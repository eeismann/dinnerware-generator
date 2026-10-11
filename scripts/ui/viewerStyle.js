/**
 * Viewer style controller: applies the shared viewer settings
 * (viewerSettings.js) to one Three.js viewport.
 *
 * - Background: the viewport's own `applyBackground(mode, inkPaper?)`
 *   recolours its background and grid (shaded palette, or ink on paper
 *   while line art is on).
 * - Axes: X (red) and Y (green) drawn on the floor, Z (blue) vertical,
 *   matching the view cube. The scenes are Y-up, so the cube's Y is world Z
 *   and its Z is world Y.
 * - Line art: flat paper-filled meshes with constant-width ink outlines and
 *   crease lines. Viewports may supply their own (Dinnerware does);
 *   otherwise every mesh in the scene is restyled just before each render,
 *   so regenerated geometry is picked up automatically.
 */

import * as THREE from 'three';
import { getViewerSettings, onViewerSettings, lineArtPalette } from './viewerSettings.js';

const AXIS_COLORS = { x: 0xe35d54, y: 0x4db576, z: 0x4d8dff };
const CREASE_ANGLE = 32;

/**
 * Ink outline drawn as an inverted hull pushed out a constant number of
 * screen pixels, so every silhouette reads like a pen line at any zoom.
 * `inverted` is for inside-out geometry (normals pointing inward): the hull
 * pushes along the opposite normal and culls the other side.
 */
export function createOutlineMaterial(color, pixels, { inverted = false } = {}) {
    return new THREE.ShaderMaterial({
        side: inverted ? THREE.FrontSide : THREE.BackSide,
        uniforms: {
            uColor: { value: new THREE.Color(color) },
            uPixels: { value: inverted ? -pixels : pixels },
            uResolution: { value: new THREE.Vector2(1, 1) }
        },
        vertexShader: `
            uniform float uPixels;
            uniform vec2 uResolution;
            void main() {
                vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                vec3 viewNormal = normalize(normalMatrix * normal);
                vec2 offset = normalize((projectionMatrix * vec4(viewNormal, 0.0)).xy + 1e-6);
                clip.xy += offset * uPixels * 2.0 / uResolution * clip.w;
                gl_Position = clip;
            }`,
        fragmentShader: `
            uniform vec3 uColor;
            void main() { gl_FragColor = vec4(uColor, 1.0); }`
    });
}

/** Colour-coded axis lines through the origin; brighter on the positive side. */
function createAxisLines(extent) {
    const group = new THREE.Group();
    group.name = 'dk-axis-lines';
    const axes = [
        { color: AXIS_COLORS.x, direction: new THREE.Vector3(1, 0, 0), length: extent },
        { color: AXIS_COLORS.y, direction: new THREE.Vector3(0, 0, 1), length: extent },
        { color: AXIS_COLORS.z, direction: new THREE.Vector3(0, 1, 0), length: extent * 0.6 }
    ];
    // Lifted a hair so the floor lines sit on top of the grid's centre lines
    const lift = new THREE.Vector3(0, 0.15, 0);
    axes.forEach(({ color, direction, length }) => {
        [[1, 0.9], [-1, 0.35]].forEach(([sign, opacity]) => {
            const end = direction.clone().multiplyScalar(length * sign);
            const geometry = new THREE.BufferGeometry().setFromPoints([lift, end.add(lift)]);
            const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({
                color, transparent: true, opacity, depthWrite: false, toneMapped: false
            }));
            line.renderOrder = 2;
            line.userData.lineArtSkip = true;
            group.add(line);
        });
    });
    return group;
}

/**
 * Generic line art for any scene: swaps each mesh's material for a flat
 * paper fill and adds an outline hull and crease lines as children.
 */
function createSceneLineArt(scene, renderer) {
    let active = false;
    let colors = null;
    const outline = createOutlineMaterial(0x000000, 1.4);
    const invertedOutline = createOutlineMaterial(0x000000, 1.4, { inverted: true });
    const outlines = [outline, invertedOutline];
    const crease = new THREE.LineBasicMaterial({ fog: false, toneMapped: false });
    const fills = new Map(); // opacity → MeshBasicMaterial
    const styled = new Set();
    const size = new THREE.Vector2();

    function fillFor(original) {
        const opacity = original?.transparent ? original.opacity : 1;
        const key = `${opacity}|${original?.clippingPlanes?.length ?? 0}`;
        if (!fills.has(key)) {
            // Double-sided so inside-out meshes still fill; no fog or tone
            // mapping so the paper stays the exact paper colour
            fills.set(key, new THREE.MeshBasicMaterial({
                side: THREE.DoubleSide,
                fog: false,
                toneMapped: false,
                transparent: opacity < 1,
                opacity,
                depthWrite: opacity >= 1,
                clippingPlanes: original?.clippingPlanes ?? null,
                polygonOffset: true,
                polygonOffsetFactor: 1,
                polygonOffsetUnits: 1
            }));
        }
        const fill = fills.get(key);
        fill.color.setHex(colors.paper);
        return fill;
    }

    // Sign of the enclosed volume: negative when the faces wind inward
    function isInverted(geometry) {
        if (geometry.userData.lineArtInverted === undefined) {
            const position = geometry.getAttribute('position');
            const index = geometry.index;
            const count = index ? index.count : position.count;
            const a = new THREE.Vector3();
            const b = new THREE.Vector3();
            const c = new THREE.Vector3();
            let volume = 0;
            for (let i = 0; i + 2 < count; i += 3) {
                a.fromBufferAttribute(position, index ? index.getX(i) : i);
                b.fromBufferAttribute(position, index ? index.getX(i + 1) : i + 1);
                c.fromBufferAttribute(position, index ? index.getX(i + 2) : i + 2);
                volume += a.dot(b.cross(c));
            }
            geometry.userData.lineArtInverted = volume < 0;
        }
        return geometry.userData.lineArtInverted;
    }

    function creaseGeometry(geometry) {
        if (!geometry.userData.lineArtCreases) {
            geometry.userData.lineArtCreases = new THREE.EdgesGeometry(geometry, CREASE_ANGLE);
            geometry.addEventListener('dispose', () => geometry.userData.lineArtCreases?.dispose());
        }
        return geometry.userData.lineArtCreases;
    }

    function style(mesh) {
        const data = mesh.userData.lineArt ?? (mesh.userData.lineArt = {});
        if (data.original === undefined || mesh.material !== data.fill) data.original = mesh.material;
        data.fill = fillFor(Array.isArray(data.original) ? data.original[0] : data.original);
        mesh.material = data.fill;
        if (!data.hull) {
            data.hull = new THREE.Mesh(mesh.geometry, outline);
            data.creases = new THREE.LineSegments(creaseGeometry(mesh.geometry), crease);
            [data.hull, data.creases].forEach(child => {
                child.userData.lineArtPart = true;
                child.castShadow = false;
                mesh.add(child);
            });
            data.hull.renderOrder = -1;
            mesh.updateMatrixWorld(true);
        }
        if (data.hull.geometry !== mesh.geometry) {
            data.hull.geometry = mesh.geometry;
            data.creases.geometry = creaseGeometry(mesh.geometry);
        }
        data.hull.material = isInverted(mesh.geometry) ? invertedOutline : outline;
        // Faint (ghost) meshes, like a semi-transparent mug, are drawn by
        // their edges only: a hull behind a see-through fill reads as a blob
        data.hull.visible = data.fill.opacity >= 0.5;
        data.creases.visible = true;
        styled.add(mesh);
    }

    function unstyle(mesh) {
        const data = mesh.userData.lineArt;
        if (!data) return;
        if (mesh.material === data.fill) mesh.material = data.original;
        [data.hull, data.creases].forEach(child => child && mesh.remove(child));
        delete mesh.userData.lineArt;
        styled.delete(mesh);
    }

    const previous = scene.onBeforeRender;
    scene.onBeforeRender = function onBeforeRender(...args) {
        previous?.apply(this, args);
        if (!active) return;
        renderer.getDrawingBufferSize(size);
        outlines.forEach(material => material.uniforms.uResolution.value.copy(size));
        scene.traverse((object) => {
            if (!object.isMesh || object.userData.lineArtPart || object.userData.lineArtSkip) return;
            if (object.material?.isShadowMaterial) return;
            style(object);
        });
        // Forget meshes the app removed
        styled.forEach(mesh => {
            if (!mesh.parent) styled.delete(mesh);
        });
    };

    return {
        enable(palette) {
            colors = palette;
            active = true;
            const pixels = 1.4 * Math.min(globalThis.devicePixelRatio || 1, 2);
            outline.uniforms.uColor.value.setHex(palette.ink);
            outline.uniforms.uPixels.value = pixels;
            invertedOutline.uniforms.uColor.value.setHex(palette.ink);
            invertedOutline.uniforms.uPixels.value = -pixels;
            crease.color.setHex(palette.ink);
            fills.forEach(fill => fill.color.setHex(palette.paper));
        },
        disable() {
            if (!active) return;
            active = false;
            [...styled].forEach(unstyle);
        }
    };
}

/**
 * @param {Object} options
 * @param {THREE.Scene} options.scene
 * @param {THREE.WebGLRenderer} [options.renderer] - Needed for generic line art
 * @param {Function} options.requestRender
 * @param {Function} options.applyBackground - (mode, inkPaper|null) recolour background + grid
 * @param {number} [options.axesExtent] - Half-length of the floor axis lines
 * @param {{ enable: Function, disable: Function }} [options.lineArt] - Custom line art
 */
export function createViewerStyle({ scene, renderer, requestRender, applyBackground, axesExtent = 300, lineArt }) {
    const axes = createAxisLines(axesExtent);
    scene.add(axes);
    const lineArtRenderer = lineArt ?? (renderer ? createSceneLineArt(scene, renderer) : null);
    let settings = null;

    function apply(next = getViewerSettings()) {
        settings = next;
        axes.visible = next.axes;
        const palette = lineArtPalette(next.background);
        if (next.lineArt && lineArtRenderer) {
            lineArtRenderer.enable(palette);
            applyBackground(next.background, palette);
        } else {
            lineArtRenderer?.disable();
            applyBackground(next.background, null);
        }
        requestRender();
    }

    const unsubscribe = onViewerSettings(apply);
    apply();

    return {
        get settings() {
            return settings;
        },
        refresh: () => apply(),
        dispose() {
            unsubscribe();
            lineArtRenderer?.disable();
            scene.remove(axes);
        }
    };
}
