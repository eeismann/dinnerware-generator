/**
 * Stacked Cylinder Mold Generator - defaults and constraints
 *
 * Slicer defaults come from the concept prototype (bandSlicer.js
 * SLICER_DEFAULTS); part defaults from castingUnitParts.js PART_DEFAULTS.
 */

import { SLICER_DEFAULTS } from '../geometry/bandSlicer.js';
import { PART_DEFAULTS } from '../geometry/castingUnitParts.js';
import { KIT_SERIES, PRINTERS, DEFAULT_PRINTER, getPrinter } from '../geometry/kitSpec.js';
import { MIX_DEFAULTS, MIX_UNITS } from '../geometry/plasterMix.js';

export const STORAGE_KEY = 'playground_ceramics_stacked_mold_projects';
export const AUTOSAVE_KEY = 'stacked_mold_autosave';
export const APP_TYPE = 'stackedmold';

export const DEFAULT_PARAMS = {
    kit: {
        diameter: 'auto',   // 'auto' (smallest standard) | 'fitted' (one-off) | '175' …
        sleeveH: 'auto',    // 'auto' | '160' …
        printer: DEFAULT_PRINTER
    },
    mold: {
        shrinkage: 0,
        plasterMin: SLICER_DEFAULTS.plasterMin,
        footerT: SLICER_DEFAULTS.footerT,
        footSeam: SLICER_DEFAULTS.footSeam,
        wellH: SLICER_DEFAULTS.wellH,
        ledgeMin: SLICER_DEFAULTS.ledgeMin
    },
    slicing: {
        maxRingH: SLICER_DEFAULTS.maxRingH,
        maxSplitH: SLICER_DEFAULTS.maxSplitH,
        minDraftDeg: SLICER_DEFAULTS.minDraftDeg,
        maxFlatRun: SLICER_DEFAULTS.maxFlatRun,
        minRingH: SLICER_DEFAULTS.minRingH,
        seamAtCrease: SLICER_DEFAULTS.seamAtCrease,
        footSeamMax: SLICER_DEFAULTS.footSeamMax
    },
    parts: {
        keyInset: SLICER_DEFAULTS.keyInset,
        sleeveWall: PART_DEFAULTS.sleeveWall,
        plateT: PART_DEFAULTS.plateT,
        strapGroove: PART_DEFAULTS.strapGroove
    },
    // Plaster mix: shown per pour, never changes the geometry
    plaster: {
        consistency: MIX_DEFAULTS.consistency,
        allowance: MIX_DEFAULTS.allowance,
        units: MIX_DEFAULTS.units
    }
};

export const SLEEVE_HEIGHTS = [60, 80, 100, 120, 140, 160, 180, 200, 240, 300];

export const PARAM_CONSTRAINTS = {
    'mold.shrinkage': { min: 0, max: 20, step: 0.5 },
    'mold.plasterMin': { min: 18, max: 60, step: 1 },
    'mold.footerT': { min: 15, max: 60, step: 1 },
    'mold.footSeam': { min: 0, max: 15, step: 0.5 },
    'mold.wellH': { min: 15, max: 60, step: 1 },
    'mold.ledgeMin': { min: 3, max: 15, step: 0.05 },
    'slicing.maxRingH': { min: 40, max: 400, step: 5 },
    'slicing.maxSplitH': { min: 60, max: 400, step: 5 },
    'slicing.minDraftDeg': { min: 0.25, max: 5, step: 0.25 },
    'slicing.maxFlatRun': { min: 4, max: 40, step: 1 },
    'slicing.minRingH': { min: 0, max: 40, step: 1 },
    'slicing.seamAtCrease': { type: 'boolean' },
    'slicing.footSeamMax': { min: 6, max: 60, step: 1 },
    'parts.keyInset': { min: 10, max: 20, step: 0.5 },
    'parts.sleeveWall': { min: 2, max: 6, step: 0.2 },
    'parts.plateT': { min: 8, max: 12, step: 0.5 },
    'parts.strapGroove': { type: 'boolean' },
    'plaster.consistency': { min: 55, max: 90, step: 1 },
    'plaster.allowance': { min: 0, max: 30, step: 1 },
    'plaster.units': { options: MIX_UNITS },
    'kit.diameter': { options: [{ value: 'auto', label: 'Auto (standard)' }, ...KIT_SERIES.map(d => ({ value: String(d), label: `Ø${d}` })), { value: 'fitted', label: 'Fitted (one-off)' }] },
    'kit.sleeveH': { options: [{ value: 'auto', label: 'Auto' }, ...[60, 80, 100, 120, 140, 160, 180, 200, 240, 300].map(h => ({ value: String(h), label: `${h} mm` }))] },
    'kit.printer': { options: Object.entries(PRINTERS).map(([value, p]) => ({ value, label: p.label })) }
};

export const DEFAULT_VIEW = {
    mode: 'stack',          // 'stack' | 'unit' | 'print'
    unit: 'U2',
    explode: 0.6,
    section: 'quarter',     // 'none' | 'quarter' | 'half'
    showWare: true,
    showPlaster: true,
    showProfile: true
};

/** Slicer params from the grouped state params. */
export function slicerParams(params) {
    const printer = getPrinter(params.kit.printer);
    return {
        ...params.mold, ...params.slicing, keyInset: params.parts.keyInset,
        bed: printer.z, bedXY: Math.max(printer.x, printer.y),
        kitDiameter: params.kit.diameter, kitSeries: KIT_SERIES,
        sleeveH: params.kit.sleeveH, lidT: Math.max(8, params.parts.plateT)
    };
}

/** Part params from the grouped state params. */
export function partParams(params) {
    const { sleeveWall, plateT, strapGroove } = params.parts;
    return { sleeveWall, plateT, strapGroove, printer: params.kit.printer };
}

export function deepClone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

/** Fill missing keys from defaults and clamp numbers into range. */
export function sanitizeParams(params = {}) {
    const out = deepClone(DEFAULT_PARAMS);
    for (const group of Object.keys(out)) {
        for (const key of Object.keys(out[group])) {
            const value = params?.[group]?.[key];
            const c = PARAM_CONSTRAINTS[`${group}.${key}`];
            if (c?.options) {
                if (c.options.some(o => o.value === String(value))) out[group][key] = String(value);
            } else if (c?.type === 'boolean') {
                if (typeof value === 'boolean') out[group][key] = value;
            } else if (Number.isFinite(value)) {
                out[group][key] = Math.max(c.min, Math.min(c.max, value));
            }
        }
    }
    return out;
}
