/**
 * Studio Shell — manipulable reference-style CSS-3D orientation square.
 *
 * Two-way sync with the app's Three.js camera via a "rig":
 *   { camera, controls, requestRender(opts), cancelTween?() }
 * - Orbit the canvas → cube follows (controls 'change' event → az/polar → CSS rotate).
 * - Drag the cube  → camera orbits (spherical mutation, radius preserved).
 * - Click a face   → app's native preset where provided, else eased spherical snap.
 */
import { icon } from './icons.js';

const FACES = ['Front', 'Back', 'Right', 'Left', 'Top', 'Bottom'];
const EPS = 0.035;
const FACE_ANGLES = {
    Front:  { theta: 0,            phi: 1.32 },
    Back:   { theta: Math.PI,      phi: 1.32 },
    Right:  { theta: Math.PI / 2,  phi: 1.32 },
    Left:   { theta: -Math.PI / 2, phi: 1.32 },
    Top:    { theta: null,         phi: EPS },
    Bottom: { theta: null,         phi: Math.PI - EPS }
};

// UI coordinates follow the reference convention: X red, Y green, Z blue.
// The Three.js scenes are Y-up, so UI Y maps to world Z and UI Z maps to world Y.
const AXES = [
    { key: 'x', label: 'X', color: '#E35D54', vector: [1, 0, 0] },
    { key: 'y', label: 'Y', color: '#4DB576', vector: [0, 0, 1] },
    { key: 'z', label: 'Z', color: '#4D8DFF', vector: [0, 1, 0] }
];

const CUBE_CENTER = { x: 50.7, y: 45.9 };
const AXIS_LENGTH = 40.2;
const AXIS_DOT_RADIUS = 2.04;

function sphericalFromOffset(x, y, z) {
    const radius = Math.sqrt(x * x + y * y + z * z) || 1;
    return {
        radius,
        theta: Math.atan2(x, z),
        phi: Math.acos(Math.min(1, Math.max(-1, y / radius)))
    };
}

function offsetFromSpherical(s) {
    const sinPhiR = s.radius * Math.sin(s.phi);
    return {
        x: sinPhiR * Math.sin(s.theta),
        y: s.radius * Math.cos(s.phi),
        z: sinPhiR * Math.cos(s.theta)
    };
}

export function createViewCube({ rig, presets = {}, onReset }) {
    const wrap = document.createElement('div');
    wrap.className = 'st-vc-wrap';
    wrap.dataset.hide = 'left';
    wrap.innerHTML = `
      <svg class="st-vc-axes" viewBox="0 0 103.2 92.4" aria-hidden="true">
        ${AXES.map(axis => `
          <g data-axis="${axis.key}">
            <line class="st-vc-axis-shadow" x1="${CUBE_CENTER.x}" y1="${CUBE_CENTER.y}" x2="${CUBE_CENTER.x}" y2="${CUBE_CENTER.y}"/>
            <line class="st-vc-axis-line" x1="${CUBE_CENTER.x}" y1="${CUBE_CENTER.y}" x2="${CUBE_CENTER.x}" y2="${CUBE_CENTER.y}" stroke="${axis.color}"/>
            <circle class="st-vc-axis-dot" cx="${CUBE_CENTER.x}" cy="${CUBE_CENTER.y}" r="${AXIS_DOT_RADIUS}" fill="${axis.color}"/>
            <text class="st-vc-axis-label" x="${CUBE_CENTER.x}" y="${CUBE_CENTER.y}" fill="${axis.color}">${axis.label}</text>
          </g>`).join('')}
      </svg>
      <div class="st-vc-scene"><div class="st-viewcube">
        ${FACES.map(f => `<div class="st-vc-face st-vc-${f.toLowerCase()}" data-view="${f}">${f}</div>`).join('')}
      </div></div>
      <button class="st-vc-reset" title="Reset view">${icon('reset')}</button>`;

    const cube = wrap.querySelector('.st-viewcube');
    const scene = wrap.querySelector('.st-vc-scene');
    const axesSvg = wrap.querySelector('.st-vc-axes');
    const { camera, controls } = rig;
    const worldAxes = rig.createWorldAxes?.();
    if (worldAxes) wrap.dataset.worldAxes = 'true';
    rig.requestRender && rig.requestRender({ settle: true });

    let dragging = false;
    let snapFrame = null;

    function currentSpherical() {
        const t = controls.target;
        return sphericalFromOffset(
            camera.position.x - t.x,
            camera.position.y - t.y,
            camera.position.z - t.z
        );
    }

    function applySpherical(s) {
        const o = offsetFromSpherical(s);
        const t = controls.target;
        camera.position.set(t.x + o.x, t.y + o.y, t.z + o.z);
        camera.lookAt(t.x, t.y, t.z);
        controls.update();
        rig.requestRender && rig.requestRender({ settle: true });
    }

    function paintFromCamera() {
        const s = currentSpherical();
        const rx = (s.phi * 180 / Math.PI) - 90;
        const ry = -(s.theta * 180 / Math.PI);
        cube.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`;

        const inverseCameraRotation = camera.quaternion.clone().invert();
        AXES.forEach((axis) => {
            const projected = camera.position.clone().set(...axis.vector).applyQuaternion(inverseCameraRotation);
            const depth = projected.z;
            const length = AXIS_LENGTH * (0.76 + Math.max(0, depth) * 0.24);
            const x2 = CUBE_CENTER.x + projected.x * length;
            const y2 = CUBE_CENTER.y - projected.y * length;
            const labelDistance = 8;
            const screenLength = Math.hypot(projected.x, projected.y) || 1;
            const labelX = x2 + (projected.x / screenLength) * labelDistance;
            const labelY = y2 - (projected.y / screenLength) * labelDistance;
            const axisGroup = axesSvg.querySelector(`[data-axis="${axis.key}"]`);
            const line = axisGroup.querySelector('.st-vc-axis-line');
            const shadow = axisGroup.querySelector('.st-vc-axis-shadow');
            const endpoint = axisGroup.querySelector('circle');
            const label = axisGroup.querySelector('text');
            line.setAttribute('x2', x2.toFixed(2));
            line.setAttribute('y2', y2.toFixed(2));
            shadow.setAttribute('x2', x2.toFixed(2));
            shadow.setAttribute('y2', y2.toFixed(2));
            endpoint.setAttribute('cx', x2.toFixed(2));
            endpoint.setAttribute('cy', y2.toFixed(2));
            label.setAttribute('x', labelX.toFixed(2));
            label.setAttribute('y', (labelY + 3).toFixed(2));
            axisGroup.style.opacity = String(0.5 + Math.abs(depth) * 0.5);
            axisGroup.style.zIndex = depth >= 0 ? '3' : '1';
        });
    }

    function stopSnap() {
        if (snapFrame) { cancelAnimationFrame(snapFrame); snapFrame = null; }
    }

    function snapTo(target) {
        stopSnap();
        rig.cancelTween && rig.cancelTween();
        const from = currentSpherical();
        const to = {
            radius: from.radius,
            theta: target.theta === null ? from.theta : target.theta,
            phi: target.phi
        };
        // shortest angular path
        let dTheta = to.theta - from.theta;
        dTheta = Math.atan2(Math.sin(dTheta), Math.cos(dTheta));
        const start = performance.now();
        const DUR = 350;
        function step(now) {
            const t = Math.min(1, (now - start) / DUR);
            const e = 1 - Math.pow(1 - t, 3);
            applySpherical({
                radius: from.radius,
                theta: from.theta + dTheta * e,
                phi: from.phi + (to.phi - from.phi) * e
            });
            if (t < 1) snapFrame = requestAnimationFrame(step);
            else snapFrame = null;
        }
        snapFrame = requestAnimationFrame(step);
    }

    /* camera → cube */
    const onControlsChange = () => { if (!dragging) paintFromCamera(); };
    controls.addEventListener('change', onControlsChange);
    paintFromCamera();

    /* cube → camera (drag) */
    let drag = null;
    scene.addEventListener('pointerdown', (e) => {
        stopSnap();
        rig.cancelTween && rig.cancelTween();
        drag = { x0: e.clientX, y0: e.clientY, s: currentSpherical(), moved: false };
        scene.setPointerCapture(e.pointerId);
        scene.classList.add('is-dragging');
        e.preventDefault();
    });
    scene.addEventListener('pointermove', (e) => {
        if (!drag) return;
        const dx = e.clientX - drag.x0;
        const dy = e.clientY - drag.y0;
        if (Math.abs(dx) + Math.abs(dy) > 4) { drag.moved = true; dragging = true; }
        if (!drag.moved) return;
        const s = {
            radius: drag.s.radius,
            theta: drag.s.theta - dx * 0.011,
            phi: Math.min(Math.PI - EPS, Math.max(EPS, drag.s.phi - dy * 0.011))
        };
        applySpherical(s);
        paintFromCamera();
    });
    const endDrag = () => {
        if (drag && drag.moved) {
            cube._suppressClick = true;
            setTimeout(() => { cube._suppressClick = false; }, 0);
        }
        drag = null;
        dragging = false;
        scene.classList.remove('is-dragging');
        paintFromCamera();
    };
    scene.addEventListener('pointerup', endDrag);
    scene.addEventListener('pointercancel', endDrag);

    /* face click → preset or generic snap */
    wrap.querySelectorAll('.st-vc-face').forEach((f) => {
        f.addEventListener('click', () => {
            if (cube._suppressClick) return;
            const view = f.dataset.view;
            f.classList.add('is-selected');
            setTimeout(() => f.classList.remove('is-selected'), 260);
            const native = presets[view];
            if (native) {
                rig.cancelTween && rig.cancelTween();
                native();
            } else {
                snapTo(FACE_ANGLES[view]);
            }
        });
    });

    wrap.querySelector('.st-vc-reset').addEventListener('click', () => {
        stopSnap();
        if (onReset) onReset();
    });

    return {
        el: wrap,
        destroy() {
            stopSnap();
            controls.removeEventListener('change', onControlsChange);
            worldAxes?.dispose?.();
            wrap.remove();
        }
    };
}
