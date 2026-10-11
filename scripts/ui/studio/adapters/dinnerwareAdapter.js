/**
 * Studio Shell adapter — Dinnerware Designer.
 * Boots itself from index.html; waits for the app to initialize, then
 * mounts the shell. Rail/items controls PROXY the classic controls so
 * app state stays coherent with zero changes to main.js.
 */
import { initStudioShell } from '../studioShell.js';
import { isStudio } from '../studioMode.js';
import { getViewport } from '../../viewport.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

function clickProxy(sel) {
    return () => { const el = $(sel); if (el) el.click(); };
}

function itemCheckboxes() {
    return $$('.items-menu-item input[data-item]');
}

function whenReady(check, cb, tries = 200) {
    const tick = () => {
        if (check()) cb();
        else if (tries-- > 0) setTimeout(tick, 50);
    };
    tick();
}

if (isStudio()) {
    whenReady(
        () => getViewport() && $('#parameterPanel') && itemCheckboxes().length,
        () => {
            const vp = getViewport();
            initStudioShell({
                appId: 'dinnerware',
                homeHref: './dashboard.html',
                topbar: {
                    nameEl: '#projectName',
                    unsavedEl: '#unsavedIndicator',
                    primaryEl: '#btnExportSTL',
                    menuEls: ['#btnUndo', '#btnRedo', '#btnNewProject', '#btnLoadProject', '#btnSaveProject']
                },
                rail: [
                    { id: 'params', icon: 'sliders', tip: 'Parameters', role: 'panel' },
                    { id: 'surface', icon: 'pattern', tip: 'Surface pattern', role: 'panel', panelId: 'surface' },
                    { divider: true },
                    {
                        id: 'pan', icon: 'hand', tip: 'Pan view', role: 'pan',
                        toggle: () => vp.togglePanMode(),
                        set: (on) => vp.setPanMode(on),
                        get: () => vp.isPanMode(),
                        subscribe: (cb) => vp.onPanModeChange(cb)
                    },
                    { id: 'section', icon: 'section', tip: 'Cross-section', set: clickProxy('#btnCrossSection') },
                    { id: 'profile', icon: 'ruler', tip: 'Profile editor', set: clickProxy('#btnProfileView') },
                    { id: 'compare', icon: 'outline', tip: 'Compare with a snapshot', set: clickProxy('#btnCompare') },
                    { id: 'grid', icon: 'grid', tip: 'Grid', initial: true, set: clickProxy('#btnToggleGrid') },
                    { id: 'tone', icon: 'tone', tip: 'Canvas tone', initial: true, set: clickProxy('#btnToggleBackground') }
                ],
                panels: [
                    { id: 'params', title: 'Parameters', mountEl: '#parameterPanel' },
                    { id: 'surface', title: 'Surface', mountEl: '[data-section="surface-pattern"]' }
                ],
                statusSel: '#statusInfo',
                items: {
                    title: 'Items',
                    rows: () => itemCheckboxes().map(cb => ({
                        id: cb.dataset.item,
                        name: cb.closest('label').textContent.trim(),
                        visible: cb.checked
                    })),
                    setVisible: (id, visible) => {
                        const cb = $(`.items-menu-item input[data-item="${id}"]`);
                        if (cb && cb.checked !== visible) {
                            cb.checked = visible;
                            cb.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                    },
                    subscribe: (cb) => itemCheckboxes().forEach(el => el.addEventListener('change', cb))
                },
                warnings: { listSel: '#warningsList' },
                camera: {
                    rig: () => vp.getCameraRig(),
                    presets: {
                        Top: () => vp.setCameraPreset('top'),
                        Bottom: () => vp.setCameraPreset('bottom'),
                        Right: () => vp.setCameraPreset('side')
                    },
                    reset: () => vp.resetView()
                }
            });
        }
    );
}
