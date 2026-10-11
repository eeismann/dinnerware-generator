/**
 * View dock: a floating DialKit-styled card in the lower left of the
 * viewport holding an orientation cube (X/Y/Z, Shapr3D-style). Click a face
 * to snap the view, drag the cube to orbit; the cube follows the camera when
 * the canvas is orbited. A small icon expands the card into the app's view
 * controls plus global ones: interface and background light/dark, X/Y/Z
 * axis lines and line-art rendering (viewerSettings.js; each viewport
 * applies them through viewerStyle.js).
 *
 * The cube itself is the Studio shell's (`../studio/viewCube.js`), driven by
 * the viewport's `getCameraRig()`. Controls are plain dk rows rather than
 * DialKit panels: DialKit renders every registered panel in every root, so
 * a second root here would duplicate the parameter panels.
 *
 * Section spec:
 *   { title, controls: [
 *       { type: 'toggle', label, get(), set(value), labels?: [offLabel, onLabel] },
 *       { type: 'select', label, options: [{ value, label }], get(), set(value) },
 *       { type: 'slider', label, min, max, step, get(), set(value), format?(value) },
 *       { type: 'actions', items: [{ label, run() }] },
 *       { type: 'group', label, controls: [...] | () => [...] }  // collapsible;
 *                                                     // a function is re-read on sync
 *   ] }
 * Controls may have `visible()` to hide themselves; call `sync()` after
 * state changes made elsewhere.
 */

import { createViewCube } from '../studio/viewCube.js';
import { getMode, setMode } from '../themeManager.js';
import { getViewerSettings, setViewerSetting, onViewerSettings } from '../viewerSettings.js';

const EXPAND_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
    <line x1="4" y1="7" x2="20" y2="7"/><circle cx="9" cy="7" r="2.2" fill="currentColor" stroke="none"/>
    <line x1="4" y1="17" x2="20" y2="17"/><circle cx="15" cy="17" r="2.2" fill="currentColor" stroke="none"/>
</svg>`;
const RESET_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M3.5 12a8.5 8.5 0 1 0 2.5-6L3.5 8.5"/><path d="M3.5 3.5v5h5"/>
</svg>`;

let dockCount = 0;

/**
 * @param {Object} options
 * @param {HTMLElement} options.container - Positioned element over the 3D view
 * @param {Object} options.rig - Viewport `getCameraRig()` result
 * @param {Function} [options.onReset] - App's default view
 * @param {Array<Object>} [options.sections] - App view controls (see header)
 * @param {string} [options.storageKey] - Remembers expanded state
 * @param {HTMLElement} [options.accessory] - Card stacked above the cube (e.g. a part legend)
 */
export function createViewDock({ container, rig, onReset, sections = [], storageKey = 'dk_view_dock_open', accessory }) {
    const id = `dkViewPanel${++dockCount}`;
    const dock = document.createElement('div');
    dock.className = 'dk-view-dock';
    dock.innerHTML = `
        <div class="dk-view-panel" id="${id}" role="region" aria-label="View controls" hidden></div>
        <div class="dk-view-cube-card">
            <div class="dk-view-cube-slot"></div>
            <button class="dk-view-btn dk-view-reset" type="button" title="Reset view" aria-label="Reset view">${RESET_ICON}</button>
            <button class="dk-view-btn dk-view-expand" type="button" title="View controls" aria-label="View controls"
                aria-expanded="false" aria-controls="${id}">${EXPAND_ICON}</button>
        </div>`;
    container.appendChild(dock);
    // Above the panel, so the expanded controls stay attached to the cube
    if (accessory) dock.prepend(accessory);

    const panel = dock.querySelector('.dk-view-panel');
    const expand = dock.querySelector('.dk-view-expand');

    // The Studio cube draws world axes into the scene when the rig offers
    // them; the dock leaves each app's scene untouched.
    const cube = rig?.camera && rig?.controls
        ? createViewCube({ rig: { ...rig, createWorldAxes: undefined }, onReset })
        : null;
    if (cube) dock.querySelector('.dk-view-cube-slot').appendChild(cube.el);
    // Route through the cube's own (hidden) reset so an in-flight face snap
    // is cancelled before the app restores its default view
    dock.querySelector('.dk-view-reset').addEventListener('click', () => {
        const cubeReset = cube?.el.querySelector('.st-vc-reset');
        if (cubeReset) cubeReset.click();
        else onReset?.();
    });

    // --- Controls ------------------------------------------------------------

    const globalSection = {
        title: 'Appearance',
        controls: [
            {
                type: 'toggle',
                label: 'Interface',
                labels: ['Dark', 'Light'],
                get: () => getMode() === 'light',
                set: (light) => setMode(light ? 'light' : 'dark')
            },
            {
                type: 'toggle',
                label: 'Background',
                labels: ['Dark', 'Light'],
                get: () => getViewerSettings().background === 'light',
                set: (light) => setViewerSetting('background', light ? 'light' : 'dark')
            },
            {
                type: 'toggle',
                label: 'Axes',
                get: () => getViewerSettings().axes,
                set: (on) => setViewerSetting('axes', on)
            },
            {
                type: 'toggle',
                label: 'Line Art',
                get: () => getViewerSettings().lineArt,
                set: (on) => setViewerSetting('lineArt', on)
            }
        ]
    };
    const refreshers = [];

    function segmented(onLabel = 'On', offLabel = 'Off') {
        const wrap = document.createElement('span');
        wrap.className = 'dk-switch';
        wrap.innerHTML = `<button type="button" class="dk-seg" data-value="false">${offLabel}</button>
            <button type="button" class="dk-seg" data-value="true">${onLabel}</button>`;
        return wrap;
    }

    function renderControl(control, host, list = refreshers) {
        if (control.type === 'group') {
            const details = document.createElement('details');
            details.className = 'dk-view-group';
            details.innerHTML = `<summary>${control.label}</summary>`;
            host.appendChild(details);
            if (typeof control.controls !== 'function') {
                control.controls.forEach(child => renderControl(child, details, list));
                if (control.visible) list.push(() => { details.hidden = !control.visible(); });
                return;
            }
            // Dynamic group (e.g. one row per generated part): rebuild its rows
            // when their labels change, then refresh them
            let signature = null;
            let childRefreshers = [];
            list.push(() => {
                if (control.visible) details.hidden = !control.visible();
                const children = control.controls();
                const next = children.map(child => child.label).join('|');
                if (next !== signature) {
                    signature = next;
                    details.querySelectorAll(':scope > :not(summary)').forEach(node => node.remove());
                    childRefreshers = [];
                    children.forEach(child => renderControl(child, details, childRefreshers));
                }
                childRefreshers.forEach(refresh => refresh());
            });
            return;
        }
        if (control.type === 'actions') {
            const row = document.createElement('div');
            row.className = 'dk-view-actions';
            control.items.forEach(item => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'dk-chip';
                button.textContent = item.label;
                button.addEventListener('click', () => {
                    item.run();
                    sync();
                });
                row.appendChild(button);
            });
            host.appendChild(row);
            if (control.visible) list.push(() => { row.hidden = !control.visible(); });
            return;
        }

        const row = document.createElement('div');
        row.className = `dk-row dk-view-row dk-view-${control.type}`;
        const label = document.createElement('span');
        label.className = 'dk-row-label';
        label.textContent = control.label;
        row.appendChild(label);
        let refresh;

        if (control.type === 'toggle') {
            const [offLabel, onLabel] = control.labels ?? ['Off', 'On'];
            const toggle = segmented(onLabel, offLabel);
            toggle.setAttribute('role', 'group');
            toggle.setAttribute('aria-label', control.label);
            toggle.querySelectorAll('.dk-seg').forEach(seg => {
                seg.addEventListener('click', () => {
                    control.set(seg.dataset.value === 'true');
                    sync();
                });
            });
            row.appendChild(toggle);
            refresh = () => {
                const on = Boolean(control.get());
                toggle.querySelectorAll('.dk-seg').forEach(seg => {
                    seg.setAttribute('aria-pressed', String((seg.dataset.value === 'true') === on));
                });
            };
        } else if (control.type === 'select') {
            row.classList.add('dk-select-row');
            const select = document.createElement('select');
            select.setAttribute('aria-label', control.label);
            select.innerHTML = control.options
                .map(opt => `<option value="${opt.value}">${opt.label}</option>`).join('');
            select.addEventListener('change', () => {
                control.set(select.value);
                sync();
            });
            row.appendChild(select);
            row.insertAdjacentHTML('beforeend', `<svg class="dk-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>`);
            refresh = () => { select.value = String(control.get()); };
        } else if (control.type === 'slider') {
            // Reads like a DialKit slider: the fill shows the value; a real
            // range input on top keeps pointer and keyboard behaviour
            const fill = document.createElement('span');
            fill.className = 'dk-view-fill';
            const value = document.createElement('span');
            value.className = 'dk-view-value';
            const input = document.createElement('input');
            input.type = 'range';
            input.min = control.min;
            input.max = control.max;
            input.step = control.step ?? 1;
            input.setAttribute('aria-label', control.label);
            input.addEventListener('input', () => {
                control.set(Number(input.value));
                paint();
            });
            row.prepend(fill);
            row.append(value, input);
            const paint = () => {
                const v = Number(input.value);
                fill.style.width = `${((v - control.min) / (control.max - control.min)) * 100}%`;
                value.textContent = control.format ? control.format(v) : String(v);
            };
            refresh = () => {
                input.value = control.get();
                paint();
            };
        }
        host.appendChild(row);
        list.push(() => {
            if (control.visible) row.hidden = !control.visible();
            if (!row.hidden) refresh?.();
        });
    }

    [...sections, globalSection].forEach(section => {
        const block = document.createElement('section');
        block.className = 'dk-view-section';
        block.innerHTML = `<h3 class="dk-section-title">${section.title}</h3>`;
        section.controls.forEach(control => renderControl(control, block));
        panel.appendChild(block);
    });

    function sync() {
        refreshers.forEach(refresh => refresh());
    }

    // --- Expand / collapse -----------------------------------------------------

    function setExpanded(open) {
        panel.hidden = !open;
        dock.classList.toggle('is-expanded', open);
        expand.setAttribute('aria-expanded', String(open));
        try {
            localStorage.setItem(storageKey, open ? '1' : '0');
        } catch {
            // Storage unavailable: still toggles for this visit
        }
        if (open) sync();
    }
    expand.addEventListener('click', () => setExpanded(panel.hidden));
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !panel.hidden && dock.contains(document.activeElement)) {
            setExpanded(false);
            expand.focus();
        }
    });
    // Theme and viewer changes from elsewhere (another tab, the dashboard)
    onViewerSettings(sync);

    let stored = null;
    try {
        stored = localStorage.getItem(storageKey);
    } catch {
        stored = null;
    }
    setExpanded(stored === '1');

    return { element: dock, sync, setExpanded, destroy: () => { cube?.destroy(); dock.remove(); } };
}
