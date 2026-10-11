/**
 * Studio Shell adapter — Cast Form (Mold Studio).
 * - Case Box rail mode drives the EXISTING view.caseBoxPreview state switch
 *   (proxying the classic #caseBoxPreviewToggle checkbox).
 * - Assembly (view mode + explosion distance) is reparented from the classic
 *   footer view menu into the params panel.
 * - Parts panel calls the new viewport.setPartVisible() over the named
 *   meshes in moldGroup. Zero geometry changes.
 */
import { initStudioShell } from '../studioShell.js';
import { isStudio } from '../studioMode.js';
import { castFormState } from '../../../castForm/state/castFormState.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

const PART_LABELS = {
    foot: 'Foot Mold',
    wall1: 'Wall Section A',
    wall2: 'Wall Section B',
    wall3: 'Wall Section C',
    wall4: 'Wall Section D'
};

function whenReady(check, cb, tries = 200) {
    const tick = () => {
        if (check()) cb();
        else if (tries-- > 0) setTimeout(tick, 50);
    };
    tick();
}

function setCaseBoxEnabled(on) {
    const cb = $('#caseBoxPreviewToggle');
    if (cb && cb.checked !== on) {
        cb.checked = on;
        cb.dispatchEvent(new Event('change', { bubbles: true }));
    }
}

/** Move the classic view-mode buttons + explosion slider into the panel. */
function buildAssemblySection() {
    const panel = $('#parameterPanel');
    if (!panel || $('#stAssemblySection')) return;
    const section = document.createElement('div');
    section.className = 'panel-section st-assembly';
    section.id = 'stAssemblySection';
    section.innerHTML = '<div class="section-header"><h3>Assembly</h3></div><div class="section-content st-assembly-body"></div>';
    const body = section.querySelector('.st-assembly-body');
    $$('#viewMenu [data-view]').forEach(btn => body.appendChild(btn));
    const slider = $('#explosionDistanceContainer');
    if (slider) body.appendChild(slider);
    panel.appendChild(section);
}

if (isStudio()) {
    whenReady(
        () => window.castFormApp && window.castFormApp.viewport && $('#parameterPanel'),
        () => {
            const vp = window.castFormApp.viewport;
            buildAssemblySection();
            initStudioShell({
                appId: 'castform',
                homeHref: '../dashboard.html',
                classicToggleHost: '#settingsPanel',
                topbar: {
                    nameEl: '#projectName',
                    unsavedEl: '#unsavedIndicator',
                    primaryEl: '#exportBtn',
                    menuEls: ['#newBtn', '#loadBtn', '#saveBtn']
                },
                rail: [
                    { id: 'params', icon: 'sliders', tip: 'Mold setup', role: 'panel' },
                    {
                        id: 'casebox', icon: 'casebox', tip: 'Case box editor', role: 'mode',
                        title: 'Case Box',
                        set: (on) => setCaseBoxEnabled(on)
                    },
                    { divider: true },
                    {
                        id: 'pan', icon: 'hand', tip: 'Pan view', role: 'pan',
                        toggle: () => vp.togglePanMode(),
                        set: (on) => vp.setPanMode(on),
                        get: () => vp.isPanMode(),
                        subscribe: (cb) => vp.onPanModeChange(cb)
                    },
                    {
                        id: 'grid', icon: 'grid', tip: 'Grid', initial: true,
                        set: () => { const g = $('#showGrid'); if (g) g.click(); }
                    }
                ],
                modes: { exitMode: () => setCaseBoxEnabled(false) },
                panel: { title: 'Mold Setup', mountEl: '#parameterPanel' },
                statusSel: '#statusText',
                items: {
                    title: 'Mold Parts',
                    rows: () => {
                        const rows = (vp.moldGroup ? vp.moldGroup.children : []).map(m => ({
                            id: m.name,
                            name: PART_LABELS[m.name] || m.name,
                            visible: m.visible,
                            color: m.material && m.material.color ? '#' + m.material.color.getHexString() : null
                        }));
                        if (vp.inputGroup) {
                            rows.push({ id: '__input', name: 'Input Preview', visible: vp.inputGroup.visible });
                        }
                        return rows;
                    },
                    setVisible: (id, visible) => {
                        if (id === '__input') {
                            if (vp.inputGroup) { vp.inputGroup.visible = visible; vp.requestRender(); }
                        } else {
                            vp.setPartVisible(id, visible);
                        }
                    },
                    subscribe: (cb) => castFormState.subscribe('output', () => setTimeout(cb, 50))
                },
                warnings: { listSel: '#warningList' },
                camera: {
                    rig: () => vp.getCameraRig(),
                    presets: {
                        Front: () => vp.setCameraPreset('front'),
                        Right: () => vp.setCameraPreset('side'),
                        Top: () => vp.setCameraPreset('top')
                    },
                    reset: () => vp.setCameraPreset('threeQuarter')
                }
            });
        }
    );
} else {
    // classic mode: ensure the Interface toggle exists in the settings panel
    whenReady(() => $('#settingsPanel'), () => {
        import('../studioShell.js').then(m => m.injectClassicToggle('#settingsPanel'));
    });
}
