/**
 * Studio Shell adapter — Vessel V3.
 * Moves the full profile configurator into the left island so the 3D preview
 * can use the same full-plane viewport as the other generator apps.
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
        () => window.vesselV3App && $('.profile-controls') && $('#motifInspector'),
        () => {
            const vp = window.vesselV3App.viewport; // may be null (WebGL fallback)
            const app = window.vesselV3App;
            $('#profileEditor')?.appendChild($('#motifInspector'));
            initStudioShell({
                appId: 'vessel-v3',
                homeHref: '../dashboard.html',
                topbar: {
                    nameEl: '#projectName',
                    unsavedEl: '#unsavedIndicator',
                    primaryEl: '#btnExportSTL',
                    menuEls: ['#btnNewProject', '#btnLoadProject', '#btnSaveProject']
                },
                rail: [
                    { id: 'params', icon: 'sliders', tip: 'Configurator', role: 'panel' },
                    { divider: true },
                    {
                        id: 'pan', icon: 'hand', tip: 'Pan view', role: 'pan',
                        toggle: () => {
                            const on = !(vp?.isPanMode?.() || app.profileEditor?.isPanMode?.());
                            vp?.setPanMode?.(on);
                            app.profileEditor?.setPanMode?.(on);
                            return on;
                        },
                        set: (on) => {
                            vp?.setPanMode?.(on);
                            app.profileEditor?.setPanMode?.(on);
                            return Boolean(on);
                        },
                        get: () => Boolean(vp?.isPanMode?.() || app.profileEditor?.isPanMode?.()),
                        subscribe: (cb) => {
                            const unsub = vp?.onPanModeChange?.(cb) || (() => {});
                            const editor = app.profileEditor?.container;
                            editor?.addEventListener('profile-pan-mode-change', cb);
                            return () => {
                                unsub();
                                editor?.removeEventListener('profile-pan-mode-change', cb);
                            };
                        }
                    },
                    { id: 'section', icon: 'section', tip: 'Cross-section (3D)', set: clickProxy('#btnToggleCrossSection') },
                    { id: 'grid', icon: 'grid', tip: 'Grid (3D)', set: clickProxy('#btnToggleGrid'), initial: true }
                ],
                panel: { title: 'Configurator', mountEl: '#profileEditor', startOpen: false, fill: true },
                statusSel: '#statusInfo',
                warnings: { listSel: '#profileWarnings' },
                camera: vp ? {
                    rig: () => vp.getCameraRig && vp.getCameraRig(),
                    presets: {
                        Top: () => vp.setCameraPreset('top'),
                        Bottom: () => vp.setCameraPreset('bottom'),
                        Right: () => vp.setCameraPreset('side')
                    },
                    reset: () => vp.setCameraPreset('threeQuarter')
                } : null
            });
        }
    );
}
