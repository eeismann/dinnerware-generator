/**
 * Stacked Cylinder Mold - universal kit specification
 *
 * A kit is the reusable tooling for one standard cylinder diameter: a bed
 * plate with a core socket, a drop-in lid, one tall sleeve (split into as
 * many segments as the printer needs) and swap-in key plugs. Every ware cast
 * at that diameter reuses it; only its cores / inserts are printed per ware.
 *
 * Pure data and arithmetic (no Three.js); the slicer and the set planner use it.
 */

/** Standard cylinder diameters (mm). */
export const KIT_SERIES = [150, 175, 200, 230, 250, 280, 310, 360];

export const PRINTERS = {
    'bambu-h2s': { label: 'Bambu Lab H2S', x: 340, y: 320, z: 340 },
    'bambu-h2d': { label: 'Bambu Lab H2D', x: 325, y: 320, z: 325 },
    'bambu-x1': { label: 'Bambu Lab X1 / P1 / A1', x: 256, y: 256, z: 256 },
    'prusa-core-one': { label: 'Prusa Core One', x: 250, y: 220, z: 270 }
};
export const DEFAULT_PRINTER = 'bambu-h2s';

export function getPrinter(id) {
    return PRINTERS[id] || PRINTERS[DEFAULT_PRINTER];
}

/** Lid / bed plate thickness: room for an M5 heat-set insert (6 mm) + 2 mm. */
/**
 * Kit geometry revision. Bump it when a kit part changes shape, so a kit
 * exported before the change is offered for export again.
 * r2 (2026-10-20): 4 mm plate rim (sleeve stands on the footer locating ring), no pit cap.
 * r3 (2026-10-25): bump and pocket plugs share one 45° key cone (no bleed hole);
 *     plug flange chamfers lie on the bore chamfer so plugs seat flush.
 */
export const KIT_REVISION = 3;

export const KIT_PLATE_T = 8;

/**
 * Default tall-sleeve height for a diameter, when the user hasn't fixed one:
 * tall enough for the units typical of that size, capped by the printer.
 */
export function autoSleeveHeight(diameter, printer = getPrinter()) {
    const h = diameter <= 230 ? 160 : diameter <= 310 ? 120 : 100;
    return Math.min(h, printer.z);
}

/** Smallest standard diameter that holds a fitted cylinder, or null. */
export function standardDiameter(fitted, series = KIT_SERIES) {
    return series.find(d => d >= fitted - 1e-9) ?? null;
}

/**
 * Resolve the cylinder diameter for a mold.
 * @param {number} fitted - the slicer's fitted diameter (ware + ledge + plaster margin)
 * @param {'auto'|'fitted'|number|string} choice
 * @returns {{ diameter, fitted, standard: boolean, tooSmall: boolean }}
 */
export function resolveDiameter(fitted, choice = 'auto') {
    if (choice === 'fitted') return { diameter: fitted, fitted, standard: false, tooSmall: false };
    const asked = Number(choice);
    if (Number.isFinite(asked) && asked > 0) {
        if (asked >= fitted) return { diameter: asked, fitted, standard: KIT_SERIES.includes(asked), tooSmall: false };
        return { diameter: fitted, fitted, standard: false, tooSmall: true };
    }
    const std = standardDiameter(fitted);
    return std ? { diameter: std, fitted, standard: true, tooSmall: false }
        : { diameter: fitted, fitted, standard: false, tooSmall: false };
}

/** Sleeve height: explicit number, or the automatic one for the diameter. */
export function resolveSleeveHeight(diameter, choice = 'auto', printer = getPrinter()) {
    const asked = Number(choice);
    if (Number.isFinite(asked) && asked > 0) return Math.min(asked, printer.z);
    return autoSleeveHeight(diameter, printer);
}

/** Kit id used in file names, e.g. "Kit_D175_H160". */
export function kitId(diameter, sleeveH) {
    return `Kit_D${diameter}_H${Math.round(sleeveH)}`;
}
