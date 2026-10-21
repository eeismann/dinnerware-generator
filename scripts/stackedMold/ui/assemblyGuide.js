/**
 * Stacked Cylinder Mold - assembly guide
 *
 * Step-by-step 3D walkthrough of casting one ware's plaster mold with the
 * universal kit: for each casting unit (footer, ring, well collar) the bed
 * plate, plugs, jack screws, locators, ware part, sleeve, pour, lid and
 * demold, then the plaster pieces stacked into the finished mold. Parts are
 * the generator's real geometry (computeMold); each step animates the parts
 * it adds or removes. Page: stacked-cylinder-mold/assembly.html.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { extractMeshProfile } from '../geometry/profileExtractor.js';
import { computeMold } from '../geometry/stackedMoldPipeline.js';
import { plasterLoop, wareSliceLoop, boltHeights, PUCK, TUBE_T, SLIT_ANGLE } from '../geometry/castingUnitParts.js';
import { DEFAULT_PARAMS, deepClone } from '../state/stackedMoldDefaults.js';
import { solidGeometry, latheGeometry } from './stackedMoldViewport.js';

const COLOR = {
    kit: 0x9fb3c4, plug: 0x6f8fa6, ware: 0xd9907a, plaster: 0xf2ecdc, plasterWet: 0xe9dfc4,
    steel: 0x5d6168, tape: 0x3f7fd0, cone: 0xc8402a, socket: 0x6e1f12, ghost: 0x8fb3c9, cut: 0x7f796d, cutPlaster: 0xe6d6b0
};
const TAU = Math.PI * 2;
const DUR = 650;

/* ---------- geometry helpers ---------- */

function cylinderAlong(p, dir, r, len, color) {
    const g = new THREE.CylinderGeometry(r, r, len, 16);
    g.rotateX(Math.PI / 2); // along +z
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, metalness: 0.5, roughness: 0.45 }));
    m.position.set(...p);
    m.lookAt(new THREE.Vector3(p[0] + dir[0], p[1] + dir[1], p[2] + dir[2]));
    return m;
}

const at = (r, a, y) => [r * Math.cos(a), y, -r * Math.sin(a)];

/* ---------- the guide ---------- */

export async function mountAssemblyGuide({ canvasHost, stepsEl, tabsEl, titleEl, captionEl, prevBtn, nextBtn, sectionBtn, legendEl, statusEl, stlUrl, wareName, kit }) {
    statusEl.textContent = 'Generating the mold…';
    const buf = await (await fetch(stlUrl)).arrayBuffer();
    const view = new DataView(buf);
    const n = view.getUint32(80, true);
    const pos = new Float32Array(n * 9);
    for (let i = 0; i < n; i++) for (let k = 0; k < 9; k++) pos[i * 9 + k] = view.getFloat32(84 + i * 50 + 12 + k * 4, true);
    const params = deepClone(DEFAULT_PARAMS);
    params.kit.diameter = String(kit.diameter);
    params.kit.sleeveH = String(kit.sleeveH);
    const mold = computeMold(extractMeshProfile(pos), params);
    const { result, dims, parts } = mold;
    const kitParts = parts.kit.parts;
    statusEl.textContent = '';

    /* ---------- scene ---------- */
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.localClippingEnabled = true;
    canvasHost.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf5f3ee);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xbdb6a6, 1.7));
    const sun = new THREE.DirectionalLight(0xffffff, 1.3);
    sun.position.set(220, 400, 260);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xffffff, 0.45);
    fill.position.set(-300, 100, -120);
    scene.add(fill);
    const grid = new THREE.GridHelper(900, 90, 0xcfc9bb, 0xe1dccf);
    scene.add(grid);
    const camera = new THREE.PerspectiveCamera(32, 1, 1, 10000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI * 0.53;
    const root = new THREE.Group();
    scene.add(root);

    let sectionOn = true;
    // Quarter cut, 0.7 mm off the axis planes (dividers lie on x = 0)
    const basePlanes = [new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0.7), new THREE.Plane(new THREE.Vector3(0, 0, -1), 0.7)];

    function resize() {
        const w = canvasHost.clientWidth, h = canvasHost.clientHeight;
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    }
    new ResizeObserver(resize).observe(canvasHost);
    resize();

    /** An item: a group whose meshes clip with a quarter cut that travels with it. */
    function item(objects, { tier = 'kit' } = {}) {
        const g = new THREE.Group();
        objects.forEach(o => g.add(o));
        g.userData.tier = tier;
        g.userData.planes = [];
        const meshes = [];
        g.traverse(o => { if (o.isMesh) meshes.push(o); });
        meshes.forEach(o => {
            const planes = basePlanes.map(p => p.clone());
            o.material.clippingPlanes = planes;
            o.material.clipIntersection = true;
            g.userData.planes.push(planes);
            if (o.material.side !== THREE.DoubleSide && !o.userData.noCut) {
                // back faces show through the cut in the cut colour
                const back = new THREE.Mesh(o.geometry, new THREE.MeshBasicMaterial({
                    color: o.userData.cutColor ?? COLOR.cut, side: THREE.BackSide, clippingPlanes: planes, clipIntersection: true,
                    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
                }));
                o.add(back);
            }
        });
        return g;
    }
    const solidMesh = (solid, matrix, color, opts = {}) => {
        const geo = solidGeometry(solid, matrix);
        const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, flatShading: true, transparent: true, opacity: 1 }));
        const lines = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), new THREE.LineBasicMaterial({ color: 0x141414, transparent: true, opacity: 0.28 }));
        m.add(lines);
        Object.assign(m.userData, opts);
        return m;
    };
    const kitPart = (role, index = 0) => kitParts.find(p => p.role === role && (p.index ?? 0) === index);

    /* ---------- per-unit items (pour frame) ---------- */

    function plasterPieceMesh(u, { wet = false, flipToMold = false } = {}) {
        let loop = plasterLoop(result, u, dims);
        if (!flipToMold) {
            loop = loop.map(([r, z]) => [r, u.orient === 'inverted' ? u.b - z : z - u.a]);
            if (u.orient === 'inverted') loop.reverse();
        }
        const geo = latheGeometry(loop, { n: 120 });
        const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: wet ? COLOR.plasterWet : COLOR.plaster, transparent: true, opacity: 1 }));
        m.userData.cutColor = COLOR.cutPlaster;
        return m;
    }

    /** Key cones / socket marks on a plaster piece (mold frame). */
    function keyMarks(u) {
        const out = [];
        dims.keyAngles.forEach(a => {
            const [x, , z] = at(dims.K, a, 0);
            if (u.plasterBottom === 'male') {
                const c = new THREE.ConeGeometry(6, 5, 32);
                c.rotateX(Math.PI);
                c.translate(x, u.a - 2.5, z);
                out.push(new THREE.Mesh(c, new THREE.MeshLambertMaterial({ color: COLOR.cone, transparent: true })));
            }
            if (u.plasterTop === 'sockets') {
                const d = new THREE.CircleGeometry(6.15, 32);
                d.rotateX(-Math.PI / 2);
                d.translate(x, u.b + 0.2, z);
                const m = new THREE.Mesh(d, new THREE.MeshBasicMaterial({ color: COLOR.socket, side: THREE.DoubleSide, transparent: true }));
                m.userData.noCut = true;
                out.push(m);
            }
        });
        return out;
    }

    function unitItems(entry) {
        const u = entry.unit;
        const T = dims.T;
        const items = {};
        const uses = entry.kitUse;
        // Bed plate (all tiles)
        items.plate = item(uses.filter(x => x.role === 'bedplate').map(x => solidMesh(kitPart('bedplate', x.index).solid, x.matrix, COLOR.kit)));
        items.plugsBed = item(uses.filter(x => x.at === 'bed').map(x => solidMesh(kitPart(x.role).solid, x.matrix, COLOR.plug)));
        items.plugsLid = item(uses.filter(x => x.at === 'lid').map(x => solidMesh(kitPart(x.role).solid, x.matrix, COLOR.plug)));
        items.lid = item(uses.filter(x => x.role === 'lid').map(x => solidMesh(kitPart('lid', x.index).solid, x.matrix, COLOR.kit)));
        const puckUse = uses.find(x => x.role === 'puck');
        if (puckUse) items.puck = item([solidMesh(kitPart('puck').solid, puckUse.matrix, COLOR.plug)]);
        // Jack screws: headless M5 set screws as long as the plate is thick,
        // flush with both faces until they are turned in
        items.jacksBed = item(dims.jackAngles.map(a => {
            const [x, , z] = at(dims.K, a, 0);
            return cylinderAlong([x, -T / 2, z], [0, 1, 0], 2.5, T - 0.1, COLOR.steel);
        }));
        items.jacksLid = item(dims.jackAngles.map(a => {
            const [x, , z] = at(dims.K, a, 0);
            return cylinderAlong([x, u.h + T / 2, z], [0, 1, 0], 2.5, T - 0.1, COLOR.steel);
        }));
        // Sleeve segments (each its own item, so they can open outward)
        uses.filter(x => x.role === 'sleeve').forEach((x, i) => {
            const it = item([solidMesh(kitPart('sleeve').solid, x.matrix, COLOR.kit)]);
            it.userData.dir = new THREE.Vector3(x.matrix[0], 0, x.matrix[8]);
            items[`sleeve${i}`] = it;
        });
        // M3 bolts through the seam ears
        items.bolts = item(dims.sleeveSeams.flatMap(s => boltHeights(dims.sleeveH).map(y => {
            const p = at(dims.boltS, s, y);
            const tangent = [-Math.sin(s), 0, -Math.cos(s)];
            return cylinderAlong(p, tangent, 1.5, 14, COLOR.steel);
        })));
        // Ware parts (tiles of one part share an item)
        for (const role of new Set(entry.parts.map(p => p.role))) {
            items[role] = item(entry.parts.filter(p => p.role === role).map(p => solidMesh(p.solid, p.toPour, COLOR.ware)), { tier: 'ware' });
        }
        // Tape closing the slit tube on the inside
        if (u.kind === 'well') {
            const r = result.rw - TUBE_T - 0.25;
            const half = 12 / r;
            const g = new THREE.CylinderGeometry(r, r, u.h + 5, 6, 1, true, SLIT_ANGLE + Math.PI / 2 - half, 2 * half);
            g.translate(0, (u.h + 5) / 2, 0);
            items.tape = item([new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: COLOR.tape, side: THREE.DoubleSide, transparent: true }))], { tier: 'hw' });
        }
        // Plaster: wet while pouring, set afterwards
        // Key cones / sockets, mapped from the mold frame into the pour frame
        const marks = () => {
            const g = new THREE.Group();
            keyMarks(u).forEach(m => g.add(m));
            g.matrixAutoUpdate = false;
            g.matrix.set(...(u.orient === 'inverted'
                ? [1, 0, 0, 0, 0, -1, 0, u.b, 0, 0, -1, 0, 0, 0, 0, 1]
                : [1, 0, 0, 0, 0, 1, 0, -u.a, 0, 0, 1, 0, 0, 0, 0, 1]));
            return g;
        };
        items.plasterWet = item([plasterPieceMesh(u, { wet: true })], { tier: 'plaster' });
        items.plaster = item([plasterPieceMesh(u), marks()], { tier: 'plaster' });
        return items;
    }

    /* ---------- step scripts ---------- */

    const U = Object.fromEntries(parts.units.map(e => [e.unit.kind, e]));
    const ringE = U.ring, footerE = U.footer, wellE = U.well;
    const sleeves = (pose = {}) => Object.fromEntries(Array.from({ length: dims.segments }, (_, i) => [`sleeve${i}`, pose]));
    const open = { open: 70 };
    const stepsFor = {
        footer: (e) => [
            { title: 'Bed plate on the bench', text: 'The kit\'s Ø' + dims.diameter + ' bed plate, bench face down. The footer needs no plugs, jack screws or pit cap.', show: { plate: {} } },
            ...(e.parts.some(p => p.role === 'footring')
                ? [{ title: 'Footer base', text: 'The footer pours upside down, so its top face forms here. Set the footer base (the ' + wareName + '\'s foot, upside down, on a flange) in the middle of the plate.', show: { plate: {}, footbase: {} }, from: { footbase: 80 } },
                    { title: 'Ring tiles', text: 'Slide the ring tiles together by their dovetails and lower them into the plate rim, pull tabs at the rim gaps. Their 45° inner edge seats on the base\'s flange and centres it. They carry the three key bumps.', show: { plate: {}, footbase: {}, footring: {} }, from: { footring: 90 } }]
                : [{ title: 'Footer base', text: 'The footer pours upside down, so its top face forms here. Lay the footer base in the plate rim, pull tabs at the rim gaps. It is the ' + wareName + '\'s foot (upside down) and the locating ring printed as one piece: the rim centres it, and its face carries the three key bumps (they make the sockets).', show: { plate: {}, footbase: {} }, from: { footbase: 80 } }]),
            { title: 'Sleeve', text: 'Stand the two sleeve halves on the ring, inside the plate rim, ears over the pull tabs, and bolt them (M3). Standing on the ring, the sleeve holds the base down against the plaster. Soap every face the plaster will touch.', show: { plate: {}, footbase: {}, footring: {}, ...sleeves(), bolts: {} } },
            { title: 'Pour', text: 'Pour to ' + e.unit.h.toFixed(0) + ' mm and let it level: this face becomes the bench face. No lid.', show: { plate: {}, footbase: {}, footring: {}, ...sleeves(), bolts: {}, plasterWet: { opacity: 0.85 } } },
            { title: 'Open the sleeve', text: 'Once set, unbolt the ears and pry the halves apart at the bevels.', show: { plate: {}, footbase: {}, footring: {}, ...sleeves(open), plaster: {} } },
            { title: 'Lift it off the plate', text: 'Lift the plaster and the base off the plate together: nothing holds them to it.', show: { plate: {}, footbase: { y: 70 }, footring: { y: 70 }, plaster: { lift: 70 } } },
            { title: 'Pull the base', text: 'Hold the plaster and pull the base out by its two tabs. The ring is thin enough to peel from the edge in, and the stub follows it straight out of the foot cavity. Flip the piece: sockets up, the foot cavity on top.', show: { footbase: {}, footring: {}, plaster: { lift: 70 } } }
        ],
        ring: (e) => [
            { title: 'Bed plate on the bench', text: 'Same plate as the footer.', show: { plate: {} } },
            { title: e.unit.bedFormer.former === 'bumps' ? 'Bump plugs and jack screws' : 'Pocket plugs and jack screws',
                text: e.unit.orient === 'inverted'
                    ? 'This ring pours upside down (wide end on the bed), so the plate forms its top face: bump plugs, from below. The three M5 set screws sit flush with both faces, so the plate lies flat and the bench holds the plugs in.'
                    : 'The plate forms this ring\'s bottom face: pocket plugs, from below. The three M5 set screws sit flush with both faces, so the plate lies flat and the bench holds the plugs in.',
                show: { plate: {}, plugsBed: {}, jacksBed: {} }, from: { plugsBed: -50, jacksBed: -50 } },
            { title: 'Locating puck', text: 'Drop the puck into the centre pit.', show: { plate: {}, plugsBed: {}, jacksBed: {}, puck: {} } },
            { title: 'Core', text: 'Set the core on the puck: the cone pit in its base centres it on the mold axis.', show: { plate: {}, plugsBed: {}, jacksBed: {}, puck: {}, core: {} } },
            { title: 'Tall sleeve', text: 'Stand the sleeve halves in the rim and bolt the ears. The same ' + dims.sleeveH + ' mm sleeve serves every unit. Soap everything.', show: { plate: {}, plugsBed: {}, jacksBed: {}, puck: {}, core: {}, ...sleeves(), bolts: {} } },
            { title: 'Pour', text: 'Pour to just above the core top (' + e.unit.h.toFixed(0) + ' mm).', show: { plate: {}, plugsBed: {}, jacksBed: {}, puck: {}, core: {}, ...sleeves(), bolts: {}, plasterWet: { opacity: 0.85 } } },
            { title: 'Drop-in lid', text: 'Push the other plug type into the lid (' + (e.unit.lidFormer.former === 'bumps' ? 'bumps' : 'pockets, bleeds at their tips') + ') and lower it inside the sleeve until it rests on the core top. Surplus plaster and air leave through the bleed holes.', show: { plate: {}, plugsBed: {}, jacksBed: {}, puck: {}, core: {}, ...sleeves(), bolts: {}, plasterWet: { opacity: 0.85 }, lid: {}, plugsLid: {}, jacksLid: {} }, from: { lid: 120, plugsLid: 120, jacksLid: 120 } },
            { title: 'Lid off, sleeve open', text: 'Once set, turn the lid\'s three set screws down evenly (2.5 mm hex key) to break it free, or lift it by its tabs. Unbolt the ears and pry the sleeve open.', show: { plate: {}, plugsBed: {}, jacksBed: {}, puck: {}, core: {}, ...sleeves(open), plaster: {} } },
            { title: 'Lift it off the core', text: 'Set the plate across two blocks (or over the bench edge) and turn the three set screws up from below, half a turn each in turn: 2 mm breaks the plaster free. Slide it up off the core. Flip it for the stack: male cones below, sockets on top.', show: { plate: {}, plugsBed: {}, jacksBed: {}, puck: {}, core: {}, plaster: { lift: e.unit.h + 40 } } }
        ],
        well: (e) => [
            { title: 'Bed plate on the bench', text: 'Same plate again.', show: { plate: {} } },
            { title: 'Pocket plugs and jack screws', text: 'The collar pours upright; the plate forms its bottom face, so pocket plugs (they make the male cones that key into the ring below).', show: { plate: {}, plugsBed: {}, jacksBed: {} }, from: { plugsBed: -50, jacksBed: -50 } },
            { title: 'Puck and tube locator', text: 'Puck in the pit, then the spoked locator over it.', show: { plate: {}, plugsBed: {}, jacksBed: {}, puck: {}, locator: {} } },
            { title: 'Slit tube', text: 'Slide the slit tube over the locator rim. Close the slit so its two edges meet flush and tape them together on the inside: the outside stays a smooth bore.', show: { plate: {}, plugsBed: {}, jacksBed: {}, puck: {}, locator: {}, slittube: {}, tape: {} }, from: { slittube: 80 } },
            { title: 'Sleeve', text: 'Sleeve halves in the rim, ears bolted, soap.', show: { plate: {}, plugsBed: {}, jacksBed: {}, puck: {}, locator: {}, slittube: {}, tape: {}, ...sleeves(), bolts: {} } },
            { title: 'Pour', text: 'Pour to ' + e.unit.h.toFixed(0) + ' mm and screed it flat: this is the pour face. No lid.', show: { plate: {}, plugsBed: {}, jacksBed: {}, puck: {}, locator: {}, slittube: {}, tape: {}, ...sleeves(), bolts: {}, plasterWet: { opacity: 0.85 } } },
            { title: 'Free the tube', text: 'Once set, peel the tape and ease one edge of the tube inward: it lets go of the bore. Open the sleeve.', show: { plate: {}, plugsBed: {}, jacksBed: {}, puck: {}, locator: {}, slittube: {}, ...sleeves(open), plaster: {} } },
            { title: 'Lift the collar', text: 'Set screws up from below to break it free, then lift the collar over the tube.', show: { plate: {}, plugsBed: {}, jacksBed: {}, puck: {}, locator: {}, slittube: {}, plaster: { lift: e.unit.h + 40 } } }
        ]
    };

    /* ---------- the stack (mold frame) ---------- */

    function stackItems() {
        const items = {};
        for (const e of parts.units) {
            const u = e.unit;
            items[u.id] = item([plasterPieceMesh(u, { flipToMold: true }), ...keyMarks(u)], { tier: 'plaster' });
            const ware = wareSliceLoop(result, u);
            if (ware) {
                const g = latheGeometry(ware.map(([r, z]) => [Math.max(0, r - 0.4), z]), { n: 96 });
                const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: COLOR.ghost, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }));
                items[`${u.id}ware`] = item([m], { tier: 'ghost' });
            }
        }
        return items;
    }
    const [f1, r2, w3] = [footerE.unit.id, ringE.unit.id, wellE.unit.id];
    const stackSteps = [
        { title: 'Footer on the bench', text: 'Bench face down, sockets and the foot cavity up.', show: { [f1]: { lift: 0 } } },
        { title: 'Ring onto the footer', text: 'Its male cones drop into the footer\'s sockets. It can only go on one way up; the three keys centre it.', show: { [f1]: {}, [r2]: {} }, from: { [r2]: 120 } },
        { title: 'Well collar on top', text: 'Keys into the ring\'s sockets. The ring\'s top face, between the mug\'s rim and the collar bore, is the ' + (result.rw - result.rLip).toFixed(1) + ' mm ledge where the slip pools.', show: { [f1]: {}, [r2]: {}, [w3]: {} }, from: { [w3]: 120 } },
        { title: 'Strap and cast', text: 'Strap or clamp the stack, fill with slip through the collar, drain. The ghost shows the mug the mold casts.', show: { [f1]: {}, [r2]: {}, [w3]: {}, [`${f1}ware`]: {}, [`${r2}ware`]: {} } },
        { title: 'Demold', text: 'Lift the collar, invert the mold, lift the footer off, then slide the ring off the mug (it releases downward: nothing below it is wider).', show: { [f1]: { lift: -60 }, [r2]: { lift: -20 }, [w3]: { lift: 80 }, [`${f1}ware`]: {}, [`${r2}ware`]: {} } }
    ];

    /* ---------- player ---------- */

    const chapters = [
        { id: 'footer', label: `${footerE.unit.id} Footer`, entry: footerE, steps: stepsFor.footer(footerE) },
        { id: 'ring', label: `${ringE.unit.id} Ring`, entry: ringE, steps: stepsFor.ring(ringE) },
        { id: 'well', label: `${wellE.unit.id} Well collar`, entry: wellE, steps: stepsFor.well(wellE) },
        { id: 'stack', label: 'Assemble the mold', steps: stackSteps }
    ];
    let chapter = null;
    let items = {};
    let stepIndex = 0;
    const tweens = new Map(); // item → { from, to, t0 }

    function poseOf(it, p = {}) {
        const pose = { x: 0, y: (p.lift ?? 0), z: 0, opacity: p.opacity ?? 1, fill: 1, visible: true };
        if (p.open && it.userData.dir) {
            pose.x = it.userData.dir.x * p.open;
            pose.z = it.userData.dir.z * p.open;
        }
        return pose;
    }
    const currentPose = (it) => ({ x: it.position.x, y: it.position.y, z: it.position.z, opacity: it.userData.opacity ?? 1, fill: it.scale.y, visible: it.visible });
    function applyPose(it, p) {
        it.position.set(p.x, p.y, p.z);
        it.scale.y = Math.max(0.001, p.fill ?? 1);
        it.userData.opacity = p.opacity;
        it.visible = p.visible || p.opacity > 0.01;
        it.traverse(o => {
            if (o.material && o.material.transparent !== undefined) {
                const base = o.material.userData.baseOpacity ?? (o.material.userData.baseOpacity = o.material.opacity);
                o.material.opacity = base * p.opacity;
                o.material.depthWrite = p.opacity > 0.95 && base > 0.95;
            }
        });
        // the quarter cut travels with the item
        it.userData.planes.forEach(planes => planes.forEach((pl, i) => {
            const b = basePlanes[i];
            pl.normal.copy(b.normal);
            pl.constant = sectionOn ? b.constant - b.normal.dot(it.position) : 1e6;
        }));
    }

    function setChapter(id) {
        chapter = chapters.find(c => c.id === id);
        root.clear();
        tweens.clear();
        items = chapter.id === 'stack' ? stackItems() : unitItems(chapter.entry);
        Object.values(items).forEach(it => { it.visible = false; it.userData.opacity = 0; root.add(it); });
        tabsEl.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.chapter === id));
        stepsEl.innerHTML = chapter.steps.map((s, i) => `<li><button type="button" data-step="${i}"><b>${s.title}</b><span>${s.text}</span></button></li>`).join('');
        stepsEl.querySelectorAll('[data-step]').forEach(b => b.addEventListener('click', () => go(Number(b.dataset.step))));
        frameCamera();
        go(0, { instant: true });
    }

    function go(i, { instant = false } = {}) {
        stepIndex = Math.max(0, Math.min(chapter.steps.length - 1, i));
        const step = chapter.steps[stepIndex];
        const now = performance.now();
        for (const [key, it] of Object.entries(items)) {
            const shown = key in step.show;
            const from = currentPose(it);
            let to;
            if (shown) {
                to = poseOf(it, step.show[key]);
                if (!it.visible || from.opacity < 0.01) {
                    if (key === 'plasterWet') {
                        // the pour rises from the bed plate
                        applyPose(it, { ...to, fill: 0, opacity: to.opacity, visible: true });
                    } else {
                        // enters from above (or below for parts pushed in from the bench side)
                        const dy = step.from?.[key] ?? 60;
                        applyPose(it, { ...to, y: to.y + dy, opacity: 0, visible: true });
                    }
                }
            } else {
                if (!it.visible) continue;
                to = { ...from, y: from.y + (0), opacity: 0, visible: false };
                if (key.startsWith('sleeve') && it.userData.dir) { to.x = it.userData.dir.x * 120; to.z = it.userData.dir.z * 120; }
            }
            if (instant) { applyPose(it, to); tweens.delete(it); }
            else tweens.set(it, { from: currentPose(it), to, t0: now, dur: key === 'plasterWet' && to.visible ? 1400 : DUR });
        }
        titleEl.textContent = `${chapter.label} · step ${stepIndex + 1} of ${chapter.steps.length}`;
        captionEl.innerHTML = `<b>${step.title}</b> ${step.text}`;
        stepsEl.querySelectorAll('li').forEach((li, k) => li.classList.toggle('on', k === stepIndex));
        stepsEl.querySelectorAll('li')[stepIndex]?.scrollIntoView({ block: 'nearest' });
        prevBtn.disabled = stepIndex === 0 && chapter === chapters[0];
        nextBtn.textContent = stepIndex === chapter.steps.length - 1 ? (chapter === chapters[chapters.length - 1] ? 'Done' : 'Next unit →') : 'Next →';
        renderLegend(step);
    }

    function renderLegend(step) {
        const names = {
            plate: ['Bed plate', 'kit'], plugsBed: ['Key plugs (plate)', 'kit'], plugsLid: ['Key plugs (lid)', 'kit'], lid: ['Drop-in lid', 'kit'],
            jacksBed: ['M5 set screws (jacks)', 'hw'], jacksLid: ['M5 set screws (lid jacks)', 'hw'], puck: ['Locating puck', 'kit'], 
            bolts: ['M3 ear bolts', 'hw'], footbase: ['Footer base (stub + ring)', 'ware'], footring: ['Locating ring tiles', 'ware'], core: ['Core', 'ware'],
            locator: ['Tube locator', 'ware'], slittube: ['Slit tube', 'ware'], tape: ['Tape (inside the tube)', 'hw'], plasterWet: ['Plaster (wet)', 'plaster'], plaster: ['Plaster piece', 'plaster']
        };
        const rows = [];
        const seen = new Set();
        for (const key of Object.keys(step.show)) {
            const k = key.startsWith('sleeve') ? 'sleeve' : key;
            if (seen.has(k) || !items[key]) continue;
            seen.add(k);
            const [label, tier] = k === 'sleeve' ? [`Sleeve, ${dims.segments} halves`, 'kit'] : names[k] || [k.replace(/ware$/, ' (the mug)'), k.endsWith('ware') ? 'ghost' : 'plaster'];
            rows.push(`<li class="t-${tier}">${label}</li>`);
        }
        legendEl.innerHTML = rows.join('');
    }

    function frameCamera() {
        const R = dims.R + 20;
        const h = chapter.id === 'stack' ? result.units.reduce((m, u) => m + u.h, 0) : dims.sleeveH;
        const center = new THREE.Vector3(0, chapter.id === 'stack' ? (result.units[0].a + result.units[result.units.length - 1].b) / 2 : h * 0.45, 0);
        const radius = Math.hypot(R * 1.4, h) * 0.75;
        const dist = radius / Math.sin((camera.fov * Math.PI / 180) / 2);
        camera.position.copy(center).add(new THREE.Vector3(1, 0.62, 1).normalize().multiplyScalar(dist));
        controls.target.copy(center);
        grid.position.y = chapter.id === 'stack' ? result.units[0].a - 0.5 : -dims.T - 0.5;
        controls.update();
    }

    function tick(now) {
        for (const [it, tw] of tweens) {
            const k = Math.min(1, (now - tw.t0) / (tw.dur || DUR));
            const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
            const lerp = (a, b) => a + (b - a) * e;
            applyPose(it, {
                x: lerp(tw.from.x, tw.to.x), y: lerp(tw.from.y, tw.to.y), z: lerp(tw.from.z, tw.to.z),
                opacity: lerp(tw.from.opacity, tw.to.opacity), fill: lerp(tw.from.fill ?? 1, tw.to.fill ?? 1), visible: true
            });
            if (k >= 1) { applyPose(it, tw.to); tweens.delete(it); }
        }
        controls.update();
        renderer.render(scene, camera);
        requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);

    /* ---------- controls ---------- */

    tabsEl.innerHTML = chapters.map(c => `<button type="button" data-chapter="${c.id}">${c.label}</button>`).join('');
    tabsEl.querySelectorAll('[data-chapter]').forEach(b => b.addEventListener('click', () => setChapter(b.dataset.chapter)));
    const next = () => {
        if (stepIndex < chapter.steps.length - 1) go(stepIndex + 1);
        else {
            const i = chapters.indexOf(chapter);
            if (i < chapters.length - 1) setChapter(chapters[i + 1].id);
        }
    };
    const prev = () => {
        if (stepIndex > 0) go(stepIndex - 1);
        else {
            const i = chapters.indexOf(chapter);
            if (i > 0) { setChapter(chapters[i - 1].id); go(chapter.steps.length - 1, { instant: true }); }
        }
    };
    nextBtn.addEventListener('click', next);
    prevBtn.addEventListener('click', prev);
    sectionBtn.addEventListener('click', () => {
        sectionOn = !sectionOn;
        sectionBtn.textContent = sectionOn ? 'Section: quarter cut' : 'Section: off';
        Object.values(items).forEach(it => applyPose(it, currentPose(it)));
    });
    document.addEventListener('keydown', e => {
        if (e.key === 'ArrowRight') next();
        if (e.key === 'ArrowLeft') prev();
    });

    setChapter('footer');
    window.__assembly = { mold, chapters, go, setChapter, get chapter() { return chapter; }, get step() { return stepIndex; } };
    return { mold };
}
