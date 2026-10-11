/**
 * Cast Form Generator - Mold Generator
 * Generates 4-part mold geometry from vessel input
 *
 * Uses outside-in raycasting for accurate profile sampling.
 */

import * as THREE from 'three';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';
import { PART_COLORS, BASE_MOLD_HEIGHT, DEFAULT_NATCHES } from '../state/castFormDefaults.js';
import { WallVolumeCompiler } from './wallVolumeCompiler.js';
import {
    patternAmplitude,
    fadeEnvelope,
    rangeFadeEnvelope,
    normalizeRawPatternParams,
    computeEffectivePattern
} from '../../geometry/surfacePattern.js';

// BVH-accelerated raycasting. Profile sampling casts tens of thousands of rays
// against the input mesh; without a spatial index every ray tests every
// triangle (~12ms/ray on a 485k-triangle patterned vessel). acceleratedRaycast
// falls back to the default path for meshes without a boundsTree.
THREE.Mesh.prototype.raycast = acceleratedRaycast;

const SAMPLING_PRESETS = {
    previewFast: { key: 'preview-fast', label: 'Preview Fast', heightSamples: 96, angleSamples: 96, radialSamples: 24 },
    previewBalanced: { key: 'preview-balanced', label: 'Preview Balanced', heightSamples: 128, angleSamples: 128, radialSamples: 32 },
    previewHigh: { key: 'preview-high', label: 'Preview High', heightSamples: 160, angleSamples: 160, radialSamples: 40 },
    export: { key: 'export', label: 'Export', heightSamples: 256, angleSamples: 256, radialSamples: 48 }
};

const DEGENERATE_AREA_EPSILON = 1e-8;
const POSITION_WELD_EPSILON = 1e-5;

// Collision-checked numeric tables keep cleanup proportional to the indexed
// mesh size. Hash collisions only affect probe length, never vertex identity.
function hashTriple(x, y, z) {
    return (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) >>> 0;
}

function hashTableCapacity(count) {
    return 2 ** Math.ceil(Math.log2(Math.max(4, count * 2)));
}

function createPositionLookup(position, quantize) {
    const slots = new Uint32Array(hashTableCapacity(position.count));
    const ids = new Uint32Array(position.count);
    const mask = slots.length - 1;

    return {
        ids,
        get(vertex) {
            if (ids[vertex]) return ids[vertex] - 1;
            const x = quantize(position.getX(vertex));
            const y = quantize(position.getY(vertex));
            const z = quantize(position.getZ(vertex));
            let slot = hashTriple(x, y, z) & mask;
            while (slots[slot]) {
                const representative = slots[slot] - 1;
                if (quantize(position.getX(representative)) === x
                    && quantize(position.getY(representative)) === y
                    && quantize(position.getZ(representative)) === z) {
                    ids[vertex] = representative + 1;
                    return representative;
                }
                slot = (slot + 1) & mask;
            }
            slots[slot] = vertex + 1;
            ids[vertex] = vertex + 1;
            return vertex;
        }
    };
}

// Pattern-aware sampling: relief below this amplitude is treated as noise
const PATTERN_MIN_AMPLITUDE = 0.15; // mm
const PATTERN_SAMPLES_PER_PERIOD_EXPORT = 8;
const PATTERN_SAMPLES_PER_PERIOD_PREVIEW = 6;
const MAX_ANGLE_SAMPLES = 1024;
const MAX_HEIGHT_SAMPLES = 768;
const PROBE_ANGULAR_SAMPLES = 1024;
const PROBE_VERTICAL_SAMPLES = 512;

/**
 * Measure the periodic component of a detrended signal for one moving-average
 * window size. Counts zero crossings of the residual with hysteresis so noise
 * doesn't inflate the count.
 */
function analyzeWithWindow(filled, wrap, window) {
    const n = filled.length;
    const half = Math.floor(window / 2);
    const residual = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        let sum = 0;
        let count = 0;
        for (let d = -half; d <= half; d++) {
            let j = i + d;
            if (wrap) {
                j = (j + n) % n;
            } else if (j < 0 || j >= n) {
                continue;
            }
            sum += filled[j];
            count++;
        }
        residual[i] = filled[i] - sum / count;
    }

    // Robust amplitude: 5th..95th percentile spread
    const sorted = Array.from(residual).sort((a, b) => a - b);
    const amplitude = sorted[Math.floor(n * 0.95)] - sorted[Math.floor(n * 0.05)];

    // RMS-based hysteresis crossing count
    let rms = 0;
    for (let i = 0; i < n; i++) rms += residual[i] * residual[i];
    rms = Math.sqrt(rms / n);
    const threshold = Math.max(rms * 0.5, amplitude * 0.1, 1e-6);

    let sign = 0;
    let flips = 0;
    for (let i = 0; i < n; i++) {
        if (residual[i] > threshold && sign <= 0) {
            if (sign < 0) flips++;
            sign = 1;
        } else if (residual[i] < -threshold && sign >= 0) {
            if (sign > 0) flips++;
            sign = -1;
        }
    }

    return { cycles: flips / 2, amplitude };
}

/**
 * Measure the dominant periodic component of a 1D signal (radius vs angle, or
 * radius vs height). Detrends with a moving average so vessel slope/curvature
 * don't read as signal. The pattern period is unknown a priori, so several
 * window sizes are tried; a candidate only counts when its measured period
 * fits comfortably inside the window (otherwise the trend follows the
 * oscillation and eats it). Strongest surviving candidate wins.
 * @returns {{cycles: number, amplitude: number}} cycles over the full span and
 *   robust peak-to-peak amplitude in mm
 */
function analyzePeriodicSignal(values, wrap) {
    const n = values.length;
    const valid = values.filter(Number.isFinite);
    if (valid.length < n * 0.8 || n < 32) {
        return { cycles: 0, amplitude: 0 };
    }

    // Fill occasional misses with nearest valid neighbor
    const filled = values.slice();
    for (let i = 0; i < n; i++) {
        if (!Number.isFinite(filled[i])) {
            for (let d = 1; d < n; d++) {
                const lo = wrap ? (i - d + n) % n : i - d;
                const hi = wrap ? (i + d) % n : i + d;
                if (lo >= 0 && Number.isFinite(filled[lo])) { filled[i] = filled[lo]; break; }
                if (hi < n && Number.isFinite(filled[hi])) { filled[i] = filled[hi]; break; }
            }
        }
    }

    let best = { cycles: 0, amplitude: 0 };
    for (const divisor of [4, 8, 16, 32]) {
        const window = Math.max(9, Math.floor(n / divisor)) | 1;
        const candidate = analyzeWithWindow(filled, wrap, window);
        if (candidate.cycles < 1) continue;

        // The window must span at least ~2 periods, or the moving average
        // tracked the oscillation itself and the measurement is invalid.
        const periodSamples = n / candidate.cycles;
        if (window < periodSamples * 2) continue;

        if (candidate.amplitude > best.amplitude) {
            best = candidate;
        }
    }

    return best;
}

export class MoldGenerator {
    constructor() {
        this.radialSegments = 64;
        this.heightSamples = SAMPLING_PRESETS.previewBalanced.heightSamples;
        this.angleSamples = SAMPLING_PRESETS.previewBalanced.angleSamples;
        this.bottomRadialSamples = SAMPLING_PRESETS.previewBalanced.radialSamples;
        // Clearance between mold interior and vessel surface (mm)
        this.vesselClearance = 0.1;
        // Fixed base mold height (mm) - creates interlocking cavity
        this.baseMoldHeight = BASE_MOLD_HEIGHT;
        this.wallVolumeCompiler = new WallVolumeCompiler({
            vesselClearance: this.vesselClearance,
            baseMoldHeight: this.baseMoldHeight
        });
        this.lastSamplingPreset = SAMPLING_PRESETS.previewBalanced;
        this.profileCache = new Map();
        this.bottomGridCache = new Map();
        this.resultCache = new Map();
        this.cacheLimit = 12;
        this.resultCacheLimit = 4;
    }

    getGeometryTriangleCount(geometry) {
        const index = geometry.getIndex();
        if (index) return Math.floor(index.count / 3);
        const position = geometry.getAttribute('position');
        return position ? Math.floor(position.count / 3) : 0;
    }

    /**
     * Prepare a mesh + raycaster for sampling passes. Builds the BVH once per
     * geometry (attached as geometry.boundsTree, the three-mesh-bvh convention)
     * so all sampling passes and repeat generations share it. firstHitOnly is
     * safe here: every sampling site only reads intersections[0].
     */
    createRaycastContext(geometry) {
        if (!geometry.boundsTree) {
            geometry.boundsTree = new MeshBVH(geometry);
        }

        const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(geometry, material);
        const raycaster = new THREE.Raycaster();
        raycaster.firstHitOnly = true;

        return {
            mesh,
            raycaster,
            dispose: () => material.dispose()
        };
    }

    selectSamplingPreset(geometry, quality = 'preview') {
        // With BVH raycasting, sampling cost no longer depends on the input
        // triangle count, so presets are quality floors rather than a defensive
        // downgrade for dense meshes. Pattern detection may raise density
        // further (see resolveSamplingDensity).
        if (quality === 'export') {
            return SAMPLING_PRESETS.export;
        }
        return SAMPLING_PRESETS.previewHigh;
    }

    applySamplingPreset(geometry, quality = 'preview') {
        const preset = this.selectSamplingPreset(geometry, quality);
        this.lastSamplingPreset = preset;
        this.heightSamples = preset.heightSamples;
        this.angleSamples = preset.angleSamples;
        this.bottomRadialSamples = preset.radialSamples;
        return preset;
    }

    /**
     * Probe the vessel with a few dense ray rings/columns and measure whether
     * the surface carries a periodic pattern (knurling, flutes, ridges).
     * Cheap post-BVH: ~5k rays. Cached per geometry.
     * @returns {{angular: {ridges: number, amplitude: number}|null,
     *            vertical: {period: number, amplitude: number}|null}}
     */
    detectPatternSignature(geometry, bounds) {
        if (!this.patternSignatureCache) {
            this.patternSignatureCache = new Map();
        }
        const cacheKey = geometry.uuid;
        if (this.patternSignatureCache.has(cacheKey)) {
            return this.patternSignatureCache.get(cacheKey);
        }

        const { mesh, raycaster, dispose } = this.createRaycastContext(geometry);
        const height = bounds.max.y - bounds.min.y;
        const maxRadius = Math.max(
            Math.abs(bounds.max.x), Math.abs(bounds.min.x),
            Math.abs(bounds.max.z), Math.abs(bounds.min.z)
        ) * 2.0;

        const castInward = (angle, y) => {
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            raycaster.set(
                new THREE.Vector3(maxRadius * cos, y, maxRadius * sin),
                new THREE.Vector3(-cos, 0, -sin)
            );
            raycaster.far = maxRadius * 2;
            const hits = raycaster.intersectObject(mesh);
            if (hits.length === 0) return NaN;
            const p = hits[0].point;
            return Math.sqrt(p.x * p.x + p.z * p.z);
        };

        // Angular rings: three heights in the wall band plus three low rings
        // covering a footring band (patterns on a short foot wall would
        // otherwise go undetected and stay at preset density)
        const measureRing = (y) => {
            const signal = [];
            for (let a = 0; a < PROBE_ANGULAR_SAMPLES; a++) {
                signal.push(castInward((a / PROBE_ANGULAR_SAMPLES) * Math.PI * 2, y));
            }
            const { cycles, amplitude } = analyzePeriodicSignal(signal, true);
            return { ridges: Math.round(cycles), amplitude };
        };

        const angularCandidates = [];
        for (const f of [0.03, 0.05, 0.08, 0.35, 0.55, 0.75]) {
            const y = bounds.min.y + height * f;
            const { ridges, amplitude } = measureRing(y);
            if (amplitude >= PATTERN_MIN_AMPLITUDE && ridges >= 4) {
                angularCandidates.push({ ridges, amplitude, y });
            }
        }

        // Keep the FINEST confirmed pattern (not the strongest): the sampling
        // grid must resolve the highest frequency present, e.g. a fine
        // footring motif under a deep wall motif. Every candidate must be
        // confirmed by a second ring 0.4mm away — a real angular pattern
        // persists across nearby heights, while a ring that tangentially
        // grazes a horizontal ridge crest reads unreproducible facet jitter
        // as a strong angular signal.
        let angular = null;
        angularCandidates.sort((a, b) => b.ridges - a.ridges);
        for (const candidate of angularCandidates) {
            const confirmY = candidate.y + 0.4 <= bounds.max.y
                ? candidate.y + 0.4
                : candidate.y - 0.4;
            const confirm = measureRing(confirmY);
            if (confirm.amplitude >= PATTERN_MIN_AMPLITUDE * 0.5
                && Math.abs(confirm.ridges - candidate.ridges) <= Math.max(1, candidate.ridges * 0.2)) {
                angular = { ridges: candidate.ridges, amplitude: candidate.amplitude };
                break;
            }
        }

        // Vertical columns at three angles. maxStep captures ridge sharpness:
        // sawtooth/stepped ridges need far denser height rows than a sine of
        // the same period, or the step smears across a full row spacing.
        let vertical = null;
        for (const angle of [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3]) {
            const signal = [];
            for (let h = 0; h < PROBE_VERTICAL_SAMPLES; h++) {
                const y = bounds.min.y + height * (h / (PROBE_VERTICAL_SAMPLES - 1));
                signal.push(castInward(angle, y));
            }
            const { cycles, amplitude } = analyzePeriodicSignal(signal, false);
            if (amplitude >= PATTERN_MIN_AMPLITUDE && cycles >= 3) {
                const period = height / cycles;
                let maxStep = 0;
                for (let i = 1; i < signal.length; i++) {
                    if (Number.isFinite(signal[i]) && Number.isFinite(signal[i - 1])) {
                        maxStep = Math.max(maxStep, Math.abs(signal[i] - signal[i - 1]));
                    }
                }
                if (!vertical || amplitude > vertical.amplitude) {
                    vertical = { period, amplitude, maxStep };
                }
            }
        }

        dispose();

        const signature = { angular, vertical };
        this.setCached(this.patternSignatureCache, cacheKey, signature);
        return signature;
    }

    /**
     * Resolve final sampling density for a generation run: preset floor,
     * raised to Nyquist-safe density when the vessel carries a pattern.
     * Tier 1 (analytic): pattern params supplied by the source generator.
     * Tier 2 (measured): pattern detected by probing the mesh.
     * Tier 3 (preset): smooth vessel, preset floor unchanged.
     */
    resolveSamplingDensity(geometry, bounds, quality = 'preview', patternMeta = null, wallCount = 1) {
        const preset = this.selectSamplingPreset(geometry, quality);
        const perPeriod = quality === 'export'
            ? PATTERN_SAMPLES_PER_PERIOD_EXPORT
            : PATTERN_SAMPLES_PER_PERIOD_PREVIEW;
        const roundUp8 = (v) => Math.ceil(v / 8) * 8;
        const height = bounds.max.y - bounds.min.y;

        let angleSamples = preset.angleSamples;
        let heightSamples = preset.heightSamples;
        let tier = 'preset';
        let signature = null;

        const angularRidges = [];
        const verticalPeriods = [];

        if (patternMeta && this.collectPatternMetaFrequencies(patternMeta, angularRidges, verticalPeriods)) {
            tier = 'analytic';
        } else {
            signature = this.detectPatternSignature(geometry, bounds);
            if (signature.angular) angularRidges.push(signature.angular.ridges);
            if (signature.vertical) verticalPeriods.push(signature.vertical.period);
            if (angularRidges.length || verticalPeriods.length) {
                tier = 'measured';
            }
        }

        if (angularRidges.length) {
            const maxRidges = Math.max(...angularRidges);
            // The wall's carrier profile is built by averaging over exactly
            // one angular period per row, which only strips the pattern
            // cleanly when the grid divides evenly into wall periods — so in
            // the analytic tier the grid is an exact multiple of the WALL
            // ridge count, raised until it also covers the finest pattern on
            // any surface (e.g. a denser footring motif).
            const wallSurface = tier === 'analytic'
                ? (patternMeta?.surfaces || []).find((s) =>
                    s?.region === 'wall'
                    && ['vertical', 'diagonal', 'crosshatch', 'knurl'].includes(s?.type)
                    && s.depth > 0 && s.count > 0)
                : null;

            if (wallSurface) {
                const wallCount = Math.max(1, Math.round(wallSurface.count));
                const requiredMin = Math.max(angleSamples, maxRidges * perPeriod);
                const k = Math.max(perPeriod, Math.ceil(requiredMin / wallCount));
                angleSamples = Math.min(
                    Math.max(1, Math.floor(MAX_ANGLE_SAMPLES / wallCount)) * wallCount,
                    wallCount * k
                );
            } else {
                const needed = roundUp8(maxRidges * perPeriod);
                angleSamples = Math.min(MAX_ANGLE_SAMPLES, Math.max(angleSamples, needed));
            }
        }
        if (verticalPeriods.length) {
            const minPeriod = Math.min(...verticalPeriods);
            if (minPeriod > 0.2) {
                const needed = roundUp8(height / (minPeriod / perPeriod));
                heightSamples = Math.min(MAX_HEIGHT_SAMPLES, Math.max(heightSamples, needed));
            }
        }

        // Sharp-stepped ridges (sawtooth profiles): per-period density is not
        // enough — a near-discontinuous step smears across one row spacing on
        // the cavity. Push row spacing toward FDM layer resolution instead.
        if ((signature?.vertical?.maxStep ?? 0) >= 0.4) {
            const targetSpacing = quality === 'export' ? 0.14 : 0.28;
            const needed = roundUp8(height / targetSpacing);
            heightSamples = Math.min(MAX_HEIGHT_SAMPLES, Math.max(heightSamples, needed));
        }

        // Wall-count alignment: when angleSamples divides evenly by the wall
        // count, each wall segment's mesh columns land exactly on profile
        // columns (angle interpolation weight 0 in the wall compiler), so
        // angular relief transfers to the cavity without interpolation loss.
        // The analytic tier's grid answers to the pattern count instead — its
        // relief is re-evaluated analytically per mesh vertex, so alignment
        // is irrelevant there.
        if (tier !== 'analytic' && wallCount > 1) {
            angleSamples = Math.min(
                Math.floor(MAX_ANGLE_SAMPLES / wallCount) * wallCount,
                Math.ceil(angleSamples / wallCount) * wallCount
            );
        }

        // Relief amplitude the cleanup passes must not smooth away
        let protectedRelief = 0;
        if (tier === 'analytic') {
            (patternMeta?.surfaces || []).forEach((surface) => {
                if (surface?.type && surface.type !== 'none' && surface.depth > 0) {
                    protectedRelief = Math.max(protectedRelief, surface.depth);
                }
            });
        } else if (signature) {
            protectedRelief = Math.max(
                signature.angular?.amplitude ?? 0,
                signature.vertical?.amplitude ?? 0
            );
        }

        this.lastSamplingPreset = preset;
        this.heightSamples = heightSamples;
        this.angleSamples = angleSamples;
        this.bottomRadialSamples = preset.radialSamples;
        this.lastSamplingTier = tier;
        this.lastPatternSignature = signature;
        this.protectedReliefAmplitude = protectedRelief;
        // Finest vertical pattern period (mm); sizes the seam-face anchor
        // smoothing window in the wall compiler.
        this.patternVerticalPeriod = verticalPeriods.length ? Math.min(...verticalPeriods) : null;

        return { preset, tier, signature };
    }

    /**
     * Extract angular ridge counts and vertical periods from pattern metadata
     * supplied by a platform generator (Tier 1). Returns true when the
     * metadata describes at least one active pattern.
     */
    collectPatternMetaFrequencies(patternMeta, angularRidges, verticalPeriods) {
        let found = false;
        const surfaces = Array.isArray(patternMeta?.surfaces) ? patternMeta.surfaces : [];

        surfaces.forEach((surface) => {
            const type = surface?.type;
            if (!type || type === 'none' || !(surface.depth > 0)) return;
            found = true;

            if (['vertical', 'diagonal', 'crosshatch', 'knurl'].includes(type)) {
                const count = Math.max(1, Math.round(surface.count || 0));
                if (count > 0) angularRidges.push(count);
            }
            if (type === 'horizontal' && surface.pitch > 0) {
                verticalPeriods.push(surface.pitch);
            }
            if (['diagonal', 'crosshatch', 'knurl'].includes(type)
                && surface.count > 0 && surface.meanRadius > 0 && surface.angleDeg > 0) {
                // Helical ridge vertical period = circumferential pitch / tan(angle)
                const circumferentialPitch = (Math.PI * 2 * surface.meanRadius) / surface.count;
                const period = circumferentialPitch / Math.tan((surface.angleDeg * Math.PI) / 180);
                if (period > 0.2) verticalPeriods.push(period);
            }
        });

        return found;
    }

    /**
     * Tier 1: prepare exact analytic pattern relief for the wall band.
     *
     * Angular-type wall patterns (vertical / diagonal / crosshatch / knurl)
     * are a pure periodic function of angle at any fixed height, so the
     * sampled profile can be split into carrier + relief exactly: a wrapped
     * moving average over one angular period per row strips the relief, and
     * patternAmplitude() re-adds it analytically at whatever tessellation the
     * mold surface has — no sampling ceiling, no aliasing.
     *
     * Horizontal patterns stay on the sampled-grid path (their fidelity comes
     * from metadata-driven height density), as do footring patterns (the
     * dense grid carries them; the foot mold's cavity is not band-stripped).
     *
     * Sets this.analyticRelief ({evaluate(angle, y)} or null) and returns the
     * profile the wall builders should consume (carrier or original).
     */
    prepareAnalyticRelief(patternMeta, bounds, profile) {
        this.analyticRelief = null;

        if (this.lastSamplingTier !== 'analytic') return profile;

        const wallMeta = (patternMeta?.surfaces || []).find((s) =>
            s?.region === 'wall'
            && ['vertical', 'diagonal', 'crosshatch', 'knurl'].includes(s.type)
            && s.depth > 0);
        if (!wallMeta) return profile;

        const params = normalizeRawPatternParams(wallMeta);
        if (!params) return profile;

        // The pattern engine snaps the helix angle of diagonal-family motifs
        // by a sub-degree amount to keep its grid commensurate with the field
        // (clean straight ridges). Reproduce the same effective field here so
        // the cavity stays exactly phase-locked to the vessel.
        const effectiveParams = (Number.isFinite(wallMeta.bandArcLength)
            && Number.isFinite(wallMeta.radialSegments)
            && Number.isFinite(wallMeta.meanRadius))
            ? computeEffectivePattern(params, wallMeta.meanRadius, wallMeta.bandArcLength, wallMeta.radialSegments)
            : params;

        const yStart = Number.isFinite(wallMeta.yStart) ? wallMeta.yStart : bounds.min.y;
        const yEnd = Number.isFinite(wallMeta.yEnd) ? wallMeta.yEnd : bounds.max.y;
        const activeYStart = Number.isFinite(wallMeta.activeYStart) ? wallMeta.activeYStart : undefined;
        const activeYEnd = Number.isFinite(wallMeta.activeYEnd) ? wallMeta.activeYEnd : undefined;
        const activeYFade = Number.isFinite(wallMeta.activeYFade) ? wallMeta.activeYFade : 1.5;
        if (yEnd - yStart < 2) return profile;

        const rows = profile.heights.length;
        const angleSamples = this.angleSamples;
        const window = Math.round(angleSamples / params.count);
        if (window < 2 || window * params.count !== angleSamples) {
            // Grid doesn't divide into exact periods; fall back to sampled path
            return profile;
        }

        // Carrier: strip the angular wave from band rows via wrapped
        // moving average over exactly one period
        const carrierRadii = profile.radii.map((row, h) => {
            const y = profile.heights[h];
            if (y < yStart || y > yEnd) return row;
            if (Number.isFinite(activeYStart) && y < activeYStart) return row;
            if (Number.isFinite(activeYEnd) && y > activeYEnd) return row;

            const stripped = new Array(angleSamples);
            let sum = 0;
            for (let a = 0; a < window; a++) sum += row[a];
            for (let a = 0; a < angleSamples; a++) {
                stripped[a] = sum / window;
                sum += row[(a + window) % angleSamples] - row[a];
            }
            return stripped;
        });
        const carrier = { heights: profile.heights, radii: carrierRadii };

        // Arc length along the carrier within the band (angle-averaged),
        // used as the pattern's t coordinate — matches the arc-length
        // parameterization the vessel generator displaced along.
        const rowMean = carrierRadii.map((row) =>
            row.reduce((s, v) => s + v, 0) / row.length);
        const arcAtRow = new Float64Array(rows);
        let bandStartRow = -1;
        for (let h = 0; h < rows; h++) {
            const y = profile.heights[h];
            if (y < yStart || y > yEnd) continue;
            if (bandStartRow < 0) {
                bandStartRow = h;
                arcAtRow[h] = 0;
            } else {
                const dy = profile.heights[h] - profile.heights[h - 1];
                const dr = rowMean[h] - rowMean[h - 1];
                arcAtRow[h] = arcAtRow[h - 1] + Math.sqrt(dy * dy + dr * dr);
            }
        }
        if (bandStartRow < 0) return profile;

        let bandEndRow = bandStartRow;
        for (let h = rows - 1; h >= 0; h--) {
            if (profile.heights[h] >= yStart && profile.heights[h] <= yEnd) {
                bandEndRow = h;
                break;
            }
        }
        const regionLength = arcAtRow[bandEndRow];
        if (regionLength < 2) return profile;

        const arcAtY = (y) => {
            // Linear interpolation between band rows
            const clamped = Math.min(Math.max(y, profile.heights[bandStartRow]), profile.heights[bandEndRow]);
            let h = bandStartRow;
            while (h < bandEndRow && profile.heights[h + 1] < clamped) h++;
            const y0 = profile.heights[h];
            const y1 = profile.heights[Math.min(h + 1, bandEndRow)];
            const t = y1 > y0 ? (clamped - y0) / (y1 - y0) : 0;
            return arcAtRow[h] + t * (arcAtRow[Math.min(h + 1, bandEndRow)] - arcAtRow[h]);
        };

        // Band-mean radius drives helix phase, matching the generator's use
        // of the region's mean radius
        let meanRadius = wallMeta.meanRadius;
        if (!(meanRadius > 0)) {
            let sum = 0;
            let count = 0;
            for (let h = bandStartRow; h <= bandEndRow; h++) { sum += rowMean[h]; count++; }
            meanRadius = Math.max(1, sum / Math.max(1, count));
        }

        const fadeStart = Number.isFinite(wallMeta.fadeStart) ? wallMeta.fadeStart : 1.5;
        const fadeEnd = Number.isFinite(wallMeta.fadeEnd) ? wallMeta.fadeEnd : 2.0;
        // Displacement is along the profile normal; the cavity radius is
        // radial. Project by the wall slope.
        const radialScale = Math.cos(((wallMeta.wallAngleDeg ?? 0) * Math.PI) / 180);
        const reliefSign = params.relief === 'recessed' ? -1 : 1;

        const coreEvaluate = (angle, y) => {
            if (y < yStart || y > yEnd) return 0;
            const t = arcAtY(y);
            const env = fadeEnvelope(t, regionLength, fadeStart, fadeEnd)
                * rangeFadeEnvelope(y, activeYStart, activeYEnd, activeYFade);
            if (env <= 0) return 0;
            // Mold sampling measures angle as atan2(z, x); the vessel
            // generator's lathe phase is atan2(x, z) = PI/2 - angle.
            const theta = Math.PI / 2 - angle;
            const amp = patternAmplitude(theta, t, meanRadius, effectiveParams);
            if (amp <= 0) return 0;
            return reliefSign * params.depth * radialScale * env * amp;
        };

        // The carrier is a moving average of the *patterned* surface, so it
        // already contains the pattern's angular mean (~depth/3 for a raised
        // knurl). Subtract that mean per row so carrier + relief reproduces
        // smooth + pattern exactly instead of double-counting the mean.
        const MEAN_SAMPLES = 128;
        const periodTheta = (Math.PI * 2) / params.count;
        const rowMeanRelief = new Float64Array(rows);
        for (let h = bandStartRow; h <= bandEndRow; h++) {
            const y = profile.heights[h];
            let sum = 0;
            for (let i = 0; i < MEAN_SAMPLES; i++) {
                sum += coreEvaluate((i / MEAN_SAMPLES) * periodTheta, y);
            }
            rowMeanRelief[h] = sum / MEAN_SAMPLES;
        }
        const meanAtY = (y) => {
            const clamped = Math.min(Math.max(y, profile.heights[bandStartRow]), profile.heights[bandEndRow]);
            let h = bandStartRow;
            while (h < bandEndRow && profile.heights[h + 1] < clamped) h++;
            const y0 = profile.heights[h];
            const y1 = profile.heights[Math.min(h + 1, bandEndRow)];
            const t = y1 > y0 ? (clamped - y0) / (y1 - y0) : 0;
            return rowMeanRelief[h] + t * (rowMeanRelief[Math.min(h + 1, bandEndRow)] - rowMeanRelief[h]);
        };

        this.analyticRelief = {
            yStart,
            yEnd,
            evaluate: (angle, y) => {
                if (y < yStart || y > yEnd) return 0;
                return coreEvaluate(angle, y) - meanAtY(y);
            }
        };

        return carrier;
    }

    getLastSamplingInfo() {
        return {
            key: this.lastSamplingPreset.key,
            label: this.lastSamplingPreset.label,
            heightSamples: this.heightSamples,
            angleSamples: this.angleSamples,
            radialSamples: this.bottomRadialSamples,
            tier: this.lastSamplingTier || 'preset',
            pattern: this.lastPatternSignature
                ? {
                    angularRidges: this.lastPatternSignature.angular?.ridges ?? null,
                    angularAmplitude: this.lastPatternSignature.angular?.amplitude ?? null,
                    verticalPeriod: this.lastPatternSignature.vertical?.period ?? null
                }
                : null
        };
    }

    setCached(map, key, value) {
        if (map.has(key)) {
            map.delete(key);
        }
        map.set(key, value);

        if (map.size > this.cacheLimit) {
            const oldestKey = map.keys().next().value;
            map.delete(oldestKey);
        }
    }

    cloneMoldResult(result) {
        return {
            foot: result.foot?.clone() || null,
            walls: (result.walls || []).map((wall) => wall?.clone() || null)
        };
    }

    disposeMoldResult(result) {
        result?.foot?.dispose?.();
        result?.walls?.forEach((wall) => wall?.dispose?.());
    }

    clearCaches() {
        this.resultCache.forEach((result) => this.disposeMoldResult(result));
        this.resultCache.clear();
        this.profileCache.clear();
        this.bottomGridCache.clear();
        this.patternSignatureCache?.clear();
        this.analyticRelief = null;
        this.wallVolumeCompiler.analyticRelief = null;
        this.lastPatternSignature = null;
    }

    dispose() {
        this.clearCaches();
    }

    getResultCacheKey(inputGeometry, params, options) {
        const paramsKey = JSON.stringify(params);
        const optionsKey = JSON.stringify({
            quality: options.quality,
            natchesEnabled: options.natchesEnabled,
            patternMeta: options.patternMeta || null,
            experimental: params?.experimental || {}
        });
        // Include resolved sampling density: it is derived from geometry
        // probing and pattern metadata, both of which can change the output
        // for the same params.
        return `${inputGeometry.uuid}|${this.heightSamples}x${this.angleSamples}|${paramsKey}|${optionsKey}`;
    }

    getCachedResult(key) {
        const cached = this.resultCache.get(key);
        if (!cached) return null;

        this.resultCache.delete(key);
        this.resultCache.set(key, cached);
        return this.cloneMoldResult(cached);
    }

    setCachedResult(key, result) {
        if (!key) return;

        if (this.resultCache.has(key)) {
            this.disposeMoldResult(this.resultCache.get(key));
            this.resultCache.delete(key);
        }

        this.resultCache.set(key, this.cloneMoldResult(result));

        while (this.resultCache.size > this.resultCacheLimit) {
            const oldestKey = this.resultCache.keys().next().value;
            this.disposeMoldResult(this.resultCache.get(oldestKey));
            this.resultCache.delete(oldestKey);
        }
    }

    getCachedVesselProfile(geometry, bounds) {
        const key = [
            geometry.uuid,
            this.heightSamples,
            this.angleSamples,
            this.vesselClearance.toFixed(3)
        ].join('|');

        if (this.profileCache.has(key)) {
            return this.profileCache.get(key);
        }

        const profile = this.sampleVesselProfile(geometry, bounds);
        this.setCached(this.profileCache, key, profile);
        return profile;
    }

    getCachedBottomGridWithRadius(geometry, bounds, maxRadius) {
        const key = [
            geometry.uuid,
            this.angleSamples,
            this.bottomRadialSamples,
            maxRadius.toFixed(3),
            (this.protectedReliefAmplitude || 0).toFixed(3)
        ].join('|');

        if (this.bottomGridCache.has(key)) {
            return this.bottomGridCache.get(key);
        }

        const grid = this.sampleVesselBottomGridWithRadius(geometry, bounds, maxRadius);
        this.setCached(this.bottomGridCache, key, grid);
        return grid;
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

    computeNatchOffset({
        angleT,
        y,
        keyBaseY,
        keyHeight,
        wallIndex,
        natchParams,
        enabled,
        seamBand = 0.075
    }) {
        if (!enabled || !natchParams) return 0;

        if (!Number.isFinite(keyBaseY) || !Number.isFinite(keyHeight) || keyHeight <= 0) return 0;
        if (y < keyBaseY || y > keyBaseY + keyHeight) return 0;

        const startDist = angleT;
        const endDist = 1 - angleT;
        const nearStart = startDist <= seamBand;
        const nearEnd = endDist <= seamBand;
        if (!nearStart && !nearEnd) return 0;

        // Male key on trailing seam, female socket on leading seam.
        const sideSign = nearEnd ? 1 : -1;
        const seamParity = wallIndex % 2 === 0 ? 1 : -1;
        const sign = sideSign * seamParity;

        const seamDistance = nearEnd ? endDist : startDist;
        const seamInfluence = Math.exp(-Math.pow(seamDistance / (seamBand * 0.55), 2));

        const depth = Math.max(0, natchParams.depth || 0);
        const diameter = Math.max(1, natchParams.diameter || 10);
        const heightFractions = this.getNatchHeightFractions(natchParams.countPerSeam || 2);
        const sigmaY = Math.max(3, diameter * 0.45);

        let heightInfluence = 0;
        for (const fraction of heightFractions) {
            const centerY = keyBaseY + keyHeight * fraction;
            const dy = y - centerY;
            heightInfluence += Math.exp(-(dy * dy) / (2 * sigmaY * sigmaY));
        }

        heightInfluence = Math.min(1, heightInfluence);
        return sign * depth * seamInfluence * heightInfluence;
    }

    getWallAngleSteps(natchesEnabled, natchParams) {
        const baseSteps = Math.max(64, Math.floor(this.angleSamples / 2));
        if (!natchesEnabled || !natchParams) return baseSteps;
        // Seam keys need denser angular sampling to avoid staircase artifacts.
        return Math.max(baseSteps, 128);
    }

    getMaxValue1D(values) {
        let maxValue = -Infinity;
        for (let i = 0; i < values.length; i++) {
            if (values[i] > maxValue) {
                maxValue = values[i];
            }
        }
        return Number.isFinite(maxValue) ? maxValue : 0;
    }

    getMaxValue2D(rows) {
        let maxValue = -Infinity;
        for (let r = 0; r < rows.length; r++) {
            const row = rows[r];
            for (let c = 0; c < row.length; c++) {
                if (row[c] > maxValue) {
                    maxValue = row[c];
                }
            }
        }
        return Number.isFinite(maxValue) ? maxValue : 0;
    }

    pushQuad(indices, v0, v1, v2, v3) {
        indices.push(v0, v1, v2);
        indices.push(v0, v2, v3);
    }

    cleanupGeometryForOutput(geometry) {
        if (!geometry?.isBufferGeometry) {
            return geometry;
        }

        const position = geometry.getAttribute('position');
        if (!position || position.count < 3) {
            return new THREE.BufferGeometry();
        }

        const sourceIndex = geometry.getIndex();
        const indexCount = Math.floor((sourceIndex?.count ?? position.count) / 3) * 3;
        const kept = new Uint32Array(indexCount);
        const triangleSlots = new Uint32Array(hashTableCapacity(indexCount / 3));
        const triangleMask = triangleSlots.length - 1;
        const rounded = createPositionLookup(position, (value) => Math.round(value / POSITION_WELD_EPSILON));
        let keptCount = 0;

        for (let offset = 0; offset < indexCount; offset += 3) {
            const a = sourceIndex ? sourceIndex.getX(offset) : offset;
            const b = sourceIndex ? sourceIndex.getX(offset + 1) : offset + 1;
            const c = sourceIndex ? sourceIndex.getX(offset + 2) : offset + 2;
            const ax = position.getX(a); const ay = position.getY(a); const az = position.getZ(a);
            const abx = position.getX(b) - ax;
            const aby = position.getY(b) - ay;
            const abz = position.getZ(b) - az;
            const acx = position.getX(c) - ax;
            const acy = position.getY(c) - ay;
            const acz = position.getZ(c) - az;
            const nx = aby * acz - abz * acy;
            const ny = abz * acx - abx * acz;
            const nz = abx * acy - aby * acx;
            const area2 = Math.sqrt(nx * nx + ny * ny + nz * nz);
            if (!Number.isFinite(area2) || area2 <= DEGENERATE_AREA_EPSILON) continue;

            const qa = rounded.get(a); const qb = rounded.get(b); const qc = rounded.get(c);
            const lo = Math.min(qa, qb, qc);
            const hi = Math.max(qa, qb, qc);
            const mid = qa + qb + qc - lo - hi;
            let slot = hashTriple(lo, mid, hi) & triangleMask;
            let duplicate = false;
            while (triangleSlots[slot]) {
                const previous = triangleSlots[slot] - 1;
                const pa = rounded.ids[kept[previous]] - 1;
                const pb = rounded.ids[kept[previous + 1]] - 1;
                const pc = rounded.ids[kept[previous + 2]] - 1;
                if (Math.min(pa, pb, pc) === lo && Math.max(pa, pb, pc) === hi && pa + pb + pc === lo + mid + hi) {
                    duplicate = true;
                    break;
                }
                slot = (slot + 1) & triangleMask;
            }
            if (duplicate) continue;
            triangleSlots[slot] = keptCount + 1;
            kept[keptCount++] = a;
            kept[keptCount++] = b;
            kept[keptCount++] = c;
        }

        // Match the former Float32BufferAttribute + three.js mergeVertices
        // tolerance exactly, including truncation for negative coordinates.
        // Only visit surviving indices so the first surviving vertex supplies
        // each welded position, as in the previous cleanup path.
        const multiplier = 10 ** Math.log10(1 / POSITION_WELD_EPSILON);
        const additive = POSITION_WELD_EPSILON * 0.5 * multiplier;
        const weld = createPositionLookup(position, (value) => ~~(Math.fround(value) * multiplier + additive));
        const outputIds = new Uint32Array(position.count);
        const outputPositions = new Float32Array(position.count * 3);
        let vertexCount = 0;
        for (let i = 0; i < keptCount; i++) {
            const source = kept[i];
            const representative = weld.get(source);
            if (!outputIds[representative]) {
                const offset = vertexCount * 3;
                outputPositions[offset] = position.getX(source);
                outputPositions[offset + 1] = position.getY(source);
                outputPositions[offset + 2] = position.getZ(source);
                outputIds[representative] = ++vertexCount;
            }
            kept[i] = outputIds[representative] - 1;
        }

        const cleaned = new THREE.BufferGeometry();
        cleaned.setAttribute('position', new THREE.BufferAttribute(
            outputPositions.slice(0, vertexCount * 3), 3
        ));
        cleaned.setIndex(new THREE.BufferAttribute(
            vertexCount <= 65535 ? new Uint16Array(kept.subarray(0, keptCount)) : kept.slice(0, keptCount), 1
        ));
        cleaned.computeVertexNormals();
        return cleaned;
    }

    /**
     * Generate complete 4-part mold from input geometry as HOLLOW SHELLS
     * All mold parts are generated with the specified shell wall thickness
     * for efficient 3D printing with PLA
     *
     * @param {THREE.BufferGeometry} inputGeometry - Scaled vessel geometry
     * @param {Object} params - Mold parameters including shell.wallThickness
     * @returns {{foot: THREE.BufferGeometry, walls: THREE.BufferGeometry[]}}
     */
    generate(inputGeometry, params, options = {}) {
        const {
            quality = 'preview',
            natchesEnabled = true,
            patternMeta = null,
            onProgress = null
        } = options;
        const { mold, shell, natches = {}, experimental = {} } = params;
        const report = (phase, progress, message) => {
            if (typeof onProgress === 'function') {
                onProgress({ phase, progress, message });
            }
        };

        // Compute input bounds (needed for pattern probing before sampling)
        inputGeometry.computeBoundingBox();
        const bounds = inputGeometry.boundingBox;
        const height = bounds.max.y - bounds.min.y;
        const wallCount = Math.max(1, Math.min(4, Math.round(mold.wallCount || 2)));

        report('setup', 0.02, 'Analyzing surface detail');
        this.resolveSamplingDensity(inputGeometry, bounds, quality, patternMeta, wallCount);

        const resultCacheKey = this.getResultCacheKey(inputGeometry, params, {
            quality,
            natchesEnabled,
            patternMeta
        });
        const cachedResult = this.getCachedResult(resultCacheKey);
        if (cachedResult) {
            report('done', 1, 'Generation complete');
            return cachedResult;
        }

        // Get shell wall thickness (default 1.5mm if not specified)
        const shellWallThickness = shell?.wallThickness || 1.5;

        // Sample the actual vessel profile using outside-in raycasting
        // (cached by geometry + resolved sampling density)
        report('sampling', 0.12, 'Sampling vessel profile');
        const vesselProfile = this.getCachedVesselProfile(inputGeometry, bounds);
        report('sampling', 0.46, 'Profile sampled');

        // Tier 1: split wall pattern into smooth carrier + analytic relief.
        // Wall builders consume the carrier; the exact relief function is
        // re-applied on the cavity surface (see computeInnerRadius hooks).
        // The base mold keeps the raw sampled profile.
        const wallProfile = this.prepareAnalyticRelief(patternMeta, bounds, vesselProfile);
        this.wallVolumeCompiler.analyticRelief = this.analyticRelief;
        this.wallVolumeCompiler.patternVerticalPeriod = this.patternVerticalPeriod;

        // Calculate mold dimensions
        // Wall molds extend from (vessel bottom - baseMoldHeight) to (vessel top + spareHeight)
        const moldWallOffset = mold.plasterWallThickness;
        const wallHeight = height + mold.spareHeight + this.baseMoldHeight;
        const registrationKeyParams = {
            ...DEFAULT_NATCHES,
            ...natches
        };
        const wallRegistrationEnabled =
            natchesEnabled
            && registrationKeyParams.enabled !== false
            && wallCount >= 2;

        // Generate base mold as hollow shell (fixed height, vertical sides, vessel bottom impressed on top)
        report('base', 0.54, 'Generating base shell');
        const baseMold = this.generateBaseMold(
            vesselProfile,
            bounds,
            moldWallOffset,
            inputGeometry,
            shellWallThickness  // Pass shell thickness for hollow shell generation
        );

        // A one-wall mold is a continuous cylindrical body. It shares the
        // foot mold's rotational construction: a constant-radius outer cylinder
        // enclosing the sampled vessel cavity. Split-wall compiler geometry is
        // reserved for the 2–4 wall configurations that need seam faces.
        report('walls', 0.70, 'Generating wall shells');
        const wallShells = wallCount === 1
            ? [this.generateCylindricalWallBody(
                wallProfile,
                bounds,
                wallHeight,
                moldWallOffset
            )]
            : this.generateWallShellsFromProfile(
                wallProfile,
                bounds,
                wallHeight,
                moldWallOffset,
                mold,
                wallRegistrationEnabled ? registrationKeyParams : null,
                shell,
                {
                    natchesEnabled: wallRegistrationEnabled,
                    quality,
                    experimental
                }
            );

        report('cleanup', 0.90, 'Cleaning output mesh');

        const cleanedFoot = this.cleanupGeometryForOutput(baseMold);
        if (cleanedFoot !== baseMold) baseMold.dispose();

        const cleanedWalls = wallShells.map((wall) => {
            const cleaned = this.cleanupGeometryForOutput(wall);
            if (cleaned !== wall) wall.dispose();
            return cleaned;
        });
        const result = {
            foot: cleanedFoot,
            walls: cleanedWalls
        };

        this.setCachedResult(resultCacheKey, result);
        report('done', 1, 'Generation complete');

        return result;
    }

    /**
     * Sample the vessel profile at multiple heights and angles using raycasting
     * Casts rays from OUTSIDE INWARD to correctly capture undercuts and foot rings
     * @param {THREE.BufferGeometry} geometry
     * @param {THREE.Box3} bounds
     * @returns {{radii: number[][], heights: number[]}}
     */
    sampleVesselProfile(geometry, bounds) {
        const height = bounds.max.y - bounds.min.y;

        // Create a temporary mesh for raycasting (BVH-accelerated)
        const { mesh: tempMesh, raycaster, dispose } = this.createRaycastContext(geometry);

        const heights = [];
        const radii = [];

        // Maximum possible radius - rays will start from outside this
        const maxRadius = Math.max(
            Math.abs(bounds.max.x), Math.abs(bounds.min.x),
            Math.abs(bounds.max.z), Math.abs(bounds.min.z)
        ) * 2.0;

        // Sample using raycasting - cast rays from OUTSIDE INWARD at each height/angle
        // This correctly captures undercuts, foot rings, and complex profiles
        for (let h = 0; h < this.heightSamples; h++) {
            const y = bounds.min.y + (height * h / (this.heightSamples - 1));
            heights.push(y);

            const angleRadii = [];

            for (let a = 0; a < this.angleSamples; a++) {
                const angle = (a / this.angleSamples) * Math.PI * 2;

                const cos = Math.cos(angle);
                const sin = Math.sin(angle);

                // Ray origin far outside the vessel at this height/angle
                const origin = new THREE.Vector3(
                    maxRadius * cos,
                    y,
                    maxRadius * sin
                );

                // Ray direction pointing INWARD toward center
                const direction = new THREE.Vector3(-cos, 0, -sin).normalize();

                raycaster.set(origin, direction);
                raycaster.far = maxRadius * 2;

                const intersections = raycaster.intersectObject(tempMesh);

                if (intersections.length > 0) {
                    // First intersection from outside = outermost surface (what mold touches)
                    const point = intersections[0].point;
                    const radius = Math.sqrt(point.x * point.x + point.z * point.z);
                    angleRadii.push(radius);
                } else {
                    // No intersection - mark for interpolation
                    angleRadii.push(0);
                }
            }

            radii.push(angleRadii);
        }

        // Fill any gaps from missed rays (rare, but handles edge cases)
        this.fillProfileGaps(radii);

        // Cleanup
        dispose();

        return { radii, heights };
    }

    /**
     * Fill gaps in the sampled profile (for rare cases where rays miss)
     * Uses simple neighbor interpolation
     * @param {number[][]} radii - 2D array of radii to fill in-place
     */
    fillProfileGaps(radii) {
        // First pass: fill angular gaps within each height band
        for (let h = 0; h < radii.length; h++) {
            const row = radii[h];
            const hasValues = row.some(r => r > 0);

            if (hasValues) {
                for (let a = 0; a < row.length; a++) {
                    if (row[a] === 0) {
                        // Find nearest non-zero values in both directions
                        let leftR = 0, rightR = 0;
                        let leftDist = 0, rightDist = 0;

                        for (let d = 1; d < row.length / 2; d++) {
                            const leftIdx = (a - d + row.length) % row.length;
                            const rightIdx = (a + d) % row.length;

                            if (leftR === 0 && row[leftIdx] > 0) {
                                leftR = row[leftIdx];
                                leftDist = d;
                            }
                            if (rightR === 0 && row[rightIdx] > 0) {
                                rightR = row[rightIdx];
                                rightDist = d;
                            }
                            if (leftR > 0 && rightR > 0) break;
                        }

                        // Weighted interpolation based on distance
                        if (leftR > 0 && rightR > 0) {
                            const totalDist = leftDist + rightDist;
                            row[a] = (leftR * rightDist + rightR * leftDist) / totalDist;
                        } else {
                            row[a] = leftR || rightR;
                        }
                    }
                }
            }
        }

        // Second pass: fill empty height bands from neighbors
        for (let h = 0; h < radii.length; h++) {
            const isEmpty = radii[h].every(r => r === 0);

            if (isEmpty) {
                let aboveH = -1, belowH = -1;

                for (let d = 1; d < radii.length; d++) {
                    if (aboveH < 0 && h + d < radii.length && !radii[h + d].every(r => r === 0)) {
                        aboveH = h + d;
                    }
                    if (belowH < 0 && h - d >= 0 && !radii[h - d].every(r => r === 0)) {
                        belowH = h - d;
                    }
                    if (aboveH >= 0 && belowH >= 0) break;
                }

                if (aboveH >= 0 && belowH >= 0) {
                    const t = (h - belowH) / (aboveH - belowH);
                    for (let a = 0; a < this.angleSamples; a++) {
                        radii[h][a] = radii[belowH][a] * (1 - t) + radii[aboveH][a] * t;
                    }
                } else if (aboveH >= 0) {
                    radii[h] = [...radii[aboveH]];
                } else if (belowH >= 0) {
                    radii[h] = [...radii[belowH]];
                }
            }
        }
    }

    normalizeAngle(angle) {
        const tau = Math.PI * 2;
        const wrapped = angle % tau;
        return wrapped < 0 ? wrapped + tau : wrapped;
    }

    sampleProfileRadius(profile, heightIndexFloat, angle) {
        const rowCount = profile?.radii?.length || 0;
        if (rowCount === 0) return 0;

        const clampedH = THREE.MathUtils.clamp(heightIndexFloat, 0, rowCount - 1);
        const h0 = Math.floor(clampedH);
        const h1 = Math.min(rowCount - 1, h0 + 1);
        const ht = clampedH - h0;

        const angleSamples = this.angleSamples;
        const normalizedAngle = this.normalizeAngle(angle);
        const anglePos = (normalizedAngle / (Math.PI * 2)) * angleSamples;
        const a0 = Math.floor(anglePos) % angleSamples;
        const a1 = (a0 + 1) % angleSamples;
        const at = anglePos - Math.floor(anglePos);

        const row0 = profile.radii[h0] || [];
        const row1 = profile.radii[h1] || row0;

        const r00 = row0[a0] || 0;
        const r01 = row0[a1] || 0;
        const r10 = row1[a0] || 0;
        const r11 = row1[a1] || 0;

        const r0 = THREE.MathUtils.lerp(r00, r01, at);
        const r1 = THREE.MathUtils.lerp(r10, r11, at);
        return THREE.MathUtils.lerp(r0, r1, ht);
    }

    sampleSpareRimRadius(profile, angle, bandRows = 4) {
        const rowCount = profile?.radii?.length || 0;
        if (rowCount === 0) return 0;

        const start = Math.max(0, rowCount - Math.max(1, bandRows));
        const samples = [];

        for (let h = start; h < rowCount; h++) {
            samples.push(this.sampleProfileRadius(profile, h, angle));
        }

        samples.sort((a, b) => a - b);
        const mid = Math.floor(samples.length / 2);
        return samples.length % 2 === 0
            ? (samples[mid - 1] + samples[mid]) * 0.5
            : samples[mid];
    }

    /**
     * Sample the vessel's bottom surface by casting rays UPWARD from below
     * This captures the actual 3D contour of the vessel bottom for the base mold
     * @param {THREE.BufferGeometry} geometry - Vessel geometry
     * @param {THREE.Box3} bounds - Vessel bounding box
     * @returns {{heights: number[], radii: number[]}} - Y-heights and radii at each angle
     */
    sampleVesselBottomSurface(geometry, bounds) {
        const { mesh: tempMesh, raycaster, dispose } = this.createRaycastContext(geometry);

        const bottomHeights = [];  // Y-position of bottom surface at each angle
        const bottomRadii = [];    // Radius at each angle

        // Get the maximum radius from the vessel profile at the bottom
        const maxRadius = Math.max(
            Math.abs(bounds.max.x), Math.abs(bounds.min.x),
            Math.abs(bounds.max.z), Math.abs(bounds.min.z)
        ) * 1.5;

        // Start rays well below the vessel
        const rayStartY = bounds.min.y - 50;

        // Sample at multiple radial distances for each angle to capture the full bottom surface
        const radialSamples = 32;  // Number of radial samples per angle

        for (let a = 0; a < this.angleSamples; a++) {
            const angle = (a / this.angleSamples) * Math.PI * 2;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);

            let maxHitRadius = 0;
            let heightAtMaxRadius = bounds.min.y;

            // Sample at different radii along this angle
            for (let r = 0; r < radialSamples; r++) {
                const sampleRadius = (r / (radialSamples - 1)) * maxRadius;

                // Ray origin below the vessel at this radial position
                const origin = new THREE.Vector3(
                    sampleRadius * cos,
                    rayStartY,
                    sampleRadius * sin
                );

                // Ray direction pointing UPWARD
                const direction = new THREE.Vector3(0, 1, 0);

                raycaster.set(origin, direction);
                raycaster.far = bounds.max.y - rayStartY + 10;

                const intersections = raycaster.intersectObject(tempMesh);

                if (intersections.length > 0) {
                    // First intersection from below = bottom surface of vessel
                    const point = intersections[0].point;
                    const hitRadius = Math.sqrt(point.x * point.x + point.z * point.z);

                    // Track the outermost hit for this angle
                    if (hitRadius > maxHitRadius) {
                        maxHitRadius = hitRadius;
                        heightAtMaxRadius = point.y;
                    }
                }
            }

            bottomRadii.push(maxHitRadius > 0 ? maxHitRadius : 0);
            bottomHeights.push(maxHitRadius > 0 ? heightAtMaxRadius : bounds.min.y);
        }

        // Cleanup
        dispose();

        return { heights: bottomHeights, radii: bottomRadii };
    }

    /**
     * Sample a grid of the vessel's bottom surface for the base mold top
     * This version uses a specified maxRadius for consistent vertex placement
     * @param {THREE.BufferGeometry} geometry - Vessel geometry
     * @param {THREE.Box3} bounds - Vessel bounding box
     * @param {number} maxRadius - Maximum radius for sampling (should match vertex placement)
     * @returns {number[][]} - 2D array of Y-heights [angleIndex][radiusIndex]
     */
    sampleVesselBottomGridWithRadius(geometry, bounds, maxRadius) {
        const { mesh: tempMesh, raycaster, dispose } = this.createRaycastContext(geometry);

        const rayStartY = bounds.min.y - 50;
        const radialSteps = this.bottomRadialSamples;
        const angleSteps = this.angleSamples;

        // First pass: collect raw samples
        const rawHeights = [];

        for (let a = 0; a < angleSteps; a++) {
            const angle = (a / angleSteps) * Math.PI * 2;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);

            const radialHeights = [];

            for (let r = 0; r < radialSteps; r++) {
                const radiusFraction = r / (radialSteps - 1);
                const sampleRadius = radiusFraction * maxRadius;

                const origin = new THREE.Vector3(
                    sampleRadius * cos,
                    rayStartY,
                    sampleRadius * sin
                );

                const direction = new THREE.Vector3(0, 1, 0);
                raycaster.set(origin, direction);
                raycaster.far = bounds.max.y - rayStartY + 10;

                const intersections = raycaster.intersectObject(tempMesh);

                if (intersections.length > 0) {
                    radialHeights.push(intersections[0].point.y);
                } else {
                    radialHeights.push(null);
                }
            }

            rawHeights.push(radialHeights);
        }

        // Second pass: fill gaps using median of valid neighbors (more robust than mean)
        const filledHeights = this.fillHeightGridGaps(rawHeights, bounds.min.y, radialSteps, angleSteps);

        // Third pass: detect and remove spikes using median filter
        const despikedHeights = this.removeSpikesByMedian(filledHeights, radialSteps, angleSteps);

        // Fourth pass: apply feature-aware smoothing. A plain Gaussian pass
        // rounds real foot-ring creases, so only blend neighbors with similar
        // heights and preserve sharp radial/angular transitions.
        //
        // Pattern guard: when the vessel carries decorative relief, its
        // ridge steps look like the "noise" this filter removes. Tighten the
        // edge threshold below the ridge step size (so flanks count as
        // edges) and drop to a single pass.
        const protectedRelief = this.protectedReliefAmplitude || 0;
        const hasProtectedRelief = protectedRelief >= PATTERN_MIN_AMPLITUDE;
        const smoothingPasses = hasProtectedRelief ? 1 : 3;
        const smoothingOptions = hasProtectedRelief
            ? { edgeThreshold: Math.min(0.45, protectedRelief * 0.5) }
            : {};

        let smoothedGrid = despikedHeights;
        for (let pass = 0; pass < smoothingPasses; pass++) {
            smoothedGrid = this.smoothHeightGridFeatureAware(smoothedGrid, radialSteps, angleSteps, smoothingOptions);
        }

        // Cleanup
        dispose();

        return smoothedGrid;
    }

    /**
     * Fill gaps in the height grid using median of valid neighbors
     */
    fillHeightGridGaps(rawHeights, defaultY, radialSteps, angleSteps) {
        const filled = [];

        for (let a = 0; a < angleSteps; a++) {
            const radialHeights = [...rawHeights[a]];

            // Find valid range for this angle
            let firstValid = -1, lastValid = -1;
            for (let r = 0; r < radialSteps; r++) {
                if (radialHeights[r] !== null) {
                    if (firstValid < 0) firstValid = r;
                    lastValid = r;
                }
            }

            // Fill each null value
            for (let r = 0; r < radialSteps; r++) {
                if (radialHeights[r] === null) {
                    // Collect valid neighbors from multiple directions
                    const neighbors = [];

                    // Check radial neighbors
                    for (let dr = -3; dr <= 3; dr++) {
                        if (dr === 0) continue;
                        const ri = r + dr;
                        if (ri >= 0 && ri < radialSteps && rawHeights[a][ri] !== null) {
                            neighbors.push(rawHeights[a][ri]);
                        }
                    }

                    // Check angular neighbors at same radius
                    for (let da = -3; da <= 3; da++) {
                        if (da === 0) continue;
                        const ai = (a + da + angleSteps) % angleSteps;
                        if (rawHeights[ai][r] !== null) {
                            neighbors.push(rawHeights[ai][r]);
                        }
                    }

                    if (neighbors.length > 0) {
                        // Use median for robustness
                        neighbors.sort((x, y) => x - y);
                        const mid = Math.floor(neighbors.length / 2);
                        radialHeights[r] = neighbors.length % 2 === 0
                            ? (neighbors[mid - 1] + neighbors[mid]) / 2
                            : neighbors[mid];
                    } else if (r > lastValid && lastValid >= 0) {
                        // Beyond vessel - use last valid
                        radialHeights[r] = rawHeights[a][lastValid];
                    } else if (r < firstValid && firstValid >= 0) {
                        // Before vessel center - use first valid
                        radialHeights[r] = rawHeights[a][firstValid];
                    } else {
                        radialHeights[r] = defaultY;
                    }
                }
            }

            filled.push(radialHeights);
        }

        return filled;
    }

    /**
     * Remove spikes by comparing each point to median of its neighbors
     * Points that deviate significantly from the local median are replaced
     */
    removeSpikesByMedian(heights, radialSteps, angleSteps) {
        const result = [];
        const spikeThreshold = 2.0; // mm - points deviating more than this are considered spikes

        for (let a = 0; a < angleSteps; a++) {
            const radialHeights = [];

            for (let r = 0; r < radialSteps; r++) {
                const currentValue = heights[a][r];

                // Collect neighborhood values (5x5 neighborhood)
                const neighbors = [];
                for (let da = -2; da <= 2; da++) {
                    const ai = (a + da + angleSteps) % angleSteps;
                    for (let dr = -2; dr <= 2; dr++) {
                        if (da === 0 && dr === 0) continue; // Skip self
                        const ri = r + dr;
                        if (ri >= 0 && ri < radialSteps) {
                            neighbors.push(heights[ai][ri]);
                        }
                    }
                }

                if (neighbors.length >= 4) {
                    // Calculate median of neighbors
                    neighbors.sort((x, y) => x - y);
                    const mid = Math.floor(neighbors.length / 2);
                    const neighborMedian = neighbors.length % 2 === 0
                        ? (neighbors[mid - 1] + neighbors[mid]) / 2
                        : neighbors[mid];

                    // If current value deviates significantly, replace with median
                    if (Math.abs(currentValue - neighborMedian) > spikeThreshold) {
                        radialHeights.push(neighborMedian);
                    } else {
                        radialHeights.push(currentValue);
                    }
                } else {
                    radialHeights.push(currentValue);
                }
            }

            result.push(radialHeights);
        }

        return result;
    }

    /**
     * Apply Gaussian-like smoothing to the height grid
     * Uses weighted average of neighbors
     */
    smoothHeightGridGaussian(heights, radialSteps, angleSteps) {
        const smoothed = [];

        // Gaussian-like weights for 3x3 kernel
        const weights = [
            [0.0625, 0.125, 0.0625],
            [0.125,  0.25,  0.125],
            [0.0625, 0.125, 0.0625]
        ];

        for (let a = 0; a < angleSteps; a++) {
            const smoothedRadial = [];

            for (let r = 0; r < radialSteps; r++) {
                // Center point gets special handling
                if (r === 0) {
                    // Average all center values across angles
                    let sum = 0;
                    for (let ai = 0; ai < angleSteps; ai++) {
                        sum += heights[ai][0];
                    }
                    smoothedRadial.push(sum / angleSteps);
                    continue;
                }

                // Apply Gaussian kernel
                let weightedSum = 0;
                let totalWeight = 0;

                for (let da = -1; da <= 1; da++) {
                    const ai = (a + da + angleSteps) % angleSteps;
                    for (let dr = -1; dr <= 1; dr++) {
                        const ri = r + dr;
                        if (ri >= 0 && ri < radialSteps) {
                            const weight = weights[da + 1][dr + 1];
                            weightedSum += heights[ai][ri] * weight;
                            totalWeight += weight;
                        }
                    }
                }

                smoothedRadial.push(weightedSum / totalWeight);
            }

            smoothed.push(smoothedRadial);
        }

        return smoothed;
    }

    /**
     * Smooth the sampled bottom surface without blending across real creases.
     * This behaves like a tiny bilateral filter: spatially close samples help,
     * but samples across a sharp height jump are ignored.
     */
    smoothHeightGridFeatureAware(heights, radialSteps, angleSteps, options = {}) {
        const smoothed = [];
        const edgeThreshold = options.edgeThreshold ?? 0.45; // mm
        const minNeighborWeight = options.minNeighborWeight ?? 0.0005;

        const spatialWeights = [
            [0.0625, 0.125, 0.0625],
            [0.125,  0.25,  0.125],
            [0.0625, 0.125, 0.0625]
        ];

        for (let a = 0; a < angleSteps; a++) {
            const smoothedRadial = [];

            for (let r = 0; r < radialSteps; r++) {
                const centerValue = heights[a][r];

                if (!Number.isFinite(centerValue)) {
                    smoothedRadial.push(centerValue);
                    continue;
                }

                let weightedSum = centerValue * spatialWeights[1][1];
                let totalWeight = spatialWeights[1][1];

                for (let da = -1; da <= 1; da++) {
                    const ai = (a + da + angleSteps) % angleSteps;

                    for (let dr = -1; dr <= 1; dr++) {
                        if (da === 0 && dr === 0) continue;

                        const ri = r + dr;
                        if (ri < 0 || ri >= radialSteps) continue;

                        const neighborValue = heights[ai][ri];
                        if (!Number.isFinite(neighborValue)) continue;

                        const heightDelta = Math.abs(neighborValue - centerValue);
                        if (heightDelta >= edgeThreshold) {
                            continue;
                        }

                        const similarity = 1 - (heightDelta / edgeThreshold);
                        const weight = spatialWeights[da + 1][dr + 1] * similarity * similarity;

                        if (weight <= minNeighborWeight) {
                            continue;
                        }

                        weightedSum += neighborValue * weight;
                        totalWeight += weight;
                    }
                }

                smoothedRadial.push(weightedSum / totalWeight);
            }

            smoothed.push(smoothedRadial);
        }

        return smoothed;
    }

    /**
     * Sample a grid of the vessel's bottom surface for the base mold top
     * Returns Y-heights at a grid of (radius, angle) positions
     * @param {THREE.BufferGeometry} geometry - Vessel geometry
     * @param {THREE.Box3} bounds - Vessel bounding box
     * @returns {number[][]} - 2D array of Y-heights [angleIndex][radiusIndex]
     */
    sampleVesselBottomGrid(geometry, bounds) {
        const { mesh: tempMesh, raycaster, dispose } = this.createRaycastContext(geometry);

        const maxRadius = Math.max(
            Math.abs(bounds.max.x), Math.abs(bounds.min.x),
            Math.abs(bounds.max.z), Math.abs(bounds.min.z)
        ) * 1.1;  // Slight expansion to ensure coverage

        const rayStartY = bounds.min.y - 50;
        const radialSteps = 32;  // Increased resolution for smoother sampling

        const heightGrid = [];

        // First pass: collect raw samples with hit/miss tracking
        const rawHeights = [];
        const hitMask = [];

        for (let a = 0; a < this.angleSamples; a++) {
            const angle = (a / this.angleSamples) * Math.PI * 2;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);

            const radialHeights = [];
            const radialHits = [];

            for (let r = 0; r < radialSteps; r++) {
                // Use r < radialSteps (not <=) and divide by (radialSteps - 1) for proper 0 to 1 range
                const radiusFraction = r / (radialSteps - 1);
                const sampleRadius = radiusFraction * maxRadius;

                const origin = new THREE.Vector3(
                    sampleRadius * cos,
                    rayStartY,
                    sampleRadius * sin
                );

                const direction = new THREE.Vector3(0, 1, 0);
                raycaster.set(origin, direction);
                raycaster.far = bounds.max.y - rayStartY + 10;

                const intersections = raycaster.intersectObject(tempMesh);

                if (intersections.length > 0) {
                    radialHeights.push(intersections[0].point.y);
                    radialHits.push(true);
                } else {
                    // Mark as miss - will be interpolated later
                    radialHeights.push(null);
                    radialHits.push(false);
                }
            }

            rawHeights.push(radialHeights);
            hitMask.push(radialHits);
        }

        // Second pass: fill gaps and smooth the height grid
        for (let a = 0; a < this.angleSamples; a++) {
            const radialHeights = rawHeights[a];
            const radialHits = hitMask[a];

            // Find the last valid hit along this radial (outermost vessel edge)
            let lastHitIndex = -1;
            let lastHitY = bounds.min.y;
            for (let r = radialSteps - 1; r >= 0; r--) {
                if (radialHits[r]) {
                    lastHitIndex = r;
                    lastHitY = radialHeights[r];
                    break;
                }
            }

            // Fill in missing values
            for (let r = 0; r < radialSteps; r++) {
                if (radialHeights[r] === null) {
                    if (r > lastHitIndex && lastHitIndex >= 0) {
                        // Beyond vessel edge - use the outermost hit value (flat extension)
                        radialHeights[r] = lastHitY;
                    } else {
                        // Inside vessel but missed (e.g., at center) - interpolate from neighbors
                        let prevHit = null, nextHit = null;
                        let prevDist = 0, nextDist = 0;

                        for (let d = 1; d < radialSteps; d++) {
                            if (prevHit === null && r - d >= 0 && radialHits[r - d]) {
                                prevHit = radialHeights[r - d];
                                prevDist = d;
                            }
                            if (nextHit === null && r + d < radialSteps && radialHits[r + d]) {
                                nextHit = radialHeights[r + d];
                                nextDist = d;
                            }
                            if (prevHit !== null && nextHit !== null) break;
                        }

                        if (prevHit !== null && nextHit !== null) {
                            // Linear interpolation between neighbors
                            const t = prevDist / (prevDist + nextDist);
                            radialHeights[r] = prevHit * (1 - t) + nextHit * t;
                        } else if (prevHit !== null) {
                            radialHeights[r] = prevHit;
                        } else if (nextHit !== null) {
                            radialHeights[r] = nextHit;
                        } else {
                            // No hits at all on this radial - use bounds.min.y
                            radialHeights[r] = bounds.min.y;
                        }
                    }
                }
            }

            heightGrid.push(radialHeights);
        }

        // Third pass: smooth the center region to eliminate center spike
        // Average the center values across all angles
        let centerSum = 0;
        let centerCount = 0;
        for (let a = 0; a < this.angleSamples; a++) {
            if (heightGrid[a][0] !== null) {
                centerSum += heightGrid[a][0];
                centerCount++;
            }
        }
        if (centerCount > 0) {
            const centerAvg = centerSum / centerCount;
            for (let a = 0; a < this.angleSamples; a++) {
                heightGrid[a][0] = centerAvg;
            }
        }

        // Fourth pass: apply gentle smoothing to reduce remaining spikes
        const smoothedGrid = this.smoothHeightGrid(heightGrid, radialSteps);

        // Cleanup
        dispose();

        return smoothedGrid;
    }

    /**
     * Apply smoothing to reduce spikes in the height grid (legacy method)
     * @param {number[][]} heightGrid - Raw height grid
     * @param {number} radialSteps - Number of radial samples
     * @returns {number[][]} - Smoothed height grid
     */
    smoothHeightGrid(heightGrid, radialSteps) {
        // Delegate to the new Gaussian smoothing
        return this.smoothHeightGridGaussian(heightGrid, radialSteps, heightGrid.length);
    }

    /**
     * Generate base mold as a HOLLOW SHELL that inserts into the wall mold cavity
     * - Fixed height: baseMoldHeight (15mm)
     * - Position: from (bounds.min.y - baseMoldHeight) to bounds.min.y
     * - Outer surface: vertical walls following vessel base outline
     * - Top surface: contoured to match vessel bottom (sampled via raycasting)
     * - Bottom surface: flat
     *
     * HOLLOW SHELL STRUCTURE:
     * - Outer surfaces (plaster-facing and exterior) as before
     * - Inner surfaces offset by shellWallThickness
     * - Connected at edges to form a hollow shell for 3D printing
     *
     * @param {Object} profile - Vessel profile data
     * @param {THREE.Box3} bounds - Vessel bounding box
     * @param {number} moldWallOffset - Offset for mold walls
     * @param {THREE.BufferGeometry} inputGeometry - Input vessel geometry
     * @param {number} shellWallThickness - Shell wall thickness in mm (default 1.5)
     */
    generateBaseMold(profile, bounds, moldWallOffset, inputGeometry, shellWallThickness = 1.5) {
        const group = new THREE.Group();

        const vertices = [];
        const indices = [];

        // Base mold dimensions
        const bottomY = bounds.min.y - this.baseMoldHeight;
        const innerBottomY = bottomY + shellWallThickness;  // Inner bottom surface
        const angleSteps = this.angleSamples;

        // Get vessel bottom profile (height index 0) for outer wall radius
        const bottomProfile = profile.radii[0];

        // Small clearance so base mold fits into wall mold cavity
        const fitClearance = 0.2;  // 0.2mm clearance per side

        // Calculate max radius - use same calculation for both sampling and vertex placement
        // This is the consistent outer radius of the base mold
        const maxRadius = this.getMaxValue1D(bottomProfile) + this.vesselClearance - fitClearance;
        const innerRadius = maxRadius - shellWallThickness;  // Inner shell radius

        // Sample the actual vessel bottom surface for the contoured top
        // Pass maxRadius to ensure sampling grid matches vertex placement
        const bottomSurfaceGrid = this.getCachedBottomGridWithRadius(inputGeometry, bounds, maxRadius);
        const radialSteps = bottomSurfaceGrid[0].length;  // Number of radial rings in the grid

        // ===== Generate vertices for HOLLOW SHELL =====
        //
        // Structure:
        // Section 1: Bottom outer ring (at bottomY with maxRadius) - exterior bottom edge
        // Section 2: Inner bottom ring (at innerBottomY with innerRadius) - shell interior bottom
        // Section 3: Top outer surface grid (follows vessel contour at maxRadius)
        // Section 4: Top inner surface grid (offset down by shellWallThickness)

        // Section 1: Bottom outer ring (at bottomY) - exterior edge
        // Vertex indices: 0 to angleSteps-1
        const bottomOuterStart = 0;
        for (let a = 0; a < angleSteps; a++) {
            const angle = (a / angleSteps) * Math.PI * 2;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            vertices.push(maxRadius * cos, bottomY, maxRadius * sin);
        }

        // Section 2: Inner shell bottom ring (at innerBottomY with innerRadius) - shell interior
        // Vertex indices: angleSteps to 2*angleSteps-1
        const innerBottomStart = angleSteps;
        for (let a = 0; a < angleSteps; a++) {
            const angle = (a / angleSteps) * Math.PI * 2;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            vertices.push(innerRadius * cos, innerBottomY, innerRadius * sin);
        }

        // Section 3: Top outer surface grid (contoured to match vessel bottom)
        // Vertex indices: 2*angleSteps to 2*angleSteps + angleSteps*radialSteps - 1
        const topOuterGridStart = 2 * angleSteps;
        for (let a = 0; a < angleSteps; a++) {
            const angle = (a / angleSteps) * Math.PI * 2;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);

            for (let r = 0; r < radialSteps; r++) {
                const radiusFraction = r / (radialSteps - 1);
                const radius = radiusFraction * maxRadius;
                const y = bottomSurfaceGrid[a][r];  // Sampled height from vessel bottom

                vertices.push(radius * cos, y, radius * sin);
            }
        }

        // Section 4: Top inner surface grid (offset down by shellWallThickness)
        // Vertex indices: 2*angleSteps + angleSteps*radialSteps to 2*angleSteps + 2*angleSteps*radialSteps - 1
        const topInnerGridStart = topOuterGridStart + angleSteps * radialSteps;
        for (let a = 0; a < angleSteps; a++) {
            const angle = (a / angleSteps) * Math.PI * 2;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);

            for (let r = 0; r < radialSteps; r++) {
                const radiusFraction = r / (radialSteps - 1);
                // Inner surface is offset inward radially (except at center)
                const innerR = Math.max(0, radiusFraction * innerRadius);
                const y = bottomSurfaceGrid[a][r] - shellWallThickness;  // Offset down

                // At center (r=0), use a single point
                const radius = r === 0 ? 0 : innerR;

                vertices.push(radius * cos, y, radius * sin);
            }
        }

        // ===== Generate faces for HOLLOW SHELL =====

        // Outer walls (vertical sides) - connect bottom outer ring to top outer surface outer ring
        for (let a = 0; a < angleSteps; a++) {
            const nextA = (a + 1) % angleSteps;
            const bottomOuter1 = bottomOuterStart + a;
            const bottomOuter2 = bottomOuterStart + nextA;
            // Outermost grid vertices (r = radialSteps - 1)
            const topOuter1 = topOuterGridStart + a * radialSteps + (radialSteps - 1);
            const topOuter2 = topOuterGridStart + nextA * radialSteps + (radialSteps - 1);

            indices.push(bottomOuter1, topOuter2, bottomOuter2);
            indices.push(bottomOuter1, topOuter1, topOuter2);
        }

        // Inner walls (shell interior vertical sides) - connect inner bottom to inner top surface outer ring
        for (let a = 0; a < angleSteps; a++) {
            const nextA = (a + 1) % angleSteps;
            const innerBottom1 = innerBottomStart + a;
            const innerBottom2 = innerBottomStart + nextA;
            // Outermost ring of inner top surface (r = radialSteps - 1)
            const topInner1 = topInnerGridStart + a * radialSteps + (radialSteps - 1);
            const topInner2 = topInnerGridStart + nextA * radialSteps + (radialSteps - 1);

            // Reversed winding for interior faces
            indices.push(innerBottom1, topInner2, topInner1);
            indices.push(innerBottom1, innerBottom2, topInner2);
        }

        // Top outer surface (plaster-facing).
        // Use a dedicated center fan to avoid welded-orientation conflicts around r=0.
        const topOuterCenterIdx = vertices.length / 3;
        let topOuterCenterY = 0;
        for (let a = 0; a < angleSteps; a++) {
            topOuterCenterY += bottomSurfaceGrid[a][0];
        }
        topOuterCenterY /= Math.max(1, angleSteps);
        vertices.push(0, topOuterCenterY, 0);

        if (radialSteps > 1) {
            for (let a = 0; a < angleSteps; a++) {
                const nextA = (a + 1) % angleSteps;
                const currRing = topOuterGridStart + a * radialSteps + 1;
                const nextRing = topOuterGridStart + nextA * radialSteps + 1;

                // Keep orientation opposite to outer wall seam edges.
                indices.push(topOuterCenterIdx, nextRing, currRing);

                for (let r = 1; r < radialSteps - 1; r++) {
                    const curr1 = topOuterGridStart + a * radialSteps + r;
                    const curr2 = topOuterGridStart + a * radialSteps + r + 1;
                    const next1 = topOuterGridStart + nextA * radialSteps + r;
                    const next2 = topOuterGridStart + nextA * radialSteps + r + 1;
                    this.pushQuad(indices, curr1, next1, next2, curr2);
                }
            }
        }

        // Top inner surface (shell interior).
        // Also use a dedicated center fan to keep edge orientation coherent after weld.
        const topInnerCenterIdx = vertices.length / 3;
        let topInnerCenterY = 0;
        for (let a = 0; a < angleSteps; a++) {
            topInnerCenterY += bottomSurfaceGrid[a][0] - shellWallThickness;
        }
        topInnerCenterY /= Math.max(1, angleSteps);
        vertices.push(0, topInnerCenterY, 0);

        if (radialSteps > 1) {
            for (let a = 0; a < angleSteps; a++) {
                const nextA = (a + 1) % angleSteps;
                const currRing = topInnerGridStart + a * radialSteps + 1;
                const nextRing = topInnerGridStart + nextA * radialSteps + 1;

                // Keep orientation opposite to inner wall seam edges.
                indices.push(topInnerCenterIdx, currRing, nextRing);

                for (let r = 1; r < radialSteps - 1; r++) {
                    const curr1 = topInnerGridStart + a * radialSteps + r;
                    const curr2 = topInnerGridStart + a * radialSteps + r + 1;
                    const next1 = topInnerGridStart + nextA * radialSteps + r;
                    const next2 = topInnerGridStart + nextA * radialSteps + r + 1;
                    this.pushQuad(indices, curr1, curr2, next2, next1);
                }
            }
        }

        // Bottom outer surface (flat exterior floor) at bottomY.
        const bottomOuterCenterIdx = vertices.length / 3;
        vertices.push(0, bottomY, 0);
        for (let a = 0; a < angleSteps; a++) {
            const nextA = (a + 1) % angleSteps;
            const outer1 = bottomOuterStart + a;
            const outer2 = bottomOuterStart + nextA;

            indices.push(bottomOuterCenterIdx, outer1, outer2);
        }

        // Inner shell bottom surface (shell interior floor) - flat surface at innerBottomY.
        const innerBottomCenterIdx = vertices.length / 3;
        vertices.push(0, innerBottomY, 0);

        for (let a = 0; a < angleSteps; a++) {
            const nextA = (a + 1) % angleSteps;
            const inner1 = innerBottomStart + a;
            const inner2 = innerBottomStart + nextA;

            // Interior bottom cap (normals point up into shell)
            indices.push(innerBottomCenterIdx, inner2, inner1);
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();

        const material = new THREE.MeshStandardMaterial({
            color: PART_COLORS.foot,
            roughness: 0.7,
            metalness: 0.0,
            side: THREE.DoubleSide
        });

        const mesh = new THREE.Mesh(geometry, material);
        group.add(mesh);

        group.name = 'base';
        return this.groupToGeometry(group);
    }

    /**
     * Generate the main body for a one-wall mold as a closed cylinder.
     *
     * This deliberately does not use the split-wall compiler: there are no
     * seams to register or flat faces to create. Like the foot mold, it is a
     * rotational mesh with a continuous cylindrical exterior and a sampled,
     * vessel-facing interior. The lower cavity remains a close sliding fit for
     * the foot mold, while the upper spare region provides the slip well.
     */
    generateCylindricalWallBody(profile, bounds, wallHeight, moldWallOffset) {
        const baseY = bounds.min.y - this.baseMoldHeight;
        const angleSteps = Math.max(32, this.angleSamples);
        const rows = this.wallVolumeCompiler.buildConnectedWallRows({
            baseY,
            wallHeight,
            bounds,
            baseSteps: this.heightSamples,
            profileHeights: profile?.heights
        });
        const samplingOptions = {
            heightFeatureScores: null,
            featureSnapThreshold: Infinity
        };

        // Measure the complete cavity first. A cylindrical body needs one
        // exterior radius that clears every vessel/profile/spare row.
        const innerRadii = rows.map(() => new Float64Array(angleSteps));
        let outerRadius = 0;
        for (let h = 0; h < rows.length; h++) {
            for (let a = 0; a < angleSteps; a++) {
                const angle = (a / angleSteps) * Math.PI * 2;
                const inner = this.wallVolumeCompiler.computeConnectedInnerRadius({
                    row: rows[h],
                    angle,
                    profile,
                    bounds,
                    angleSamples: this.angleSamples,
                    samplingOptions
                });
                innerRadii[h][a] = inner;
                outerRadius = Math.max(outerRadius, inner + moldWallOffset);
            }
        }

        const positions = [];
        const indices = [];
        const innerIndex = [];
        const outerIndex = [];
        const addVertex = (x, y, z) => {
            positions.push(x, y, z);
            return positions.length / 3 - 1;
        };

        for (let h = 0; h < rows.length; h++) {
            innerIndex[h] = [];
            outerIndex[h] = [];
            for (let a = 0; a < angleSteps; a++) {
                const angle = (a / angleSteps) * Math.PI * 2;
                const cos = Math.cos(angle);
                const sin = Math.sin(angle);
                const inner = innerRadii[h][a];
                innerIndex[h][a] = addVertex(inner * cos, rows[h].y, inner * sin);
                outerIndex[h][a] = addVertex(outerRadius * cos, rows[h].y, outerRadius * sin);
            }
        }

        for (let h = 0; h < rows.length - 1; h++) {
            for (let a = 0; a < angleSteps; a++) {
                const nextA = (a + 1) % angleSteps;
                // Exterior cylinder: outward-facing normals.
                this.pushQuad(indices,
                    outerIndex[h][a], outerIndex[h + 1][a],
                    outerIndex[h + 1][nextA], outerIndex[h][nextA]
                );
                // Vessel-facing cavity: inward-facing normals.
                this.pushQuad(indices,
                    innerIndex[h][a], innerIndex[h][nextA],
                    innerIndex[h + 1][nextA], innerIndex[h + 1][a]
                );
            }
        }

        const bottomRow = 0;
        const topRow = rows.length - 1;
        for (let a = 0; a < angleSteps; a++) {
            const nextA = (a + 1) % angleSteps;
            // Annular caps close the cylinder without blocking the form cavity.
            this.pushQuad(indices,
                outerIndex[bottomRow][a], outerIndex[bottomRow][nextA],
                innerIndex[bottomRow][nextA], innerIndex[bottomRow][a]
            );
            this.pushQuad(indices,
                outerIndex[topRow][a], innerIndex[topRow][a],
                innerIndex[topRow][nextA], outerIndex[topRow][nextA]
            );
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        return geometry;
    }

    /**
     * Generate split wall mold shells with flat outer walls as HOLLOW SHELLS
     * Wall molds extend from (vessel bottom - baseMoldHeight) to (vessel top + spareHeight)
     * The 15mm extension below vessel base creates a cavity for the base mold to insert into
     * Inner surface is vertical in this extension region
     * Outer walls are registered at the widest diameter point
     * Corner triangles are removed via vertical cut planes based on cornerCutWidth
     *
     * Shell wall thickness is controlled by shellParams.wallThickness for 3D printing
     */
    generateWallShellsFromProfile(profile, bounds, wallHeight, moldWallOffset, moldParams, natchParams, shellParams, options = {}) {
        const walls = [];
        // cornerCutWidth is legacy corner relief: inert while experimental.compactWallBlocks
        // (default on) is active — compact blocks derive their own lateral clip planes.
        const { cornerCutWidth = 0 } = moldParams;
        const wallCount = Math.max(1, Math.min(4, Math.round(moldParams.wallCount || 2)));
        const { wallThickness = 1.5 } = shellParams || {};
        const {
            natchesEnabled = false,
            quality = 'preview',
            experimental = {}
        } = options;
        const useVolumeWallCompiler = experimental?.volumeWallCompiler !== false;

        // Find the maximum vessel radius (widest diameter point) - this is our register point
        const maxVesselRadius = this.getMaxValue2D(profile.radii);

        // Wall molds start 15mm below vessel bottom to create cavity for base mold
        const baseY = bounds.min.y - this.baseMoldHeight;

        const segmentAngle = (Math.PI * 2) / wallCount;
        const useConnectedTopology = experimental?.connectedWallTopology !== false;
        const useCompactBlocksForWalls = experimental?.compactWallBlocks !== false;
        // wallCount >= 2 is load-bearing: enabling natches for a 1-wall closed
        // ring would wake the dead radial computeNatchOffset path at the wrap
        // seam (the compiler only suppresses it while faceRegistrationEnabled is
        // true, and closed loops never enable face registration). The voxel
        // escape hatch (connectedWallTopology:false) keeps 3/4-wall molds
        // keyless: its radial mechanism assigns male/female per wall, which is a
        // broken 2-coloring on odd seam cycles.
        const wallNatchesEnabled = useVolumeWallCompiler
            && natchesEnabled
            && natchParams?.enabled !== false
            && (wallCount === 2 || (wallCount >= 3 && useConnectedTopology));

        // Keyed multi-wall molds share one mold-global lateral half-width so
        // mating seam faces get identical radial spans and male/female key
        // centers coincide exactly (center = inner + 0.62 * faceLength; inner is
        // shared at the seam angle, so only the half-width can differ between
        // adjacent walls of an asymmetric vessel).
        let lateralHalfWidthOverride;
        if (useVolumeWallCompiler && useConnectedTopology && useCompactBlocksForWalls
            && wallNatchesEnabled && wallCount >= 3) {
            let sharedHalfWidth = 0;
            for (let i = 0; i < wallCount; i++) {
                const estimated = this.wallVolumeCompiler.estimateConnectedWallLateralHalfWidth({
                    profile,
                    bounds,
                    baseY,
                    wallHeight,
                    moldWallOffset,
                    maxVesselRadius,
                    startAngle: i * segmentAngle,
                    endAngle: (i + 1) * segmentAngle,
                    natchParams,
                    shellThickness: wallThickness,
                    wallCount,
                    angleSamples: this.angleSamples,
                    heightSamples: this.heightSamples,
                    quality,
                    natchesEnabled: wallNatchesEnabled,
                    experimental
                });
                if (Number.isFinite(estimated) && estimated > sharedHalfWidth) {
                    sharedHalfWidth = estimated;
                }
            }
            if (sharedHalfWidth > 0) {
                lateralHalfWidthOverride = sharedHalfWidth;
            }
        }

        for (let i = 0; i < wallCount; i++) {
            const startAngle = i * segmentAngle;
            const endAngle = (i + 1) * segmentAngle;

            if (useVolumeWallCompiler) {
                const wallGeometry = this.wallVolumeCompiler.compileWallSegment({
                    profile,
                    bounds,
                    baseY,
                    wallHeight,
                    moldWallOffset,
                    maxVesselRadius,
                    startAngle,
                    endAngle,
                    wallIndex: i,
                    natchParams,
                    shellThickness: wallThickness,
                    cornerCutWidth,
                    wallCount,
                    angleSamples: this.angleSamples,
                    heightSamples: this.heightSamples,
                    quality,
                    natchesEnabled: wallNatchesEnabled,
                    experimental,
                    lateralHalfWidthOverride
                });
                walls.push(wallGeometry);
                continue;
            }

            const legacyWallGeometry = this.generateWallSegmentWithFlatOuter(
                profile,
                bounds,
                baseY,  // Start 15mm below vessel bottom
                wallHeight,  // Full height including extension
                moldWallOffset,
                maxVesselRadius,
                startAngle,
                endAngle,
                i,
                natchParams,
                cornerCutWidth,
                wallThickness,  // Shell wall thickness for hollow shell
                {
                    natchesEnabled: wallNatchesEnabled
                }
            );

            walls.push(legacyWallGeometry);
        }

        return walls;
    }

    /**
     * Generate single wall segment (120°) as a HOLLOW SHELL for 3D printing
     * The outer walls are registered at the widest diameter point (maxVesselRadius)
     * Wall thickness adjustments are made from that register point
     *
     * IMPORTANT: Outer walls are clipped to vertical cut planes at corners.
     * The cornerCutWidth parameter controls how much of each corner triangle is removed.
     *
     * Wall molds extend from baseY (15mm below vessel) to baseY + wallHeight
     * The 15mm extension below vessel base has vertical inner walls at the vessel's bottom profile radius
     *
     * HOLLOW SHELL STRUCTURE:
     * For each position, we create 4 vertices:
     * - A (innerOuter): cavity-facing surface (plaster touches this)
     * - A' (innerInner): interior side of cavity wall (shell hollow)
     * - B' (outerInner): interior side of exterior wall (shell hollow)
     * - B (outerOuter): exterior flat wall surface
     */
    generateWallSegmentWithFlatOuter(profile, bounds, baseY, wallHeight, moldWallOffset, maxVesselRadius, startAngle, endAngle, wallIndex, natchParams, cornerCutWidth = 0, shellWallThickness = 1.5, options = {}) {
        const { natchesEnabled = false } = options;
        const group = new THREE.Group();
        const vesselHeight = bounds.max.y - bounds.min.y;

        const vertices = [];
        const indices = [];

        // Calculate angle indices - increase density when seam keys are enabled.
        const angleSteps = this.getWallAngleSteps(natchesEnabled, natchParams);

        // Height steps for the full wall height
        const heightSteps = Math.max(profile.heights.length, 16);

        // Calculate vessel wall height (just the vessel portion, excluding spare and base extension)
        const vesselWallHeight = vesselHeight;

        // The outer wall is flat and registered at maxVesselRadius + moldWallOffset
        // This is the key register point where wall thickness adjustments are made
        const outerWallDistance = maxVesselRadius + moldWallOffset;

        // Calculate the mid-angle of this segment (where the flat wall is tangent)
        const midAngle = (startAngle + endAngle) / 2;

        // For a single flat wall per segment:
        // The wall normal points outward at the midAngle
        // The wall is positioned at outerWallDistance from center
        const wallNormal = { x: Math.cos(midAngle), z: Math.sin(midAngle) };

        // Calculate the original corner points (before cut)
        const originalStartCorner = this.getWallCornerPoint(outerWallDistance, midAngle, startAngle);
        const originalEndCorner = this.getWallCornerPoint(outerWallDistance, midAngle, endAngle);

        // Calculate corner distances from center
        const startCornerDist = Math.sqrt(originalStartCorner.x ** 2 + originalStartCorner.z ** 2);
        const endCornerDist = Math.sqrt(originalEndCorner.x ** 2 + originalEndCorner.z ** 2);

        // Calculate cut plane distances (corner distance minus cut width)
        const startCutDist = Math.max(outerWallDistance, startCornerDist - cornerCutWidth);
        const endCutDist = Math.max(outerWallDistance, endCornerDist - cornerCutWidth);

        // Calculate B-line endpoints (where flat wall meets vertical cut planes)
        // These are the new effective corners after the cut
        const startCorner = cornerCutWidth > 0
            ? this.getWallCutIntersection(midAngle, startAngle, outerWallDistance, startCutDist) || originalStartCorner
            : originalStartCorner;
        const endCorner = cornerCutWidth > 0
            ? this.getWallCutIntersection(midAngle, endAngle, outerWallDistance, endCutDist) || originalEndCorner
            : originalEndCorner;

        // Store cut plane info for vertex clipping
        const startCutPlane = { angle: startAngle, distance: startCutDist };
        const endCutPlane = { angle: endAngle, distance: endCutDist };

        const startCutNormal = { x: Math.cos(startCutPlane.angle), z: Math.sin(startCutPlane.angle) };
        const endCutNormal = { x: Math.cos(endCutPlane.angle), z: Math.sin(endCutPlane.angle) };
        const startBoundaryNormal = { x: -Math.sin(startAngle), z: Math.cos(startAngle) };
        const endBoundaryNormal = { x: Math.sin(endAngle), z: -Math.cos(endAngle) };
        const natchDiameter = Math.max(1, natchParams?.diameter || 10);
        const natchTolerance = Math.max(0, natchParams?.toleranceOffset || 0);
        const seamBand = THREE.MathUtils.clamp(
            (3 * (natchDiameter + 2 * natchTolerance)) / (2 * Math.PI * Math.max(outerWallDistance, 1)),
            0.04,
            0.11
        );

        const spareHeight = Math.max(0, wallHeight - vesselWallHeight - this.baseMoldHeight);
        const topY = baseY + wallHeight;
        const hasSpareRegion = spareHeight > 0 && heightSteps >= 2;
        let rimRow = 0;
        if (hasSpareRegion) {
            for (let h = 0; h <= heightSteps; h++) {
                const y = baseY + (h / heightSteps) * wallHeight;
                if (y >= bounds.max.y) {
                    rimRow = h;
                    break;
                }
            }
        } else {
            rimRow = heightSteps;
        }

        // Keep the shelf effectively flat by making the spare jump happen over a tiny Y interval.
        const shelfRise = hasSpareRegion
            ? Math.min(spareHeight, 0.1)
            : 0;
        const spareStartY = hasSpareRegion
            ? Math.min(topY, bounds.max.y + shelfRise)
            : topY;
        const topRow = profile.radii[profile.radii.length - 1] || [];
        const shelfRimRadius = topRow.length > 0
            ? topRow.reduce((sum, value) => sum + value, 0) / topRow.length
            : 0;

        const rowSamples = [];
        for (let h = 0; h <= heightSteps; h++) {
            let y;
            let spareBlendT = 0;

            if (!hasSpareRegion) {
                y = baseY + (h / heightSteps) * wallHeight;
            } else if (h < rimRow) {
                const t = rimRow > 0 ? h / rimRow : 0;
                y = baseY + t * (bounds.max.y - baseY);
            } else if (h === rimRow) {
                y = bounds.max.y;
            } else if (h === rimRow + 1) {
                y = spareStartY;
                spareBlendT = 1;
            } else {
                const denom = Math.max(1, heightSteps - (rimRow + 1));
                const t = (h - (rimRow + 1)) / denom;
                y = spareStartY + t * (topY - spareStartY);
                spareBlendT = 1;
            }

            rowSamples.push({ y, spareBlendT });
        }

        // Generate vertices for hollow shell
        // Per (h, a) position, we create 4 vertices:
        // [0] A = innerOuter (cavity-facing, plaster surface)
        // [1] A' = innerInner (interior of cavity wall)
        // [2] B' = outerInner (interior of exterior wall)
        // [3] B = outerOuter (exterior flat wall)
        for (let h = 0; h <= heightSteps; h++) {
            const { y, spareBlendT } = rowSamples[h];

            // Map each row back to vessel profile height (clamped), while rowSamples controls
            // where the shelf and spare transition occur in Y.
            const vesselT = THREE.MathUtils.clamp(
                (y - bounds.min.y) / vesselWallHeight,
                0,
                1
            );
            const profileHFloat = vesselT * (profile.heights.length - 1);

            for (let a = 0; a <= angleSteps; a++) {
                const angleT = a / angleSteps;
                const angle = startAngle + angleT * (endAngle - startAngle);

                // Use a deterministic rim radius at/above the shelf transition to keep
                // the shelf flat and the spare wall vertical without seam jitter.
                const useShelfRadius = hasSpareRegion && h >= rimRow;
                let vesselRadius = useShelfRadius
                    ? shelfRimRadius
                    : this.sampleProfileRadius(profile, profileHFloat, angle);
                if (!useShelfRadius && this.analyticRelief) {
                    vesselRadius += this.analyticRelief.evaluate(angle, Math.min(y, bounds.max.y));
                }
                const spareRimRadius = shelfRimRadius;
                const blendedRadius = THREE.MathUtils.lerp(vesselRadius, spareRimRadius, spareBlendT);
                const spareRadiusOffset = 15 * spareBlendT;

                // Inner radius (vessel surface, with offset for spare region)
                // In extension region, this creates vertical walls at the bottom profile radius
                const innerRadiusRaw = blendedRadius + this.vesselClearance + spareRadiusOffset;

                // Inner shell radius (offset inward from cavity surface by shell thickness)
                const innerShellRadiusRaw = innerRadiusRaw + shellWallThickness;

                const cos = Math.cos(angle);
                const sin = Math.sin(angle);

                // Calculate outer vertices (B' and B) using flat wall projection
                let outerX, outerZ, outerInnerX, outerInnerZ;
                const natchOffset = this.computeNatchOffset({
                    angleT,
                    y,
                    keyBaseY: bounds.min.y,
                    keyHeight: vesselWallHeight,
                    wallIndex,
                    natchParams,
                    enabled: natchesEnabled,
                    seamBand
                });
                const adjustedOuterWallDistance = Math.max(shellWallThickness + 1, outerWallDistance + natchOffset);
                const adjustedInnerOuterWallDistance = adjustedOuterWallDistance - shellWallThickness;

                // Find intersection of ray from origin at 'angle' with the flat wall
                const dot = cos * wallNormal.x + sin * wallNormal.z;

                if (Math.abs(dot) > 0.001) {
                    const projDist = adjustedOuterWallDistance / dot;
                    const projX = projDist * cos;
                    const projZ = projDist * sin;

                    const innerProjDist = adjustedInnerOuterWallDistance / dot;
                    const innerProjX = innerProjDist * cos;
                    const innerProjZ = innerProjDist * sin;

                    // CLIP to vertical cut planes instead of corner points
                    const startCutCheck = projX * startCutNormal.x + projZ * startCutNormal.z;

                    const endCutCheck = projX * endCutNormal.x + projZ * endCutNormal.z;

                    const startBoundaryDist = projX * startBoundaryNormal.x + projZ * startBoundaryNormal.z;

                    const endBoundaryDist = projX * endBoundaryNormal.x + projZ * endBoundaryNormal.z;

                    // Determine clipping behavior
                    if (startBoundaryDist < 0 || startCutCheck > startCutPlane.distance) {
                        // Point is past start boundary or cut plane - clip to cut plane
                        const cutPlaneDot = cos * startCutNormal.x + sin * startCutNormal.z;
                        if (Math.abs(cutPlaneDot) > 0.001) {
                            const cutProjDist = startCutPlane.distance / cutPlaneDot;
                            outerX = cutProjDist * cos;
                            outerZ = cutProjDist * sin;
                            // Inner shell follows the same cut plane but offset
                            const innerCutProjDist = (startCutPlane.distance - shellWallThickness) / cutPlaneDot;
                            outerInnerX = innerCutProjDist * cos;
                            outerInnerZ = innerCutProjDist * sin;
                        } else {
                            const fallbackOuter = this.getWallCornerPoint(adjustedOuterWallDistance, midAngle, startAngle);
                            const fallbackInner = this.getWallCornerPoint(adjustedInnerOuterWallDistance, midAngle, startAngle);
                            outerX = fallbackOuter.x;
                            outerZ = fallbackOuter.z;
                            outerInnerX = fallbackInner.x;
                            outerInnerZ = fallbackInner.z;
                        }
                    } else if (endBoundaryDist < 0 || endCutCheck > endCutPlane.distance) {
                        // Point is past end boundary or cut plane - clip to cut plane
                        const cutPlaneDot = cos * endCutNormal.x + sin * endCutNormal.z;
                        if (Math.abs(cutPlaneDot) > 0.001) {
                            const cutProjDist = endCutPlane.distance / cutPlaneDot;
                            outerX = cutProjDist * cos;
                            outerZ = cutProjDist * sin;
                            const innerCutProjDist = (endCutPlane.distance - shellWallThickness) / cutPlaneDot;
                            outerInnerX = innerCutProjDist * cos;
                            outerInnerZ = innerCutProjDist * sin;
                        } else {
                            const fallbackOuter = this.getWallCornerPoint(adjustedOuterWallDistance, midAngle, endAngle);
                            const fallbackInner = this.getWallCornerPoint(adjustedInnerOuterWallDistance, midAngle, endAngle);
                            outerX = fallbackOuter.x;
                            outerZ = fallbackOuter.z;
                            outerInnerX = fallbackInner.x;
                            outerInnerZ = fallbackInner.z;
                        }
                    } else {
                        // Point is within bounds - use the projected point on flat wall
                        outerX = projX;
                        outerZ = projZ;
                        outerInnerX = innerProjX;
                        outerInnerZ = innerProjZ;
                    }
                } else {
                    // Ray is parallel to wall - use corner points based on which half we're in
                    if (angleT < 0.5) {
                        const fallbackOuter = this.getWallCornerPoint(adjustedOuterWallDistance, midAngle, startAngle);
                        const fallbackInner = this.getWallCornerPoint(adjustedInnerOuterWallDistance, midAngle, startAngle);
                        outerX = fallbackOuter.x;
                        outerZ = fallbackOuter.z;
                        outerInnerX = fallbackInner.x;
                        outerInnerZ = fallbackInner.z;
                    } else {
                        const fallbackOuter = this.getWallCornerPoint(adjustedOuterWallDistance, midAngle, endAngle);
                        const fallbackInner = this.getWallCornerPoint(adjustedInnerOuterWallDistance, midAngle, endAngle);
                        outerX = fallbackOuter.x;
                        outerZ = fallbackOuter.z;
                        outerInnerX = fallbackInner.x;
                        outerInnerZ = fallbackInner.z;
                    }
                }

                // Guard against local shell inversion near seam cut planes.
                // This can occur in spare region where inner radius grows but seam/corner clipping reduces B' radius.
                const outerInnerRadius = Math.sqrt(outerInnerX * outerInnerX + outerInnerZ * outerInnerZ);
                const maxInnerShellRadius = Math.max(
                    shellWallThickness + this.vesselClearance,
                    outerInnerRadius - 0.15
                );
                const innerShellRadius = Math.min(innerShellRadiusRaw, maxInnerShellRadius);
                const innerRadius = Math.max(this.vesselClearance, innerShellRadius - shellWallThickness);

                // [0] A = Inner outer vertex (cavity-facing, follows vessel profile)
                vertices.push(innerRadius * cos, y, innerRadius * sin);

                // [1] A' = Inner inner vertex (shell interior, offset from cavity surface)
                vertices.push(innerShellRadius * cos, y, innerShellRadius * sin);

                // [2] B' = Outer inner vertex (shell interior, inside of exterior wall)
                vertices.push(outerInnerX, y, outerInnerZ);

                // [3] B = Outer outer vertex (exterior flat wall)
                vertices.push(outerX, y, outerZ);
            }
        }

        // Generate faces for hollow shell
        // Each row now has 4 vertices per angle position: A, A', B', B
        const vertsPerRow = (angleSteps + 1) * 4;

        for (let h = 0; h < heightSteps; h++) {
            for (let a = 0; a < angleSteps; a++) {
                // Current row vertex indices
                const baseA = h * vertsPerRow + a * 4;       // A (inner outer)
                const baseAp = baseA + 1;                    // A' (inner inner)
                const baseBp = baseA + 2;                    // B' (outer inner)
                const baseB = baseA + 3;                     // B (outer outer)

                const nextA = h * vertsPerRow + (a + 1) * 4;
                const nextAp = nextA + 1;
                const nextBp = nextA + 2;
                const nextB = nextA + 3;

                // Next row (height) vertex indices
                const topBaseA = (h + 1) * vertsPerRow + a * 4;
                const topBaseAp = topBaseA + 1;
                const topBaseBp = topBaseA + 2;
                const topBaseB = topBaseA + 3;

                const topNextA = (h + 1) * vertsPerRow + (a + 1) * 4;
                const topNextAp = topNextA + 1;
                const topNextBp = topNextA + 2;
                const topNextB = topNextA + 3;

                // Face A: Inner cavity surface (plaster-facing, normals point inward)
                indices.push(baseA, topNextA, topBaseA);
                indices.push(baseA, nextA, topNextA);

                // Face A': Inner shell surface (shell interior, normals point outward)
                indices.push(baseAp, topBaseAp, topNextAp);
                indices.push(baseAp, topNextAp, nextAp);

                // Face B': Outer shell surface (shell interior, normals point inward)
                indices.push(baseBp, topNextBp, topBaseBp);
                indices.push(baseBp, nextBp, topNextBp);

                // Face B: Exterior surface (outside-facing, normals point outward)
                indices.push(baseB, topBaseB, topNextB);
                indices.push(baseB, topNextB, nextB);
            }
        }

        // Bottom caps:
        // - Exterior floor strip (A to B)
        // - Interior floor strip (A' to B')
        for (let a = 0; a < angleSteps; a++) {
            const A1 = a * 4;
            const Ap1 = A1 + 1;
            const Bp1 = A1 + 2;
            const B1 = A1 + 3;

            const A2 = (a + 1) * 4;
            const Ap2 = A2 + 1;
            const Bp2 = A2 + 2;
            const B2 = A2 + 3;

            // Exterior floor strip (A to B).
            this.pushQuad(indices, A1, B1, B2, A2);

            // Shell interior floor (A' to B').
            this.pushQuad(indices, Ap1, Ap2, Bp2, Bp1);
        }

        // Top caps:
        // - Exterior roof strip (A to B)
        // - Interior ceiling strip (A' to B')
        const topRowStart = heightSteps * vertsPerRow;
        for (let a = 0; a < angleSteps; a++) {
            const A1 = topRowStart + a * 4;
            const Ap1 = A1 + 1;
            const Bp1 = A1 + 2;
            const B1 = A1 + 3;

            const A2 = topRowStart + (a + 1) * 4;
            const Ap2 = A2 + 1;
            const Bp2 = A2 + 2;
            const B2 = A2 + 3;

            // Exterior roof strip (A to B).
            this.pushQuad(indices, A1, A2, B2, B1);

            // Shell interior ceiling (A' to B').
            this.pushQuad(indices, Ap1, Bp1, Bp2, Ap2);
        }

        // Side caps at start/end angles.
        // Start angle:
        // - Exterior seam wall (A to B)
        // - Interior seam wall (A' to B')
        for (let h = 0; h < heightSteps; h++) {
            const A1 = h * vertsPerRow;
            const Ap1 = A1 + 1;
            const Bp1 = A1 + 2;
            const B1 = A1 + 3;

            const A2 = (h + 1) * vertsPerRow;
            const Ap2 = A2 + 1;
            const Bp2 = A2 + 2;
            const B2 = A2 + 3;

            // Exterior seam wall (A to B).
            this.pushQuad(indices, A1, A2, B2, B1);

            // Shell interior (A' to B').
            this.pushQuad(indices, Ap1, Bp1, Bp2, Ap2);
        }

        // End angle:
        // - Exterior seam wall (A to B)
        // - Interior seam wall (A' to B')
        const endAngleOffset = angleSteps * 4;
        for (let h = 0; h < heightSteps; h++) {
            const A1 = h * vertsPerRow + endAngleOffset;
            const Ap1 = A1 + 1;
            const Bp1 = A1 + 2;
            const B1 = A1 + 3;

            const A2 = (h + 1) * vertsPerRow + endAngleOffset;
            const Ap2 = A2 + 1;
            const Bp2 = A2 + 2;
            const B2 = A2 + 3;

            // Exterior seam wall (A to B).
            this.pushQuad(indices, A1, B1, B2, A2);

            // Shell interior (A' to B').
            this.pushQuad(indices, Ap1, Ap2, Bp2, Bp1);
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();

        const material = new THREE.MeshStandardMaterial({
            color: PART_COLORS[`wall${wallIndex + 1}`] || PART_COLORS.wall1,
            roughness: 0.7,
            metalness: 0.0,
            side: THREE.DoubleSide
        });

        const mesh = new THREE.Mesh(geometry, material);
        group.add(mesh);

        group.name = `wall${wallIndex + 1}`;
        return this.groupToGeometry(group);
    }

    /**
     * Calculate the corner point where a flat wall intersects a radial boundary line
     * @param {number} wallDistance - Distance from center to the flat wall (perpendicular distance)
     * @param {number} wallNormalAngle - Angle of the wall's outward normal (midpoint angle of segment)
     * @param {number} radialAngle - Angle of the radial boundary line
     * @returns {{x: number, z: number}} - Corner point coordinates
     */
    getWallCornerPoint(wallDistance, wallNormalAngle, radialAngle) {
        // The flat wall is defined by: x*cos(wallNormalAngle) + z*sin(wallNormalAngle) = wallDistance
        // The radial line is defined by: points of form (t*cos(radialAngle), t*sin(radialAngle)) for t >= 0

        // Substituting the radial line into the wall equation:
        // t*cos(radialAngle)*cos(wallNormalAngle) + t*sin(radialAngle)*sin(wallNormalAngle) = wallDistance
        // t * cos(radialAngle - wallNormalAngle) = wallDistance
        // t = wallDistance / cos(radialAngle - wallNormalAngle)

        const angleDiff = radialAngle - wallNormalAngle;
        const cosDiff = Math.cos(angleDiff);

        // Avoid division by zero (shouldn't happen for 120° segments with midpoint normal)
        if (Math.abs(cosDiff) < 0.001) {
            // Fallback: place corner at wallDistance along the radial
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

    /**
     * Calculate vertical cut plane position for corner elimination
     * Instead of chamfered corners, this creates a flat vertical cut at a fixed distance from center
     * @param {number} cutDistance - Distance from center to the cut plane
     * @param {number} cornerAngle - Angle of the corner (radial direction)
     * @returns {Object} Cut plane data with normal, distance, and angle
     */
    getVerticalCutPlane(cutDistance, cornerAngle) {
        return {
            angle: cornerAngle,
            normal: { x: Math.cos(cornerAngle), z: Math.sin(cornerAngle) },
            distance: cutDistance
        };
    }

    /**
     * Calculate intersection point of a flat wall with a vertical cut plane (B-line endpoint)
     * @param {number} wallNormalAngle - Normal angle of the flat wall
     * @param {number} cutAngle - Angle of the vertical cut plane
     * @param {number} wallDistance - Distance from center to the flat wall
     * @param {number} cutDistance - Distance from center to the cut plane
     * @returns {Object|null} Intersection point {x, z} or null if parallel
     */
    getWallCutIntersection(wallNormalAngle, cutAngle, wallDistance, cutDistance) {
        // Wall plane: x*cos(wallNormalAngle) + z*sin(wallNormalAngle) = wallDistance
        // Cut plane: x*cos(cutAngle) + z*sin(cutAngle) = cutDistance

        const nx1 = Math.cos(wallNormalAngle);
        const nz1 = Math.sin(wallNormalAngle);
        const nx2 = Math.cos(cutAngle);
        const nz2 = Math.sin(cutAngle);

        // Solve 2x2 system using Cramer's rule
        const det = nx1 * nz2 - nz1 * nx2;

        if (Math.abs(det) < 0.001) {
            // Planes are parallel - shouldn't happen in normal operation
            return null;
        }

        const x = (wallDistance * nz2 - cutDistance * nz1) / det;
        const z = (nx1 * cutDistance - nx2 * wallDistance) / det;

        return { x, z };
    }

    /**
     * Project a point at given angle onto a vertical cut plane
     * @param {number} angle - Angle to project
     * @param {Object} cutPlane - Cut plane object with distance and normal
     * @returns {Object} Projected point {x, z}
     */
    projectToVerticalCut(angle, cutPlane) {
        // Simply place point at cut plane distance in the radial direction
        return {
            x: cutPlane.distance * Math.cos(cutPlane.angle),
            z: cutPlane.distance * Math.sin(cutPlane.angle)
        };
    }

    /**
     * Create registration key geometry
     */
    createRegistrationKey(radius, angleDegrees, height, diameter, depth, isMale) {
        const angle = (angleDegrees * Math.PI) / 180;

        // Create hemisphere
        const sphereRadius = diameter / 2;
        const geometry = new THREE.SphereGeometry(
            sphereRadius,
            16,
            8,
            0,
            Math.PI * 2,
            0,
            Math.PI / 2
        );

        // Position
        const x = radius * Math.cos(angle);
        const z = radius * Math.sin(angle);

        geometry.rotateX(Math.PI / 2);
        geometry.translate(x, height, z);

        return geometry;
    }

    /**
     * Create natches (registration keys) for wall segment
     */
    createNatchesForWall(outerRadius, baseHeight, wallHeight, startAngle, endAngle, wallIndex, params) {
        const geometries = [];
        const { diameter, depth, countPerSeam } = params;

        // Position natches at height fractions
        const heightFractions = countPerSeam === 1
            ? [0.5]
            : countPerSeam === 2
                ? [0.25, 0.75]
                : countPerSeam === 3
                    ? [0.2, 0.5, 0.8]
                    : [0.2, 0.4, 0.6, 0.8];

        heightFractions.forEach(fraction => {
            const y = baseHeight + wallHeight * fraction;

            // Male natch on trailing edge (endAngle)
            const maleGeo = this.createRegistrationKey(
                outerRadius + 5,
                (endAngle * 180) / Math.PI,
                y,
                diameter,
                depth,
                true
            );
            geometries.push(maleGeo);
        });

        return geometries;
    }

    /**
     * Convert group of meshes to single geometry
     */
    groupToGeometry(group) {
        const geometries = [];

        group.traverse(child => {
            if (child.isMesh && child.geometry) {
                const geo = child.geometry.clone();
                child.updateMatrixWorld(true);
                geo.applyMatrix4(child.matrixWorld);
                geometries.push(geo);
            }
        });

        if (geometries.length === 0) {
            return new THREE.BufferGeometry();
        }

        if (geometries.length === 1) {
            return geometries[0];
        }

        let totalFloats = 0;
        const chunks = geometries.map((geometry) => {
            const expanded = geometry.getIndex() ? geometry.toNonIndexed() : geometry;
            const position = expanded.getAttribute('position');
            const chunk = new Float32Array(position.array);
            totalFloats += chunk.length;

            if (expanded !== geometry) {
                expanded.dispose();
            }
            geometry.dispose();

            return chunk;
        });

        const mergedArray = new Float32Array(totalFloats);
        let offset = 0;
        for (const chunk of chunks) {
            mergedArray.set(chunk, offset);
            offset += chunk.length;
        }

        const merged = new THREE.BufferGeometry();
        merged.setAttribute('position', new THREE.BufferAttribute(mergedArray, 3));
        merged.computeVertexNormals();
        return merged;
    }
}

export default MoldGenerator;
