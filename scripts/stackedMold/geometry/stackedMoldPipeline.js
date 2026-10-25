/**
 * Stacked Cylinder Mold - pipeline
 *
 * Source profile (ware size) → mold-size profile → slice → printable parts
 * → warnings → plaster mix per pour. Pure (no DOM, no Three.js scene), shared by the app and the
 * Node gates.
 */

import { makeControlProfile, makeSampledProfile, sliceProfile, countPieces } from './bandSlicer.js';
import { buildCastingParts, moldDimensions } from './castingUnitParts.js';
import { collectWarnings } from './moldWarnings.js';
import { plasterSchedule } from './plasterMix.js';
import { slicerParams, partParams } from '../state/stackedMoldDefaults.js';

/**
 * Mold-size profile from a stored source profile.
 * @param {Object} src - { controlPoints? | outer, underside, asymmetry }
 * @param {number} shrinkagePct
 */
export function moldProfile(src, shrinkagePct = 0) {
    const s = 1 / (1 - Math.max(0, Math.min(40, shrinkagePct)) / 100);
    if (src.controlPoints?.length) {
        const prof = makeControlProfile(src.controlPoints.map(([z, r]) => [z * s, r * s]));
        prof.underside = (src.underside || []).map(p => ({ rho: p.rho * s, z: p.z * s }));
        return prof;
    }
    if (!src.outer?.length) throw new Error('The source has no outer profile.');
    return makeSampledProfile(
        src.outer.map(p => ({ z: p.z * s, r: p.r * s })),
        { underside: (src.underside || []).map(p => ({ rho: p.rho * s, z: p.z * s })) }
    );
}

/**
 * @param {Object} src - stored source profile
 * @param {Object} params - grouped app params (stackedMoldDefaults DEFAULT_PARAMS shape)
 * @param {Object} [options] - { parts: false } skips solid building (slicer only)
 */
export function computeMold(src, params, { parts = true } = {}) {
    const profile = moldProfile(src, params.mold.shrinkage);
    const result = sliceProfile(profile, slicerParams(params));
    const dims = moldDimensions(result, partParams(params));
    const built = parts ? buildCastingParts(result, partParams(params)) : null;
    const warnings = collectWarnings(result, dims, src, params, built);
    return {
        result,
        dims,
        parts: built,
        warnings,
        mix: plasterSchedule(result, params.plaster),
        summary: {
            units: result.units.length,
            pieces: countPieces(result),
            diameter: result.S,
            stackHeight: result.units.reduce((m, u) => m + u.h, 0),
            ledge: result.rw - result.rLip,
            plasterLitres: result.units.reduce((m, u) => m + u.vol, 0)
        }
    };
}
