/**
 * Vessel Designer V3 - Lid Inspector (Phase 1: state/UI shell only)
 *
 * Unlike the spout, a vessel has at most one lid, so this isn't a
 * selection-contextual card — it's a static settings panel docked in the
 * profile workspace sidebar, next to the existing profile controls/warnings.
 * Reuses the same `.mi-*` field/range/select/warn chrome as MotifInspector so
 * it looks native. No lid geometry exists yet (Phase 3 wires lidGenerator.js
 * + a second STL export button) — controls only update state.lid.
 */

import vesselV3State from '../state/vesselV3State.js';

const MIN_LID_CLEARANCE_WARN_MM = 0.2;

export class LidInspector {
    constructor() {
        this.el = {
            panel: document.getElementById('lidInspector'),
            enabled: document.getElementById('lidEnabled'),
            body: document.getElementById('lidBody'),
            previewMode: document.getElementById('lidPreviewMode'),
            fit: document.getElementById('lidFit'),
            domeHeight: document.getElementById('lidDomeHeight'),
            domeHeightVal: document.getElementById('lidDomeHeightVal'),
            wall: document.getElementById('lidWall'),
            wallVal: document.getElementById('lidWallVal'),
            clearance: document.getElementById('lidClearance'),
            clearanceVal: document.getElementById('lidClearanceVal'),
            knobStyle: document.getElementById('lidKnobStyle'),
            knobHeight: document.getElementById('lidKnobHeight'),
            knobHeightVal: document.getElementById('lidKnobHeightVal'),
            knobWidth: document.getElementById('lidKnobWidth'),
            knobWidthVal: document.getElementById('lidKnobWidthVal'),
            flangeDepthField: document.getElementById('lidFlangeDepthField'),
            flangeDepth: document.getElementById('lidFlangeDepth'),
            flangeDepthVal: document.getElementById('lidFlangeDepthVal'),
            warn: document.getElementById('lidWarn'),
            warnText: document.getElementById('lidWarnText')
        };

        if (!this.el.panel) return;

        this.bind();
        this.unsubscribe = vesselV3State.subscribe('*', () => this.sync());
        this.sync();
    }

    bind() {
        this.el.enabled.addEventListener('change', () => {
            vesselV3State.setLid({ enabled: this.el.enabled.checked }, { history: false });
        });

        this.el.fit.querySelectorAll('button').forEach((btn) => {
            btn.addEventListener('click', () => {
                vesselV3State.setLid({ fit: btn.dataset.v }, { history: false });
            });
        });

        this.el.previewMode?.querySelectorAll('button').forEach((btn) => {
            btn.addEventListener('click', () => {
                vesselV3State.setState('ui.lidPreviewMode', btn.dataset.v, { history: false });
            });
        });

        this.bindRange('domeHeight', 'domeHeight');
        this.bindRange('wall', 'wallThickness');
        this.bindRange('clearance', 'clearance');
        this.bindRange('knobHeight', 'knob.height');
        this.bindRange('knobWidth', 'knob.width');
        this.bindRange('flangeDepth', 'flangeDepth');

        this.el.knobStyle.addEventListener('change', () => {
            vesselV3State.setLid({ knob: { style: this.el.knobStyle.value } }, { history: false });
        });
    }

    bindRange(elKey, field) {
        const input = this.el[elKey];
        input.addEventListener('input', () => {
            const value = Number(input.value);
            if (field.startsWith('knob.')) {
                const knobField = field.split('.')[1];
                vesselV3State.setLid({ knob: { [knobField]: value } }, { history: false });
            } else {
                vesselV3State.setLid({ [field]: value }, { history: false });
            }
        });
    }

    // ----- rendering -----

    sync() {
        if (!this.el.panel) return;
        const lid = vesselV3State.getState('lid') || {};

        if (document.activeElement !== this.el.enabled) {
            this.el.enabled.checked = lid.enabled === true;
        }
        this.el.body.hidden = lid.enabled !== true;

        if (this.el.previewMode) {
            this.setSeg(this.el.previewMode, vesselV3State.getState('ui.lidPreviewMode') || 'seated');
        }

        this.setSeg(this.el.fit, lid.fit);
        this.el.flangeDepthField.hidden = lid.fit !== 'inset';

        this.setValue(this.el.domeHeight, lid.domeHeight);
        this.setValue(this.el.wall, lid.wallThickness);
        this.setValue(this.el.clearance, lid.clearance);
        this.setValue(this.el.knobHeight, lid.knob?.height);
        this.setValue(this.el.knobWidth, lid.knob?.width);
        this.setValue(this.el.flangeDepth, lid.flangeDepth);
        if (document.activeElement !== this.el.knobStyle) {
            this.el.knobStyle.value = lid.knob?.style || 'ball';
        }

        this.el.domeHeightVal.textContent = `${Number(lid.domeHeight).toFixed(0)} mm`;
        this.el.wallVal.textContent = `${Number(lid.wallThickness).toFixed(2)} mm`;
        this.el.clearanceVal.textContent = `${Number(lid.clearance).toFixed(2)} mm`;
        this.el.knobHeightVal.textContent = `${Number(lid.knob?.height).toFixed(0)} mm`;
        this.el.knobWidthVal.textContent = `${Number(lid.knob?.width).toFixed(0)} mm`;
        this.el.flangeDepthVal.textContent = `${Number(lid.flangeDepth).toFixed(0)} mm`;

        this.updateWarning(lid);
    }

    setValue(el, value) {
        if (document.activeElement === el || value === undefined) return;
        el.value = value;
    }

    setSeg(group, value) {
        group.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.v === value));
    }

    updateWarning(lid) {
        if (lid.enabled === true && Number(lid.clearance) < MIN_LID_CLEARANCE_WARN_MM) {
            this.el.warnText.textContent = `Clearance ${Number(lid.clearance).toFixed(2)} mm may not fit without sanding (min ${MIN_LID_CLEARANCE_WARN_MM} mm).`;
            this.el.warn.classList.add('show');
        } else {
            this.el.warn.classList.remove('show');
        }
    }

    dispose() {
        this.unsubscribe?.();
    }
}

export default LidInspector;
