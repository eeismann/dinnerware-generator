/**
 * DialKit controls for the Dinnerware Designer
 *
 * Replaces the classic parameter panel with DialKit panels mounted inline in
 * the left column. The project state stays the single source of truth: dial
 * edits are forwarded to the app through `api`, and `sync()` pushes state back
 * into the dials after anything else changes it (undo, presets, load, the
 * profile panel).
 *
 * DialKit re-renders every panel whenever any panel's control list changes,
 * so structural updates (rows that appear/disappear, relabelled overrides)
 * wait until a pointer gesture ends, and folder open state is remembered and
 * written back into each config as `_collapsed`.
 */

import { createDialKit, createDialRoot, DialStore } from 'dialkit/vanilla';
import 'dialkit/vanilla/styles.css';
import {
    stateManager,
    parameterResolver,
    ITEM_TYPES,
    ITEM_NAMES,
    PARAMETER_CONSTRAINTS
} from '../../state/projectState.js';
import { BUILT_IN_PRESETS, matchingPreset, loadUserPresets } from '../../state/presets.js';

export const PATTERN_PREFIXES = ['wall', 'footring'];
export const PATTERN_PARAM_SUFFIXES = [
    'Type', 'Depth', 'Relief', 'Count', 'Pitch', 'LineWidth', 'Profile', 'Angle', 'Direction'
];
// Which variation controls each pattern type exposes
export const PATTERN_VISIBLE_SUFFIXES = {
    none: [],
    vertical: ['Depth', 'Relief', 'Count', 'LineWidth', 'Profile'],
    horizontal: ['Depth', 'Relief', 'Pitch', 'LineWidth', 'Profile'],
    diagonal: ['Depth', 'Relief', 'Count', 'LineWidth', 'Profile', 'Angle', 'Direction'],
    crosshatch: ['Depth', 'Relief', 'Count', 'LineWidth', 'Profile', 'Angle'],
    knurl: ['Depth', 'Relief', 'Count', 'Angle']
};
// DialKit derives labels from config keys ("lineCount" → "Line Count")
const PATTERN_SUFFIX_KEYS = {
    Type: 'pattern',
    Depth: 'depth',
    Relief: 'relief',
    Count: 'lineCount',
    Pitch: 'pitch',
    LineWidth: 'lineWidth',
    Profile: 'ridgeProfile',
    Angle: 'angle',
    Direction: 'direction'
};

export function patternParamName(prefix, suffix) {
    return `${prefix}Pattern${suffix}`;
}

const OVERRIDABLE_PARAMS = [
    'wallAngle', 'wallInsetEnabled', 'wallInsetHeight', 'wallInsetDepth',
    'bottomCornerRadius', 'footringOriginHeight', 'outerFootringAngle',
    'footringBaseWidth', 'innerFootringAngle', 'wallThickness', 'footCavityDepth', 'rimStyle',
    ...PATTERN_PREFIXES.flatMap(prefix =>
        PATTERN_PARAM_SUFFIXES.map(suffix => patternParamName(prefix, suffix)))
];
const OVERRIDE_KEYS = {
    wallInsetEnabled: 'wallInset',
    footringOriginHeight: 'footringHeight',
    footringBaseWidth: 'footringWidth'
};
// Marks an overridden control in its label; DialKit keeps the key verbatim
const OVERRIDE_MARK = ' ●';

const ITEM_KEYS = {
    plate: 'plate',
    soup_bowl: 'soupBowl',
    pasta_bowl: 'pastaBowl',
    mug: 'mug',
    tumbler: 'tumbler',
    saucer: 'saucer',
    serving_bowl: 'servingBowl'
};

const CAMERA_ACTIONS = {
    top: { label: 'Top', preset: 'top' },
    side: { label: 'Side', preset: 'side' },
    threeQuarter: { label: '3/4', preset: 'three-quarter' },
    bottom: { label: 'Bottom', preset: 'bottom' }
};

const LAYOUT_OPTIONS = [
    { value: 'row', label: 'Row' },
    { value: 'grid', label: 'Grid' },
    { value: 'stack', label: 'Stacked' },
    { value: 'table', label: 'Table Setting' }
];

// Folder open state is applied on rebuild but never triggers one
function configSignature(config) {
    return JSON.stringify(config, (key, value) => (key === '_collapsed' ? undefined : value));
}

// Same transform DialKit applies to config keys
function formatLabel(key) {
    return key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim();
}

function formatValue(param, value) {
    const constraints = PARAMETER_CONSTRAINTS[param] || {};
    if (constraints.type === 'boolean') return value ? 'On' : 'Off';
    const option = constraints.options?.find(opt => opt.value === value);
    if (option) return option.label;
    return `${Number.isFinite(value) ? Number(value.toFixed(2)) : value}${constraints.unit ?? ''}`;
}

/**
 * Collects a panel's config together with the bindings from DialKit value
 * paths to app parameters, and applies remembered folder open state.
 */
class ConfigBuilder {
    constructor(panelName, folderOpen) {
        this.panelName = panelName;
        this.folderOpen = folderOpen;
        this.bindings = new Map();
    }

    folder(key, children, { collapsed = false } = {}) {
        const open = this.folderOpen.get(`${this.panelName}/${formatLabel(key)}`);
        return { ...children, _collapsed: open === undefined ? collapsed : !open };
    }

    control(path, param, { constraints = PARAMETER_CONSTRAINTS[param], ...binding } = {}) {
        this.bindings.set(path, { param, ...binding });
        if (constraints.type === 'boolean') return Boolean(constraints.default);
        if (constraints.options) {
            return { type: 'select', options: constraints.options, default: constraints.default };
        }
        return [constraints.default, constraints.min, constraints.max, constraints.step];
    }
}

/**
 * @param {Object} api - App hooks; see scripts/main.js initDials()
 * @returns {{ sync: Function, setOverrideItem: Function, reveal: Function, revealOverrides: Function, element: HTMLElement }}
 */
export function initDinnerwareDials(api) {
    const { container } = api;
    const folderOpen = new Map();
    const view = {
        crossSection: false,
        showGrid: true,
        lightBackground: true
    };
    let overrideItem = ITEM_TYPES[0];
    let syncing = false;
    let gesture = false;
    let gestureChanged = false;
    let structurePending = false;
    let syncQueued = false;

    const root = createDialRoot({ mode: 'inline', target: container, theme: currentTheme() });
    root.element.classList.add('dinnerware-dials');

    // --- Panel definitions -------------------------------------------------

    const panels = [
        { id: 'dinnerware-style', name: 'Set Style', build: buildStyleConfig, read: readGlobal },
        { id: 'dinnerware-pattern', name: 'Surface Pattern', build: buildPatternConfig, read: readGlobal },
        { id: 'dinnerware-proportions', name: 'Item Proportions', build: buildProportionsConfig, read: readMultiplier },
        { id: 'dinnerware-overrides', name: 'Per-Item Overrides', build: buildOverridesConfig, read: readOverride },
        { id: 'dinnerware-view', name: 'View', build: buildViewConfig, read: readView }
    ];

    function readGlobal({ param }) {
        return stateManager.getState(`globalParameters.${param}`);
    }

    function readMultiplier({ item, axis }) {
        return stateManager.getState(`itemMultipliers.${item}.${axis}`);
    }

    function readOverride({ param }) {
        if (param === '__item') return overrideItem;
        const item = overrideItem;
        const value = param === 'footringBaseWidth'
            ? parameterResolver.getAllParameters(item).footringBaseWidth
            : parameterResolver.getEffectiveParameter(item, param);
        return typeof value === 'number' ? Number(value.toFixed(2)) : value;
    }

    function readView({ param, item }) {
        if (param === 'layout') return stateManager.getState('ui.layoutMode') || 'row';
        if (param === 'visible') return stateManager.getState('ui.visibleItems').includes(item);
        return view[param];
    }

    function buildStyleConfig(b) {
        const globals = stateManager.getState('globalParameters');
        const userPresets = loadUserPresets();
        const presets = [...BUILT_IN_PRESETS, ...userPresets];
        const match = matchingPreset(globals, presets);
        const presetOptions = [
            ...(match ? [] : [{ value: 'custom', label: 'Custom' }]),
            ...BUILT_IN_PRESETS.map(p => ({ value: p.id, label: p.name })),
            ...userPresets.map(p => ({ value: p.id, label: `${p.name} (saved)` }))
        ];
        b.bindings.set('preset', { param: '__preset', value: match?.id ?? 'custom' });

        const insetEnabled = Boolean(globals.wallInsetEnabled);
        const proportional = Boolean(globals.footringWidthProportional);

        return {
            preset: { type: 'select', options: presetOptions, default: match?.id ?? 'custom' },
            presets: b.folder('presets', {
                newPresetName: { type: 'text', placeholder: 'Name this style', default: '' },
                savePreset: { type: 'action', label: 'Save Style as Preset' },
                ...(match?.user ? { deletePreset: { type: 'action', label: `Delete “${match.name}”` } } : {})
            }, { collapsed: true }),
            scale: b.folder('scale', {
                heightScale: b.control('scale.heightScale', 'globalHeightScale'),
                widthScale: b.control('scale.widthScale', 'globalWidthScale')
            }),
            wall: b.folder('wall', {
                wallAngle: b.control('wall.wallAngle', 'wallAngle'),
                angleAnchor: b.control('wall.angleAnchor', 'positiveWallAngleAnchor'),
                wallCurve: b.control('wall.wallCurve', 'wallCurveAmount'),
                curvePosition: b.control('wall.curvePosition', 'wallCurvePosition'),
                wallThickness: b.control('wall.wallThickness', 'wallThickness'),
                rimStyle: b.control('wall.rimStyle', 'rimStyle')
            }),
            steppedInset: b.folder('steppedInset', {
                wallInset: b.control('steppedInset.wallInset', 'wallInsetEnabled'),
                ...(insetEnabled ? {
                    insetHeight: b.control('steppedInset.insetHeight', 'wallInsetHeight'),
                    insetDepth: b.control('steppedInset.insetDepth', 'wallInsetDepth')
                } : {})
            }),
            cornerAndFoot: b.folder('cornerAndFoot', {
                bottomCornerRadius: b.control('cornerAndFoot.bottomCornerRadius', 'bottomCornerRadius'),
                footringHeight: b.control('cornerAndFoot.footringHeight', 'footringOriginHeight'),
                outerFootringAngle: b.control('cornerAndFoot.outerFootringAngle', 'outerFootringAngle'),
                innerFootringAngle: b.control('cornerAndFoot.innerFootringAngle', 'innerFootringAngle'),
                ...(proportional
                    ? { plateFootringWidth: b.control('cornerAndFoot.plateFootringWidth', 'footringBaseWidth') }
                    : { footringWidth: b.control('cornerAndFoot.footringWidth', 'footringBaseWidth') }),
                proportionalWidth: b.control('cornerAndFoot.proportionalWidth', 'footringWidthProportional'),
                ...(proportional ? {
                    widthReduction: b.control('cornerAndFoot.widthReduction', 'footringWidthReduction')
                } : {})
            }),
            base: b.folder('base', {
                footCavityDepth: b.control('base.footCavityDepth', 'footCavityDepth')
            })
        };
    }

    function buildPatternConfig(b) {
        const globals = stateManager.getState('globalParameters');
        const config = {};
        PATTERN_PREFIXES.forEach(prefix => {
            const type = globals[patternParamName(prefix, 'Type')] || 'none';
            const visible = PATTERN_VISIBLE_SUFFIXES[type] || [];
            const children = {};
            PATTERN_PARAM_SUFFIXES.forEach(suffix => {
                if (suffix !== 'Type' && !visible.includes(suffix)) return;
                const key = prefix === 'wall' && suffix === 'Count' ? 'referenceLineCount' : PATTERN_SUFFIX_KEYS[suffix];
                children[key] = b.control(`${prefix}.${key}`, patternParamName(prefix, suffix));
            });
            if (prefix === 'wall' && globals.wallInsetEnabled && type !== 'none') {
                children.insetRegion = b.control('wall.insetRegion', 'wallPatternInsetRegion');
            }
            config[prefix] = b.folder(prefix, children);
        });
        if ((globals.wallPatternType || 'none') !== 'none') {
            config.copyWallToFootring = { type: 'action', label: 'Copy Wall Pattern to Footring' };
        }
        return config;
    }

    function buildProportionsConfig(b) {
        const config = {};
        ITEM_TYPES.forEach(item => {
            const key = ITEM_KEYS[item];
            const constraints = { min: 50, max: 200, step: 5, default: 100 };
            config[key] = b.folder(key, {
                height: b.control(`${key}.height`, null, { constraints, item, axis: 'height' }),
                width: b.control(`${key}.width`, null, { constraints, item, axis: 'width' })
            }, { collapsed: true });
        });
        return config;
    }

    function buildOverridesConfig(b) {
        const item = overrideItem;
        const overrides = stateManager.getState(`itemOverrides.${item}`) || {};
        const overridden = Object.keys(overrides);
        b.bindings.set('item', { param: '__item' });

        const config = {
            item: {
                type: 'select',
                options: ITEM_TYPES.map(type => {
                    const count = Object.keys(stateManager.getState(`itemOverrides.${type}`) || {}).length;
                    return { value: type, label: count ? `${ITEM_NAMES[type]} (${count})` : ITEM_NAMES[type] };
                }),
                default: ITEM_TYPES[0]
            }
        };

        const groups = { shape: {}, wallPattern: {}, footringPattern: {} };
        OVERRIDABLE_PARAMS.forEach(param => {
            const patternMatch = param.match(/^(wall|footring)Pattern(.+)$/);
            if (patternMatch && patternMatch[2] !== 'Type') {
                const typeParam = patternParamName(patternMatch[1], 'Type');
                const effectiveType = parameterResolver.getEffectiveParameter(item, typeParam) ?? 'none';
                if (!(PATTERN_VISIBLE_SUFFIXES[effectiveType] || []).includes(patternMatch[2])) return;
            }
            const group = patternMatch ? `${patternMatch[1]}Pattern` : 'shape';
            const baseKey = patternMatch ? PATTERN_SUFFIX_KEYS[patternMatch[2]] : (OVERRIDE_KEYS[param] || param);
            const key = overrides[param] !== undefined ? `${baseKey}${OVERRIDE_MARK}` : baseKey;
            const constraints = param === 'footringBaseWidth'
                ? { ...PARAMETER_CONSTRAINTS[param], step: 0.01 }
                : PARAMETER_CONSTRAINTS[param];
            groups[group][key] = b.control(`${group}.${key}`, param, { constraints });
        });
        config.shape = b.folder('shape', groups.shape);
        config.wallPattern = b.folder('wallPattern', groups.wallPattern, { collapsed: true });
        config.footringPattern = b.folder('footringPattern', groups.footringPattern, { collapsed: true });

        if (overridden.length) {
            const resets = {};
            overridden.forEach(param => {
                resets[`reset_${param}`] = {
                    type: 'action',
                    label: `↺ ${formatLabel(OVERRIDE_KEYS[param] || param)} → ${formatValue(param, stateManager.getState(`globalParameters.${param}`))}`
                };
            });
            resets.clearAll = { type: 'action', label: `Clear All ${overridden.length} Overrides` };
            config.useGlobal = b.folder('useGlobal', resets);
        }
        return config;
    }

    function buildViewConfig(b) {
        b.bindings.set('layout', { param: 'layout' });
        b.bindings.set('crossSection', { param: 'crossSection' });
        b.bindings.set('showGrid', { param: 'showGrid' });
        b.bindings.set('lightBackground', { param: 'lightBackground' });
        const items = {};
        ITEM_TYPES.forEach(item => {
            const key = ITEM_KEYS[item];
            items[key] = true;
            b.bindings.set(`items.${key}`, { param: 'visible', item });
        });
        const camera = {};
        Object.entries(CAMERA_ACTIONS).forEach(([key, { label }]) => {
            camera[key] = { type: 'action', label };
        });
        camera.resetView = { type: 'action', label: 'Reset View' };
        return {
            camera: b.folder('camera', camera),
            layout: { type: 'select', options: LAYOUT_OPTIONS, default: 'row' },
            crossSection: false,
            showGrid: true,
            lightBackground: true,
            items: b.folder('items', {
                ...items,
                showAll: { type: 'action', label: 'Show All' },
                hideAll: { type: 'action', label: 'Hide All' }
            })
        };
    }

    // --- Registration ------------------------------------------------------

    panels.forEach(panel => {
        const builder = new ConfigBuilder(panel.name, folderOpen);
        panel.config = panel.build(builder);
        panel.bindings = builder.bindings;
        panel.signature = configSignature(panel.config);
        panel.kit = createDialKit(panel.name, panel.config, {
            id: panel.id,
            defaultCollapsed: panel.id !== 'dinnerware-style',
            onAction: (path) => handleAction(panel, path)
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
            if (values[path] !== panel.lastSeen[path]) changed.push([path, binding, values[path]]);
        });
        panel.lastSeen = { ...values };
        if (!changed.length) return;
        const interactive = gesture;
        if (gesture) gestureChanged = true;

        changed.forEach(([, binding, value]) => {
            const { param, item, axis } = binding;
            if (panel.id === 'dinnerware-style' || panel.id === 'dinnerware-pattern') {
                if (param === '__preset') {
                    if (value !== 'custom') api.applyPreset(value);
                } else {
                    api.setGlobal(param, value, { interactive });
                }
            } else if (panel.id === 'dinnerware-proportions') {
                api.setMultiplier(item, axis, value, { interactive });
            } else if (panel.id === 'dinnerware-overrides') {
                if (param === '__item') {
                    overrideItem = value;
                    api.onSelectItem(value);
                } else {
                    api.setOverride(overrideItem, param, value, { interactive });
                }
            } else if (panel.id === 'dinnerware-view') {
                applyViewChange(param, item, value);
            }
        });
        requestSync();
    }

    function applyViewChange(param, item, value) {
        if (param === 'layout') {
            api.setLayout(value);
        } else if (param === 'visible') {
            const visible = new Set(stateManager.getState('ui.visibleItems'));
            if (value) visible.add(item);
            else visible.delete(item);
            api.setVisibleItems(ITEM_TYPES.filter(type => visible.has(type)));
        } else if (param in view) {
            view[param] = value;
            if (param === 'crossSection') api.setCrossSection(value);
            if (param === 'showGrid') api.setGrid(value);
            if (param === 'lightBackground') api.setLightBackground(value);
        }
    }

    function handleAction(panel, path) {
        const action = path.split('.').pop();
        if (panel.id === 'dinnerware-style') {
            if (action === 'savePreset') {
                const name = String(DialStore.getValue(panel.id, 'presets.newPresetName') || '').trim();
                if (!name) {
                    revealLabel('New Preset Name');
                    return;
                }
                api.savePreset(name);
                panel.kit.setValue('presets.newPresetName', '');
            } else if (action === 'deletePreset') {
                const match = matchingPreset(stateManager.getState('globalParameters'), loadUserPresets());
                if (match) api.deletePreset(match.id);
            }
        } else if (panel.id === 'dinnerware-pattern' && action === 'copyWallToFootring') {
            api.copyWallPatternToFootring();
        } else if (panel.id === 'dinnerware-overrides') {
            if (action === 'clearAll') {
                api.clearAllOverrides(overrideItem);
            } else if (action.startsWith('reset_')) {
                api.clearOverride(overrideItem, action.slice('reset_'.length));
            }
        } else if (panel.id === 'dinnerware-view') {
            if (CAMERA_ACTIONS[action]) api.setCamera(CAMERA_ACTIONS[action].preset);
            else if (action === 'resetView') api.resetView();
            else if (action === 'showAll') api.setVisibleItems([...ITEM_TYPES]);
            else if (action === 'hideAll') api.setVisibleItems([]);
        }
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
        const scroller = container;
        const scrollTop = scroller.scrollTop;
        const focus = focusedControl();
        let rebuilt = false;
        syncing = true;
        try {
            panels.forEach(panel => {
                const builder = new ConfigBuilder(panel.name, folderOpen);
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
                // Bindings carry live context (the matched preset) even when
                // the control structure is unchanged
                if (panel.signature === signature) panel.bindings = builder.bindings;
                const updates = {};
                panel.bindings.forEach((binding, path) => {
                    const value = binding.value !== undefined ? binding.value : panel.read(binding);
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
        scroller.scrollTop = scrollTop;
        if (rebuilt && focus) restoreFocus(focus);
    }

    // A rebuild replaces every control element; keep keyboard users on the
    // control they were adjusting (matched by section and accessible name).
    function focusedControl() {
        const active = document.activeElement;
        if (!active || !root.element.contains(active)) return null;
        const label = active.getAttribute('aria-label');
        const section = active.closest('.dialkit-folder-section')
            ?.querySelector(':scope > .dialkit-folder-header .dialkit-folder-title')?.textContent;
        return label ? { label, section } : null;
    }

    function restoreFocus({ label, section }) {
        const match = [...root.element.querySelectorAll('[aria-label]')].find(node =>
            node.getAttribute('aria-label') === label
            && node.closest('.dialkit-folder-section')
                ?.querySelector(':scope > .dialkit-folder-header .dialkit-folder-title')?.textContent === section);
        match?.focus({ preventScroll: true });
    }

    // --- Gestures, folders, theme --------------------------------------------

    // A slider drag previews interactively and is one undo step; the release
    // triggers the full-resolution rebuild and any deferred structure change.
    root.element.addEventListener('pointerdown', () => {
        gesture = true;
        gestureChanged = false;
        api.onGestureStart();
    }, true);
    const endGesture = () => {
        if (!gesture) return;
        gesture = false;
        api.onGestureEnd(gestureChanged);
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
        const section = folder.closest('.dialkit-folder-section');
        const panelName = section?.querySelector(':scope > .dialkit-folder-header .dialkit-folder-title')?.textContent;
        return title && panelName ? `${panelName}/${title}` : null;
    }

    function currentTheme() {
        return document.documentElement.dataset.mode === 'light' ? 'light' : 'dark';
    }
    new MutationObserver(() => {
        root.element.dataset.theme = currentTheme();
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-mode'] });

    // --- Public helpers ------------------------------------------------------

    function panelById(id) {
        return panels.find(panel => panel.id === id);
    }

    function setOverrideItem(item) {
        if (!ITEM_TYPES.includes(item) || item === overrideItem) return;
        overrideItem = item;
        requestSync();
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

    /**
     * Show the control behind a warning: the item's override when it has
     * one, otherwise the set-wide control.
     */
    function reveal(item, param) {
        if (!param) return;
        const overridden = item && parameterResolver.hasOverride(item, param);
        if (overridden) setOverrideItem(item);
        const panel = overridden
            ? panelById('dinnerware-overrides')
            : param.includes('Pattern') ? panelById('dinnerware-pattern') : panelById('dinnerware-style');
        if (overridden) sync(); // bindings follow the override item's visible rows
        const path = [...panel.bindings].find(([, binding]) => binding.param === param)?.[0];
        const parts = path ? path.split('.') : [];
        panel.kit.setOpen(true);
        if (parts.length > 1) openFolder(`${panel.name}/${formatLabel(parts[0])}`);
        if (parts.length) requestAnimationFrame(() => revealLabel(formatLabel(parts[parts.length - 1])));
    }

    /** Expand a folder through DialKit's own header toggle. */
    function openFolder(key) {
        const folder = [...root.element.querySelectorAll('.dialkit-folder')]
            .find(node => folderKey(node) === key);
        if (folder?.dataset.open === 'false') {
            folder.querySelector(':scope > .dialkit-folder-header')?.click();
        }
    }

    /** Open the overrides panel on an item. */
    function revealOverrides(item) {
        setOverrideItem(item);
        const panel = panelById('dinnerware-overrides');
        panel.kit.setOpen(true);
        requestAnimationFrame(() => revealLabel(panel.name));
    }

    sync();

    return { sync: requestSync, setOverrideItem, reveal, revealOverrides, element: root.element };
}
