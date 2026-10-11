/**
 * Cast Form Generator - Dinnerware Import
 * Rebuilds a Dinnerware Designer item from its saved parametric state and
 * derives exact surface-pattern metadata for Tier 1 analytic mold relief.
 *
 * The dinnerware state singleton is seeded directly (no setState calls), so
 * the dinnerware app's autosave never fires from this page.
 */

import { stateManager, parameterResolver, ITEM_TYPES } from '../../state/projectState.js';
import {
    generateItemMesh,
    calculateGeometryValues,
    computePatternBandMeta,
    getWallInsetConfig
} from '../../geometry/meshGenerator.js';
import { getPatternParams, computePatternRadialSegments } from '../../geometry/surfacePattern.js';
import { InputProcessor } from './inputProcessor.js';

// Must mirror the fade margins in meshGenerator's pattern options so the
// analytic mold relief starts/stops exactly where the vessel's does.
const WALL_JUNCTION_FADE = 1.5;
const WALL_RIM_FADE = 2.0;
const FOOT_SEAT_FADE = 1.0;
const FOOT_JUNCTION_FADE = 1.5;

/**
 * Build one surface's pattern metadata from resolved item parameters.
 * Plain JSON — travels through postMessage to the mold worker.
 */
function buildSurfaceMeta(prefix, params, geoVals, bandInfo, radialSegments, insetConfig, normalizedPattern) {
    const type = params[`${prefix}PatternType`];
    if (!type || type === 'none') return null;
    const depth = params[`${prefix}PatternDepth`];
    if (!depth || depth < 0.05) return null;

    const isWall = prefix === 'wall';
    if (!isWall && !geoVals.hasFootring) return null;

    // Height span of the exact profile chain the pattern engine displaces
    // (wall: fillet tangent or footring top to the rim; footring: bed to top).
    const yStart = bandInfo?.yStart ?? (isWall ? geoVals.footringHeight : 0);
    const yEnd = bandInfo?.yEnd ?? (isWall ? geoVals.h : geoVals.footringHeight);

    // Prefer the engine's own band mean radius (the value that drives the
    // helix phase in the displaced mesh); fall back to the geometric estimate.
    const approxMeanRadius = isWall
        ? (geoVals.radius + geoVals.radiusAtWallBottom) / 2
        : (geoVals.footringOuterRadius + geoVals.radiusAtWallBottom) / 2;
    const meanRadius = bandInfo?.meanRadius ?? approxMeanRadius;
    const insetRegion = isWall ? (params.wallPatternInsetRegion || 'both') : 'both';
    const activeYStart = insetConfig && insetRegion === 'upper'
        ? insetConfig.upperY
        : undefined;
    const activeYEnd = insetConfig && insetRegion === 'lower'
        ? insetConfig.lowerY
        : undefined;

    return {
        region: isWall ? 'wall' : 'footring',
        type,
        depth,
        relief: params[`${prefix}PatternRelief`],
        count: normalizedPattern?.count ?? params[`${prefix}PatternCount`],
        pitch: params[`${prefix}PatternPitch`],
        lineWidthPct: Number.isFinite(normalizedPattern?.duty)
            ? normalizedPattern.duty * 100
            : params[`${prefix}PatternLineWidth`],
        profile: params[`${prefix}PatternProfile`],
        angleDeg: params[`${prefix}PatternAngle`],
        direction: params[`${prefix}PatternDirection`],
        meanRadius,
        // Grid parity data: lets the mold's analytic relief reproduce the
        // pattern engine's exact effective field (angle snap) on this band
        bandArcLength: bandInfo?.bandArcLength,
        radialSegments,
        wallAngleDeg: isWall ? params.wallAngle : params.outerFootringAngle,
        yStart,
        yEnd,
        fadeStart: isWall ? WALL_JUNCTION_FADE : FOOT_SEAT_FADE,
        fadeEnd: isWall ? WALL_RIM_FADE : FOOT_JUNCTION_FADE,
        activeYStart,
        activeYEnd,
        activeYFade: isWall ? WALL_JUNCTION_FADE : undefined
    };
}

/**
 * Regenerate a dinnerware item's mesh from saved project state and derive
 * its pattern metadata.
 * @param {Object} projectState - Full dinnerware state (as stored by the dashboard)
 * @param {string} itemType - e.g. 'mug'
 * @returns {{geometry: THREE.BufferGeometry|null, patternMeta: Object|null, errors: string[]}}
 */
export function buildDinnerwareItemForCastForm(projectState, itemType) {
    if (!ITEM_TYPES.includes(itemType)) {
        return { geometry: null, patternMeta: null, errors: [`Unknown item type: ${itemType}`] };
    }

    // Seed the dinnerware state directly. mergeWithDefaults backfills any
    // parameters added since the project was saved.
    stateManager.state = stateManager.mergeWithDefaults(projectState);

    const rawGeometry = generateItemMesh(itemType);
    const params = parameterResolver.getAllParameters(itemType);
    const geoVals = calculateGeometryValues(params);

    // The generated mesh sits with its foot at y=0, but processGeometry
    // re-bases min.y to 0 — a recessed base extends below the foot plane, so
    // capture the shift and apply it to the pattern band coordinates.
    rawGeometry.computeBoundingBox();
    const yShift = -rawGeometry.boundingBox.min.y;

    const processed = InputProcessor.processGeometry(rawGeometry);

    // Same radial resolution and band profiles the mesh generator used —
    // needed by the mold's analytic relief to reproduce the effective field
    const wallPattern = getPatternParams(params, 'wall');
    const footringPattern = geoVals.hasFootring ? getPatternParams(params, 'footring') : null;
    const radialSegments = computePatternRadialSegments(wallPattern, footringPattern);
    const bands = computePatternBandMeta(params, geoVals);
    const insetConfig = getWallInsetConfig(params, geoVals);

    const surfaces = [
        buildSurfaceMeta('wall', params, geoVals, bands.wall, radialSegments, insetConfig, wallPattern),
        buildSurfaceMeta('footring', params, geoVals, bands.footring, radialSegments, insetConfig, footringPattern)
    ].filter(Boolean).map((surface) => ({
        ...surface,
        yStart: surface.yStart + yShift,
        yEnd: surface.yEnd + yShift,
        activeYStart: Number.isFinite(surface.activeYStart)
            ? surface.activeYStart + yShift
            : undefined,
        activeYEnd: Number.isFinite(surface.activeYEnd)
            ? surface.activeYEnd + yShift
            : undefined
    }));

    return {
        geometry: processed.geometry,
        patternMeta: surfaces.length > 0 ? { source: 'dinnerware', itemType, surfaces } : null,
        errors: processed.errors
    };
}
