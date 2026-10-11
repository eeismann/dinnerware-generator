/**
 * Studio Shell adapter — Vessel Designer (V1).
 */
import { initStudioShell } from '../studioShell.js';
import { isStudio } from '../studioMode.js';

const $ = (s) => document.querySelector(s);
const clickProxy = (sel) => () => { const el = $(sel); if (el) el.click(); };

function whenReady(check, cb, tries = 200) {
    const tick = () => {
        if (check()) cb();
        else if (tries-- > 0) setTimeout(tick, 50);
    };
    tick();
}

if (isStudio()) {
    whenReady(
        () => window.vesselApp && window.vesselApp.viewport && $('#parameterPanel'),
        () => {
            const vp = window.vesselApp.viewport;
            initStudioShell({
                appId: 'vessel',
                homeHref: '../dashboard.html',
                topbar: {
                    nameEl: '#projectName',
                    unsavedEl: '#unsavedIndicator',
                    primaryEl: '#btnExportSTL',
                    menuEls: ['#btnNewProject', '#btnLoadProject', '#btnSaveProject']
                },
                rail: [
                    { id: 'params', icon: 'sliders', tip: 'Parameters', role: 'panel' },
                    { divider: true },
                    {
                        id: 'pan', icon: 'hand', tip: 'Pan view', role: 'pan',
                        toggle: () => vp.togglePanMode(),
                        set: (on) => vp.setPanMode(on),
                        get: () => vp.isPanMode(),
                        subscribe: (cb) => vp.onPanModeChange(cb)
                    },
                    { id: 'section', icon: 'section', tip: 'Cross-section', set: clickProxy('#btnToggleCrossSection') },
                    { id: 'grid', icon: 'grid', tip: 'Grid', initial: true, set: clickProxy('#btnToggleGrid') }
                ],
                panel: { title: 'Vessel Sections', mountEl: '#parameterPanel' },
                statusSel: '#statusInfo',
                warnings: { listSel: '#warningsList' },
                camera: {
                    rig: () => vp.getCameraRig && vp.getCameraRig(),
                    presets: {
                        Top: () => vp.setCameraPreset('top'),
                        Bottom: () => vp.setCameraPreset('bottom'),
                        Right: () => vp.setCameraPreset('side')
                    },
                    reset: () => vp.setCameraPreset('threeQuarter')
                }
            });
        }
    );
}
