/**
 * Surface Motif — shared options, constraints, and visibility map.
 *
 * Single source of truth for the motif parameter vocabulary so the Dinnerware
 * app and the Vessel V2 app never drift. The Vessel V2 per-segment model stores
 * these as flat fields on each segment's owning profile point (no wall/footring
 * prefix); see getMotifPattern() in surfacePattern.js for the geometry adapter.
 */

export const MOTIF_TYPE_OPTIONS = [
    { value: 'none', label: 'Smooth' },
    { value: 'vertical', label: 'Vertical Lines' },
    { value: 'horizontal', label: 'Horizontal Lines' },
    { value: 'diagonal', label: 'Diagonal Lines' },
    { value: 'crosshatch', label: 'Cross-Hatch' },
    { value: 'knurl', label: 'Knurling' }
];

export const MOTIF_RELIEF_OPTIONS = [
    { value: 'raised', label: 'Raised' },
    { value: 'recessed', label: 'Recessed' }
];

export const MOTIF_PROFILE_OPTIONS = [
    { value: 'rounded', label: 'Rounded' },
    { value: 'v', label: 'V-Groove' },
    { value: 'square', label: 'Square' }
];

export const MOTIF_DIRECTION_OPTIONS = [
    { value: 'right', label: 'Right' },
    { value: 'left', label: 'Left' }
];

/** Numeric field constraints (enum fields validated against the option lists). */
export const MOTIF_CONSTRAINTS = {
    depth: { min: 0.1, max: 1.5, step: 0.05, unit: 'mm', default: 0.4 },
    count: { min: 8, max: 240, step: 1, unit: '', default: 32 },
    pitch: { min: 1, max: 20, step: 0.5, unit: 'mm', default: 4 },
    lineWidth: { min: 10, max: 90, step: 5, unit: '%', default: 50 },
    angle: { min: 15, max: 75, step: 5, unit: '°', default: 45 }
};

/**
 * Which controls each motif type exposes (progressive disclosure). Suffixes
 * match the inspector field ids / control builders.
 */
export const MOTIF_VISIBLE_SUFFIXES = {
    none: [],
    vertical: ['Depth', 'Relief', 'Count', 'LineWidth', 'Profile'],
    horizontal: ['Depth', 'Relief', 'Pitch', 'LineWidth', 'Profile'],
    diagonal: ['Depth', 'Relief', 'Count', 'LineWidth', 'Profile', 'Angle', 'Direction'],
    crosshatch: ['Depth', 'Relief', 'Count', 'LineWidth', 'Profile', 'Angle'],
    knurl: ['Depth', 'Relief', 'Count', 'Angle']
};

const TYPE_VALUES = new Set(MOTIF_TYPE_OPTIONS.map((o) => o.value));
const RELIEF_VALUES = new Set(MOTIF_RELIEF_OPTIONS.map((o) => o.value));
const PROFILE_VALUES = new Set(MOTIF_PROFILE_OPTIONS.map((o) => o.value));
const DIRECTION_VALUES = new Set(MOTIF_DIRECTION_OPTIONS.map((o) => o.value));

export function getDefaultMotif() {
    return {
        type: 'none',
        depth: MOTIF_CONSTRAINTS.depth.default,
        relief: 'raised',
        count: MOTIF_CONSTRAINTS.count.default,
        pitch: MOTIF_CONSTRAINTS.pitch.default,
        lineWidth: MOTIF_CONSTRAINTS.lineWidth.default,
        profile: 'rounded',
        angle: MOTIF_CONSTRAINTS.angle.default,
        direction: 'right'
    };
}

function clampNumber(value, key) {
    const c = MOTIF_CONSTRAINTS[key];
    const n = Number(value);
    if (!Number.isFinite(n)) return c.default;
    return Math.max(c.min, Math.min(c.max, n));
}

/**
 * Coerce an arbitrary (possibly missing/partial) motif object into a complete,
 * valid motif. Used for backfilling loaded projects and sanitizing edits.
 */
export function normalizeMotif(motif) {
    const base = getDefaultMotif();
    if (!motif || typeof motif !== 'object') return base;

    return {
        type: TYPE_VALUES.has(motif.type) ? motif.type : base.type,
        depth: clampNumber(motif.depth, 'depth'),
        relief: RELIEF_VALUES.has(motif.relief) ? motif.relief : base.relief,
        count: Math.round(clampNumber(motif.count, 'count')),
        pitch: clampNumber(motif.pitch, 'pitch'),
        lineWidth: clampNumber(motif.lineWidth, 'lineWidth'),
        profile: PROFILE_VALUES.has(motif.profile) ? motif.profile : base.profile,
        angle: clampNumber(motif.angle, 'angle'),
        direction: DIRECTION_VALUES.has(motif.direction) ? motif.direction : base.direction
    };
}

export function isMotifActive(motif) {
    return !!motif && motif.type && motif.type !== 'none' && Number(motif.depth) >= 0.05;
}
