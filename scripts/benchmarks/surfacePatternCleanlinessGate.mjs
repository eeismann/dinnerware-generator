/**
 * Release gate: surface-pattern line cleanliness.
 *
 * Black-box measurement of pattern quality on generated items via ray
 * probing (no reliance on the mesh's own grid):
 *  - Ridge straightness: the angular phase of the pattern's fundamental
 *    harmonic must advance linearly with height (helical ridges are straight
 *    lines on the unwrapped surface). The pre-fix sampling produced ~0.05-0.1
 *    period of row-to-row phase wobble; clean geometry stays within ray
 *    quantization noise.
 *  - Ridge width uniformity: every ridge on a ring has the same angular
 *    width, and each ridge keeps its width along its length.
 *  - Cycle count: every probed ring carries exactly `count` ridges.
 *  - Horizontal patterns: rings are perfect circles (no angular relief).
 *  - Print validity of every swept configuration.
 *
 * Run: node scripts/benchmarks/surfacePatternCleanlinessGate.mjs
 */

import * as THREE from 'three';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';
import { stateManager, parameterResolver } from '../../scripts/state/projectState.js';
import { generateItemMesh, calculateGeometryValues, computePatternBandMeta } from '../../scripts/geometry/meshGenerator.js';
import { validateGeometryForPrint } from '../../scripts/geometry/meshQuality.js';
import {
    getPatternParams,
    computePatternRadialSegments,
    computeEffectivePattern,
    patternAmplitude
} from '../../scripts/geometry/surfacePattern.js';

THREE.Mesh.prototype.raycast = acceleratedRaycast;

const ANGLE_SAMPLES = 2048;
const RING_COUNT = 24;

let failures = 0;
function check(name, cond, extra = '') {
    console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
    if (!cond) failures++;
}

function setWallPattern(p) {
    const defaults = {
        type: 'none', depth: 0.4, relief: 'raised', count: 32, pitch: 4,
        lineWidth: 50, profile: 'rounded', angle: 45, direction: 'right'
    };
    const v = { ...defaults, ...p };
    stateManager.setState('globalParameters.wallPatternType', v.type);
    stateManager.setState('globalParameters.wallPatternDepth', v.depth);
    stateManager.setState('globalParameters.wallPatternRelief', v.relief);
    stateManager.setState('globalParameters.wallPatternCount', v.count);
    stateManager.setState('globalParameters.wallPatternPitch', v.pitch);
    stateManager.setState('globalParameters.wallPatternLineWidth', v.lineWidth);
    stateManager.setState('globalParameters.wallPatternProfile', v.profile);
    stateManager.setState('globalParameters.wallPatternAngle', v.angle);
    stateManager.setState('globalParameters.wallPatternDirection', v.direction);
    stateManager.setState('globalParameters.footringPatternType', 'none');
}

/** Outer-surface radius at (angle, y) via inward ray probing. */
function ringSignal(geometry, mesh, y, angles) {
    const ray = new THREE.Raycaster();
    ray.firstHitOnly = true;
    const bb = geometry.boundingBox;
    const maxR = Math.max(bb.max.x, -bb.min.x, bb.max.z, -bb.min.z) * 2;
    return angles.map((angle) => {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        ray.set(new THREE.Vector3(maxR * cos, y, maxR * sin), new THREE.Vector3(-cos, 0, -sin));
        ray.far = maxR * 2;
        const hits = ray.intersectObject(mesh);
        return hits.length ? Math.hypot(hits[0].point.x, hits[0].point.z) : NaN;
    });
}

/** Hysteresis cycle count + robust p2p of an angular signal. */
function measureRing(signal) {
    const n = signal.length;
    const valid = signal.filter(Number.isFinite);
    if (valid.length < n * 0.8) return { p2p: 0, cycles: 0 };
    const mean = valid.reduce((s, v) => s + v, 0) / valid.length;
    const residual = signal.map((v) => (Number.isFinite(v) ? v - mean : 0));
    const sorted = [...residual].sort((a, b) => a - b);
    const p2p = sorted[Math.floor(n * 0.95)] - sorted[Math.floor(n * 0.05)];
    const thr = Math.max(p2p * 0.15, 1e-6);
    let flips = 0;
    let sign = 0;
    for (const r of residual) {
        if (r > thr && sign <= 0) { if (sign < 0) flips++; sign = 1; }
        else if (r < -thr && sign >= 0) { if (sign > 0) flips++; sign = -1; }
    }
    // The hysteresis pass sees the 0-crossing seam as up to one extra flip
    // pair; count full up+down cycles.
    return { p2p, cycles: Math.round(flips / 2), mean };
}

/** Phase (radians) of the DFT bin at the given harmonic. */
function harmonicPhase(signal, harmonic) {
    const n = signal.length;
    const valid = signal.filter(Number.isFinite);
    const mean = valid.reduce((s, v) => s + v, 0) / valid.length;
    let re = 0;
    let im = 0;
    for (let a = 0; a < n; a++) {
        const v = Number.isFinite(signal[a]) ? signal[a] - mean : 0;
        const arg = (-2 * Math.PI * harmonic * a) / n;
        re += v * Math.cos(arg);
        im += v * Math.sin(arg);
    }
    return { phase: Math.atan2(im, re), magnitude: Math.hypot(re, im) / n };
}

/** Angular widths (radians) of contiguous above-midline runs, seam-aware. */
function ridgeWidths(signal) {
    const n = signal.length;
    const valid = signal.filter(Number.isFinite);
    const mean = valid.reduce((s, v) => s + v, 0) / valid.length;
    const on = signal.map((v) => Number.isFinite(v) && v > mean);
    // rotate so index 0 is OFF (avoids splitting a seam-straddling ridge)
    let start = on.indexOf(false);
    if (start < 0) return [];
    const widths = [];
    let run = 0;
    for (let a = 0; a < n; a++) {
        if (on[(start + a) % n]) {
            run++;
        } else if (run > 0) {
            widths.push((run * 2 * Math.PI) / n);
            run = 0;
        }
    }
    if (run > 0) widths.push((run * 2 * Math.PI) / n);
    return widths;
}

/** Pattern band (y range) matching the mesh generator's patterned segments. */
function wallBand() {
    const params = parameterResolver.getAllParameters('mug');
    const geoVals = calculateGeometryValues(params);
    const filletLift = geoVals.bottomCornerRadius >= 0.5 ? geoVals.bottomCornerRadius : 0;
    return { yStart: geoVals.footringHeight + filletLift, yEnd: geoVals.h };
}

function probeMug() {
    const geometry = generateItemMesh('mug');
    const v = validateGeometryForPrint(geometry);
    geometry.computeBoundingBox();
    if (!geometry.boundsTree) geometry.boundsTree = new MeshBVH(geometry);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    const { yStart, yEnd } = wallBand();
    // Probe the band interior, clear of both fade zones
    const lo = yStart + (yEnd - yStart) * 0.2;
    const hi = yStart + (yEnd - yStart) * 0.88;
    const heights = Array.from({ length: RING_COUNT }, (_, i) => lo + ((hi - lo) * i) / (RING_COUNT - 1));
    const angles = Array.from({ length: ANGLE_SAMPLES }, (_, i) => (i / ANGLE_SAMPLES) * 2 * Math.PI);
    const rings = heights.map((y) => ringSignal(geometry, mesh, y, angles));
    return { valid: v.valid, errors: v.errors, heights, rings };
}

/**
 * Max deviation (in pattern periods) of per-ring fundamental phase from the
 * best straight line over height — the straightness metric. Clean helical
 * ridges give ~0; the pre-fix aliasing gave ~0.05-0.1.
 */
function phaseLinearity(heights, rings, count) {
    const phases = rings.map((r) => harmonicPhase(r, count).phase);
    // unwrap
    const un = [phases[0]];
    for (let i = 1; i < phases.length; i++) {
        let p = phases[i];
        while (p - un[i - 1] > Math.PI) p -= 2 * Math.PI;
        while (p - un[i - 1] < -Math.PI) p += 2 * Math.PI;
        un.push(p);
    }
    // least-squares line over y
    const n = un.length;
    const my = heights.reduce((s, v) => s + v, 0) / n;
    const mp = un.reduce((s, v) => s + v, 0) / n;
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
        num += (heights[i] - my) * (un[i] - mp);
        den += (heights[i] - my) ** 2;
    }
    const slope = den > 0 ? num / den : 0;
    let maxResidual = 0;
    for (let i = 0; i < n; i++) {
        const fit = mp + slope * (heights[i] - my);
        maxResidual = Math.max(maxResidual, Math.abs(un[i] - fit));
    }
    return { maxResidualPeriods: maxResidual / (2 * Math.PI), slope };
}

/** Ridge width stats across all rings: per-ring spread and global spread. */
function widthStats(rings) {
    let globalMin = Infinity;
    let globalMax = -Infinity;
    let maxPerRingSpread = 0;
    rings.forEach((r) => {
        const w = ridgeWidths(r);
        if (w.length === 0) return;
        const lo = Math.min(...w);
        const hi = Math.max(...w);
        maxPerRingSpread = Math.max(maxPerRingSpread, hi - lo);
        globalMin = Math.min(globalMin, lo);
        globalMax = Math.max(globalMax, hi);
    });
    return { maxPerRingSpread, globalSpread: globalMax - globalMin };
}

const rayQuantum = (2 * Math.PI) / ANGLE_SAMPLES;

// ---------------------------------------------------------------------------
// Diagonal — the reported defect, at the reproduction settings and across the
// parameter space (angle, direction, profile, width, count, relief, depth)
// ---------------------------------------------------------------------------

const diagonalConfigs = [
    { label: 'repro: 43/60%/square/40°/right/1.5mm', count: 43, lineWidth: 60, profile: 'square', angle: 40, direction: 'right', depth: 1.5 },
    { label: 'mirror: 43/60%/square/40°/left', count: 43, lineWidth: 60, profile: 'square', angle: 40, direction: 'left', depth: 1.5 },
    { label: 'shallow v: 8/90%/v/15°/right/0.4mm', count: 8, lineWidth: 90, profile: 'v', angle: 15, direction: 'right', depth: 0.4 },
    { label: 'steep dense: 240/30%/rounded/75°/right/0.8mm', count: 240, lineWidth: 30, profile: 'rounded', angle: 75, direction: 'right', depth: 0.8 },
    { label: 'recessed: 43/60%/square/40°/right/1.0mm', count: 43, lineWidth: 60, profile: 'square', angle: 40, direction: 'right', depth: 1.0, relief: 'recessed' }
];

for (const cfg of diagonalConfigs) {
    setWallPattern({ ...cfg, type: 'diagonal' });
    const { valid, errors, heights, rings } = probeMug();
    check(`diagonal ${cfg.label}: printable`, valid, (errors || []).join('; '));

    const cyclesOk = rings.every((r) => measureRing(r).cycles === cfg.count);
    check(`diagonal ${cfg.label}: every ring has ${cfg.count} ridges`, cyclesOk,
        rings.map((r) => measureRing(r).cycles).join(','));

    const { maxResidualPeriods } = phaseLinearity(heights, rings, cfg.count);
    check(`diagonal ${cfg.label}: ridges straight (phase residual < 0.015 period)`,
        maxResidualPeriods < 0.015, `residual=${maxResidualPeriods.toFixed(4)} period`);

    // Width uniformity only meaningful for hard-edged profiles with room to
    // resolve each ridge at the probe resolution
    if (cfg.profile === 'square' && cfg.count <= 64) {
        const { maxPerRingSpread, globalSpread } = widthStats(rings);
        const tol = 4 * rayQuantum;
        check(`diagonal ${cfg.label}: uniform ridge width (spread < ${(tol).toFixed(3)} rad)`,
            maxPerRingSpread < tol && globalSpread < tol * 1.5,
            `perRing=${maxPerRingSpread.toFixed(4)} global=${globalSpread.toFixed(4)}`);
    }
}

// ---------------------------------------------------------------------------
// Vertical — commensurate columns must make all ridges identical
// ---------------------------------------------------------------------------

{
    setWallPattern({ type: 'vertical', count: 43, lineWidth: 60, profile: 'square', depth: 1.0 });
    const { valid, heights, rings } = probeMug();
    check('vertical 43/60%/square: printable', valid);
    const cyclesOk = rings.every((r) => measureRing(r).cycles === 43);
    check('vertical 43/60%/square: every ring has 43 ridges', cyclesOk);
    const { maxResidualPeriods } = phaseLinearity(heights, rings, 43);
    check('vertical 43/60%/square: ridges straight', maxResidualPeriods < 0.015,
        `residual=${maxResidualPeriods.toFixed(4)} period`);
    const { maxPerRingSpread, globalSpread } = widthStats(rings);
    const tol = 4 * rayQuantum;
    check('vertical 43/60%/square: uniform ridge width', maxPerRingSpread < tol && globalSpread < tol * 1.5,
        `perRing=${maxPerRingSpread.toFixed(4)} global=${globalSpread.toFixed(4)}`);
}

// ---------------------------------------------------------------------------
// Horizontal — rings must be perfect circles (all relief is axial)
// ---------------------------------------------------------------------------

{
    setWallPattern({ type: 'horizontal', pitch: 6, lineWidth: 50, profile: 'square', depth: 1.0 });
    const { valid, rings } = probeMug();
    check('horizontal 6mm/50%/square: printable', valid);
    // A ring exactly on a near-vertical flank picks up per-ray facet noise;
    // 0.03mm keeps headroom over that while catching any angular relief
    const maxP2p = Math.max(...rings.map((r) => measureRing(r).p2p));
    check('horizontal 6mm/50%/square: rings are circles (angular p2p < 0.03mm)',
        maxP2p < 0.03, `maxP2p=${maxP2p.toFixed(4)}mm`);
}

// ---------------------------------------------------------------------------
// Cross-hatch / knurl — the crossing lattice legitimately alternates between
// `count` peaks (crossing rows) and `2*count` peaks (between crossings), so a
// peak count is not the right metric. Instead require every probed ring's
// measured relief to correlate with the analytic effective field at that
// height: moiré/beading decorrelates rings mid-band, a commensurate lattice
// tracks the field everywhere. This also exercises computeEffectivePattern —
// the same parity path Tier-1 analytic molds use.
// ---------------------------------------------------------------------------

function pearson(a, b) {
    let n = 0, ma = 0, mb = 0;
    for (let i = 0; i < a.length; i++) {
        if (!Number.isFinite(a[i]) || !Number.isFinite(b[i])) continue;
        ma += a[i]; mb += b[i]; n++;
    }
    if (n < a.length * 0.8) return null;
    ma /= n; mb /= n;
    let cov = 0, va = 0, vb = 0;
    for (let i = 0; i < a.length; i++) {
        if (!Number.isFinite(a[i]) || !Number.isFinite(b[i])) continue;
        cov += (a[i] - ma) * (b[i] - mb);
        va += (a[i] - ma) ** 2;
        vb += (b[i] - mb) ** 2;
    }
    // null when either signal is flat (correlation undefined)
    return va > 1e-12 && vb > 1e-12 ? cov / Math.sqrt(va * vb) : null;
}

/**
 * Periodic uniformity: resample a ring signal onto a common within-period
 * grid and measure how much the `count` periods differ from one another,
 * relative to the relief amplitude. This is the direct no-moiré metric: a
 * commensurate lattice renders every period identically (deviation ~probe
 * noise); the pre-fix aliasing gave every ridge a different width and edge
 * position (deviation ~30%+ of relief).
 */
function periodicUniformity(signal, count, bins = 64) {
    const n = signal.length;
    const perBin = Array.from({ length: bins }, () => []);
    for (let k = 0; k < count; k++) {
        for (let b = 0; b < bins; b++) {
            const pos = ((k + b / bins) / count) * n;
            const i0 = Math.floor(pos) % n;
            const i1 = (i0 + 1) % n;
            const f = pos - Math.floor(pos);
            const v0 = signal[i0];
            const v1 = signal[i1];
            if (!Number.isFinite(v0) || !Number.isFinite(v1)) continue;
            perBin[b].push(v0 * (1 - f) + v1 * f);
        }
    }
    let devSum = 0;
    let devN = 0;
    perBin.forEach((vals) => {
        if (vals.length < count * 0.8) return;
        const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
        const varr = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
        devSum += Math.sqrt(varr);
        devN++;
    });
    const { p2p } = measureRing(signal);
    if (devN === 0 || p2p <= 0) return null;
    return (devSum / devN) / p2p;
}

for (const type of ['crosshatch', 'knurl']) {
    setWallPattern({ type, count: 43, lineWidth: 60, profile: 'square', angle: 40, depth: 0.8 });
    const { valid, heights, rings } = probeMug();
    check(`${type} 43/40°: printable`, valid);

    const params = parameterResolver.getAllParameters('mug');
    const geoVals = calculateGeometryValues(params);
    const wallPattern = getPatternParams(params, 'wall');
    const segs = computePatternRadialSegments(wallPattern, null);
    const band = computePatternBandMeta(params, geoVals).wall;
    const eff = computeEffectivePattern(wallPattern, band.meanRadius, band.bandArcLength, segs);
    const { yStart, yEnd } = wallBand();
    const angles = Array.from({ length: ANGLE_SAMPLES }, (_, i) => (i / ANGLE_SAMPLES) * 2 * Math.PI);

    // A ring on a surface of revolution has a constant base radius, so the
    // raw ring signal correlates directly against the field amplitude — no
    // smooth-baseline subtraction (whose coarser faceting would inject a
    // spurious ripple). Displacement along the tilted profile normal shifts
    // flank geometry vertically by up to depth·sin(wallAngle), so each ring
    // may see the field at a slightly offset t: allow a per-ring best match
    // within ±0.6mm. Pre-fix moiré is phase jitter WITHIN a ring, which no
    // t-shift can repair, so this stays a discriminating metric. The band
    // profile may be authored bottom-up or top-down (fillet case); accept
    // whichever orientation matches.
    const DT_SCAN = Array.from({ length: 13 }, (_, i) => -0.6 + i * 0.1);
    const corrFor = (topDown) => heights.map((y, h) => {
        const frac = (y - yStart) / (yEnd - yStart);
        const t0 = (topDown ? 1 - frac : frac) * band.bandArcLength;
        let best = null;
        for (const dt of DT_SCAN) {
            const expected = angles.map((a) =>
                patternAmplitude(Math.PI / 2 - a, t0 + dt, band.meanRadius, eff));
            const c = pearson(rings[h], expected);
            if (c !== null && (best === null || c > best)) best = c;
        }
        return best;
    });
    // Crosshatch legitimately has near-flat rings (at crossing rows the two
    // ridge families' union covers nearly the whole circumference), where
    // correlation is meaningless noise. Judge only rings carrying relief.
    const p2pAll = rings.map((r) => measureRing(r).p2p);
    const p2pMax = Math.max(...p2pAll);
    const stats = (corrs) => {
        const j = corrs.filter((c, h) => c !== null && p2pAll[h] >= p2pMax * 0.3);
        return { min: Math.min(...j), mean: j.reduce((s, v) => s + v, 0) / j.length, n: j.length };
    };
    const up = stats(corrFor(false));
    const down = stats(corrFor(true));
    const bestStat = up.mean >= down.mean ? up : down;
    // Pearson vs the continuous field is capped by the mesh's designed
    // column-quantum cross-section (sub-quantum slot widths differ), so this
    // is a coarse phase/angle-parity guard, not the cleanliness metric
    check(`${type} 43/40°: relief rings track the analytic field (min corr > 0.7, mean > 0.85)`,
        bestStat.min > 0.7 && bestStat.mean > 0.85,
        `min=${bestStat.min.toFixed(3)} mean=${bestStat.mean.toFixed(3)} over ${bestStat.n} rings`);

    // The cleanliness metric: every one of the `count` periods on a ring
    // renders identically (no moiré, no per-ridge width drift)
    const uniformity = rings
        .map((r) => periodicUniformity(r, 43))
        .filter((u, h) => u !== null && p2pAll[h] >= p2pMax * 0.3);
    const worstU = Math.max(...uniformity);
    check(`${type} 43/40°: all 43 periods identical on every relief ring (deviation < 4% of relief)`,
        worstU < 0.04, `worst=${(worstU * 100).toFixed(2)}% over ${uniformity.length} rings`);

    const p2ps = rings.map((r) => measureRing(r).p2p);
    const meanP2p = p2ps.reduce((s, v) => s + v, 0) / p2ps.length;
    check(`${type} 43/40°: relief present everywhere (min p2p > 35% of mean)`,
        Math.min(...p2ps) > meanP2p * 0.35,
        `min=${Math.min(...p2ps).toFixed(3)} mean=${meanP2p.toFixed(3)}`);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
