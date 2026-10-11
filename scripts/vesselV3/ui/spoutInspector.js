/**
 * Vessel Designer V3 - Spout Inspector (Phase 1: state/UI shell only)
 *
 * Mirrors MotifInspector's contextual-card pattern: the card is keyed off
 * `ui.selectedSegmentId` (the same wall-segment selection profileEditor.js
 * already exposes), reuses the same `.mi-*` card/field/warning chrome, and
 * writes edits straight onto `state.spout` via vesselV3State.setSpout(). No
 * geometry is generated from these values yet (Phase 2 wires spoutGraft.js
 * into the mesh generator) — sliders only update state and let the app's
 * existing debounced viewport update run (harmless no-op until Phase 2).
 */

import vesselV3State from '../state/vesselV3State.js';

const FLAT_EPS = 1e-6;
const MIN_PRINT_WALL_WARN_MM = 1.5;

export class SpoutInspector {
    constructor() {
        this.el = {
            panel: document.getElementById('spoutInspector'),
            title: document.getElementById('spoutSegTitle'),
            sub: document.getElementById('spoutSegSub'),
            close: document.getElementById('spoutClose'),
            enabled: document.getElementById('spoutEnabled'),
            hint: document.getElementById('spoutHint'),
            angle: document.getElementById('spoutAngle'),
            angleVal: document.getElementById('spoutAngleVal'),
            width: document.getElementById('spoutWidth'),
            widthVal: document.getElementById('spoutWidthVal'),
            length: document.getElementById('spoutLength'),
            lengthVal: document.getElementById('spoutLengthVal'),
            drop: document.getElementById('spoutDrop'),
            dropVal: document.getElementById('spoutDropVal'),
            wall: document.getElementById('spoutWall'),
            wallVal: document.getElementById('spoutWallVal'),
            warn: document.getElementById('spoutWarn'),
            warnText: document.getElementById('spoutWarnText')
        };

        if (!this.el.panel) return;

        this.bind();
        this.unsubscribe = vesselV3State.subscribe('*', () => this.sync());
        this.sync();
    }

    // ----- selection context (same shape as MotifInspector.getContext) -----

    getContext() {
        const state = vesselV3State.getState();
        const ownerId = state.ui.selectedSegmentId;
        if (!ownerId) return null;
        const points = state.profile.points;
        const index = points.findIndex((p) => p.id === ownerId);
        if (index <= 0) return null;
        const point = points[index];
        const prev = points[index - 1];
        if (Math.abs((point.h || 0) - (prev.h || 0)) < FLAT_EPS) return null; // flat/base
        return { points, index, point, prev, ownerId };
    }

    segNumber(points, ownerId) {
        let n = 0;
        for (let i = 1; i < points.length; i++) {
            if (Math.abs((points[i].h || 0) - (points[i - 1].h || 0)) < FLAT_EPS) continue;
            n += 1;
            if (points[i].id === ownerId) return n;
        }
        return n;
    }

    bind() {
        this.el.close.addEventListener('click', () => {
            vesselV3State.setState('ui.selectedSegmentId', null, { history: false });
        });

        this.el.enabled.addEventListener('change', () => {
            const ctx = this.getContext();
            if (!ctx) return;
            if (this.el.enabled.checked) {
                vesselV3State.setSpout({ enabled: true, segmentId: ctx.ownerId }, { history: false });
            } else {
                vesselV3State.setSpout({ enabled: false }, { history: false });
            }
        });

        this.bindRange('angle', 'angle');
        this.bindRange('width', 'width');
        this.bindRange('length', 'length');
        this.bindRange('drop', 'drop');
        this.bindRange('wall', 'wallThickness');
    }

    bindRange(elKey, field) {
        const input = this.el[elKey];
        input.addEventListener('input', () => {
            vesselV3State.setSpout({ [field]: Number(input.value) }, { history: false });
        });
    }

    // ----- rendering -----

    sync() {
        if (!this.el.panel) return;
        const ctx = this.getContext();

        if (!ctx) {
            this.el.panel.classList.add('hidden');
            return;
        }

        this.el.panel.classList.remove('hidden');

        const spout = vesselV3State.getState('spout') || {};
        const num = this.segNumber(ctx.points, ctx.ownerId);
        this.el.title.childNodes[0].nodeValue = `Spout — Segment ${num} `;
        this.el.sub.textContent = `h ${Math.round(ctx.prev.h)}–${Math.round(ctx.point.h)} mm`;

        const attachedHere = spout.enabled === true && spout.segmentId === ctx.ownerId;
        const attachedElsewhere = spout.enabled === true && spout.segmentId && spout.segmentId !== ctx.ownerId;

        if (document.activeElement !== this.el.enabled) {
            this.el.enabled.checked = attachedHere;
        }

        this.el.hint.hidden = attachedHere;
        this.el.hint.textContent = attachedElsewhere
            ? `Spout is currently on segment ${this.segNumber(ctx.points, spout.segmentId)} — enabling here moves it.`
            : 'Enable to pull a spout from this wall segment.';

        this.el.panel.querySelectorAll('.mi-hideable[data-suffix="controls"]').forEach((node) => {
            node.hidden = !attachedHere;
        });

        this.setValue(this.el.angle, spout.angle);
        this.setValue(this.el.width, spout.width);
        this.setValue(this.el.length, spout.length);
        this.setValue(this.el.drop, spout.drop);
        this.setValue(this.el.wall, spout.wallThickness);

        this.el.angleVal.textContent = `${Math.round(spout.angle)}°`;
        this.el.widthVal.textContent = `${Math.round(spout.width)}°`;
        this.el.lengthVal.textContent = `${Number(spout.length).toFixed(1)} mm`;
        this.el.dropVal.textContent = `${Number(spout.drop).toFixed(1)} mm`;
        this.el.wallVal.textContent = `${Number(spout.wallThickness).toFixed(2)} mm`;

        this.updateWarning(attachedHere, spout);
    }

    setValue(el, value) {
        if (document.activeElement === el) return; // don't fight an active drag
        el.value = value;
    }

    updateWarning(attachedHere, spout) {
        if (attachedHere && Number(spout.wallThickness) < MIN_PRINT_WALL_WARN_MM) {
            this.el.warnText.textContent = `Tip wall ${Number(spout.wallThickness).toFixed(2)} mm may be too thin to print reliably (min ${MIN_PRINT_WALL_WARN_MM} mm).`;
            this.el.warn.classList.add('show');
        } else {
            this.el.warn.classList.remove('show');
        }
    }

    dispose() {
        this.unsubscribe?.();
    }
}

export default SpoutInspector;
