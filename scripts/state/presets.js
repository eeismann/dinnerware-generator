/**
 * Style Presets
 * Named sets of global style parameters. Applying a preset sets every style
 * parameter (unspecified ones fall back to defaults); scaling, surface
 * patterns and per-item overrides are left alone.
 */

import { DEFAULT_PARAMETERS } from './projectState.js';

export const STYLE_KEYS = [
    'wallAngle', 'positiveWallAngleAnchor', 'wallCurveAmount', 'wallCurvePosition',
    'wallInsetEnabled', 'wallInsetHeight', 'wallInsetDepth',
    'bottomCornerRadius', 'rimStyle', 'wallThickness',
    'footringOriginHeight', 'outerFootringAngle', 'footringBaseWidth',
    'innerFootringAngle', 'footCavityDepth'
];

const USER_PRESETS_KEY = 'playground_ceramics_dinnerware_presets';

export const BUILT_IN_PRESETS = [
    {
        id: 'default',
        name: 'Studio Default',
        params: {}
    },
    {
        id: 'hasami-straight',
        name: 'Hasami Straight',
        params: {
            wallAngle: 6, bottomCornerRadius: 3, wallThickness: 3,
            footringOriginHeight: 6, outerFootringAngle: 0, innerFootringAngle: 0,
            footringBaseWidth: 6
        }
    },
    {
        id: 'soft-bowl',
        name: 'Soft Bowl',
        params: {
            wallAngle: 22, wallCurveAmount: 5, wallCurvePosition: 0.4,
            bottomCornerRadius: 4, rimStyle: 'rounded', wallThickness: 3,
            footringOriginHeight: 7, outerFootringAngle: 20, innerFootringAngle: -10
        }
    },
    {
        id: 'bistro',
        name: 'Bistro Classic',
        params: {
            wallAngle: 18, bottomCornerRadius: 4, rimStyle: 'rounded', wallThickness: 3.5,
            footringOriginHeight: 9, outerFootringAngle: 12, footringBaseWidth: 10
        }
    },
    {
        id: 'fine-tapered',
        name: 'Fine Tapered Lip',
        params: {
            wallAngle: 12, wallCurveAmount: 4, rimStyle: 'tapered', wallThickness: 3,
            bottomCornerRadius: 4, footringOriginHeight: 6
        }
    },
    {
        id: 'stepped',
        name: 'Stepped Band',
        params: {
            wallAngle: 4, wallInsetEnabled: true, wallInsetHeight: 40, wallInsetDepth: 5,
            bottomCornerRadius: 2, wallThickness: 3, positiveWallAngleAnchor: 'base'
        }
    }
];

/**
 * Every style key resolved for a preset: its own values over the defaults.
 */
export function presetStyle(preset) {
    const style = {};
    STYLE_KEYS.forEach(key => {
        style[key] = preset.params[key] ?? DEFAULT_PARAMETERS[key];
    });
    return style;
}

/**
 * Apply a preset as one batched (single undo step) state update.
 */
export function applyPreset(stateManager, preset) {
    const updates = {};
    Object.entries(presetStyle(preset)).forEach(([key, value]) => {
        updates[`globalParameters.${key}`] = value;
    });
    stateManager.batchUpdate(updates);
}

/**
 * The preset whose style matches the current global parameters, if any.
 */
export function matchingPreset(globalParameters, presets) {
    return presets.find(preset => {
        const style = presetStyle(preset);
        return STYLE_KEYS.every(key => globalParameters[key] === style[key]);
    }) ?? null;
}

export function loadUserPresets(storage = globalThis.localStorage) {
    try {
        const parsed = JSON.parse(storage?.getItem(USER_PRESETS_KEY) || '[]');
        return Array.isArray(parsed)
            ? parsed.filter(preset => preset?.id && preset?.name && preset?.params)
            : [];
    } catch {
        return [];
    }
}

export function saveUserPreset(name, globalParameters, storage = globalThis.localStorage) {
    const params = {};
    STYLE_KEYS.forEach(key => { params[key] = globalParameters[key]; });
    const presets = loadUserPresets(storage).filter(preset => preset.name !== name);
    const preset = { id: `user-${Date.now().toString(36)}`, name, params, user: true };
    presets.push(preset);
    storage.setItem(USER_PRESETS_KEY, JSON.stringify(presets));
    return preset;
}

export function deleteUserPreset(id, storage = globalThis.localStorage) {
    const presets = loadUserPresets(storage).filter(preset => preset.id !== id);
    storage.setItem(USER_PRESETS_KEY, JSON.stringify(presets));
}
