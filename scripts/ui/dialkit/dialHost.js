/**
 * DialKit host
 *
 * Shared plumbing for mounting DialKit (`dialkit/vanilla`) panels as an app's
 * parameter controls while the app's own state stays the source of truth.
 * Each app describes its panels; the host registers them, forwards dial
 * edits, pushes state back on `sync()`, and works around DialKit's vanilla
 * root re-rendering every panel whenever any panel's control list changes:
 *
 * - structural rebuilds wait until a pointer gesture (slider drag) ends
 * - folder open state is remembered and written back as `_collapsed`
 * - keyboard focus returns to the control being adjusted after a rebuild
 * - the dial theme follows `<html data-mode>`
 *
 * Panel definition:
 *   {
 *     id, name,                       // DialKit panel id and section title
 *     build(b) -> DialConfig,         // b.folder()/b.control() record bindings
 *     read(binding) -> value,         // current app value for a binding
 *     change(binding, value, { interactive }),  // dial edited
 *     action?(name, path),            // DialKit action button clicked
 *     collapsed?: boolean             // start closed (default false)
 *   }
 * Bindings are `{ param, ...extra }` objects passed to b.control().
 */

import { createDialKit, createDialRoot, DialStore } from 'dialkit/vanilla';
import 'dialkit/vanilla/styles.css';

// Folder open state is applied on rebuild but never triggers one
function configSignature(config) {
    return JSON.stringify(config, (key, value) => (key === '_collapsed' ? undefined : value));
}

/** Same transform DialKit applies to config keys ("wallAngle" → "Wall Angle"). */
export function formatLabel(key) {
    return key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim();
}

/**
 * Collects a panel's config together with the bindings from DialKit value
 * paths to app parameters, and applies remembered folder open state.
 *
 * Constraints use the apps' common shape: `{ min, max, step, default }` for
 * sliders, `{ options: [{ value, label }], default }` for selects and
 * `{ type: 'boolean', default }` for toggles.
 */
export class ConfigBuilder {
    constructor(panelName, folderOpen, constraintTable = {}) {
        this.panelName = panelName;
        this.folderOpen = folderOpen;
        this.constraintTable = constraintTable;
        this.bindings = new Map();
    }

    folder(key, children, { collapsed = false } = {}) {
        const open = this.folderOpen.get(`${this.panelName}/${formatLabel(key)}`);
        return { ...children, _collapsed: open === undefined ? collapsed : !open };
    }

    /** Constraints default to the host's table entry for `param`. */
    control(path, param, { constraints = this.constraintTable[param], ...binding } = {}) {
        this.bindings.set(path, { param, ...binding });
        if (constraints.type === 'boolean') return Boolean(constraints.default);
        if (constraints.options) {
            return { type: 'select', options: constraints.options, default: constraints.default };
        }
        return [constraints.default, constraints.min, constraints.max, constraints.step];
    }

    /** Bind a path whose control the caller writes itself (e.g. a literal select). */
    bind(path, param, binding = {}) {
        this.bindings.set(path, { param, ...binding });
    }
}

/**
 * @param {Object} options
 * @param {HTMLElement} options.container - Scroll container the root mounts into
 * @param {Array<Object>} options.panels - Panel definitions (see file header)
 * @param {Object} [options.constraints] - Default constraints by param name
 * @param {string} [options.className] - Extra class for the DialKit root
 * @param {Function} [options.onGestureStart] - Pointer down inside the dials
 * @param {Function} [options.onGestureEnd] - Pointer released; receives whether values changed
 */
export function createDialHost({
    container, panels, constraints = {}, className, onGestureStart = () => {}, onGestureEnd = () => {}
}) {
    const folderOpen = new Map();
    let syncing = false;
    let gesture = false;
    let gestureChanged = false;
    let structurePending = false;
    let syncQueued = false;

    const root = createDialRoot({ mode: 'inline', target: container, theme: currentTheme() });
    root.element.classList.add('dk-dials');
    if (className) root.element.classList.add(className);

    panels.forEach(panel => {
        const builder = new ConfigBuilder(panel.name, folderOpen, constraints);
        panel.config = panel.build(builder);
        panel.bindings = builder.bindings;
        panel.signature = configSignature(panel.config);
        panel.kit = createDialKit(panel.name, panel.config, {
            id: panel.id,
            defaultCollapsed: Boolean(panel.collapsed),
            onAction: (path) => {
                panel.action?.(path.split('.').pop(), path);
                requestSync();
            }
        });
        panel.lastSeen = {};
        panel.kit.subscribe(() => handleDialChange(panel), false);
    });

    // --- Dial → app --------------------------------------------------------

    function handleDialChange(panel) {
        if (syncing) return;
        const values = DialStore.getValues(panel.id);
        const changed = [];
        panel.bindings.forEach((binding, path) => {
            if (values[path] !== panel.lastSeen[path]) changed.push([binding, values[path]]);
        });
        panel.lastSeen = { ...values };
        if (!changed.length) return;
        const interactive = gesture;
        if (gesture) gestureChanged = true;
        changed.forEach(([binding, value]) => panel.change(binding, value, { interactive }));
        requestSync();
    }

    // --- App → dial --------------------------------------------------------

    function requestSync() {
        if (syncQueued) return;
        syncQueued = true;
        queueMicrotask(() => {
            syncQueued = false;
            sync();
        });
    }

    /**
     * Rebuild configs whose structure changed (deferred during a drag), then
     * push current state into every bound control.
     */
    function sync() {
        const scrollTop = container.scrollTop;
        const focus = focusedControl();
        let rebuilt = false;
        syncing = true;
        try {
            panels.forEach(panel => {
                const builder = new ConfigBuilder(panel.name, folderOpen, constraints);
                const config = panel.build(builder);
                const signature = configSignature(config);
                if (signature !== panel.signature) {
                    if (gesture) {
                        structurePending = true;
                    } else {
                        panel.config = config;
                        panel.signature = signature;
                        panel.kit.updateConfig(config);
                        rebuilt = true;
                    }
                }
                if (panel.signature === signature) panel.bindings = builder.bindings;
                const updates = {};
                panel.bindings.forEach((binding, path) => {
                    const value = panel.read(binding);
                    if (value !== undefined && DialStore.getValue(panel.id, path) !== value) {
                        updates[path] = value;
                    }
                });
                if (Object.keys(updates).length) DialStore.updateValues(panel.id, updates);
                panel.lastSeen = { ...DialStore.getValues(panel.id) };
            });
        } finally {
            syncing = false;
        }
        container.scrollTop = scrollTop;
        if (rebuilt && focus) restoreFocus(focus);
    }

    // A rebuild replaces every control element; keep keyboard users on the
    // control they were adjusting (matched by section and accessible name).
    function sectionTitle(node) {
        return node.closest('.dialkit-folder-section')
            ?.querySelector(':scope > .dialkit-folder-header .dialkit-folder-title')?.textContent;
    }

    function focusedControl() {
        const active = document.activeElement;
        if (!active || !root.element.contains(active)) return null;
        const label = active.getAttribute('aria-label');
        return label ? { label, section: sectionTitle(active) } : null;
    }

    function restoreFocus({ label, section }) {
        const match = [...root.element.querySelectorAll('[aria-label]')].find(node =>
            node.getAttribute('aria-label') === label && sectionTitle(node) === section);
        match?.focus({ preventScroll: true });
    }

    // --- Gestures, folders, theme --------------------------------------------

    root.element.addEventListener('pointerdown', () => {
        gesture = true;
        gestureChanged = false;
        onGestureStart();
    }, true);
    const endGesture = () => {
        if (!gesture) return;
        gesture = false;
        onGestureEnd(gestureChanged);
        gestureChanged = false;
        if (structurePending) {
            structurePending = false;
            requestSync();
        }
    };
    document.addEventListener('pointerup', endGesture, true);
    document.addEventListener('pointercancel', endGesture, true);

    // Remember folder open state across DialKit's full re-renders
    new MutationObserver(records => {
        records.forEach(({ target }) => {
            // Folders torn down by a re-render still report their old state
            if (!target.isConnected || !target.classList?.contains('dialkit-folder')
                || target.classList.contains('dialkit-folder-root')
                || target.classList.contains('dialkit-folder-section')) return;
            const key = folderKey(target);
            if (key) folderOpen.set(key, target.dataset.open === 'true');
        });
    }).observe(root.element, { attributes: true, attributeFilter: ['data-open'], subtree: true });

    function folderKey(folder) {
        const title = folder.querySelector(':scope > .dialkit-folder-header .dialkit-folder-title')?.textContent;
        const panelName = sectionTitle(folder);
        return title && panelName ? `${panelName}/${title}` : null;
    }

    function currentTheme() {
        return document.documentElement.dataset.mode === 'light' ? 'light' : 'dark';
    }
    new MutationObserver(() => {
        root.element.dataset.theme = currentTheme();
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-mode'] });

    // --- Public helpers ------------------------------------------------------

    function panel(id) {
        return panels.find(entry => entry.id === id);
    }

    /** Scroll to and flash the first control whose label matches. */
    function revealLabel(label) {
        const match = [...root.element.querySelectorAll('span, label, div')]
            .find(node => node.childElementCount === 0 && node.textContent.trim() === label);
        const row = match?.closest('[class*="dialkit-slider"], [class*="dialkit-select"], [class*="dialkit-toggle"], [class*="dialkit-text"]') || match;
        if (!row) return;
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        row.classList.remove('dial-flash');
        void row.offsetWidth;
        row.classList.add('dial-flash');
    }

    /** Open a panel's section and scroll it into view. */
    function reveal(id) {
        const entry = panel(id);
        if (!entry) return;
        entry.kit.setOpen(true);
        requestAnimationFrame(() => revealLabel(entry.name));
    }

    sync();

    return { sync: requestSync, syncNow: sync, panel, reveal, revealLabel, element: root.element };
}
