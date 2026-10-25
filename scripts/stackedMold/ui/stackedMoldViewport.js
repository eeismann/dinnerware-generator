/**
 * Stacked Cylinder Mold - viewport
 *
 * Three views of one generated mold:
 *   stack  the plaster pieces stacked into the cylinder (exploded by the
 *          explode amount), keys, the ware ghost inside
 *   unit   one casting unit as poured: bed plate, core / insert, sleeve
 *          halves, lid and the resulting plaster piece, exploded apart
 *          (the anatomy viewer's layout, scripts/concepts/stackedMoldAnatomy.js)
 *   print  that unit's printable parts in print orientation on the printer bed
 * Section cuts (quarter / half) use clipping planes; back faces show through
 * a cut in the cut colour.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RenderScheduler } from '../../ui/renderScheduler.js';
import { createOrbitPanMode } from '../../ui/orbitPanMode.js';
import { getViewerSettings, shadedPalette, FLOOR_GRID_Y } from '../../ui/viewerSettings.js';
import { createViewerStyle } from '../../ui/viewerStyle.js';
import { plasterLoop, wareSliceLoop, KEY } from '../geometry/castingUnitParts.js';
import { printSolid } from '../geometry/stackedMoldExporter.js';

const C = {
    pla: 0xcdc8bc, pla2: 0xb4aea0, plaster: 0xf4f1e8, plasterSplit: 0xf1e3cf,
    key: 0xc8402a, socket: 0x6e1f12, ware: 0x8fb3c9, select: 0xe0a243,
    cutPla: 0x7f796d, cutPlaster: 0xeedfbd, bed: 0x3a3f46,
    parting: 0xe0846c, // split parting faces
    kit: 0xa9bccb,     // universal kit (tier 1)
    warePart: 0xe3b6a8 // ware-specific parts (tier 2)
};
const TAU = Math.PI * 2;

export function solidGeometry(solid, matrix = null) {
    const g = new THREE.BufferGeometry();
    // Copy: applyMatrix4 transforms in place, and the solid belongs to the mold
    // (the kit, the exporter); sharing it moved the parts again on every rebuild
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(solid.positions), 3));
    g.setIndex(new THREE.BufferAttribute(solid.indices, 1));
    if (matrix) g.applyMatrix4(toMatrix4(matrix));
    g.computeVertexNormals();
    return g;
}

export function toMatrix4(m) {
    return new THREE.Matrix4().set(m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7], m[8], m[9], m[10], m[11], 0, 0, 0, 1);
}

/** Lathe display mesh of a closed (ρ, y) loop, optionally a partial sweep. */
export function latheGeometry(loop, { theta0 = 0, theta1 = TAU, n = 120 } = {}) {
    const pts = loop.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.02), y));
    if (loop[0][0] > 1e-6 || loop[loop.length - 1][0] > 1e-6) pts.push(pts[0].clone());
    // three's lathe maps (r, y) → (r sin φ, y, r cos φ); φ = π/2 − θ matches θ (x, −z)
    return new THREE.LatheGeometry(pts, n, theta0 + Math.PI / 2, theta1 - theta0);
}

export function capGeometry(loop, theta) {
    const shape = new THREE.Shape(loop.map(([r, y]) => new THREE.Vector2(r, y)));
    const g = new THREE.ShapeGeometry(shape);
    // shape lies in the (x, y) plane = meridian at θ = 0; rotate to θ about Y
    g.rotateY(theta);
    return g;
}

export class StackedMoldViewport {
    constructor(container) {
        this.container = container;
        this.mold = null;
        this.view = { mode: 'stack', unit: 'U2', explode: 0.6, section: 'quarter', showWare: true, showPlaster: true };
        this.onPickUnit = null;
        this.init();
    }

    init() {
        const w = this.container.clientWidth || 800;
        const h = this.container.clientHeight || 600;
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(shadedPalette(getViewerSettings().background).background);
        this.camera = new THREE.PerspectiveCamera(35, w / h, 1, 20000);
        this.camera.position.set(420, 320, 420);
        this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(w, h);
        this.renderer.localClippingEnabled = true;
        this.container.appendChild(this.renderer.domElement);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.target.set(0, 80, 0);
        this.controls.addEventListener('change', () => this.requestRender({ settle: true }));
        this.panController = createOrbitPanMode({
            THREE, controls: this.controls, element: this.renderer.domElement, root: this.container,
            requestRender: (o) => this.requestRender(o)
        });

        this.scene.add(new THREE.HemisphereLight(0xffffff, 0xb9b3a6, 1.5));
        const sun = new THREE.DirectionalLight(0xffffff, 1.4);
        sun.position.set(200, 420, 260);
        this.scene.add(sun);
        const fill = new THREE.DirectionalLight(0xffffff, 0.45);
        fill.position.set(-300, 120, -100);
        this.scene.add(fill);

        this.root = new THREE.Group();
        this.scene.add(this.root);
        this.setupGrid();

        this.scheduler = new RenderScheduler({ controls: this.controls, render: () => this.renderer.render(this.scene, this.camera) });
        this.viewerStyle = createViewerStyle({
            scene: this.scene, renderer: this.renderer,
            requestRender: () => this.requestRender(),
            applyBackground: (mode, inkPaper) => this.applyBackground(mode, inkPaper),
            axesExtent: 260
        });

        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(this.container);
        this.setupPicking();
        this.requestRender();
    }

    setupGrid(mode = getViewerSettings().background, inkPaper = null) {
        const shaded = shadedPalette(mode);
        this.grid = inkPaper
            ? new THREE.GridHelper(1600, 160, inkPaper.ink, inkPaper.ink)
            : new THREE.GridHelper(1600, 160, shaded.grid, shaded.gridCenter);
        if (inkPaper) {
            this.grid.material.transparent = true;
            this.grid.material.opacity = 0.14;
        }
        this.grid.position.y = FLOOR_GRID_Y + this.floorY();
        this.grid.userData.lineArtSkip = true;
        this.scene.add(this.grid);
    }

    floorY() {
        return this.floor ?? 0;
    }

    applyBackground(mode, inkPaper) {
        this.scene.background = new THREE.Color(inkPaper ? inkPaper.paper : shadedPalette(mode).background);
        this.scene.remove(this.grid);
        this.grid.geometry.dispose();
        this.grid.material.dispose();
        this.setupGrid(mode, inkPaper);
        this.requestRender();
    }

    requestRender(options) {
        this.scheduler?.request(options);
    }

    resize() {
        const w = this.container.clientWidth;
        const h = this.container.clientHeight;
        if (!w || !h) return;
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
        this.requestRender();
    }

    getCameraRig() {
        return {
            camera: this.camera, controls: this.controls, scene: this.scene,
            requestRender: (o) => this.requestRender(o),
            cancelTween: () => {}
        };
    }

    /* ---------- materials ---------- */

    clipPlanes() {
        const s = this.view.section;
        if (this.view.mode === 'print' || this.view.mode === 'kit' || s === 'none') return [];
        // 0.7 mm off the axis planes: split dividers lie exactly on x = 0
        if (s === 'half') return [new THREE.Plane(new THREE.Vector3(0, 0, -1), 0.7)];
        return [new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0.7), new THREE.Plane(new THREE.Vector3(0, 0, -1), 0.7)];
    }

    /**
     * A part mesh. `at` places it (exploded offset); its section cut moves with
     * it, so a part that slides out keeps the same cut instead of being sliced
     * by planes fixed in the world.
     */
    mesh(geometry, color, cutColor, { opacity = 1, edges = true, flat = true, at = null } = {}) {
        const planes = this.planesAt(at);
        const g = new THREE.Group();
        if (at) g.position.copy(at);
        const front = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({
            color, flatShading: flat, clippingPlanes: planes, clipIntersection: true,
            transparent: opacity < 1, opacity, depthWrite: opacity >= 1, side: opacity < 1 ? THREE.DoubleSide : THREE.FrontSide
        }));
        g.add(front);
        if (opacity >= 1 && planes.length) {
            // Pulled slightly toward the camera so edge lines on the far
            // surfaces don't show through the cut face
            const back = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
                color: cutColor, side: THREE.BackSide, clippingPlanes: planes, clipIntersection: true,
                polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
            }));
            back.userData.lineArtSkip = true;
            g.add(back);
        }
        if (edges && opacity >= 1) {
            const line = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 30),
                new THREE.LineBasicMaterial({ color: 0x141414, transparent: true, opacity: 0.35, clippingPlanes: planes, clipIntersection: true }));
            line.userData.lineArtSkip = true;
            g.add(line);
        }
        return g;
    }

    /* ---------- state in ---------- */

    setMold(mold) {
        this.mold = mold;
        this.rebuild({ frame: !this.framedOnce });
        this.framedOnce = Boolean(mold);
    }

    setView(view, { frame = false } = {}) {
        const prev = this.view;
        this.view = { ...this.view, ...view };
        const modeChanged = prev.mode !== this.view.mode || (this.view.mode !== 'stack' && prev.unit !== this.view.unit);
        this.rebuild({ frame: frame || modeChanged });
    }

    clear() {
        this.root.traverse(o => {
            if (o.geometry) o.geometry.dispose();
            if (o.material) [].concat(o.material).forEach(m => m.dispose());
        });
        this.root.clear();
        this.pickables = [];
    }

    rebuild({ frame = false } = {}) {
        this.clear();
        this.planes = this.clipPlanes();
        this.floor = 0;
        if (this.mold) {
            if (this.view.mode === 'unit') this.buildUnit();
            else if (this.view.mode === 'print') this.buildPrint();
            else if (this.view.mode === 'kit') this.buildKit();
            else this.buildStack();
        }
        this.grid.position.y = FLOOR_GRID_Y + this.floor;
        if (frame) this.frame();
        this.requestRender();
    }

    unitById(id) {
        const units = this.mold?.result.units || [];
        return units.find(u => u.id === id) || units[1] || units[0];
    }

    /* ---------- stack ---------- */

    buildStack() {
        const { result, dims } = this.mold;
        const gap = 46 * this.view.explode;
        this.floor = result.units[0].a;
        result.units.forEach((u, i) => {
            const g = new THREE.Group();
            g.userData.unitId = u.id;
            const loop = plasterLoop(result, u, dims);
            const selected = u.id === this.view.unit;
            const color = u.kind === 'split' ? C.plasterSplit : C.plaster;
            if (this.view.showPlaster) {
                if (u.kind === 'split') {
                    // Two halves through the axis, pulled apart sideways (the way
                    // they demold) with their parting faces coloured, so a
                    // trapped cavity never reads as a one-piece ring
                    const apart = Math.max(gap * 0.5, dims.R * 0.55 * this.view.explode);
                    [[-Math.PI / 2, Math.PI / 2, 1], [Math.PI / 2, 1.5 * Math.PI, -1]].forEach(([t0, t1, side]) => {
                        // the section cut travels with each half (planes are vertical, so
                        // the piece's own lift doesn't matter)
                        const at = new THREE.Vector3(side * apart, 0, 0);
                        g.add(this.mesh(latheGeometry(loop, { theta0: t0, theta1: t1 }), color, C.cutPlaster, { at }));
                        [t0, t1].forEach(t => {
                            const cap = this.partingFace(capGeometry(loop, t), at);
                            cap.position.copy(at);
                            g.add(cap);
                        });
                    });
                } else {
                    g.add(this.mesh(latheGeometry(loop), color, C.cutPlaster));
                }
                this.addKeys(g, u, dims);
                if (selected) g.add(this.outlineRing(dims.R + 1.5, u.a, u.b));
            }
            g.position.y = i * gap;
            g.traverse(o => { if (o.isMesh) { o.userData.unitId = u.id; this.pickables.push(o); } });
            // The ware's own slice rides with its piece, so the ghost always fills the cavity
            const slice = this.view.showWare ? wareSliceLoop(result, u) : null;
            // Inset 0.4 mm so it doesn't z-fight with the cavity it fills
            if (slice) g.add(this.mesh(latheGeometry(slice.map(([rho, z]) => [Math.max(0, rho - 0.4), z])), C.ware, C.ware, { opacity: 0.35, edges: false, flat: false }));
            this.root.add(g);
        });
    }

    /** Split parting face: coloured on both sides, clipped like the rest. */
    planesAt(at) {
        return at ? this.planes.map(p => p.clone().translate(at)) : this.planes;
    }

    partingFace(geometry, at = null) {
        const m = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({
            color: C.parting, side: THREE.DoubleSide, clippingPlanes: this.planesAt(at), clipIntersection: true
        }));
        m.userData.lineArtSkip = true;
        return m;
    }

    outlineRing(r, a, b) {
        const g = new THREE.Group();
        [a, b].forEach(y => {
            const pts = Array.from({ length: 97 }, (_, k) => new THREE.Vector3(r * Math.cos(k * TAU / 96), y, -r * Math.sin(k * TAU / 96)));
            const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: C.select, clippingPlanes: this.planes, clipIntersection: true }));
            line.userData.lineArtSkip = true;
            g.add(line);
        });
        return g;
    }

    /** Male cones under the bottom face, socket marks on the top face. */
    addKeys(group, u, dims) {
        const K = dims.K;
        dims.keyAngles.forEach(a => {
            const x = K * Math.cos(a), z = -K * Math.sin(a);
            if (u.plasterBottom === 'male') {
                const cone = new THREE.ConeGeometry(KEY.r, KEY.h, 32);
                cone.rotateX(Math.PI);
                cone.translate(x, u.a - KEY.h / 2, z);
                group.add(this.mesh(cone, C.key, C.key, { edges: false, flat: false }));
            }
            if (u.plasterTop === 'sockets') {
                const disc = new THREE.CircleGeometry(KEY.r, 32);
                disc.rotateX(-Math.PI / 2);
                disc.translate(x, u.b + 0.15, z);
                const m = new THREE.Mesh(disc, new THREE.MeshBasicMaterial({ color: C.socket, clippingPlanes: this.planes, clipIntersection: true }));
                m.userData.lineArtSkip = true;
                group.add(m);
            }
        });
    }

    /* ---------- unit (as poured, exploded) ---------- */

    buildUnit() {
        const { result, dims, parts } = this.mold;
        const u = this.unitById(this.view.unit);
        const entry = parts.units.find(e => e.unit.id === u.id);
        const e = this.view.explode;
        const kitPart = (use) => parts.kit.parts.find(p => p.role === use.role && (p.index ?? 0) === (use.index ?? 0));
        this.floor = entry.fused ? -dims.T - 2 : -dims.T;
        // Kit parts where this unit uses them, pulled apart by the explode amount
        for (const use of entry.kitUse) {
            const part = kitPart(use);
            if (!part) continue;
            const at = new THREE.Vector3();
            if (use.role === 'lid' || use.at === 'lid') at.y = (u.h * 0.6 + 50) * e;
            else if (use.at === 'bed') at.y = -30 * e;
            else if (use.role === 'sleeve') {
                // each segment slides out along its centre direction
                const m = use.matrix;
                at.set(m[0] * dims.R * 0.8 * e, 0, m[8] * dims.R * 0.8 * e);
            }
            this.root.add(this.mesh(solidGeometry(part.solid, use.matrix), C.kit, C.cutPla, { at }));
        }
        // Ware parts (tier 2)
        for (const part of entry.parts) {
            const side = part.half === 'B' ? -1 : part.half === 'A' ? 1 : 0;
            const at = new THREE.Vector3(side * dims.R * 0.9 * e, part.role === 'footring' || part.role === 'footbase' ? 16 * e : 0, 0);
            this.root.add(this.mesh(solidGeometry(part.solid, part.toPour), C.warePart, C.cutPla, { at }));
        }
        // Plaster result, mapped from the mold frame into the pour frame
        if (this.view.showPlaster) {
            const loop = plasterLoop(result, u, dims).map(([r, z]) => [r, u.orient === 'inverted' ? u.b - z : z - u.a]);
            const ordered = u.orient === 'inverted' ? [...loop].reverse() : loop;
            if (e > 0) {
                const lift = u.h + 20 + (u.h * 0.6 + 50) * e + 40 * e;
                if (u.kind === 'split') {
                    [[-Math.PI / 2, Math.PI / 2, 1], [Math.PI / 2, 1.5 * Math.PI, -1]].forEach(([t0, t1, side]) => {
                        const at = new THREE.Vector3(side * dims.R * 0.9 * e, lift, 0);
                        this.root.add(this.mesh(latheGeometry(ordered, { theta0: t0, theta1: t1 }), C.plasterSplit, C.cutPlaster, { at }));
                        [t0, t1].forEach(t => {
                            const cap = this.partingFace(capGeometry(ordered, t), at);
                            cap.position.copy(at);
                            this.root.add(cap);
                        });
                    });
                } else {
                    this.root.add(this.mesh(latheGeometry(ordered), C.plaster, C.cutPlaster, { at: new THREE.Vector3(0, lift, 0) }));
                }
            }
        }
    }

    /* ---------- print layouts ---------- */

    /** Parts on printer beds in a grid; kit parts tinted blue, ware parts red. */
    layoutBeds(items) {
        const { dims } = this.mold;
        const printer = dims.printer;
        const gap = 24;
        const cols = Math.ceil(Math.sqrt(items.length));
        const rows = Math.ceil(items.length / cols);
        const cellX = printer.x + gap;
        const cellZ = printer.y + gap;
        items.forEach(({ part, kit }, i) => {
            const g = solidGeometry(printSolid(part, printer));
            const cx = (i % cols - (cols - 1) / 2) * cellX;
            const cz = (Math.floor(i / cols) - (rows - 1) / 2) * cellZ;
            g.translate(cx, 0, cz);
            this.root.add(this.mesh(g, kit ? C.kit : C.warePart, C.cutPla));
            const sq = new THREE.EdgesGeometry(new THREE.PlaneGeometry(printer.x, printer.y).rotateX(-Math.PI / 2));
            const line = new THREE.LineSegments(sq, new THREE.LineBasicMaterial({ color: C.select, transparent: true, opacity: 0.55 }));
            line.position.set(cx, 0.2, cz);
            line.userData.lineArtSkip = true;
            this.root.add(line);
        });
    }

    /** One unit's prints: the kit parts it uses (once each) and its ware parts. */
    buildPrint() {
        const { parts } = this.mold;
        const u = this.unitById(this.view.unit);
        const entry = parts.units.find(e => e.unit.id === u.id);
        const seen = new Set();
        const items = [];
        for (const use of entry.kitUse) {
            const key = `${use.role}:${use.index ?? 0}`;
            if (seen.has(key)) continue;
            seen.add(key);
            const part = parts.kit.parts.find(p => p.role === use.role && (p.index ?? 0) === (use.index ?? 0));
            if (part) items.push({ part, kit: true });
        }
        entry.parts.forEach(part => items.push({ part, kit: false }));
        this.layoutBeds(items);
    }

    /** The whole universal kit (print once per diameter). */
    buildKit() {
        this.layoutBeds(this.mold.parts.kit.parts.map(part => ({ part, kit: true })));
    }

    /* ---------- camera ---------- */

    frame() {
        const box = new THREE.Box3().setFromObject(this.root);
        if (box.isEmpty()) return;
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const radius = Math.max(size.x, size.y, size.z) * 0.62;
        const dist = radius / Math.sin((this.camera.fov * Math.PI / 180) / 2);
        const dir = this.view.mode === 'print' || this.view.mode === 'kit' ? new THREE.Vector3(0.0, 1.1, 1).normalize() : new THREE.Vector3(1, 0.62, 1).normalize();
        this.controls.target.copy(center);
        this.camera.position.copy(center).addScaledVector(dir, dist);
        this.camera.near = Math.max(1, dist / 100);
        this.camera.far = dist * 20;
        this.camera.updateProjectionMatrix();
        this.controls.update();
        this.requestRender();
    }

    resetView() {
        this.frame();
    }

    /* ---------- picking ---------- */

    setupPicking() {
        this.pickables = [];
        const ray = new THREE.Raycaster();
        const ndc = new THREE.Vector2();
        let down = null;
        const el = this.renderer.domElement;
        el.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
        el.addEventListener('pointerup', (e) => {
            if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) return;
            if (this.view.mode !== 'stack' || !this.onPickUnit) return;
            const rect = el.getBoundingClientRect();
            ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
            ray.setFromCamera(ndc, this.camera);
            const [hit] = ray.intersectObjects(this.pickables, false);
            if (hit?.object.userData.unitId) this.onPickUnit(hit.object.userData.unitId);
        });
    }

    thumbnail(size = 320) {
        this.renderer.render(this.scene, this.camera);
        const src = this.renderer.domElement;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const s = Math.min(src.width, src.height);
        canvas.getContext('2d').drawImage(src, (src.width - s) / 2, (src.height - s) / 2, s, s, 0, 0, size, size);
        return canvas.toDataURL('image/jpeg', 0.8);
    }

    dispose() {
        this.clear();
        this.viewerStyle?.dispose();
        this.scheduler?.dispose?.();
        this.resizeObserver?.disconnect();
        this.renderer.dispose();
    }
}

