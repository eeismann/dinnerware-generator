/**
 * Vessel Designer V3 - Spout/Lid Validation
 *
 * Phase 2: spoutGraft.js now produces real geometry, but it only displaces
 * the OUTER wall's rim ring — it does not sculpt a matching pull into the
 * independently-offset inner wall (spout.wallThickness is a design target
 * for the tip, not a quantity derived from the graft; see
 * VESSEL_V3_SPOUT_HANDLE_LID_PLAN.md section 3). Deriving a true "actual"
 * inner-wall gap at the grafted ring would need a second raycast against
 * the inner profile for a value the UI never sculpts to, so per the phase-2
 * scope this validates the design parameter alone against the print-safety
 * floor (`wallThicknessContext.tipWallThickness` is still accepted as an
 * override for callers that do compute a real gap; nothing currently
 * passes one).
 *
 * Phase 3: lidGenerator.js now computes real fit geometry, so validateLid()
 * accepts an optional `fitContext` (from `lidGenerator.computeLidFitContext`)
 * — when supplied it checks the ACTUAL skirt-to-neck clearance the fit math
 * produced (which can be pinned to a floor radius and come out tighter than
 * the requested `lid.clearance` on a very small neck) and flags a shallow/
 * wide dome as an overhang risk. Falling back to parameter-only validation
 * when no fitContext is given keeps existing callers working unchanged.
 *
 * Phase 5: the dome overhang check now compares
 * `fitContext.domeOverhangAngleDeg` (computed by
 * `lidGenerator.estimateDomeOverhangAngleDeg`, reusing the same dome
 * geometry `buildOuterProfilePoints` produces) against the platform's usual
 * 45-degree overhang threshold, instead of a bare radius/height comparison
 * — see that function's doc comment for why a literal steepest-sampled-
 * segment angle is not used (it is degenerate near the dome's closed apex
 * for any dome proportions, so it can't discriminate a real risk from a
 * normal one).
 */

const MIN_PRINT_WALL_MM = 1.2;
const MIN_LID_WALL_MM = 1.2;
const MAX_SPOUT_WIDTH_DEG = 300;
const MIN_LID_CLEARANCE_MM = 0.2;
const LID_CLEARANCE_PINCH_TOLERANCE_MM = 0.05;
const MAX_LID_DOME_OVERHANG_DEG = 45;

export function validateSpout(spoutState, wallThicknessContext = {}) {
    const warnings = [];
    if (!spoutState || spoutState.enabled !== true) return warnings;

    if (!spoutState.segmentId) {
        warnings.push('Spout is enabled but no wall segment is selected for it.');
    }

    const tipWall = Number.isFinite(Number(wallThicknessContext.tipWallThickness))
        ? Number(wallThicknessContext.tipWallThickness)
        : Number(spoutState.wallThickness);
    if (Number.isFinite(tipWall) && tipWall < MIN_PRINT_WALL_MM) {
        warnings.push(
            `Spout tip wall ${tipWall.toFixed(2)} mm is below the ${MIN_PRINT_WALL_MM} mm minimum print wall.`
        );
    }

    const width = Number(spoutState.width);
    if (Number.isFinite(width) && width > MAX_SPOUT_WIDTH_DEG) {
        warnings.push(
            `Spout width ${width.toFixed(0)}° overlaps itself past ${MAX_SPOUT_WIDTH_DEG}° — clamp before generating geometry.`
        );
    }

    return warnings;
}

export function validateLid(lidState, fitContext = {}) {
    const warnings = [];
    if (!lidState || lidState.enabled !== true) return warnings;

    const clearance = Number.isFinite(Number(fitContext.actualClearance))
        ? Number(fitContext.actualClearance)
        : Number(lidState.clearance);
    if (Number.isFinite(clearance) && clearance < MIN_LID_CLEARANCE_MM) {
        warnings.push(
            `Lid clearance ${clearance.toFixed(2)} mm may not fit without sanding (min ${MIN_LID_CLEARANCE_MM} mm).`
        );
    }

    // The neck was small enough that the fit math had to pin the skirt
    // radius to a floor, so the actual clearance came out tighter than what
    // the user asked for.
    if (
        Number.isFinite(Number(fitContext.actualClearance)) &&
        Number.isFinite(Number(fitContext.requestedClearance)) &&
        fitContext.requestedClearance - fitContext.actualClearance > LID_CLEARANCE_PINCH_TOLERANCE_MM
    ) {
        warnings.push(
            `Neck opening is small enough that the actual lid clearance (${fitContext.actualClearance.toFixed(2)} mm) is tighter than the requested ${fitContext.requestedClearance.toFixed(2)} mm.`
        );
    }

    const wall = Number(lidState.wallThickness);
    if (Number.isFinite(wall) && wall < MIN_LID_WALL_MM) {
        warnings.push(
            `Lid wall ${wall.toFixed(2)} mm is below the ${MIN_LID_WALL_MM} mm minimum print wall.`
        );
    }

    const domeOverhangDeg = Number(fitContext.domeOverhangAngleDeg);
    if (Number.isFinite(domeOverhangDeg) && domeOverhangDeg > MAX_LID_DOME_OVERHANG_DEG) {
        warnings.push(
            `Lid dome (height ${Number(fitContext.domeHeight).toFixed(0)} mm vs. base radius ${Number(fitContext.domeBaseRadius).toFixed(0)} mm) creates an estimated overhang of ${domeOverhangDeg.toFixed(0)}° — exceeds ${MAX_LID_DOME_OVERHANG_DEG}° and may require supports.`
        );
    }

    return warnings;
}
