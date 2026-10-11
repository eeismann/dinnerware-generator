/**
 * Line Shell — Dinnerware Designer configuration of the Line app frame:
 * the app's mark, project controls in the bar, display toggles in the View
 * menu, a Layout menu and view tools in the caption, a piece/mesh readout,
 * and a shaded viewer with an optional one-ink "Line render".
 */

import { getViewport } from '../viewport.js';
import { stateManager } from '../../state/projectState.js';
import { $, el, bootLineApp, mountLineApp, proxyMenu } from './lineAppShell.js';

const RENDER_KEY = 'ceramics-line-render';

/**
 * A two-option select shown as a compact Line toggle; the select stays the
 * source of truth (main.js listens to it).
 */
function selectAsToggle(select) {
    const toggle = el('div', 'ln-segmented');
    toggle.setAttribute('role', 'group');
    toggle.setAttribute('aria-label', select.getAttribute('aria-label') || 'Options');
    const buttons = [...select.options].map(option => {
        const button = el('button', '', option.textContent.split(/\s+[—-]\s+/)[0]);
        button.type = 'button';
        button.title = option.textContent;
        button.addEventListener('click', () => {
            if (select.value === option.value) return;
            select.value = option.value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            sync();
        });
        toggle.appendChild(button);
        return { button, value: option.value };
    });
    const sync = () => buttons.forEach(({ button, value }) => button.setAttribute('aria-pressed', String(select.value === value)));
    select.addEventListener('change', sync);
    select.classList.add('ln-replaced');
    select.after(toggle);
    sync();
    return sync;
}

/**
 * Dinnerware panel refinements for the Line interface: plain section names,
 * no preset row or explainers, a toggle for the positive-angle anchor, and
 * a View menu without the controls that moved elsewhere.
 */
function refinePanel() {
    const rename = { 'global-scaling': 'Scaling', 'global-style': 'Style' };
    Object.entries(rename).forEach(([section, name]) => {
        const heading = $(`[data-section="${section}"] .section-header h3`);
        if (heading) heading.textContent = name;
    });
    document.querySelectorAll('#parameterPanel .preset-row, #parameterPanel #stylePresetHelp, #parameterPanel .preset-save')
        .forEach(node => node.classList.add('ln-hidden'));
    const anchor = $('[data-param="positiveWallAngleAnchor"] select');
    const syncAnchor = anchor ? selectAsToggle(anchor) : () => {};
    // Layout has its own menu; Negative replaces the light/dark background
    const layoutSection = $('#btnLayoutRow')?.closest('.view-menu-section');
    if (layoutSection) {
        layoutSection.classList.add('ln-hidden');
        const divider = layoutSection.previousElementSibling;
        if (divider?.classList.contains('view-menu-divider')) divider.classList.add('ln-hidden');
    }
    $('#btnToggleBackground')?.classList.add('ln-hidden');
    return syncAnchor;
}

bootLineApp(
    () => getViewport()?.meshes.size > 0 && $('#parameterPanel .panel-content'),
    () => {
        const viewport = getViewport();
        let lineRender = localStorage.getItem(RENDER_KEY) === 'line';

        const ctx = mountLineApp({
            id: 'dinnerware',
            title: 'Dinnerware',
            // The app name opens a menu of every app and the dashboard
            mark: { text: 'Dinnerware' },
            appSwitcher: { base: './' },
            projectInBar: true,
            projectCentered: true,
            iconActions: true,
            viewMenu: '#viewMenu',
            caption: false,
            root: '#app',
            dashboardHref: './dashboard.html',
            stages: ['.viewport-container'],
            panel: '#parameterPanel',
            panelBody: '.panel-content',
            barActions: ['#btnUndo', '#btnRedo'],
            barToggles: [{
                label: 'Line render',
                action: 'render',
                title: 'Draw the pieces in one ink instead of the shaded viewer',
                get: () => lineRender,
                set: (value) => {
                    lineRender = value;
                    localStorage.setItem(RENDER_KEY, lineRender ? 'line' : 'shaded');
                },
                restyleViewer: true
            }],
            primary: ['#btnExportSTL'],
            tools: (container) => {
                const viewTools = el('div', 'ln-group');
                // All arrangements under one menu button
                viewTools.appendChild(proxyMenu('Layout', [
                    { text: 'Row', source: '#btnLayoutRow' },
                    { text: 'Grid', source: '#btnLayoutGrid' },
                    { text: 'Stacked', source: '#btnLayoutStack' },
                    { text: 'Table setting', source: '#btnLayoutTable' }
                ]));
                viewTools.append(...['.view-menu-container', '.items-menu-container']
                    .map(s => $(s)).filter(Boolean));
                viewTools.querySelectorAll('#btnViewMenu, #btnItemsMenu')
                    .forEach(button => button.classList.add('ln-toggle', 'ln-text-only'));
                container.appendChild(viewTools);
            },
            readout: [
                {
                    label: 'Mesh',
                    text: () => {
                        let vertices = 0;
                        viewport.meshes.forEach(mesh => {
                            if (mesh.visible) vertices += mesh.geometry.getAttribute('position').count;
                        });
                        return `${(vertices / 1000).toFixed(1)}k verts`;
                    }
                }
            ],

            subscribe: (refresh) => {
                stateManager.subscribeAll(refresh);
                viewport.onSelect(refresh);
            },
            // Shaded by default, like the original app; "Line render" draws
            // the pieces in one ink to match the page
            viewer: (colors, theme) => {
                if (lineRender) {
                    viewport.setAppearance({
                        ink: colors.ink,
                        paper: colors.paper,
                        outlinePixels: 1.4 * Math.min(window.devicePixelRatio || 1, 2)
                    });
                } else {
                    viewport.clearAppearance({ background: colors.paper, light: theme === 'positive' });
                }
            }
        });

        const syncAnchor = refinePanel();
        // Loading a project or undo rewrites the select without a change event
        stateManager.subscribeAll(() => requestAnimationFrame(syncAnchor));
        return ctx;
    }
);
