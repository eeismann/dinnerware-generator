/**
 * Studio Shell adapter — Handle Designer.
 * Export Mold Kit lives in the ⋯ menu (open item 9.2 default).
 * Cube is hidden automatically in the WebGL fallback (rig() === null).
 */
import { initStudioShell } from '../studioShell.js';
import { isStudio } from '../studioMode.js';
import { getHandleViewport } from '../../../handle/ui/handleViewport.js';

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
        () => getHandleViewport() && $('#parameterPanel'),
        () => {
            const vp = getHandleViewport();
            initStudioShell({
                appId: 'handle',
                homeHref: '../dashboard.html',
                topbar: {
                    nameEl: '#projectName',
                    unsavedEl: '#unsavedIndicator',
                    primaryEl: '#btnExportSTL',
                    menuEls: ['#btnNewProject', '#btnLoadProject', '#btnSaveProject', '#btnExportMoldKit']
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
                    { id: 'section', icon: 'section', tip: 'Cross-section', set: clickProxy('#btnCrossSection') },
                    { id: 'grid', icon: 'grid', tip: 'Grid', initial: true, set: clickProxy('#btnToggleGrid') },
                    { id: 'dims', icon: 'ruler', tip: 'Dimensions', set: clickProxy('#btnToggleDimensions') },
                    { id: 'outlines', icon: 'outline', tip: 'Attachment outlines', set: clickProxy('#btnToggleOutlines') },
                    { id: 'mold', icon: 'boxes', tip: 'Mold preview', set: clickProxy('#btnMoldPreview') }
                ],
                panel: { title: 'Handle', mountEl: '#parameterPanel' },
                statusSel: '#handleDimensionsSummary',
                warnings: { listSel: '#warningsList' },
                camera: {
                    rig: () => vp.getCameraRig(),
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
