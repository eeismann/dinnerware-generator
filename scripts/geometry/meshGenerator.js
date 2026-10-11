/**
 * Mesh Generator
 * Generates 3D meshes for dinnerware items using parametric profiles
 *
 * Each item's closed cross-section (profileBuilder.js) is revolved chain by
 * chain. Chains break at sharp profile transitions, so crisp profile edges
 * survive while circumferential shading stays smooth.
 */

import * as THREE from 'three';
import { parameterResolver, ITEM_TYPES } from '../state/projectState.js';
import {
    getPatternParams,
    computePatternRadialSegments,
    latheWithOptionalPattern
} from './surfacePattern.js';
import {
    CENTERLINE_SEAM_RADIUS,
    buildCrossSection,
    computeWallInsetConfig,
    designWallPoints,
    solveBottomFillet
} from './profileBuilder.js';

// Resolution settings
const RADIAL_SEGMENTS = 64;
const EXPORT_RADIAL_SEGMENTS = 512;
// Interactive previews (slider drags) halve the pattern grid's density
const INTERACTIVE_MIN_SEGMENTS = 32;

// Fade margins (mm): pattern displacement eases to zero near edges so the
// rim stays clean, junctions stay watertight, and the foot sits flat.
// Cast Form's dinnerware import mirrors these values.
const RIM_FADE = 2.0;
const JUNCTION_FADE = 1.5;
const FOOT_SEAT_FADE = 1.0;

/**
 * Calculate common geometry values used across profile generation
 * (exported for the validation/warning system)
 */
export function calculateGeometryValues(params) {
    const { diameter, height } = params.dimensions;
    const nominalRadius = Math.max(diameter / 2, 10);
    const h = Math.max(height, 5);

    const wallAngleRad = (params.wallAngle * Math.PI) / 180;
    const footringHeight = Math.max(0, Math.min(params.footringOriginHeight, h * 0.8));
    const hasFootring = footringHeight > 0;

    const wallHeight = h - footringHeight;
    const wallRadiusChange = wallHeight * Math.tan(wallAngleRad);
    const anchorPositiveAngleAtBase = params.wallAngle > 0
        && params.positiveWallAngleAnchor === 'base';
    // The item diameter normally describes the top rim. In base-anchor mode,
    // positive angles reinterpret that same set-scale diameter as the wall's
    // bottom diameter and let the rim expand outward from it.
    const radiusAtWallBottom = anchorPositiveAngleAtBase
        ? Math.max(nominalRadius, 15)
        : Math.max(nominalRadius - wallRadiusChange, 15);
    const radius = anchorPositiveAngleAtBase
        ? radiusAtWallBottom + wallRadiusChange
        : nominalRadius;

    // Bottom corner radius - limit to reasonable values based on geometry
    const maxCornerRadius = Math.min(wallHeight * 0.8, radiusAtWallBottom * 0.5);
    const bottomCornerRadius = Math.min(params.bottomCornerRadius || 0, maxCornerRadius);
    const thickness = Math.max(params.wallThickness, 0.5);

    const geoVals = {
        radius,
        h,
        footringHeight,
        hasFootring,
        wallHeight,
        radiusAtWallBottom,
        wallAngleRad,
        thickness,
        bottomCornerRadius
    };

    // The fillet is tangent to both the foot plane and the (possibly curved)
    // wall, so it meets each without a crease.
    geoVals.wallPoints = designWallPoints(params, geoVals);
    geoVals.fillet = bottomCornerRadius >= 0.5
        ? solveBottomFillet(geoVals.wallPoints, footringHeight, bottomCornerRadius)
        : null;
    // Where the footring wall (or flat base) meets the body
    const footringTopRadius = geoVals.fillet ? geoVals.fillet.center.x : radiusAtWallBottom;

    let footringOuterRadius = radiusAtWallBottom;
    let footringInnerRadius = 3;
    if (hasFootring) {
        const outerAngleRad = (params.outerFootringAngle * Math.PI) / 180;
        const outerWallHorizontal = footringHeight * Math.tan(outerAngleRad);
        footringOuterRadius = Math.max(footringTopRadius - outerWallHorizontal, params.footringBaseWidth + 5);
        footringInnerRadius = Math.max(footringOuterRadius - params.footringBaseWidth, 3);
    }

    return Object.assign(geoVals, {
        footringTopRadius,
        footringOuterRadius,
        footringInnerRadius
    });
}

/**
 * Resolve the set-level stepped inset in local item coordinates: the chamfer
 * spans [lowerY, upperY]; everything below lowerY is scaled by radialScale.
 */
export function getWallInsetConfig(params, geoVals) {
    return computeWallInsetConfig(params, geoVals);
}

/**
 * Cross-section of an item from resolved parameters.
 */
export function buildItemCrossSection(params, geoVals = calculateGeometryValues(params), options) {
    return buildCrossSection(params, geoVals, options);
}

/**
 * Engine-truth pattern band info per patternable region: the mean radius,
 * arc length and height span of the exact profile polyline the pattern
 * engine displaces. Exported so the Cast Form importer can ship parity data
 * for Tier-1 analytic mold relief (computeEffectivePattern needs these to
 * reproduce the grid's angle snap).
 */
export function computePatternBandMeta(params, geoVals) {
    const section = buildCrossSection(params, geoVals);
    const bandFromPoints = (pts) => {
        if (!pts || pts.length < 2) return null;
        let mean = 0;
        let len = 0;
        pts.forEach(p => { mean += p.x; });
        for (let i = 1; i < pts.length; i++) len += pts[i - 1].distanceTo(pts[i]);
        const ys = pts.map(p => p.y);
        return {
            meanRadius: Math.max(1, mean / pts.length),
            bandArcLength: len,
            yStart: Math.min(...ys),
            yEnd: Math.max(...ys)
        };
    };
    const chainPoints = (pattern) => section.chains.find(chain => chain.pattern === pattern)?.points;

    return {
        wall: bandFromPoints(chainPoints('wall')),
        footring: geoVals.hasFootring ? bandFromPoints(chainPoints('footring')) : null
    };
}

/**
 * Close the centerline hole left by a chain that stops at the seam radius.
 * Vertices follow LatheGeometry's (r sin φ, r cos φ) convention so the fan's
 * rim coincides bitwise with the adjacent lathe ring.
 */
function createAxisFan(y, radius, segments, faceUp) {
    const positions = new Float32Array((segments + 2) * 3);
    const normals = new Float32Array((segments + 2) * 3);
    const indices = [];
    const ny = faceUp ? 1 : -1;
    positions[1] = y;
    normals[1] = ny;
    for (let i = 0; i <= segments; i++) {
        const phi = (i / segments) * Math.PI * 2;
        const o = (i + 1) * 3;
        positions[o] = radius * Math.sin(phi);
        positions[o + 1] = y;
        positions[o + 2] = radius * Math.cos(phi);
        normals[o + 1] = ny;
    }
    for (let i = 1; i <= segments; i++) {
        if (faceUp) indices.push(0, i, i + 1);
        else indices.push(0, i + 1, i);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geometry.setIndex(indices);
    return geometry;
}

/**
 * Generate complete mesh for an item type
 * @param {string} itemType
 * @param {Object} [options]
 * @param {number} [options.minRadialSegments] - Floor for the shared radial resolution
 * @param {boolean} [options.interactive] - Lighter mesh for live slider drags
 */
export function generateItemMesh(itemType, { minRadialSegments = RADIAL_SEGMENTS, interactive = false } = {}) {
    try {
        const params = parameterResolver.getAllParameters(itemType);

        if (!params || !params.dimensions) {
            console.error('Invalid parameters for', itemType);
            return createFallbackGeometry();
        }

        const { diameter, height } = params.dimensions;
        if (!diameter || !height || diameter <= 0 || height <= 0) {
            console.error('Invalid dimensions for', itemType);
            return createFallbackGeometry();
        }

        const geoVals = calculateGeometryValues(params);

        // === SURFACE PATTERNS ===
        // All lathe segments of an item share one radial resolution so that
        // boundary rings between patterned and smooth segments coincide
        // exactly (required for a watertight merge).
        const wallPattern = getPatternParams(params, 'wall');
        const footringPattern = geoVals.hasFootring ? getPatternParams(params, 'footring') : null;
        let patternSegments = computePatternRadialSegments(wallPattern, footringPattern);
        if (interactive) {
            // Halving keeps the grid a multiple of 8 and, where the ridge
            // count allows, of every ridge count (no ridge-to-ridge drift).
            const half = patternSegments / 2;
            const counts = [wallPattern, footringPattern]
                .filter(p => p && ['vertical', 'diagonal', 'crosshatch', 'knurl'].includes(p.type))
                .map(p => p.count);
            if (half >= INTERACTIVE_MIN_SEGMENTS && half % 8 === 0 && counts.every(c => half % c === 0)) {
                patternSegments = half;
            }
        }
        // Refine by a whole multiple of the preview grid so existing pattern
        // samples and matching cap/footring rings stay aligned. Dense patterns
        // retain their resolution instead of being reduced to the export floor.
        const radialSegments = patternSegments * Math.max(1, Math.ceil(minRadialSegments / patternSegments));

        // Keep centerline seam chords well above the STL weld resolution
        // (0.001mm): grow the seam radius with radial density so the tiny
        // near-axis circle never collapses into welded/over-connected edges.
        const seamRadius = Math.max(CENTERLINE_SEAM_RADIUS, radialSegments * 0.0005);
        const section = buildCrossSection(params, geoVals, { seamRadius });

        const insetConfig = section.inset;
        const wallPatternRegion = params.wallPatternInsetRegion || 'both';
        const wallPatternRegionOpts = {};
        if (insetConfig && wallPatternRegion === 'upper') {
            wallPatternRegionOpts.activeYMin = insetConfig.upperY;
            wallPatternRegionOpts.activeYFade = JUNCTION_FADE;
        } else if (insetConfig && wallPatternRegion === 'lower') {
            wallPatternRegionOpts.activeYMax = insetConfig.lowerY;
            wallPatternRegionOpts.activeYFade = JUNCTION_FADE;
        }
        const patternOptions = {
            // Recessed patterns must leave structural material behind them
            wall: {
                pattern: wallPattern,
                fadeStart: JUNCTION_FADE,
                fadeEnd: RIM_FADE,
                maxRecessDepth: Math.max(0, geoVals.thickness - 1.0),
                ...wallPatternRegionOpts
            },
            footring: {
                pattern: footringPattern,
                // Profile runs bottom-to-top: foot seat, then body junction
                fadeStart: FOOT_SEAT_FADE,
                fadeEnd: JUNCTION_FADE,
                maxRecessDepth: Math.max(0, params.footringBaseWidth - 1.0)
            }
        };

        const geometries = section.chains.map(chain => {
            const options = chain.pattern ? patternOptions[chain.pattern] : null;
            return latheWithOptionalPattern(chain.points, radialSegments, options?.pattern ?? null, options);
        });
        section.axisCaps.forEach(cap => {
            geometries.push(createAxisFan(cap.y, cap.radius, radialSegments, cap.faceUp));
        });

        // Merge WITHOUT recomputing normals - each segment maintains its own normals
        // This preserves smooth circumference while keeping sharp profile angles
        const merged = mergeBufferGeometries(geometries);
        geometries.forEach(geometry => geometry.dispose());
        return merged;

    } catch (error) {
        console.error('Error generating mesh for', itemType, error);
        return createFallbackGeometry();
    }
}

/**
 * Regenerate the authored item for printing without replacing its preview mesh.
 */
export function generateItemExportMesh(itemType) {
    return generateItemMesh(itemType, { minRadialSegments: EXPORT_RADIAL_SEGMENTS });
}

function createFallbackGeometry() {
    const points = [
        new THREE.Vector2(50, 0),
        new THREE.Vector2(60, 30)
    ];
    return new THREE.LatheGeometry(points, RADIAL_SEGMENTS);
}

function mergeBufferGeometries(geometries) {
    const valid = geometries.filter(g => g?.getAttribute('position')?.count > 0);
    if (valid.length === 0) return createFallbackGeometry();

    let vertexCount = 0;
    let indexCount = 0;
    valid.forEach(geo => {
        vertexCount += geo.getAttribute('position').count;
        indexCount += geo.getIndex()?.count ?? geo.getAttribute('position').count;
    });

    const positions = new Float32Array(vertexCount * 3);
    const normals = new Float32Array(vertexCount * 3);
    const indices = vertexCount > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);

    let vertexOffset = 0;
    let indexOffset = 0;
    valid.forEach(geo => {
        const position = geo.getAttribute('position');
        const normal = geo.getAttribute('normal');
        positions.set(position.array.subarray(0, position.count * 3), vertexOffset * 3);
        if (normal) normals.set(normal.array.subarray(0, position.count * 3), vertexOffset * 3);

        const index = geo.getIndex();
        if (index) {
            const source = index.array;
            for (let i = 0; i < index.count; i++) indices[indexOffset + i] = source[i] + vertexOffset;
            indexOffset += index.count;
        } else {
            for (let i = 0; i < position.count; i++) indices[indexOffset + i] = i + vertexOffset;
            indexOffset += position.count;
        }
        vertexOffset += position.count;
    });

    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    merged.setIndex(new THREE.BufferAttribute(indices, 1));
    return merged;
}

export function generateAllMeshes() {
    const meshes = {};
    ITEM_TYPES.forEach(itemType => {
        meshes[itemType] = generateItemMesh(itemType);
    });
    return meshes;
}

export function getItemDimensions(itemType) {
    const params = parameterResolver.getAllParameters(itemType);
    return {
        diameter: Math.round((params.dimensions?.diameter || 100) * 10) / 10,
        height: Math.round((params.dimensions?.height || 50) * 10) / 10
    };
}
