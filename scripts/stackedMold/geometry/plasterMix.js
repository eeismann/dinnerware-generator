/**
 * Stacked Cylinder Mold - plaster mix per pour
 *
 * Pottery plaster is mixed by weight at a consistency C: C parts water to 100
 * parts dry plaster (USG No. 1 Pottery Plaster: 70). The slurry's volume is the
 * water plus the plaster's absolute volume (true specific gravity of beta
 * hemihydrate ≈ 2.63), so one litre of slurry holds
 *
 *     plaster (g) = 1000 / (1 / 2.63 + C / 100)      water (g = ml) = plaster · C / 100
 *
 * (C 70: 926 g plaster + 648 g water per litre, about 30 in³ per lb.) The set
 * piece keeps the slurry's volume, so a piece of V litres needs V litres of
 * slurry plus an allowance for what stays in the bucket, overfills the lid and
 * leaves through its bleeds.
 */

export const PLASTER_SG = 2.63;

export const MIX_DEFAULTS = Object.freeze({
    consistency: 70, // parts water per 100 parts plaster, by weight
    allowance: 10,   // % extra slurry for bucket loss and overfill
    units: 'metric'  // 'metric' (g, ml) | 'imperial' (lb, oz; water weighed too)
});

export const MIX_UNITS = [
    { value: 'metric', label: 'Metric (g, ml)' },
    { value: 'imperial', label: 'Imperial (lb, oz)' }
];

const G_PER_OZ = 28.349523125;

/** Dry plaster and water (grams; water g = ml) for `litres` of set plaster. */
export function plasterMix(litres, { consistency = MIX_DEFAULTS.consistency, allowance = MIX_DEFAULTS.allowance } = {}) {
    const slurryL = litres * (1 + allowance / 100);
    const plasterG = slurryL * 1000 / (1 / PLASTER_SG + consistency / 100);
    return { litres, slurryL, plasterG, waterG: plasterG * consistency / 100 };
}

/**
 * One row per pour, bottom to top: a split unit pours its two halves
 * separately (insert A, then insert B), every other unit pours once.
 */
export function plasterSchedule(result, mix = MIX_DEFAULTS) {
    mix = { ...MIX_DEFAULTS, ...mix };
    const pours = result.units.flatMap(u => (u.kind === 'split'
        ? ['A', 'B'].map(half => ({ id: `${u.id}${half}`, unit: u.id, kind: u.kind, litres: u.vol / 2 }))
        : [{ id: u.id, unit: u.id, kind: u.kind, litres: u.vol }]
    )).map(p => ({ ...p, ...plasterMix(p.litres, mix) }));
    const sum = (k) => pours.reduce((s, p) => s + p[k], 0);
    return {
        consistency: mix.consistency,
        allowance: mix.allowance,
        units: mix.units,
        pours,
        total: { litres: sum('litres'), slurryL: sum('slurryL'), plasterG: sum('plasterG'), waterG: sum('waterG') }
    };
}

/** Pounds and ounces in half-ounce steps: 326 → "11.5 oz", 1236 → "2 lb 11.5 oz". */
export function formatPounds(g) {
    const halfOz = Math.round(g / G_PER_OZ * 2);
    const lb = Math.floor(halfOz / 32);
    const oz = (halfOz - lb * 32) / 2;
    if (!lb) return `${oz} oz`;
    return oz ? `${lb} lb ${oz} oz` : `${lb} lb`;
}

/** Dry plaster: 432 → "430 g", 1236 → "1.24 kg" (kitchen scale: 5 g steps), or lb/oz. */
export function formatGrams(g, units = 'metric') {
    if (units === 'imperial') return formatPounds(g);
    return g < 1000 ? `${Math.round(g / 5) * 5} g` : `${(g / 1000).toFixed(2)} kg`;
}

/** Water: by volume in metric (302 → "300 ml", 1048 → "1.05 L"), by weight in lb/oz. */
export function formatWater(g, units = 'metric') {
    if (units === 'imperial') return formatPounds(g);
    return g < 1000 ? `${Math.round(g / 5) * 5} ml` : `${(g / 1000).toFixed(2)} L`;
}
