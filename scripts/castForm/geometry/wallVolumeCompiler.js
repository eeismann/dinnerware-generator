/**
 * Cast Form Generator - Volume-First Wall Compiler
 *
 * Builds wall shells from a sampled occupancy volume in (height, angle, depth)
 * space, then extracts exposed cell faces. This avoids stitched-surface
 * topology failure modes and keeps the generated wall closed by construction.
 */

import * as THREE from 'three';
import { computeWallSideCutPlanes } from './sideStockCutPlanes.js';

const QUALITY_PRESETS = {
    preview: {
        depthStepsMin: 22,
        depthStepsMax: 56,
        shellBandMultiplier: 1.0,
        seamBandMultiplier: 1.15,
        targetVoxelSize: 1.35,
        heightSampleScale: 0.85,
        angleSampleScale: 0.70,
        spareShelfRise: 0.04,
        featureSnapThreshold: 0.22
    },
    export: {
        depthStepsMin: 32,
        depthStepsMax: 76,
        shellBandMultiplier: 1.0,
        seamBandMultiplier: 1.2,
        targetVoxelSize: 0.85,
        heightSampleScale: 0.86,
        angleSampleScale: 0.72,
        spareShelfRise: 0.02,
        featureSnapThreshold: 0.14
    }
};

const EPSILON = 1e-6;
const REGISTRATION_KEY_PROFILE_OFFSETS = [
    -1,
    -0.94,
    -0.84,
    -0.72,
    -0.60,
    -0.48,
    -0.36,
    -0.24,
    -0.12,
    0,
    0.12,
    0.24,
    0.36,
    0.48,
    0.60,
    0.72,
    0.84,
    0.94,
    1
];

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function normalizeAngle(angle) {
    const tau = Math.PI * 2;
    const wrapped = angle % tau;
    return wrapped < 0 ? wrapped + tau : wrapped;
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function average4(a, b, c, d) {
    return (a + b + c + d) * 0.25;
}

function createRegistrationFaceColumns() {
    return [
        0,
        0.18,
        0.30,
        0.38,
        0.44,
        0.49,
        0.53,
        0.56,
        0.59,
        0.61,
        0.62,
        0.63,
        0.65,
        0.68,
        0.71,
        0.75,
        0.80,
        0.88,
        1
    ];
}

function lineIntersection(normalA, distanceA, normalB, distanceB) {
    const det = normalA.x * normalB.z - normalA.z * normalB.x;
    if (Math.abs(det) <= EPSILON) return null;

    return {
        x: (distanceA * normalB.z - normalA.z * distanceB) / det,
        z: (normalA.x * distanceB - distanceA * normalB.x) / det
    };
}

function raySegmentIntersectionT(direction, start, end) {
    const edge = {
        x: end.x - start.x,
        z: end.z - start.z
    };
    const det = edge.x * direction.z - direction.x * edge.z;

    if (Math.abs(det) <= EPSILON) {
        const startCross = direction.x * start.z - direction.z * start.x;
        const endCross = direction.x * end.z - direction.z * end.x;
        if (Math.abs(startCross) > 1e-5 || Math.abs(endCross) > 1e-5) {
            return null;
        }

        const startT = direction.x * start.x + direction.z * start.z;
        const endT = direction.x * end.x + direction.z * end.z;
        return Math.max(startT, endT);
    }

    const t = (edge.x * start.z - start.x * edge.z) / det;
    const s = (direction.x * start.z - direction.z * start.x) / det;

    if (t < -EPSILON || s < -EPSILON || s > 1 + EPSILON) {
        return null;
    }

    return Math.max(0, t);
}

function rayPolygonMaxT(direction, points) {
    if (!Array.isArray(points) || points.length < 3) return null;

    let maxT = null;
    for (let i = 0; i < points.length; i++) {
        const start = points[i];
        const end = points[(i + 1) % points.length];
        const t = raySegmentIntersectionT(direction, start, end);
        if (t === null || !Number.isFinite(t)) continue;
        maxT = maxT === null ? t : Math.max(maxT, t);
    }

    return maxT;
}

function sampleFeature(values, idx) {
    const clamped = clamp(idx, 0, values.length - 1);
    return values[clamped];
}

function readPos(positions, vertexIndex) {
    const base = vertexIndex * 3;
    return [
        positions[base],
        positions[base + 1],
        positions[base + 2]
    ];
}

function pushOrientedQuad(indices, positions, i0, i1, i2, i3, cellCenter) {
    const v0 = readPos(positions, i0);
    const v1 = readPos(positions, i1);
    const v2 = readPos(positions, i2);
    const v3 = readPos(positions, i3);

    const c0 = (v0[0] + v1[0] + v2[0] + v3[0]) * 0.25;
    const c1 = (v0[1] + v1[1] + v2[1] + v3[1]) * 0.25;
    const c2 = (v0[2] + v1[2] + v2[2] + v3[2]) * 0.25;

    const e1x = v1[0] - v0[0];
    const e1y = v1[1] - v0[1];
    const e1z = v1[2] - v0[2];
    const e2x = v2[0] - v0[0];
    const e2y = v2[1] - v0[1];
    const e2z = v2[2] - v0[2];

    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;

    const ox = c0 - cellCenter[0];
    const oy = c1 - cellCenter[1];
    const oz = c2 - cellCenter[2];

    const outwardDot = nx * ox + ny * oy + nz * oz;

    if (outwardDot >= 0) {
        indices.push(i0, i1, i2);
        indices.push(i0, i2, i3);
        return;
    }

    indices.push(i0, i3, i2);
    indices.push(i0, i2, i1);
}

function pushOrientedTriangle(indices, positions, i0, i1, i2, cellCenter) {
    const v0 = readPos(positions, i0);
    const v1 = readPos(positions, i1);
    const v2 = readPos(positions, i2);

    const e1x = v1[0] - v0[0];
    const e1y = v1[1] - v0[1];
    const e1z = v1[2] - v0[2];
    const e2x = v2[0] - v0[0];
    const e2y = v2[1] - v0[1];
    const e2z = v2[2] - v0[2];

    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    const area2 = Math.sqrt(nx * nx + ny * ny + nz * nz);

    if (!Number.isFinite(area2) || area2 <= 1e-8) {
        return;
    }

    const cx = (v0[0] + v1[0] + v2[0]) / 3;
    const cy = (v0[1] + v1[1] + v2[1]) / 3;
    const cz = (v0[2] + v1[2] + v2[2]) / 3;
    const ox = cx - cellCenter[0];
    const oy = cy - cellCenter[1];
    const oz = cz - cellCenter[2];
    const outwardDot = nx * ox + ny * oy + nz * oz;

    if (outwardDot >= 0) {
        indices.push(i0, i1, i2);
        return;
    }

    indices.push(i0, i2, i1);
}

export class WallVolumeCompiler {
    constructor(options = {}) {
        this.vesselClearance = options.vesselClearance ?? 0.1;
        this.baseMoldHeight = options.baseMoldHeight ?? 15;
        // Tier 1 analytic pattern relief hook; set per generation by MoldGenerator
        this.analyticRelief = null;
        // Finest vertical pattern period (mm) measured/derived by MoldGenerator;
        // sizes the seam-face anchor smoothing window (see buildSeamAnchorRadii)
        this.patternVerticalPeriod = null;
    }

    getQualityPreset(quality = 'preview') {
        return quality === 'export'
            ? QUALITY_PRESETS.export
            : QUALITY_PRESETS.preview;
    }

    getNatchHeightFractions(countPerSeam) {
        return countPerSeam === 1
            ? [0.5]
            : countPerSeam === 2
                ? [0.3, 0.7]
                : countPerSeam === 3
                    ? [0.2, 0.5, 0.8]
                    : [0.18, 0.38, 0.62, 0.82];
    }

    addRegistrationKeyRows(rows, bounds, natchParams, enabled) {
        if (!enabled || !natchParams) return rows;

        const keyHeight = bounds.max.y - bounds.min.y;
        if (!Number.isFinite(keyHeight) || keyHeight <= EPSILON) return rows;

        const diameter = Math.max(1, (natchParams.diameter || 10) + Math.max(0, natchParams.toleranceOffset || 0) * 2);
        const radius = diameter * 0.5;
        const fractions = this.getNatchHeightFractions(natchParams.countPerSeam || 2);
        const keyedRows = [...rows];

        const addRow = (y) => {
            if (!Number.isFinite(y) || y < bounds.min.y - EPSILON || y > bounds.max.y + EPSILON) {
                return;
            }

            if (keyedRows.some((row) => Math.abs(row.y - y) <= EPSILON)) {
                return;
            }

            keyedRows.push({
                y: clamp(y, bounds.min.y, bounds.max.y),
                mode: 'vessel'
            });
        };

        for (const fraction of fractions) {
            const centerY = bounds.min.y + keyHeight * fraction;
            for (const offset of REGISTRATION_KEY_PROFILE_OFFSETS) {
                addRow(centerY + radius * offset);
            }
        }

        keyedRows.sort((a, b) => a.y - b.y);
        return keyedRows;
    }

    computeFaceRegistrationDisplacement({
        y,
        depthT,
        faceLength,
        outwardNormal,
        role,
        natchParams,
        enabled,
        keyBaseY,
        keyHeight,
        shellThickness
    }) {
        if (!enabled || !natchParams) return { x: 0, z: 0, amount: 0 };
        if (!Number.isFinite(faceLength) || faceLength <= EPSILON) return { x: 0, z: 0, amount: 0 };
        if (!Number.isFinite(keyBaseY) || !Number.isFinite(keyHeight) || keyHeight <= EPSILON) return { x: 0, z: 0, amount: 0 };
        if (depthT <= EPSILON || depthT >= 1 - EPSILON) return { x: 0, z: 0, amount: 0 };

        const baseDiameter = Math.max(1, natchParams.diameter || 10);
        const tolerance = Math.max(0, natchParams.toleranceOffset || 0);
        // Male keys use the base diameter; female sockets are enlarged by the
        // per-side tolerance so the printed bump seats without binding.
        const featureDiameter = role === 'male'
            ? baseDiameter
            : baseDiameter + tolerance * 2;
        const desiredRadius = featureDiameter * 0.5;
        const depthDistance = depthT * faceLength;
        const minimumMargin = Math.max(shellThickness * 0.75, 1);
        const centerDepth = clamp(
            faceLength * 0.62,
            desiredRadius + minimumMargin,
            Math.max(desiredRadius + minimumMargin, faceLength - desiredRadius - minimumMargin)
        );
        const effectiveRadius = Math.min(
            desiredRadius,
            centerDepth - minimumMargin,
            faceLength - centerDepth - minimumMargin
        );

        if (!Number.isFinite(effectiveRadius) || effectiveRadius <= EPSILON) {
            return { x: 0, z: 0, amount: 0 };
        }

        const heightFractions = this.getNatchHeightFractions(natchParams.countPerSeam || 2);
        let influence = 0;

        for (const fraction of heightFractions) {
            const centerY = keyBaseY + keyHeight * fraction;
            const dy = y - centerY;
            const dd = depthDistance - centerDepth;
            const distanceSq = dy * dy + dd * dd;
            const radiusSq = effectiveRadius * effectiveRadius;
            if (distanceSq >= radiusSq) continue;

            const distance = Math.sqrt(distanceSq);
            const normalizedDistance = clamp(distance / effectiveRadius, 0, 1);
            const smoothInfluence = 0.5 + 0.5 * Math.cos(normalizedDistance * Math.PI);
            influence = Math.max(influence, smoothInfluence);
        }

        if (influence <= EPSILON) {
            return { x: 0, z: 0, amount: 0 };
        }

        const directionSign = role === 'male' ? 1 : -1;
        const amount = directionSign * Math.max(0, natchParams.depth || 0) * influence;
        return {
            x: outwardNormal.x * amount,
            z: outwardNormal.z * amount,
            amount
        };
    }

    computeNatchOffset({
        angleT,
        y,
        keyBaseY,
        keyHeight,
        wallIndex,
        natchParams,
        enabled,
        outerWallDistance,
        seamBand = 0.075
    }) {
        if (!enabled || !natchParams) return 0;

        if (!Number.isFinite(keyBaseY) || !Number.isFinite(keyHeight) || keyHeight <= 0) return 0;
        if (y < keyBaseY || y > keyBaseY + keyHeight) return 0;

        const baseDiameter = Math.max(1, natchParams.diameter || 10);
        const tolerance = Math.max(0, natchParams.toleranceOffset || 0);
        // Two-part molds use one positive half and one matching socket half.
        const sign = wallIndex === 0 ? 1 : -1;
        const featureDiameter = sign < 0
            ? baseDiameter + tolerance * 2
            : baseDiameter;
        const featureSeamBand = Number.isFinite(outerWallDistance) && outerWallDistance > EPSILON
            ? clamp((3 * featureDiameter) / (2 * Math.PI * Math.max(outerWallDistance, 1)), 0.04, 0.12)
            : seamBand;
        const activeSeamBand = Math.max(featureSeamBand, EPSILON);

        const startDist = angleT;
        const endDist = 1 - angleT;
        const nearStart = startDist <= activeSeamBand;
        const nearEnd = endDist <= activeSeamBand;
        if (!nearStart && !nearEnd) return 0;

        const seamDistance = nearEnd ? endDist : startDist;
        const seamInfluence = Math.exp(-Math.pow(seamDistance / Math.max(activeSeamBand * 0.55, EPSILON), 2));

        const depth = Math.max(0, natchParams.depth || 0);
        const heightFractions = this.getNatchHeightFractions(natchParams.countPerSeam || 2);
        const sigmaY = Math.max(3, featureDiameter * 0.45);

        let heightInfluence = 0;
        for (const fraction of heightFractions) {
            const centerY = keyBaseY + keyHeight * fraction;
            const dy = y - centerY;
            heightInfluence += Math.exp(-(dy * dy) / (2 * sigmaY * sigmaY));
        }

        heightInfluence = Math.min(1, heightInfluence);
        return sign * depth * seamInfluence * heightInfluence;
    }

    sampleProfileRadius(profile, angleSamples, heightIndexFloat, angle, options = {}) {
        const {
            heightFeatureScores = null,
            featureSnapThreshold = Infinity
        } = options;

        const rowCount = profile?.radii?.length || 0;
        if (rowCount === 0) return 0;

        const clampedH = clamp(heightIndexFloat, 0, rowCount - 1);
        const h0 = Math.floor(clampedH);
        const h1 = Math.min(rowCount - 1, h0 + 1);
        const ht = clampedH - h0;

        const normalizedAngle = normalizeAngle(angle);
        const anglePos = (normalizedAngle / (Math.PI * 2)) * angleSamples;
        const a0 = Math.floor(anglePos) % angleSamples;
        const a1 = (a0 + 1) % angleSamples;
        const at = anglePos - Math.floor(anglePos);

        const sampleAtRow = (rowIndex) => {
            const row = profile.radii[rowIndex] || [];
            const rA = row[a0] || 0;
            const rB = row[a1] || 0;
            return lerp(rA, rB, at);
        };

        const featureScore = Math.max(
            heightFeatureScores ? sampleFeature(heightFeatureScores, h0) : 0,
            heightFeatureScores ? sampleFeature(heightFeatureScores, h1) : 0
        );

        if (featureScore >= featureSnapThreshold) {
            const snapRow = ht < 0.5 ? h0 : h1;
            return sampleAtRow(snapRow);
        }

        const r0 = sampleAtRow(h0);
        const r1 = sampleAtRow(h1);
        return lerp(r0, r1, ht);
    }

    buildHeightFeatureScores(profile) {
        const rowCount = profile?.radii?.length || 0;
        if (rowCount === 0) return new Float32Array(0);

        const scores = new Float32Array(rowCount);
        const angleCount = profile?.radii?.[0]?.length || 0;

        for (let h = 1; h < rowCount - 1; h++) {
            let maxCurvature = 0;
            const prevRow = profile.radii[h - 1] || [];
            const row = profile.radii[h] || [];
            const nextRow = profile.radii[h + 1] || [];

            for (let a = 0; a < angleCount; a++) {
                const rPrev = prevRow[a] || 0;
                const rNow = row[a] || 0;
                const rNext = nextRow[a] || 0;
                const curvature = Math.abs(rNext - (2 * rNow) + rPrev);
                if (curvature > maxCurvature) {
                    maxCurvature = curvature;
                }
            }

            scores[h] = maxCurvature;
        }

        if (rowCount > 1) {
            scores[0] = scores[1];
            scores[rowCount - 1] = scores[rowCount - 2];
        }

        return scores;
    }

    sampleSpareRimRadius(profile, angleSamples, angle, bandRows = 4, options = {}) {
        const rowCount = profile?.radii?.length || 0;
        if (rowCount === 0) return 0;

        const start = Math.max(0, rowCount - Math.max(1, bandRows));
        const samples = [];

        for (let h = start; h < rowCount; h++) {
            const radius = this.sampleProfileRadius(profile, angleSamples, h, angle, options);
            samples.push(radius);
        }

        if (samples.length === 0) return 0;

        samples.sort((a, b) => a - b);
        const mid = Math.floor(samples.length / 2);
        return samples.length % 2 === 0
            ? (samples[mid - 1] + samples[mid]) * 0.5
            : samples[mid];
    }

    getWallCornerPoint(wallDistance, wallNormalAngle, radialAngle) {
        const angleDiff = radialAngle - wallNormalAngle;
        const cosDiff = Math.cos(angleDiff);

        if (Math.abs(cosDiff) < 0.001) {
            return {
                x: wallDistance * Math.cos(radialAngle),
                z: wallDistance * Math.sin(radialAngle)
            };
        }

        const t = wallDistance / cosDiff;
        return {
            x: t * Math.cos(radialAngle),
            z: t * Math.sin(radialAngle)
        };
    }

    estimateDepthEnvelope({
        profile,
        bounds,
        baseY,
        wallHeight,
        angleSamples,
        startAngle,
        endAngle,
        wallNormal,
        outerWallDistance,
        startCutNormal,
        endCutNormal,
        startCutDist,
        endCutDist,
        startStockCutDist = startCutDist,
        endStockCutDist = endCutDist,
        seamStockBand = 0,
        seamStockPolygons = [],
        restoreSideCutStock = false,
        lateralHalfWidth,
        natchParams,
        natchesEnabled,
        wallIndex,
        seamBand,
        shellThickness,
        samplingOptions,
        spareConfig
    }) {
        const samplesH = 10;
        const samplesA = 18;
        let maxDepth = 0;

        for (let ih = 0; ih <= samplesH; ih++) {
            const y = baseY + (ih / samplesH) * wallHeight;

            for (let ia = 0; ia <= samplesA; ia++) {
                const angleT = ia / samplesA;
                const angle = startAngle + angleT * (endAngle - startAngle);

                const innerRadius = this.computeInnerRadius({
                    y,
                    angle,
                    profile,
                    bounds,
                    wallHeight,
                    baseY,
                    angleSamples,
                    samplingOptions,
                    spareConfig
                });

                const outerRadius = this.computeOuterRadius({
                    y,
                    angle,
                    angleT,
                    wallNormal,
                    outerWallDistance,
                    startCutNormal,
                    endCutNormal,
                    startCutDist,
                    endCutDist,
                    lateralHalfWidth,
                    natchParams,
                    natchesEnabled,
                    wallIndex,
                    seamBand,
                    shellThickness,
                    startAngle,
                    endAngle
                });

                const depth = outerRadius - innerRadius;
                if (depth > maxDepth) {
                    maxDepth = depth;
                }
            }
        }

        return Math.max(shellThickness * 3, maxDepth);
    }

    computeInnerRadius({
        y,
        angle,
        profile,
        bounds,
        wallHeight,
        baseY,
        angleSamples,
        samplingOptions = {},
        spareConfig = {}
    }) {
        const vesselWallHeight = Math.max(EPSILON, bounds.max.y - bounds.min.y);
        const spareHeight = Math.max(0, wallHeight - vesselWallHeight - this.baseMoldHeight);

        const profileHFloat = clamp(
            (Math.min(y, bounds.max.y) - bounds.min.y) / vesselWallHeight,
            0,
            1
        ) * (profile.heights.length - 1);

        let vesselRadius = this.sampleProfileRadius(
            profile,
            angleSamples,
            profileHFloat,
            angle,
            samplingOptions
        );

        // Tier 1 analytic pattern relief: the profile passed in is the smooth
        // carrier; the exact pattern function is evaluated here at cavity
        // tessellation (set by MoldGenerator before compiling; null otherwise).
        if (this.analyticRelief) {
            vesselRadius += this.analyticRelief.evaluate(angle, Math.min(y, bounds.max.y));
        }

        if (y <= bounds.max.y || spareHeight <= EPSILON) {
            return vesselRadius + this.vesselClearance;
        }

        const topProfileH = profile.heights.length - 1;
        const topVesselRadius = this.sampleProfileRadius(
            profile,
            angleSamples,
            topProfileH,
            angle,
            samplingOptions
        );
        const topInnerRadius = topVesselRadius + this.vesselClearance;

        const rimRadius = this.sampleSpareRimRadius(
            profile,
            angleSamples,
            angle,
            4,
            samplingOptions
        );
        const spareInnerRadius = rimRadius + this.vesselClearance + 15;

        // Force a shelf-like spare transition: very short rise to expanded spare radius
        // and then a vertical spare wall.
        const configuredShelfRise = Math.max(EPSILON, spareConfig.spareShelfRise ?? 0.04);
        const shelfRise = Math.min(spareHeight, configuredShelfRise);
        const spareStartY = bounds.max.y + shelfRise;

        if (y <= spareStartY) {
            const t = clamp((y - bounds.max.y) / Math.max(shelfRise, EPSILON), 0, 1);
            return lerp(topInnerRadius, spareInnerRadius, t);
        }

        return spareInnerRadius;
    }

    computeOuterRadius({
        y,
        angle,
        angleT,
        wallNormal,
        outerWallDistance,
        startCutNormal,
        endCutNormal,
        startCutDist,
        endCutDist,
        startStockCutDist = startCutDist,
        endStockCutDist = endCutDist,
        seamStockBand = 0,
        seamStockPolygons = [],
        restoreSideCutStock = false,
        lateralHalfWidth,
        natchParams,
        natchesEnabled,
        wallIndex,
        seamBand,
        shellThickness,
        startAngle,
        endAngle,
        closedLoop = false
    }) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        const natchOffset = this.computeNatchOffset({
            angleT,
            y,
            keyBaseY: this._keyBaseY,
            keyHeight: this._keyHeight,
            wallIndex,
            natchParams,
            enabled: natchesEnabled,
            outerWallDistance,
            seamBand
        });

        const adjustedOuterWallDistance = Math.max(shellThickness + 1, outerWallDistance + natchOffset);

        if (closedLoop) {
            return adjustedOuterWallDistance;
        }

        const wallDot = cos * wallNormal.x + sin * wallNormal.z;
        const tangent = { x: -wallNormal.z, z: wallNormal.x };
        const tangentDot = cos * tangent.x + sin * tangent.z;
        const startDot = cos * startCutNormal.x + sin * startCutNormal.z;
        const endDot = cos * endCutNormal.x + sin * endCutNormal.z;
        const halfSpan = Math.abs(endAngle - startAngle) * 0.5;
        // Compact wall blocks: the lateral candidates become real clip planes at
        // +/- lateralHalfWidth from the bisector (vertical, exactly perpendicular to
        // the flat outer face — required for polymer case-mold release). Legacy
        // behavior places them exactly through the wedge corners so they never win.
        const sideExtent = Number.isFinite(lateralHalfWidth)
            ? Math.max(shellThickness * 2 + 1, lateralHalfWidth + natchOffset)
            : (halfSpan < (Math.PI * 0.5 - 0.001)
                ? adjustedOuterWallDistance * Math.tan(halfSpan)
                : adjustedOuterWallDistance);
        const startStockInfluence = seamStockBand > EPSILON && angleT <= seamStockBand
            ? clamp(1 - (angleT / seamStockBand), 0, 1)
            : 0;
        const endStockInfluence = seamStockBand > EPSILON && (1 - angleT) <= seamStockBand
            ? clamp(1 - ((1 - angleT) / seamStockBand), 0, 1)
            : 0;
        const natchStartCutOffset = angleT <= 0.5 ? natchOffset : 0;
        const natchEndCutOffset = angleT > 0.5 ? natchOffset : 0;
        const effectiveStartCutDist = Math.max(
            shellThickness + 1,
            lerp(startCutDist, startStockCutDist, startStockInfluence) + natchStartCutOffset
        );
        const effectiveEndCutDist = Math.max(
            shellThickness + 1,
            lerp(endCutDist, endStockCutDist, endStockInfluence) + natchEndCutOffset
        );

        const candidates = [];

        if (wallDot > EPSILON) {
            candidates.push(adjustedOuterWallDistance / wallDot);
        }
        if (tangentDot > EPSILON) {
            candidates.push(sideExtent / tangentDot);
        }
        if (tangentDot < -EPSILON) {
            candidates.push(-sideExtent / tangentDot);
        }
        // Legacy corner cut planes (cornerCutWidth mechanism). Compact blocks
        // replace them with the lateral planes above — for 2-wall molds they sit at
        // exactly outerWallDistance and would otherwise clip the plaster-guaranteed
        // width back down; with saved cornerCutWidth > 0 they would cut into the
        // block. Skip them whenever a lateral half-width is active.
        const useLegacyCornerCuts = !restoreSideCutStock && !Number.isFinite(lateralHalfWidth);
        if (useLegacyCornerCuts && startDot > EPSILON) {
            candidates.push(effectiveStartCutDist / startDot);
        }
        if (useLegacyCornerCuts && endDot > EPSILON) {
            candidates.push(effectiveEndCutDist / endDot);
        }

        let outerRadius = Infinity;
        for (let i = 0; i < candidates.length; i++) {
            const value = candidates[i];
            if (Number.isFinite(value) && value > EPSILON && value < outerRadius) {
                outerRadius = value;
            }
        }

        if (Number.isFinite(outerRadius)) {
            let envelopeRadius = outerRadius;
            const direction = { x: cos, z: sin };

            for (const polygon of seamStockPolygons) {
                const stockRadius = rayPolygonMaxT(direction, polygon);
                if (
                    stockRadius !== null
                    && Number.isFinite(stockRadius)
                    && stockRadius > envelopeRadius
                ) {
                    envelopeRadius = stockRadius;
                }
            }

            return envelopeRadius;
        }

        return adjustedOuterWallDistance;
    }

    buildWallYCoords({ baseY, wallHeight, baseSteps, rimY, shellBand }) {
        const topY = baseY + wallHeight;
        const coords = [];
        const addCoord = (value) => {
            if (!Number.isFinite(value) || value < baseY - EPSILON || value > topY + EPSILON) {
                return;
            }
            coords.push(clamp(value, baseY, topY));
        };

        for (let h = 0; h <= baseSteps; h++) {
            addCoord(baseY + (h / baseSteps) * wallHeight);
        }

        // Make the rim shelf an explicit voxel feature. Without these planes,
        // the rim falls between uniform rows and the shelf becomes a sloped
        // interpolation that slicers can treat as a floating/internal island.
        addCoord(rimY - shellBand);
        addCoord(rimY);
        addCoord(rimY + shellBand);

        coords.sort((a, b) => a - b);

        const unique = [];
        for (const coord of coords) {
            if (unique.length === 0 || Math.abs(coord - unique[unique.length - 1]) > EPSILON) {
                unique.push(coord);
            }
        }

        return new Float32Array(unique);
    }

    computeShelfRadiusRange({
        profile,
        angleSamples,
        angle,
        samplingOptions,
        shellBand
    }) {
        const topProfileH = Math.max(0, (profile?.heights?.length || 1) - 1);
        const vesselInnerRadius = this.sampleProfileRadius(
            profile,
            angleSamples,
            topProfileH,
            angle,
            samplingOptions
        ) + this.vesselClearance;

        const spareInnerRadius = this.sampleSpareRimRadius(
            profile,
            angleSamples,
            angle,
            4,
            samplingOptions
        ) + this.vesselClearance + 15;

        return {
            min: Math.min(vesselInnerRadius, spareInnerRadius) - shellBand * 0.35,
            max: Math.max(vesselInnerRadius, spareInnerRadius) + shellBand * 0.35
        };
    }

    buildConnectedWallRows({
        baseY,
        wallHeight,
        bounds,
        baseSteps,
        profileHeights = null
    }) {
        const topY = baseY + wallHeight;
        const rimY = bounds.max.y;
        const vesselSpan = Math.max(EPSILON, rimY - baseY);
        const spareSpan = Math.max(0, topY - rimY);
        const spareSteps = Math.max(2, Math.round(baseSteps * (spareSpan / Math.max(wallHeight, EPSILON))));
        const rows = [];

        const alignedHeights = Array.isArray(profileHeights) && profileHeights.length >= 2
            ? profileHeights
            : null;

        if (alignedHeights) {
            // Rows locked 1:1 to the sampled profile rows: every cavity vertex
            // reads an exact profile sample (vertical interpolation weight 0),
            // so the mold mirrors the vessel's surface relief at the full
            // sampling fidelity instead of a resampled approximation.
            const extensionSpan = Math.max(0, alignedHeights[0] - baseY);
            if (extensionSpan > EPSILON) {
                // Below the vessel the cavity is a vertical wall (profile row 0
                // clamped) — a coarse uniform ladder is enough.
                const extensionSteps = Math.max(2, Math.round(baseSteps * (extensionSpan / Math.max(wallHeight, EPSILON))));
                for (let h = 0; h < extensionSteps; h++) {
                    rows.push({
                        y: baseY + (h / extensionSteps) * extensionSpan,
                        mode: 'vessel'
                    });
                }
            }
            for (const y of alignedHeights) {
                if (y >= baseY - EPSILON && y <= rimY + EPSILON) {
                    rows.push({ y: clamp(y, baseY, rimY), mode: 'vessel' });
                }
            }
        } else {
            const vesselSteps = Math.max(12, Math.round(baseSteps * (vesselSpan / Math.max(wallHeight, EPSILON))));
            for (let h = 0; h <= vesselSteps; h++) {
                rows.push({
                    y: baseY + (h / vesselSteps) * vesselSpan,
                    mode: 'vessel'
                });
            }
        }

        if (spareSpan > EPSILON) {
            // Give the rim shelf a small but real height. A zero-height duplicate
            // row creates collapsed seam-cap quads; Bambu and our validator then
            // see a few isolated rim edges even though the visual surface looks
            // continuous. One layer of rise keeps the shelf explicit and stable.
            const shelfRise = Math.min(spareSpan, 0.2);
            const spareStartY = rimY + shelfRise;
            rows.push({ y: spareStartY, mode: 'spare' });

            for (let h = 1; h <= spareSteps; h++) {
                rows.push({
                    y: spareStartY + (h / spareSteps) * Math.max(0, topY - spareStartY),
                    mode: 'spare'
                });
            }
        }

        return rows;
    }

    computeConnectedInnerRadius({
        row,
        angle,
        profile,
        bounds,
        angleSamples,
        samplingOptions = {}
    }) {
        if (row.mode === 'spare') {
            return this.sampleSpareRimRadius(
                profile,
                angleSamples,
                angle,
                4,
                samplingOptions
            ) + this.vesselClearance + 15;
        }

        const vesselWallHeight = Math.max(EPSILON, bounds.max.y - bounds.min.y);
        const profileHFloat = clamp(
            (Math.min(row.y, bounds.max.y) - bounds.min.y) / vesselWallHeight,
            0,
            1
        ) * (profile.heights.length - 1);

        let vesselRadius = this.sampleProfileRadius(
            profile,
            angleSamples,
            profileHFloat,
            angle,
            samplingOptions
        );

        // Tier 1 analytic pattern relief (see computeInnerRadius)
        if (this.analyticRelief) {
            vesselRadius += this.analyticRelief.evaluate(angle, Math.min(row.y, bounds.max.y));
        }

        return vesselRadius + this.vesselClearance;
    }

    /**
     * Pattern-free cavity radius per mesh row at one seam angle.
     *
     * The seam registration faces (and the key bumps/sockets on them) must be
     * smooth: interpolating their column grid from the raw cavity edge would
     * make the whole face — and the keys — inherit the vessel's decorative
     * relief. Interior face columns therefore anchor to this low-passed curve
     * instead (column 0 stays on the true cavity edge so the mesh remains
     * closed; see getRegistrationFaceVertex).
     *
     * Tier 1 (analytic relief active): the profile is already the smooth
     * carrier, so sampling it without the relief hook is exact. Measured
     * profiles carry the pattern in the samples; a windowed-max envelope
     * (rides the crest line, so the face interior never dips inside the
     * cavity edge) followed by box smoothing strips it.
     *
     * Returns radii including vesselClearance, indexed by mesh row.
     */
    buildSeamAnchorRadii({ rows, profile, bounds, angleSamples, angle, samplingOptions }) {
        const rowCount = profile?.heights?.length || 0;
        const result = new Float64Array(rows.length);

        const fallback = (h) => this.computeConnectedInnerRadius({
            row: rows[h],
            angle,
            profile,
            bounds,
            angleSamples,
            samplingOptions
        });

        if (rowCount < 2) {
            for (let h = 0; h < rows.length; h++) result[h] = fallback(h);
            return result;
        }

        // Per-profile-row radius at the seam angle (uniform y grid), without
        // the analytic relief hook — for Tier 1 this IS the smooth carrier.
        const raw = new Float64Array(rowCount);
        for (let h = 0; h < rowCount; h++) {
            raw[h] = this.sampleProfileRadius(profile, angleSamples, h, angle, samplingOptions);
        }

        let smooth = raw;
        if (!this.analyticRelief) {
            const spanY = Math.max(EPSILON, bounds.max.y - bounds.min.y);
            const rowSpacing = spanY / (rowCount - 1);
            const windowMm = clamp((this.patternVerticalPeriod || 0) * 1.6, 4, 12);
            const half = Math.max(1, Math.round(windowMm / rowSpacing / 2));

            const envelope = new Float64Array(rowCount);
            for (let h = 0; h < rowCount; h++) {
                let maxValue = -Infinity;
                for (let d = -half; d <= half; d++) {
                    const j = clamp(h + d, 0, rowCount - 1);
                    if (raw[j] > maxValue) maxValue = raw[j];
                }
                envelope[h] = maxValue;
            }

            // Two box passes remove the envelope's plateau kinks.
            smooth = envelope;
            for (let pass = 0; pass < 2; pass++) {
                const next = new Float64Array(rowCount);
                for (let h = 0; h < rowCount; h++) {
                    let sum = 0;
                    let count = 0;
                    for (let d = -half; d <= half; d++) {
                        const j = h + d;
                        if (j < 0 || j >= rowCount) continue;
                        sum += smooth[j];
                        count++;
                    }
                    next[h] = sum / count;
                }
                smooth = next;
            }
        }

        const minY = bounds.min.y;
        const spanY = Math.max(EPSILON, bounds.max.y - bounds.min.y);
        for (let h = 0; h < rows.length; h++) {
            const row = rows[h];
            if (row.mode === 'spare') {
                // Spare/slip-well ring is pattern-free already.
                result[h] = fallback(h);
                continue;
            }
            const t = clamp((Math.min(row.y, bounds.max.y) - minY) / spanY, 0, 1) * (rowCount - 1);
            const h0 = Math.floor(t);
            const h1 = Math.min(rowCount - 1, h0 + 1);
            result[h] = lerp(smooth[h0], smooth[h1], t - h0) + this.vesselClearance;
        }

        return result;
    }

    /**
     * Derive the compact-block lateral half-width for one wall segment.
     *
     * Single W per wall, constant over the full part height (a height-varying W
     * would slope the side faces into an undercut). W is the maximum lateral
     * extent of the inner mold envelope (vessel cavity + clearance and the
     * spare/slip-well shelf ring) plus the plaster wall offset, so the minimum
     * plaster thickness is guaranteed at the lateral faces.
     */
    estimateLateralHalfWidth({
        profile,
        bounds,
        rows,
        angleSamples,
        samplingOptions,
        startAngle,
        endAngle,
        wallNormalAngle,
        outerWallDistance,
        moldWallOffset,
        shellThickness,
        natchParams,
        faceRegistrationEnabled = false
    }) {
        const halfSpan = Math.abs(endAngle - startAngle) * 0.5;
        const angleSteps = 32;
        const aliasMargin = 0.5;

        let maxLateralExtent = 0;
        let maxSeamInnerRadius = 0;

        for (let h = 0; h < rows.length; h++) {
            const row = rows[h];
            // Decimate for speed, but never skip spare rows (the slip-well shelf is
            // the widest ring) or the first/last rows.
            const mustSample = row.mode === 'spare' || h === 0 || h === rows.length - 1;
            if (!mustSample && h % 4 !== 0) continue;

            for (let a = 0; a <= angleSteps; a++) {
                const angle = startAngle + (a / angleSteps) * (endAngle - startAngle);
                const inner = this.computeConnectedInnerRadius({
                    row,
                    angle,
                    profile,
                    bounds,
                    angleSamples,
                    samplingOptions
                });

                const lateralExtent = inner * Math.abs(Math.sin(angle - wallNormalAngle));
                if (lateralExtent > maxLateralExtent) {
                    maxLateralExtent = lateralExtent;
                }
                if ((a === 0 || a === angleSteps) && inner > maxSeamInnerRadius) {
                    maxSeamInnerRadius = inner;
                }
            }
        }

        let halfWidth = Math.max(
            maxLateralExtent + aliasMargin + moldWallOffset,
            shellThickness * 2 + 1
        );

        // Registration faces (wall counts >= 2) need enough radial span for full-size keys.
        if (faceRegistrationEnabled && natchParams) {
            const featureDiameter = Math.max(1, natchParams.diameter || 10)
                + 2 * Math.max(0, natchParams.toleranceOffset || 0);
            const featureMargin = 2 * Math.max(shellThickness * 0.75, 1);
            const natchFloor = Math.sin(halfSpan)
                * (maxSeamInnerRadius + featureDiameter + featureMargin);
            halfWidth = Math.max(halfWidth, natchFloor);
        }

        // Defensive ceiling: never extend past the legacy wedge corners. If this
        // binds, the side faces are no longer full-height vertical planes and the
        // lay-flat polymer case-mold workflow is not guaranteed — warn loudly.
        if (halfSpan < Math.PI * 0.5 - 0.001) {
            const cornerWidth = outerWallDistance * Math.tan(halfSpan);
            if (halfWidth > cornerWidth) {
                console.warn(
                    `[castform] Compact wall block half-width ${halfWidth.toFixed(2)}mm exceeds the wedge corner `
                    + `width ${cornerWidth.toFixed(2)}mm; clamping to the wedge envelope. Side faces will NOT be `
                    + `vertical 90° planes — polymer case-mold extraction is not guaranteed for this wall.`
                );
                halfWidth = cornerWidth;
            }
        }

        return halfWidth;
    }

    pushConnectedWallFace(indices, positions, i0, i1, i2, i3, cellCenter) {
        pushOrientedTriangle(indices, positions, i0, i1, i2, cellCenter);
        pushOrientedTriangle(indices, positions, i0, i2, i3, cellCenter);
    }

    averageVertexPosition(positions, vertexIndices) {
        const center = [0, 0, 0];
        for (const vertexIndex of vertexIndices) {
            const vertex = readPos(positions, vertexIndex);
            center[0] += vertex[0];
            center[1] += vertex[1];
            center[2] += vertex[2];
        }

        const scale = 1 / Math.max(1, vertexIndices.length);
        center[0] *= scale;
        center[1] *= scale;
        center[2] *= scale;
        return center;
    }

    /**
     * Sampling parameters shared by compileConnectedWallSegment and the
     * standalone half-width estimator — extracted so a hoisted mold-global
     * estimate can never drift from what the compile itself would derive.
     */
    resolveConnectedSampling({ quality = 'preview', experimental = {}, heightSamples, angleSamples, wallCount = 1 }) {
        const qualityPreset = this.getQualityPreset(quality);
        const heightScale = quality === 'export'
            ? (experimental.heightSampleScaleExport ?? experimental.heightSampleScale ?? qualityPreset.heightSampleScale)
            : (experimental.heightSampleScalePreview ?? experimental.heightSampleScale ?? qualityPreset.heightSampleScale);
        const angleScale = quality === 'export'
            ? (experimental.angleSampleScaleExport ?? experimental.angleSampleScale ?? qualityPreset.angleSampleScale)
            : (experimental.angleSampleScalePreview ?? experimental.angleSampleScale ?? qualityPreset.angleSampleScale);
        const featureSnapThreshold = quality === 'export'
            ? (experimental.featureSnapThresholdExport ?? experimental.featureSnapThreshold ?? qualityPreset.featureSnapThreshold)
            : (experimental.featureSnapThresholdPreview ?? experimental.featureSnapThreshold ?? qualityPreset.featureSnapThreshold);

        // Column alignment: when the profile's angular grid divides evenly by
        // the wall count (MoldGenerator rounds it so for non-analytic tiers),
        // one segment's columns land exactly on profile columns and angular
        // relief transfers without interpolation loss. Integer oversampling
        // preserves the alignment — extra columns subdivide the exact
        // polyline — while keeping a sane mesh floor for coarse grids.
        const segmentColumns = Number.isFinite(angleSamples) && wallCount >= 1
            ? angleSamples / wallCount
            : NaN;
        let aSteps;
        if (Number.isInteger(segmentColumns) && segmentColumns >= 8) {
            const oversample = Math.max(1, Math.ceil(64 / segmentColumns));
            aSteps = Math.min(1024, segmentColumns * oversample);
        } else {
            aSteps = Math.max(64, Math.min(1024, Math.round((angleSamples || 120) * angleScale)));
        }

        return {
            baseHSteps: Math.max(24, Math.min(300, Math.round((heightSamples || 120) * heightScale))),
            aSteps,
            featureSnapThreshold
        };
    }

    /**
     * Standalone per-segment lateral half-width estimate, mirroring exactly what
     * compileConnectedWallSegment would derive for the same segment. Used by
     * moldGenerator to hoist one mold-global half-width (max over segments) for
     * keyed multi-wall molds, so mating seam faces get identical radial spans
     * and male/female key centers coincide.
     * Returns undefined when compact blocks are off or the segment is a closed loop.
     */
    estimateConnectedWallLateralHalfWidth({
        profile,
        bounds,
        baseY,
        wallHeight,
        moldWallOffset,
        maxVesselRadius,
        startAngle,
        endAngle,
        natchParams,
        shellThickness,
        wallCount = 2,
        angleSamples,
        heightSamples,
        quality = 'preview',
        natchesEnabled = false,
        experimental = {}
    }) {
        const angularSpan = Math.abs(endAngle - startAngle);
        const isClosedLoop = wallCount === 1 || angularSpan >= Math.PI * 2 - 0.001;
        if (isClosedLoop || experimental.compactWallBlocks === false) {
            return undefined;
        }

        const { baseHSteps, featureSnapThreshold } = this.resolveConnectedSampling({
            quality,
            experimental,
            heightSamples,
            angleSamples,
            wallCount
        });
        const faceRegistrationEnabled =
            natchesEnabled
            && wallCount >= 2
            && natchParams?.enabled !== false;
        const rowsAlignedToProfile = Array.isArray(profile?.heights) && profile.heights.length >= 2;
        let rows = this.buildConnectedWallRows({
            baseY,
            wallHeight,
            bounds,
            baseSteps: baseHSteps,
            profileHeights: profile?.heights
        });
        rows = this.addRegistrationKeyRows(rows, bounds, natchParams, faceRegistrationEnabled);

        return this.estimateLateralHalfWidth({
            profile,
            bounds,
            rows,
            angleSamples,
            samplingOptions: {
                // With profile-aligned rows the feature snap is unnecessary
                // (interpolation weight is 0 at every profile row) and would
                // distort the inserted key rows — disable it.
                heightFeatureScores: rowsAlignedToProfile ? null : this.buildHeightFeatureScores(profile),
                featureSnapThreshold: rowsAlignedToProfile ? Infinity : featureSnapThreshold
            },
            startAngle,
            endAngle,
            wallNormalAngle: (startAngle + endAngle) * 0.5,
            outerWallDistance: maxVesselRadius + moldWallOffset,
            moldWallOffset,
            shellThickness,
            natchParams,
            faceRegistrationEnabled
        });
    }

    compileConnectedWallSegment({
        profile,
        bounds,
        baseY,
        wallHeight,
        moldWallOffset,
        maxVesselRadius,
        startAngle,
        endAngle,
        wallIndex,
        natchParams,
        shellThickness,
        cornerCutWidth,
        wallCount = 2,
        angleSamples,
        heightSamples,
        quality = 'preview',
        natchesEnabled = false,
        experimental = {},
        lateralHalfWidthOverride
    }) {
        const { baseHSteps, aSteps, featureSnapThreshold } = this.resolveConnectedSampling({
            quality,
            experimental,
            heightSamples,
            angleSamples,
            wallCount
        });
        const angularSpan = Math.abs(endAngle - startAngle);
        const isClosedLoop = wallCount === 1 || angularSpan >= Math.PI * 2 - 0.001;
        const faceRegistrationEnabled =
            natchesEnabled
            && wallCount >= 2
            && !isClosedLoop
            && natchParams?.enabled !== false;
        // Registration role per seam face. N>=3 uses per-face roles (END face =
        // male, START face = female): per-wall male/female is a 2-coloring of the
        // seam cycle, impossible on odd cycles (3 walls). Per-face pairs exactly
        // one male + one female at every seam for any N and makes all walls
        // congruent under rotation. wallCount===2 keeps the legacy per-wall
        // mapping (wall0 male on both faces, wall1 female) so the two-part gate
        // baseline stays byte-identical.
        const resolveRegistrationRole = (isStartSide) => wallCount === 2
            ? (wallIndex === 0 ? 'male' : 'female')
            : (isStartSide ? 'female' : 'male');
        // Compact block walls: clip each segment to two vertical planes parallel to
        // its bisector so the part is a lay-flat prism (outer face down, side faces
        // exactly vertical at 90°) — required for polymer case-mold casting.
        const useCompactBlocks =
            experimental.compactWallBlocks !== false
            && !isClosedLoop;
        const angleColumnCount = isClosedLoop ? aSteps : aSteps + 1;
        const rowsAlignedToProfile = Array.isArray(profile?.heights) && profile.heights.length >= 2;
        let rows = this.buildConnectedWallRows({
            baseY,
            wallHeight,
            bounds,
            baseSteps: baseHSteps,
            profileHeights: profile?.heights
        });
        rows = this.addRegistrationKeyRows(rows, bounds, natchParams, faceRegistrationEnabled);
        const wallNormalAngle = (startAngle + endAngle) * 0.5;
        const wallNormal = { x: Math.cos(wallNormalAngle), z: Math.sin(wallNormalAngle) };
        const outerWallDistance = maxVesselRadius + moldWallOffset;

        const sideCutPlanes = computeWallSideCutPlanes({
            wallIndex,
            wallCount,
            startAngle,
            endAngle,
            outerWallDistance,
            cornerCutWidth
        });
        const startCutDist = sideCutPlanes.start.distance;
        const endCutDist = sideCutPlanes.end.distance;
        const startCutNormal = sideCutPlanes.start.normal;
        const endCutNormal = sideCutPlanes.end.normal;
        // Legacy corner-restore stock; superseded by (and incompatible with) compact
        // blocks, which ignore cornerCutWidth entirely.
        const useAdditiveSeamStock =
            !useCompactBlocks
            && !isClosedLoop
            && cornerCutWidth > EPSILON
            && experimental.additiveSeamStock !== false;
        const seamStockBand = 0;
        const startStockCutDist = startCutDist;
        const endStockCutDist = endCutDist;

        const natchDiameter = Math.max(1, natchParams?.diameter || 10);
        const natchTolerance = Math.max(0, natchParams?.toleranceOffset || 0);
        const seamBand = clamp(
            (3 * (natchDiameter + 2 * natchTolerance)) / (2 * Math.PI * Math.max(outerWallDistance, 1)),
            0.04,
            0.12
        );

        const samplingOptions = {
            // With profile-aligned rows the feature snap is unnecessary (every
            // vessel-band row samples a profile row exactly) and would distort
            // the inserted registration-key rows — disable it.
            heightFeatureScores: rowsAlignedToProfile ? null : this.buildHeightFeatureScores(profile),
            featureSnapThreshold: rowsAlignedToProfile ? Infinity : featureSnapThreshold
        };

        this._keyBaseY = bounds.min.y;
        this._keyHeight = bounds.max.y - bounds.min.y;

        // Smooth per-row anchors for the seam registration faces. Both walls
        // sharing a seam compute the same curve (same profile, same angle), so
        // the mating male/female grids still coincide exactly.
        const seamAnchorRadii = faceRegistrationEnabled
            ? {
                start: this.buildSeamAnchorRadii({
                    rows, profile, bounds, angleSamples, angle: startAngle, samplingOptions
                }),
                end: this.buildSeamAnchorRadii({
                    rows, profile, bounds, angleSamples, angle: endAngle, samplingOptions
                })
            }
            : null;

        const lateralHalfWidth = useCompactBlocks
            ? (Number.isFinite(lateralHalfWidthOverride)
                // Mold-global W for keyed multi-wall molds: mating faces need
                // identical radial spans so key centers coincide. Callers derive
                // the override as max over per-wall estimates, each already
                // clamped to the wedge-corner ceiling (same D and halfSpan for
                // every wall of one mold) — no re-clamp needed here.
                ? lateralHalfWidthOverride
                : this.estimateLateralHalfWidth({
                    profile,
                    bounds,
                    rows,
                    angleSamples,
                    samplingOptions,
                    startAngle,
                    endAngle,
                    wallNormalAngle,
                    outerWallDistance,
                    moldWallOffset,
                    shellThickness,
                    natchParams,
                    faceRegistrationEnabled
                }))
            : undefined;
        let lateralClampCount = 0;
        let lateralClampMaxDeficit = 0;

        const angleTs = new Float64Array(angleColumnCount);
        for (let a = 0; a < angleColumnCount; a++) {
            angleTs[a] = a / aSteps;
        }
        if (Number.isFinite(lateralHalfWidth)) {
            // Snap one angle column onto each flat<->lateral corner angle so the 90°
            // edges of the compact block are crisp vertical lines instead of being
            // chamfered by the angular sampling grid. Seam-edge columns already
            // sample the exact segment endpoints.
            const cornerOffset = Math.atan2(lateralHalfWidth, outerWallDistance);
            if (cornerOffset < angularSpan * 0.5 - EPSILON) {
                const offsetT = cornerOffset / angularSpan;
                let previousIndex = 0;
                for (const cornerT of [0.5 - offsetT, 0.5 + offsetT]) {
                    const index = clamp(Math.round(cornerT * aSteps), previousIndex + 1, aSteps - 1);
                    angleTs[index] = cornerT;
                    previousIndex = index;
                }
            }
        }

        const positions = [];
        const innerIndices = [];
        const outerIndices = [];
        const startWing = [];
        const endWing = [];
        const addVertex = (x, y, z) => {
            const index = positions.length / 3;
            positions.push(x, y, z);
            return index;
        };
        const tangent = { x: -wallNormal.z, z: wallNormal.x };
        const halfSpan = Math.abs(endAngle - startAngle) * 0.5;
        const seamSlope = Math.tan(Math.min(halfSpan, Math.PI * 0.5 - 0.001));
        const wingBaseUFloor = Math.max(maxVesselRadius + shellThickness, shellThickness * 2);
        const projectLocal = (x, z) => ({
            u: x * wallNormal.x + z * wallNormal.z,
            v: x * tangent.x + z * tangent.z
        });
        const localPoint = (u, v, y) => ({
            x: wallNormal.x * u + tangent.x * v,
            y,
            z: wallNormal.z * u + tangent.z * v
        });
        // Wing geometry assumes the legacy corner extent (its side base V would
        // invert once the lateral planes clip inside it) — compact blocks supersede it.
        const usePerpendicularSideWalls =
            !useCompactBlocks
            && experimental.perpendicularSideWalls === true;
        const buildWingRow = ({ row, innerIndex, outerIndex, sign }) => {
            if (isClosedLoop || !usePerpendicularSideWalls) {
                return {
                    seamBaseIndex: outerIndex,
                    sideBaseIndex: null,
                    hasWing: false
                };
            }

            const inner = readPos(positions, innerIndex);
            const outer = readPos(positions, outerIndex);
            const innerLocal = projectLocal(inner[0], inner[2]);
            const outerLocal = projectLocal(outer[0], outer[2]);
            const maxBaseU = outerLocal.u - Math.max(shellThickness * 0.35, 0.25);
            const baseU = clamp(
                Math.max(wingBaseUFloor, innerLocal.u + shellThickness * 1.5),
                innerLocal.u,
                maxBaseU
            );
            const seamBaseV = sign * baseU * seamSlope;
            const sideBaseV = outerLocal.v;
            const hasWing =
                Number.isFinite(baseU)
                && baseU > innerLocal.u + EPSILON
                && Math.abs(sideBaseV - seamBaseV) > Math.max(shellThickness * 0.25, 0.25);

            if (!hasWing) {
                return {
                    seamBaseIndex: outerIndex,
                    sideBaseIndex: null,
                    hasWing: false
                };
            }

            const seamBase = localPoint(baseU, seamBaseV, row.y);
            const sideBase = localPoint(baseU, sideBaseV, row.y);

            return {
                seamBaseIndex: addVertex(seamBase.x, seamBase.y, seamBase.z),
                sideBaseIndex: addVertex(sideBase.x, sideBase.y, sideBase.z),
                hasWing: true
            };
        };

        for (let h = 0; h < rows.length; h++) {
            const row = rows[h];
            innerIndices[h] = [];
            outerIndices[h] = [];

            for (let a = 0; a < angleColumnCount; a++) {
                const angleT = angleTs[a];
                const angle = startAngle + angleT * (endAngle - startAngle);
                const cos = Math.cos(angle);
                const sin = Math.sin(angle);

                const inner = this.computeConnectedInnerRadius({
                    row,
                    angle,
                    profile,
                    bounds,
                    angleSamples,
                    samplingOptions
                });

                const outer = this.computeOuterRadius({
                    y: row.y,
                    angle,
                    angleT,
                    wallNormal,
                    outerWallDistance,
                    startCutNormal,
                    endCutNormal,
                    startCutDist,
                    endCutDist,
                    startStockCutDist,
                    endStockCutDist,
                    seamStockBand,
                    restoreSideCutStock: useAdditiveSeamStock,
                    lateralHalfWidth,
                    natchParams,
                    natchesEnabled: natchesEnabled && !faceRegistrationEnabled,
                    wallIndex,
                    seamBand,
                    shellThickness,
                    startAngle,
                    endAngle,
                    closedLoop: isClosedLoop
                });
                const minDepth = Math.max(shellThickness * 2 + 0.7, shellThickness + 1.1);
                const safeOuter = Math.max(inner + minDepth, outer);

                if (Number.isFinite(lateralHalfWidth) && safeOuter > outer + EPSILON) {
                    // The min-depth clamp should never win against a lateral plane —
                    // W already includes the full plaster offset. If it does, the
                    // side face bulges past the plane: derivation bug, warn below.
                    const tangentDot = Math.abs(Math.sin(angle - wallNormalAngle));
                    const lateralBound = tangentDot > EPSILON
                        ? lateralHalfWidth / tangentDot
                        : Infinity;
                    if (outer >= lateralBound - 1e-6) {
                        lateralClampCount += 1;
                        lateralClampMaxDeficit = Math.max(lateralClampMaxDeficit, safeOuter - outer);
                    }
                }

                innerIndices[h][a] = addVertex(inner * cos, row.y, inner * sin);
                outerIndices[h][a] = addVertex(safeOuter * cos, row.y, safeOuter * sin);
            }

            startWing[h] = buildWingRow({
                row,
                innerIndex: innerIndices[h][0],
                outerIndex: outerIndices[h][0],
                sign: -1
            });
            endWing[h] = buildWingRow({
                row,
                innerIndex: innerIndices[h][angleColumnCount - 1],
                outerIndex: outerIndices[h][angleColumnCount - 1],
                sign: 1
            });
        }

        if (lateralClampCount > 0) {
            console.warn(
                `[castform] Wall ${wallIndex}: min-depth clamp pushed ${lateralClampCount} vertices past the `
                + `lateral plane (max ${lateralClampMaxDeficit.toFixed(2)}mm). Compact block half-width derivation `
                + `is undersized for this vessel — side faces are not guaranteed planar.`
            );
        }

        const indexBuffer = [];
        const getNextAngleIndex = (a) => isClosedLoop ? (a + 1) % angleColumnCount : a + 1;
        const getCellCenter = (h, a) => {
            const nextA = getNextAngleIndex(a);
            return this.averageVertexPosition(positions, [
            innerIndices[h][a],
            innerIndices[h][nextA],
            innerIndices[h + 1][a],
            innerIndices[h + 1][nextA],
            outerIndices[h][a],
            outerIndices[h][nextA],
            outerIndices[h + 1][a],
            outerIndices[h + 1][nextA]
        ]);
        };

        for (let h = 0; h < rows.length - 1; h++) {
            for (let a = 0; a < aSteps; a++) {
                const nextA = getNextAngleIndex(a);
                const cellCenter = getCellCenter(h, a);

                // Vessel-facing surface and explicit rim shelf.
                this.pushConnectedWallFace(
                    indexBuffer,
                    positions,
                    innerIndices[h][a],
                    innerIndices[h + 1][a],
                    innerIndices[h + 1][nextA],
                    innerIndices[h][nextA],
                    cellCenter
                );

                // Flat/cut exterior surface.
                this.pushConnectedWallFace(
                    indexBuffer,
                    positions,
                    outerIndices[h][a],
                    outerIndices[h][nextA],
                    outerIndices[h + 1][nextA],
                    outerIndices[h + 1][a],
                    cellCenter
                );
            }
        }

        const bottomRow = 0;
        const topRow = rows.length - 1;
        const pushTriangle = (i0, i1, i2, cellCenter) => {
            pushOrientedTriangle(indexBuffer, positions, i0, i1, i2, cellCenter);
        };
        const pushRegistrationCapGrid = ({
            sideVertices,
            oppositeInner,
            oppositeOuter,
            sideOnStart,
            cellCenter
        }) => {
            for (let c = 0; c < sideVertices.length - 1; c++) {
                if (sideOnStart) {
                    pushTriangle(sideVertices[c], oppositeInner, sideVertices[c + 1], cellCenter);
                } else {
                    pushTriangle(sideVertices[c], sideVertices[c + 1], oppositeInner, cellCenter);
                }
            }

            if (sideOnStart) {
                pushTriangle(sideVertices[sideVertices.length - 1], oppositeInner, oppositeOuter, cellCenter);
            } else {
                pushTriangle(sideVertices[sideVertices.length - 1], oppositeOuter, oppositeInner, cellCenter);
            }
        };
        const pushBottomCapCell = (a) => {
            const nextA = getNextAngleIndex(a);
            const center = this.averageVertexPosition(positions, [
                innerIndices[bottomRow][a],
                innerIndices[bottomRow][nextA],
                outerIndices[bottomRow][nextA],
                outerIndices[bottomRow][a],
                innerIndices[Math.min(bottomRow + 1, topRow)][a],
                outerIndices[Math.min(bottomRow + 1, topRow)][a]
            ]);

            if (!isClosedLoop && faceRegistrationEnabled && a === 0) {
                const sideVertices = getRegistrationFaceVertices({
                    rowIndex: bottomRow,
                    innerIndex: innerIndices[bottomRow][a],
                    seamIndex: startWing[bottomRow].seamBaseIndex,
                    isStartSide: true,
                    sideKey: 'start'
                });

                pushRegistrationCapGrid({
                    sideVertices,
                    oppositeInner: innerIndices[bottomRow][nextA],
                    oppositeOuter: outerIndices[bottomRow][nextA],
                    sideOnStart: true,
                    cellCenter: center
                });
                return;
            }

            if (!isClosedLoop && faceRegistrationEnabled && nextA === angleColumnCount - 1) {
                const sideVertices = getRegistrationFaceVertices({
                    rowIndex: bottomRow,
                    innerIndex: innerIndices[bottomRow][nextA],
                    seamIndex: endWing[bottomRow].seamBaseIndex,
                    isStartSide: false,
                    sideKey: 'end'
                });

                pushRegistrationCapGrid({
                    sideVertices,
                    oppositeInner: innerIndices[bottomRow][a],
                    oppositeOuter: outerIndices[bottomRow][a],
                    sideOnStart: false,
                    cellCenter: center
                });
                return;
            }

            if (!isClosedLoop && a === 0 && startWing[bottomRow]?.hasWing) {
                this.pushConnectedWallFace(
                    indexBuffer,
                    positions,
                    innerIndices[bottomRow][a],
                    innerIndices[bottomRow][nextA],
                    outerIndices[bottomRow][nextA],
                    startWing[bottomRow].seamBaseIndex,
                    center
                );
                pushTriangle(
                    startWing[bottomRow].seamBaseIndex,
                    outerIndices[bottomRow][nextA],
                    outerIndices[bottomRow][a],
                    center
                );
                return;
            }

            if (!isClosedLoop && nextA === angleColumnCount - 1 && endWing[bottomRow]?.hasWing) {
                this.pushConnectedWallFace(
                    indexBuffer,
                    positions,
                    innerIndices[bottomRow][a],
                    innerIndices[bottomRow][nextA],
                    endWing[bottomRow].seamBaseIndex,
                    outerIndices[bottomRow][a],
                    center
                );
                pushTriangle(
                    endWing[bottomRow].seamBaseIndex,
                    outerIndices[bottomRow][nextA],
                    outerIndices[bottomRow][a],
                    center
                );
                return;
            }

            this.pushConnectedWallFace(
                indexBuffer,
                positions,
                innerIndices[bottomRow][a],
                innerIndices[bottomRow][nextA],
                outerIndices[bottomRow][nextA],
                outerIndices[bottomRow][a],
                center
            );
        };
        const pushTopCapCell = (a) => {
            const nextA = getNextAngleIndex(a);
            const center = this.averageVertexPosition(positions, [
                innerIndices[topRow][a],
                innerIndices[topRow][nextA],
                outerIndices[topRow][nextA],
                outerIndices[topRow][a],
                innerIndices[Math.max(topRow - 1, 0)][a],
                outerIndices[Math.max(topRow - 1, 0)][a]
            ]);

            if (!isClosedLoop && faceRegistrationEnabled && a === 0) {
                const sideVertices = getRegistrationFaceVertices({
                    rowIndex: topRow,
                    innerIndex: innerIndices[topRow][a],
                    seamIndex: startWing[topRow].seamBaseIndex,
                    isStartSide: true,
                    sideKey: 'start'
                });

                pushRegistrationCapGrid({
                    sideVertices,
                    oppositeInner: innerIndices[topRow][nextA],
                    oppositeOuter: outerIndices[topRow][nextA],
                    sideOnStart: true,
                    cellCenter: center
                });
                return;
            }

            if (!isClosedLoop && faceRegistrationEnabled && nextA === angleColumnCount - 1) {
                const sideVertices = getRegistrationFaceVertices({
                    rowIndex: topRow,
                    innerIndex: innerIndices[topRow][nextA],
                    seamIndex: endWing[topRow].seamBaseIndex,
                    isStartSide: false,
                    sideKey: 'end'
                });

                pushRegistrationCapGrid({
                    sideVertices,
                    oppositeInner: innerIndices[topRow][a],
                    oppositeOuter: outerIndices[topRow][a],
                    sideOnStart: false,
                    cellCenter: center
                });
                return;
            }

            if (!isClosedLoop && a === 0 && startWing[topRow]?.hasWing) {
                this.pushConnectedWallFace(
                    indexBuffer,
                    positions,
                    innerIndices[topRow][a],
                    startWing[topRow].seamBaseIndex,
                    outerIndices[topRow][nextA],
                    innerIndices[topRow][nextA],
                    center
                );
                pushTriangle(
                    startWing[topRow].seamBaseIndex,
                    outerIndices[topRow][a],
                    outerIndices[topRow][nextA],
                    center
                );
                return;
            }

            if (!isClosedLoop && nextA === angleColumnCount - 1 && endWing[topRow]?.hasWing) {
                this.pushConnectedWallFace(
                    indexBuffer,
                    positions,
                    innerIndices[topRow][a],
                    outerIndices[topRow][a],
                    endWing[topRow].seamBaseIndex,
                    innerIndices[topRow][nextA],
                    center
                );
                pushTriangle(
                    endWing[topRow].seamBaseIndex,
                    outerIndices[topRow][a],
                    outerIndices[topRow][nextA],
                    center
                );
                return;
            }

            this.pushConnectedWallFace(
                indexBuffer,
                positions,
                innerIndices[topRow][a],
                outerIndices[topRow][a],
                outerIndices[topRow][nextA],
                innerIndices[topRow][nextA],
                center
            );
        };

        const registrationFaceColumns = createRegistrationFaceColumns();
        const registrationFaceVertexCache = new Map();
        const getSideOutwardNormal = (isStartSide) => {
            const sideAngle = isStartSide ? startAngle : endAngle;
            return isStartSide
                ? { x: Math.sin(sideAngle), z: -Math.cos(sideAngle) }
                : { x: -Math.sin(sideAngle), z: Math.cos(sideAngle) };
        };
        const getRegistrationFaceVertex = ({
            rowIndex,
            innerIndex,
            seamIndex,
            columnIndex,
            isStartSide,
            sideKey
        }) => {
            if (columnIndex === 0) return innerIndex;
            if (columnIndex === registrationFaceColumns.length - 1) return seamIndex;

            const outwardNormal = getSideOutwardNormal(isStartSide);
            const cacheKey = `${sideKey}|${rowIndex}|${columnIndex}`;
            if (registrationFaceVertexCache.has(cacheKey)) {
                return registrationFaceVertexCache.get(cacheKey);
            }

            const depthT = registrationFaceColumns[columnIndex];
            const inner = readPos(positions, innerIndex);
            const seam = readPos(positions, seamIndex);

            // Interior columns interpolate from the smooth anchor rather than
            // the raw cavity edge, so the face — and the key features riding
            // on it — cannot inherit the vessel's surface relief. The anchor
            // sits in the same radial seam plane as the cavity edge.
            let innerX = inner[0];
            let innerZ = inner[2];
            const anchorRadius = seamAnchorRadii?.[sideKey]?.[rowIndex];
            if (Number.isFinite(anchorRadius)) {
                const sideAngle = isStartSide ? startAngle : endAngle;
                const seamRadius = Math.hypot(seam[0], seam[2]);
                const boundedRadius = Math.min(anchorRadius, seamRadius - Math.max(shellThickness, 1));
                innerX = boundedRadius * Math.cos(sideAngle);
                innerZ = boundedRadius * Math.sin(sideAngle);
            }

            const baseX = lerp(innerX, seam[0], depthT);
            const baseY = lerp(inner[1], seam[1], depthT);
            const baseZ = lerp(innerZ, seam[2], depthT);
            const faceLength = Math.hypot(seam[0] - innerX, seam[2] - innerZ);
            const displacement = this.computeFaceRegistrationDisplacement({
                y: baseY,
                depthT,
                faceLength,
                outwardNormal,
                role: resolveRegistrationRole(isStartSide),
                natchParams,
                enabled: faceRegistrationEnabled,
                keyBaseY: this._keyBaseY,
                keyHeight: this._keyHeight,
                shellThickness
            });
            const vertexIndex = addVertex(
                baseX + displacement.x,
                baseY,
                baseZ + displacement.z
            );
            registrationFaceVertexCache.set(cacheKey, vertexIndex);
            return vertexIndex;
        };

        const getRegistrationFaceVertices = ({
            rowIndex,
            innerIndex,
            seamIndex,
            isStartSide,
            sideKey
        }) => registrationFaceColumns.map((_, columnIndex) => getRegistrationFaceVertex({
            rowIndex,
            innerIndex,
            seamIndex,
            columnIndex,
            isStartSide,
            sideKey
        }));

        const pushRegistrationFaceGrid = ({
            h,
            current,
            next,
            innerA,
            innerB,
            isStartSide,
            sideKey
        }) => {
            const outwardNormal = getSideOutwardNormal(isStartSide);
            const insideOffset = Math.max(0.25, shellThickness * 0.5);

            for (let c = 0; c < registrationFaceColumns.length - 1; c++) {
                const lowerA = getRegistrationFaceVertex({
                    rowIndex: h,
                    innerIndex: innerA,
                    seamIndex: current.seamBaseIndex,
                    columnIndex: c,
                    isStartSide,
                    sideKey
                });
                const lowerB = getRegistrationFaceVertex({
                    rowIndex: h,
                    innerIndex: innerA,
                    seamIndex: current.seamBaseIndex,
                    columnIndex: c + 1,
                    isStartSide,
                    sideKey
                });
                const upperA = getRegistrationFaceVertex({
                    rowIndex: h + 1,
                    innerIndex: innerB,
                    seamIndex: next.seamBaseIndex,
                    columnIndex: c,
                    isStartSide,
                    sideKey
                });
                const upperB = getRegistrationFaceVertex({
                    rowIndex: h + 1,
                    innerIndex: innerB,
                    seamIndex: next.seamBaseIndex,
                    columnIndex: c + 1,
                    isStartSide,
                    sideKey
                });
                const faceCenter = this.averageVertexPosition(positions, [
                    lowerA,
                    lowerB,
                    upperA,
                    upperB
                ]);
                const cellCenter = [
                    faceCenter[0] - outwardNormal.x * insideOffset,
                    faceCenter[1],
                    faceCenter[2] - outwardNormal.z * insideOffset
                ];

                if (isStartSide) {
                    this.pushConnectedWallFace(
                        indexBuffer,
                        positions,
                        lowerA,
                        lowerB,
                        upperB,
                        upperA,
                        cellCenter
                    );
                } else {
                    this.pushConnectedWallFace(
                        indexBuffer,
                        positions,
                        lowerA,
                        upperA,
                        upperB,
                        lowerB,
                        cellCenter
                    );
                }
            }
        };

        for (let a = 0; a < aSteps; a++) {
            pushBottomCapCell(a);
            pushTopCapCell(a);
        }

        const pushWingFaces = (wingRows, outerColumnIndex, innerColumnIndex, isStartSide) => {
            for (let h = 0; h < rows.length - 1; h++) {
                const startCellCenter = getCellCenter(h, 0);
                const current = wingRows[h];
                const next = wingRows[h + 1];
                const innerA = innerIndices[h][innerColumnIndex];
                const innerB = innerIndices[h + 1][innerColumnIndex];
                const outerA = outerIndices[h][outerColumnIndex];
                const outerB = outerIndices[h + 1][outerColumnIndex];

                if (faceRegistrationEnabled) {
                    pushRegistrationFaceGrid({
                        h,
                        current,
                        next,
                        innerA,
                        innerB,
                        isStartSide,
                        sideKey: isStartSide ? 'start' : 'end'
                    });
                } else {
                    if (isStartSide) {
                        this.pushConnectedWallFace(
                            indexBuffer,
                            positions,
                            innerA,
                            current.seamBaseIndex,
                            next.seamBaseIndex,
                            innerB,
                            startCellCenter
                        );
                    } else {
                        this.pushConnectedWallFace(
                            indexBuffer,
                            positions,
                            innerA,
                            innerB,
                            next.seamBaseIndex,
                            current.seamBaseIndex,
                            startCellCenter
                        );
                    }
                }

                if (!current.hasWing || !next.hasWing) {
                    continue;
                }

                const wingCenter = this.averageVertexPosition(positions, [
                    current.seamBaseIndex,
                    current.sideBaseIndex,
                    outerA,
                    next.seamBaseIndex,
                    next.sideBaseIndex,
                    outerB
                ]);

                this.pushConnectedWallFace(
                    indexBuffer,
                    positions,
                    current.seamBaseIndex,
                    next.seamBaseIndex,
                    next.sideBaseIndex,
                    current.sideBaseIndex,
                    wingCenter
                );

                this.pushConnectedWallFace(
                    indexBuffer,
                    positions,
                    current.sideBaseIndex,
                    next.sideBaseIndex,
                    outerB,
                    outerA,
                    wingCenter
                );
            }

            const bottom = wingRows[bottomRow];
            const top = wingRows[topRow];
            if (bottom?.hasWing) {
                const bottomOuter = outerIndices[bottomRow][outerColumnIndex];
                const bottomInsideRow = Math.min(bottomRow + 1, topRow);
                const bottomCapCenter = this.averageVertexPosition(positions, [
                    bottom.seamBaseIndex,
                    bottom.sideBaseIndex,
                    bottomOuter,
                    wingRows[bottomInsideRow].seamBaseIndex,
                    wingRows[bottomInsideRow].sideBaseIndex,
                    outerIndices[bottomInsideRow][outerColumnIndex]
                ]);

                pushTriangle(
                    bottom.seamBaseIndex,
                    bottom.sideBaseIndex,
                    bottomOuter,
                    bottomCapCenter
                );
            }
            if (top?.hasWing) {
                const topOuter = outerIndices[topRow][outerColumnIndex];
                const topInsideRow = Math.max(topRow - 1, 0);
                const topCapCenter = this.averageVertexPosition(positions, [
                    top.seamBaseIndex,
                    top.sideBaseIndex,
                    topOuter,
                    wingRows[topInsideRow].seamBaseIndex,
                    wingRows[topInsideRow].sideBaseIndex,
                    outerIndices[topInsideRow][outerColumnIndex]
                ]);

                pushTriangle(
                    top.seamBaseIndex,
                    topOuter,
                    top.sideBaseIndex,
                    topCapCenter
                );
            }
        };

        if (!isClosedLoop) {
            pushWingFaces(startWing, 0, 0, true);
            pushWingFaces(endWing, angleColumnCount - 1, angleColumnCount - 1, false);
        }

        /*
        if (!isClosedLoop) {
            for (let h = 0; h < rows.length - 1; h++) {
                const startCellCenter = getCellCenter(h, 0);
                this.pushConnectedWallFace(
                    indexBuffer,
                    positions,
                    innerIndices[h][0],
                    outerIndices[h][0],
                    outerIndices[h + 1][0],
                    innerIndices[h + 1][0],
                    startCellCenter
                );

                const endCellCenter = getCellCenter(h, aSteps - 1);
                this.pushConnectedWallFace(
                    indexBuffer,
                    positions,
                    innerIndices[h][aSteps],
                    innerIndices[h + 1][aSteps],
                    outerIndices[h + 1][aSteps],
                    outerIndices[h][aSteps],
                    endCellCenter
                );
            }
        }
        */

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setIndex(indexBuffer);
        geometry.computeVertexNormals();
        if (Number.isFinite(lateralHalfWidth)) {
            // Debug metadata for same-process gates; not serialized by moldWorker.
            geometry.userData.compactWallBlock = {
                halfWidth: lateralHalfWidth,
                outerWallDistance,
                wallNormalAngle,
                halfSpan
            };
        }
        return geometry;
    }

    compileWallSegment({
        profile,
        bounds,
        baseY,
        wallHeight,
        moldWallOffset,
        maxVesselRadius,
        startAngle,
        endAngle,
        wallIndex,
        natchParams,
        shellThickness,
        cornerCutWidth,
        wallCount = 2,
        angleSamples,
        heightSamples,
        quality = 'preview',
        natchesEnabled = false,
        experimental = {},
        lateralHalfWidthOverride
    }) {
        if (experimental.connectedWallTopology !== false) {
            return this.compileConnectedWallSegment({
                profile,
                bounds,
                baseY,
                wallHeight,
                moldWallOffset,
                maxVesselRadius,
                startAngle,
                endAngle,
                wallIndex,
                natchParams,
                shellThickness,
                cornerCutWidth,
                wallCount,
                angleSamples,
                heightSamples,
                quality,
                natchesEnabled,
                experimental,
                lateralHalfWidthOverride
            });
        }

        const qualityPreset = this.getQualityPreset(quality);

        const shellBand = Math.max(0.8, shellThickness * (experimental.shellBandMultiplier || qualityPreset.shellBandMultiplier));
        const seamBandMultiplier = experimental.seamBandMultiplier || qualityPreset.seamBandMultiplier;

        const wallNormalAngle = (startAngle + endAngle) * 0.5;
        const wallNormal = { x: Math.cos(wallNormalAngle), z: Math.sin(wallNormalAngle) };
        const outerWallDistance = maxVesselRadius + moldWallOffset;

        const sideCutPlanes = computeWallSideCutPlanes({
            wallIndex,
            wallCount,
            startAngle,
            endAngle,
            outerWallDistance,
            cornerCutWidth
        });
        const startCutDist = sideCutPlanes.start.distance;
        const endCutDist = sideCutPlanes.end.distance;
        const startCutNormal = sideCutPlanes.start.normal;
        const endCutNormal = sideCutPlanes.end.normal;

        const natchDiameter = Math.max(1, natchParams?.diameter || 10);
        const natchTolerance = Math.max(0, natchParams?.toleranceOffset || 0);
        const seamBand = clamp(
            (3 * (natchDiameter + 2 * natchTolerance)) / (2 * Math.PI * Math.max(outerWallDistance, 1)),
            0.04,
            0.12
        );

        const featureSnapThreshold = quality === 'export'
            ? (experimental.featureSnapThresholdExport ?? experimental.featureSnapThreshold ?? qualityPreset.featureSnapThreshold)
            : (experimental.featureSnapThresholdPreview ?? experimental.featureSnapThreshold ?? qualityPreset.featureSnapThreshold);
        const samplingOptions = {
            heightFeatureScores: this.buildHeightFeatureScores(profile),
            featureSnapThreshold
        };
        const spareConfig = {
            spareShelfRise: quality === 'export'
                ? (experimental.spareShelfRiseExport ?? experimental.spareShelfRise ?? qualityPreset.spareShelfRise)
                : (experimental.spareShelfRisePreview ?? experimental.spareShelfRise ?? qualityPreset.spareShelfRise)
        };

        this._keyBaseY = bounds.min.y;
        this._keyHeight = bounds.max.y - bounds.min.y;

        // Compact block clipping for the voxel fallback. Cell extraction renders the
        // lateral faces as fine radial staircases — acceptable for this escape-hatch
        // path, but it does NOT meet the lay-flat polymer case-mold invariants the
        // connected path guarantees.
        const angularSpanForBlocks = Math.abs(endAngle - startAngle);
        const isClosedLoopForBlocks = wallCount === 1 || angularSpanForBlocks >= Math.PI * 2 - 0.001;
        const useCompactBlocks =
            experimental.compactWallBlocks !== false
            && !isClosedLoopForBlocks;
        const lateralHalfWidth = useCompactBlocks
            ? this.estimateLateralHalfWidth({
                profile,
                bounds,
                rows: this.buildConnectedWallRows({
                    baseY,
                    wallHeight,
                    bounds,
                    baseSteps: 24
                }),
                angleSamples,
                samplingOptions,
                startAngle,
                endAngle,
                wallNormalAngle,
                outerWallDistance,
                moldWallOffset,
                shellThickness,
                natchParams,
                faceRegistrationEnabled: false
            })
            : undefined;

        const maxDepthEstimate = this.estimateDepthEnvelope({
            profile,
            bounds,
            baseY,
            wallHeight,
            angleSamples,
            startAngle,
            endAngle,
            wallNormal,
            outerWallDistance,
            startCutNormal,
            endCutNormal,
            startCutDist,
            endCutDist,
            lateralHalfWidth,
            natchParams,
            natchesEnabled,
            wallIndex,
            seamBand,
            shellThickness,
            samplingOptions,
            spareConfig
        });

        const heightScale = quality === 'export'
            ? (experimental.heightSampleScaleExport ?? experimental.heightSampleScale ?? qualityPreset.heightSampleScale)
            : (experimental.heightSampleScalePreview ?? experimental.heightSampleScale ?? qualityPreset.heightSampleScale);
        const angleScale = quality === 'export'
            ? (experimental.angleSampleScaleExport ?? experimental.angleSampleScale ?? qualityPreset.angleSampleScale)
            : (experimental.angleSampleScalePreview ?? experimental.angleSampleScale ?? qualityPreset.angleSampleScale);

        const baseHSteps = Math.max(24, Math.min(300, Math.round((heightSamples || 120) * heightScale)));
        const aSteps = Math.max(64, Math.min(300, Math.round((angleSamples || 120) * angleScale)));

        const voxelSize = experimental.targetVoxelSize || qualityPreset.targetVoxelSize;
        const configuredVoxelSize = quality === 'export'
            ? experimental.targetVoxelSizeExport
            : experimental.targetVoxelSizePreview;
        const voxelSizeForQuality = configuredVoxelSize || voxelSize;
        const depthStepsMinForQuality = quality === 'export'
            ? (experimental.depthStepsMinExport || experimental.depthStepsMin)
            : (experimental.depthStepsMinPreview || experimental.depthStepsMin);
        const depthStepsMaxForQuality = quality === 'export'
            ? (experimental.depthStepsMaxExport || experimental.depthStepsMax)
            : (experimental.depthStepsMaxPreview || experimental.depthStepsMax);
        const depthSteps = clamp(
            Math.ceil(maxDepthEstimate / Math.max(voxelSizeForQuality, 0.5)),
            depthStepsMinForQuality || qualityPreset.depthStepsMin,
            depthStepsMaxForQuality || qualityPreset.depthStepsMax
        );

        const yCoords = this.buildWallYCoords({
            baseY,
            wallHeight,
            baseSteps: baseHSteps,
            rimY: bounds.max.y,
            shellBand
        });
        const hSteps = yCoords.length - 1;
        const angleCoords = new Float32Array(aSteps + 1);

        for (let a = 0; a <= aSteps; a++) {
            angleCoords[a] = startAngle + (a / aSteps) * (endAngle - startAngle);
        }

        const haCount = (hSteps + 1) * (aSteps + 1);
        const innerRadii = new Float32Array(haCount);
        const outerRadii = new Float32Array(haCount);

        const getHAIndex = (h, a) => h * (aSteps + 1) + a;

        for (let h = 0; h <= hSteps; h++) {
            const y = yCoords[h];

            for (let a = 0; a <= aSteps; a++) {
                const angle = angleCoords[a];
                const angleT = a / aSteps;

                const inner = this.computeInnerRadius({
                    y,
                    angle,
                    profile,
                    bounds,
                    wallHeight,
                    baseY,
                    angleSamples,
                    samplingOptions,
                    spareConfig
                });

                const outer = this.computeOuterRadius({
                    y,
                    angle,
                    angleT,
                    wallNormal,
                    outerWallDistance,
                    startCutNormal,
                    endCutNormal,
                    startCutDist,
                    endCutDist,
                    lateralHalfWidth,
                    natchParams,
                    natchesEnabled,
                    wallIndex,
                    seamBand,
                    shellThickness,
                    startAngle,
                    endAngle
                });

                const minDepth = Math.max(shellThickness * 2 + 0.7, shellThickness + 1.1);
                const safeOuter = Math.max(inner + minDepth, outer);

                const idx = getHAIndex(h, a);
                innerRadii[idx] = inner;
                outerRadii[idx] = safeOuter;
            }
        }

        const cellCount = hSteps * aSteps * depthSteps;
        const occupied = new Uint8Array(cellCount);

        const getCellIndex = (h, a, d) => ((h * aSteps + a) * depthSteps) + d;
        const isInside = (h, a, d) => {
            if (h < 0 || h >= hSteps || a < 0 || a >= aSteps || d < 0 || d >= depthSteps) return 0;
            return occupied[getCellIndex(h, a, d)];
        };

        for (let h = 0; h < hSteps; h++) {
            const yMid = (yCoords[h] + yCoords[h + 1]) * 0.5;
            const topDist = (baseY + wallHeight) - yMid;
            const bottomDist = yMid - baseY;

            for (let a = 0; a < aSteps; a++) {
                const angleMid = (angleCoords[a] + angleCoords[a + 1]) * 0.5;
                const deltaStart = Math.max(0, angleMid - startAngle);
                const deltaEnd = Math.max(0, endAngle - angleMid);
                const shelfRadiusRange = this.computeShelfRadiusRange({
                    profile,
                    angleSamples,
                    angle: angleMid,
                    samplingOptions,
                    shellBand
                });
                const shelfHalfThickness = Math.max(shellThickness * 0.55, 0.65);
                const inShelfSlab = Math.abs(yMid - bounds.max.y) <= shelfHalfThickness;

                const innerMid = average4(
                    innerRadii[getHAIndex(h, a)],
                    innerRadii[getHAIndex(h + 1, a)],
                    innerRadii[getHAIndex(h, a + 1)],
                    innerRadii[getHAIndex(h + 1, a + 1)]
                );

                const outerMid = average4(
                    outerRadii[getHAIndex(h, a)],
                    outerRadii[getHAIndex(h + 1, a)],
                    outerRadii[getHAIndex(h, a + 1)],
                    outerRadii[getHAIndex(h + 1, a + 1)]
                );

                const localDepth = Math.max(outerMid - innerMid, EPSILON);

                for (let d = 0; d < depthSteps; d++) {
                    const t = (d + 0.5) / depthSteps;
                    const depthFromInner = t * localDepth;
                    const depthFromOuter = localDepth - depthFromInner;
                    const radiusMid = innerMid + depthFromInner;
                    const seamDistance = Math.min(deltaStart, deltaEnd) * radiusMid;
                    const inShelfRadius =
                        radiusMid >= shelfRadiusRange.min
                        && radiusMid <= shelfRadiusRange.max;

                    let fill = 0;

                    if (inShelfSlab && inShelfRadius) {
                        fill = 1;
                    } else if (localDepth <= shellBand * 2 + 0.4) {
                        fill = 1;
                    } else if (
                        depthFromInner <= shellBand
                        || depthFromOuter <= shellBand
                        || seamDistance <= shellBand * seamBandMultiplier
                        || topDist <= shellBand
                        || bottomDist <= shellBand
                    ) {
                        fill = 1;
                    }

                    occupied[getCellIndex(h, a, d)] = fill;
                }
            }
        }

        const vertexCount = (hSteps + 1) * (aSteps + 1) * (depthSteps + 1);
        const positions = new Float32Array(vertexCount * 3);

        const getVertexIndex = (h, a, d) => ((h * (aSteps + 1) + a) * (depthSteps + 1)) + d;

        for (let h = 0; h <= hSteps; h++) {
            const y = yCoords[h];

            for (let a = 0; a <= aSteps; a++) {
                const angle = angleCoords[a];
                const cos = Math.cos(angle);
                const sin = Math.sin(angle);

                const haIdx = getHAIndex(h, a);
                const inner = innerRadii[haIdx];
                const outer = outerRadii[haIdx];
                const depth = Math.max(outer - inner, EPSILON);

                for (let d = 0; d <= depthSteps; d++) {
                    const t = d / depthSteps;
                    const radius = inner + depth * t;

                    const vertexIndex = getVertexIndex(h, a, d);
                    const base = vertexIndex * 3;
                    positions[base] = radius * cos;
                    positions[base + 1] = y;
                    positions[base + 2] = radius * sin;
                }
            }
        }

        const indices = [];

        for (let h = 0; h < hSteps; h++) {
            const yMid = (yCoords[h] + yCoords[h + 1]) * 0.5;

            for (let a = 0; a < aSteps; a++) {
                const angleMid = (angleCoords[a] + angleCoords[a + 1]) * 0.5;

                const innerMid = average4(
                    innerRadii[getHAIndex(h, a)],
                    innerRadii[getHAIndex(h + 1, a)],
                    innerRadii[getHAIndex(h, a + 1)],
                    innerRadii[getHAIndex(h + 1, a + 1)]
                );

                const outerMid = average4(
                    outerRadii[getHAIndex(h, a)],
                    outerRadii[getHAIndex(h + 1, a)],
                    outerRadii[getHAIndex(h, a + 1)],
                    outerRadii[getHAIndex(h + 1, a + 1)]
                );

                for (let d = 0; d < depthSteps; d++) {
                    if (!occupied[getCellIndex(h, a, d)]) continue;

                    const tMid = (d + 0.5) / depthSteps;
                    const radiusMid = lerp(innerMid, outerMid, tMid);
                    const cellCenter = [
                        radiusMid * Math.cos(angleMid),
                        yMid,
                        radiusMid * Math.sin(angleMid)
                    ];

                    const c000 = getVertexIndex(h, a, d);
                    const c001 = getVertexIndex(h, a, d + 1);
                    const c010 = getVertexIndex(h, a + 1, d);
                    const c011 = getVertexIndex(h, a + 1, d + 1);
                    const c100 = getVertexIndex(h + 1, a, d);
                    const c101 = getVertexIndex(h + 1, a, d + 1);
                    const c110 = getVertexIndex(h + 1, a + 1, d);
                    const c111 = getVertexIndex(h + 1, a + 1, d + 1);

                    if (!isInside(h - 1, a, d)) {
                        pushOrientedQuad(indices, positions, c000, c001, c011, c010, cellCenter);
                    }
                    if (!isInside(h + 1, a, d)) {
                        pushOrientedQuad(indices, positions, c100, c110, c111, c101, cellCenter);
                    }
                    if (!isInside(h, a - 1, d)) {
                        pushOrientedQuad(indices, positions, c000, c100, c101, c001, cellCenter);
                    }
                    if (!isInside(h, a + 1, d)) {
                        pushOrientedQuad(indices, positions, c010, c011, c111, c110, cellCenter);
                    }
                    if (!isInside(h, a, d - 1)) {
                        pushOrientedQuad(indices, positions, c000, c010, c110, c100, cellCenter);
                    }
                    if (!isInside(h, a, d + 1)) {
                        pushOrientedQuad(indices, positions, c001, c101, c111, c011, cellCenter);
                    }
                }
            }
        }

        if (indices.length === 0) {
            return new THREE.BufferGeometry();
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();

        return geometry;
    }
}

export default WallVolumeCompiler;
