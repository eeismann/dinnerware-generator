/**
 * DialKit controls for the Dinnerware Designer
 *
 * Panel definitions for the shared DialKit host (dialHost.js): set style,
 * surface pattern, item proportions, per-item overrides and view. Project
 * state stays the source of truth; dial edits go through `api` (see
 * scripts/main.js initDials()) and `sync()` pushes state back after undo or
 * load.
 */

import {
    stateManager,
    parameterResolver,
    ITEM_TYPES,
    ITEM_NAMES,
    PARAMETER_CONSTRAINTS
} from '../../state/projectState.js';
import { createDialHost, formatLabel } from './dialHost.js';

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

function formatValue(param, value) {
    const constraints = PARAMETER_CONSTRAINTS[param] || {};
    if (constraints.type === 'boolean') return value ? 'On' : 'Off';
    const option = constraints.options?.find(opt => opt.value === value);
    if (option) return option.label;
    return `${Number.isFinite(value) ? Number(value.toFixed(2)) : value}${constraints.unit ?? ''}`;
}

/**
 * @param {Object} api - App hooks; see scripts/main.js initDials()
 * @returns {{ sync: Function, setOverrideItem: Function, revealOverrides: Function, element: HTMLElement }}
 */
export function initDinnerwareDials(api) {
    const view = {
        crossSection: false,
        showGrid: true,
        lightBackground: true
    };
    let overrideItem = ITEM_TYPES[0];

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
        const insetEnabled = Boolean(globals.wallInsetEnabled);
        const proportional = Boolean(globals.footringWidthProportional);

        return {
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

    const host = createDialHost({
        container: api.container,
        constraints: PARAMETER_CONSTRAINTS,
        className: 'dinnerware-dials',
        onGestureStart: api.onGestureStart,
        onGestureEnd: api.onGestureEnd,
        panels: [
            {
                id: 'dinnerware-style',
                name: 'Set Style',
                build: buildStyleConfig,
                read: readGlobal,
                change: ({ param }, value, options) => api.setGlobal(param, value, options)
            },
            {
                id: 'dinnerware-pattern',
                name: 'Surface Pattern',
                collapsed: true,
                build: buildPatternConfig,
                read: readGlobal,
                change: ({ param }, value, options) => api.setGlobal(param, value, options),
                action: (name) => {
                    if (name === 'copyWallToFootring') api.copyWallPatternToFootring();
                }
            },
            {
                id: 'dinnerware-proportions',
                name: 'Item Proportions',
                collapsed: true,
                build: buildProportionsConfig,
                read: readMultiplier,
                change: ({ item, axis }, value, options) => api.setMultiplier(item, axis, value, options)
            },
            {
                id: 'dinnerware-overrides',
                name: 'Per-Item Overrides',
                collapsed: true,
                build: buildOverridesConfig,
                read: readOverride,
                change: ({ param }, value, options) => {
                    if (param === '__item') {
                        overrideItem = value;
                        api.onSelectItem(value);
                    } else {
                        api.setOverride(overrideItem, param, value, options);
                    }
                },
                action: (name) => {
                    if (name === 'clearAll') api.clearAllOverrides(overrideItem);
                    else if (name.startsWith('reset_')) api.clearOverride(overrideItem, name.slice('reset_'.length));
                }
            },
            {
                id: 'dinnerware-view',
                name: 'View',
                collapsed: true,
                build: buildViewConfig,
                read: readView,
                change: ({ param, item }, value) => applyViewChange(param, item, value),
                action: (name) => {
                    if (CAMERA_ACTIONS[name]) api.setCamera(CAMERA_ACTIONS[name].preset);
                    else if (name === 'resetView') api.resetView();
                    else if (name === 'showAll') api.setVisibleItems([...ITEM_TYPES]);
                    else if (name === 'hideAll') api.setVisibleItems([]);
                }
            }
        ]
    });

    function setOverrideItem(item) {
        if (!ITEM_TYPES.includes(item) || item === overrideItem) return;
        overrideItem = item;
        host.sync();
    }

    /** Open the overrides panel on an item. */
    function revealOverrides(item) {
        setOverrideItem(item);
        host.reveal('dinnerware-overrides');
    }

    return { sync: host.sync, setOverrideItem, revealOverrides, element: host.element };
}
