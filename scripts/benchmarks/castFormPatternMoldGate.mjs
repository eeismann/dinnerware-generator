/**
 * Release gate: patterned-vessel mold generation — performance + fidelity.
 *
 * Covers the three fidelity tiers:
 *   Tier 1 (analytic):  knurled mug generated in-process + pattern metadata
 *   Tier 2 (measured):  test-files/Pattern_mug.stl (horizontal ridges, 485k tris)
 *   Tier 3 (preset):    test-files/Angle_mug.stl (smooth) — no regression
 *
 * Run: node scripts/benchmarks/castFormPatternMoldGate.mjs
 */

import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const abs = (p) => path.join(ROOT, p);

const { MoldGenerator } = await import(abs('scripts/castForm/geometry/moldGenerator.js'));
const { DEFAULT_PARAMS } = await import(abs('scripts/castForm/state/castFormDefaults.js'));
const { validateGeometryForPrint } = await import(abs('scripts/geometry/meshQuality.js'));
const { stateManager, parameterResolver } = await import(abs('scripts/state/projectState.js'));
const { buildDinnerwareItemForCastForm } = await import(abs('scripts/castForm/geometry/dinnerwareImport.js'));

THREE.Mesh.prototype.raycast = acceleratedRaycast;

const correctnessOnly = process.argv.includes('--correctness-only');
let failures = 0;
function check(name, cond, extra = '') {
    if (correctnessOnly && / < \d+s$/.test(name)) return;
    console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
    if (!cond) failures++;
}

function loadSTL(file) {
    const buf = fs.readFileSync(abs(file));
    let geo = new STLLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    geo = mergeVertices(geo);
    geo.computeBoundingBox();
    const b = geo.boundingBox;
    const c = new THREE.Vector3();
    b.getCenter(c);
    geo.translate(-c.x, -b.min.y, -c.z);
    geo.computeBoundingBox();
    return geo;
}

function params() {
    return JSON.parse(JSON.stringify(DEFAULT_PARAMS));
}

/**
 * Ring probe. mode 'outward': rays from the axis outward (mold cavity —
 * first hit is the cavity surface). mode 'inward': rays from far outside
 * inward (vessel outer surface).
 */
function ringSignal(geometry, y, angles, mode) {
    if (!geometry.boundsTree) geometry.boundsTree = new MeshBVH(geometry);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    const ray = new THREE.Raycaster();
    ray.firstHitOnly = true;
    geometry.computeBoundingBox();
    const bb = geometry.boundingBox;
    const maxR = Math.max(bb.max.x, -bb.min.x, bb.max.z, -bb.min.z) * 2;

    return angles.map((angle) => {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        if (mode === 'outward') {
            ray.set(new THREE.Vector3(0, y, 0), new THREE.Vector3(cos, 0, sin));
        } else {
            ray.set(new THREE.Vector3(maxR * cos, y, maxR * sin), new THREE.Vector3(-cos, 0, -sin));
        }
        ray.far = maxR * 2;
        const hits = ray.intersectObject(mesh);
        return hits.length ? Math.hypot(hits[0].point.x, hits[0].point.z) : NaN;
    });
}

/**
 * Robust p2p (5..95 percentile) + hysteresis cycle count of a signal.
 * detrendWindow: moving-average detrend (samples) for signals with an
 * underlying trend (vertical columns follow the wall slope); 0 = mean-remove
 * only (rings on a surface of revolution have no angular trend).
 */
function measureRing(signal, detrendWindow = 0) {
    const n = signal.length;
    const valid = signal.filter(Number.isFinite);
    if (valid.length < n * 0.8) return { p2p: 0, cycles: 0 };
    let residual;
    if (detrendWindow > 0) {
        const half = Math.floor(detrendWindow / 2);
        residual = signal.map((v, i) => {
            if (!Number.isFinite(v)) return 0;
            let sum = 0;
            let count = 0;
            for (let d = -half; d <= half; d++) {
                const j = i + d;
                if (j < 0 || j >= n || !Number.isFinite(signal[j])) continue;
                sum += signal[j];
                count++;
            }
            return count > 0 ? v - sum / count : 0;
        });
    } else {
        const mean = valid.reduce((s, v) => s + v, 0) / valid.length;
        residual = signal.map((v) => (Number.isFinite(v) ? v - mean : 0));
    }
    const sorted = [...residual].sort((a, b) => a - b);
    const p2p = sorted[Math.floor(n * 0.95)] - sorted[Math.floor(n * 0.05)];
    const thr = Math.max(p2p * 0.15, 1e-6);
    let flips = 0;
    let sign = 0;
    for (const r of residual) {
        if (r > thr && sign <= 0) { if (sign < 0) flips++; sign = 1; }
        else if (r < -thr && sign >= 0) { if (sign > 0) flips++; sign = -1; }
    }
    return { p2p, cycles: flips / 2 };
}

/** Probe a wall mold's cavity across a 60° span centered inside its sector. */
function measureCavity(wall, y, samples = 512) {
    const probe = ringSignal(wall, y, Array.from({ length: 360 }, (_, i) => (i * Math.PI) / 180), 'outward');
    const hitIdx = probe.map((v, i) => (Number.isFinite(v) ? i : -1)).filter((i) => i >= 0);
    if (hitIdx.length < 60) return { p2p: 0, cycles: 0, angles: null };
    const mid = hitIdx[Math.floor(hitIdx.length / 2)];
    const start = ((mid - 30) * Math.PI) / 180;
    const angles = Array.from({ length: samples }, (_, i) => start + (i / samples) * (Math.PI / 3));
    return { ...measureRing(ringSignal(wall, y, angles, 'outward')), angles };
}

function moldIsManifold(result) {
    const parts = [result.foot, ...result.walls].filter(Boolean);
    return parts.every((g) => validateGeometryForPrint(g).valid);
}

// ── Tier 3: smooth vessel, perf + no regression ────────────────────────────

{
    const geo = loadSTL('test-files/Angle_mug.stl');
    const gen = new MoldGenerator();
    const t0 = performance.now();
    const result = gen.generate(geo, params(), { quality: 'preview' });
    const s = (performance.now() - t0) / 1000;
    check('smooth preview < 3s', s < 3, `${s.toFixed(2)}s`);
    check('smooth tier is preset', gen.getLastSamplingInfo().tier === 'preset');
    check('smooth mold parts manifold', moldIsManifold(result));
}

// ── Tier 2 perf: 485k-triangle patterned import ────────────────────────────

{
    const geo = loadSTL('test-files/Pattern_mug.stl');
    const gen = new MoldGenerator();
    let t0 = performance.now();
    gen.generate(geo, params(), { quality: 'preview' });
    const preview = (performance.now() - t0) / 1000;
    // Budget recalibrated when sharp-step ridge detection began raising the
    // preview row density (0.28mm rows for this sawtooth-ridged mug); the
    // guard still catches the pre-BVH ~4min pathology.
    check('Pattern_mug preview < 8s', preview < 8, `${preview.toFixed(2)}s (was ~4min pre-BVH)`);

    t0 = performance.now();
    const exportResult = gen.generate(geo, params(), { quality: 'export' });
    const exp = (performance.now() - t0) / 1000;
    check('Pattern_mug export < 30s', exp < 30, `${exp.toFixed(2)}s`);
    check('Pattern_mug tier is measured', gen.getLastSamplingInfo().tier === 'measured',
        gen.getLastSamplingInfo().tier);
    check('Pattern_mug mold parts manifold', moldIsManifold(exportResult));

    // Fidelity: the mold cavity must carry the vessel's horizontal ridges.
    // Vertical pattern -> compare a vertical radius column on vessel vs cavity.
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    const heights = Array.from({ length: 256 }, (_, i) =>
        bb.min.y + (bb.max.y - bb.min.y) * (0.25 + 0.5 * (i / 255)));
    // Angle inside wall 0's span
    const probe = ringSignal(exportResult.walls[0], (bb.max.y - bb.min.y) / 2,
        Array.from({ length: 360 }, (_, i) => (i * Math.PI) / 180), 'outward');
    const hitIdx = probe.map((v, i) => (Number.isFinite(v) ? i : -1)).filter((i) => i >= 0);
    const angle = (hitIdx[Math.floor(hitIdx.length / 2)] * Math.PI) / 180;

    // Detrend window ~3x the ridge period so the wall slope doesn't mask
    // the ridges (256 samples over 50mm, ~4.2mm pitch => ~21 samples/period)
    const columnOf = (g, mode) => measureRing(
        heights.map((y) => ringSignal(g, y, [angle], mode)[0]), 64);
    const vesselCol = columnOf(geo, 'inward');
    const cavityCol = columnOf(exportResult.walls[0], 'outward');
    check('Pattern_mug vessel column shows ridges (>= 6 cycles)',
        vesselCol.cycles >= 6, `${vesselCol.cycles}`);
    check('Pattern_mug cavity ridge count within 20% of vessel',
        Math.abs(cavityCol.cycles - vesselCol.cycles) <= vesselCol.cycles * 0.2,
        `vessel=${vesselCol.cycles} cavity=${cavityCol.cycles}`);
    check('Pattern_mug cavity relief >= 85% of vessel',
        cavityCol.p2p >= vesselCol.p2p * 0.85,
        `vessel=${vesselCol.p2p.toFixed(3)}mm cavity=${cavityCol.p2p.toFixed(3)}mm (${(cavityCol.p2p / vesselCol.p2p * 100).toFixed(0)}%)`);

    // Registration keys must stay smooth on patterned vessels: seam faces
    // anchor to a pattern-free curve, so the key bump/socket cannot inherit
    // the vessel's ridges. Metric: the key's radial centroid, measured per
    // height row across the key, must not drift with the ridge period.
    const seamKeyCentroidDrift = (wall, sideAngle, outward, keyY) => {
        const radialDir = { x: Math.cos(sideAngle), z: Math.sin(sideAngle) };
        const position = wall.getAttribute('position');

        // Face span at key height, excluding displaced key vertices
        let minRadial = Infinity;
        let maxRadial = -Infinity;
        for (let i = 0; i < position.count; i++) {
            const x = position.getX(i);
            const vy = position.getY(i);
            const z = position.getZ(i);
            if (Math.abs(vy - keyY) > 2) continue;
            if (Math.abs(x * outward.x + z * outward.z) > 0.2) continue;
            const radial = x * radialDir.x + z * radialDir.z;
            if (radial <= 1e-5) continue;
            minRadial = Math.min(minRadial, radial);
            maxRadial = Math.max(maxRadial, radial);
        }
        if (!Number.isFinite(minRadial) || maxRadial - minRadial < 8) return null;

        if (!wall.boundsTree) wall.boundsTree = new MeshBVH(wall);
        const mesh = new THREE.Mesh(wall, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
        const ray = new THREE.Raycaster();
        ray.firstHitOnly = true;

        // Scan only the key's neighborhood (center = inner + 0.62·span) and
        // accept only physically possible key displacements — rays near the
        // face's inner edge can slip past the patterned cavity edge into the
        // open cavity and register bogus multi-mm hits.
        const scanCenter = minRadial + (maxRadial - minRadial) * 0.62;
        const keyDepthCap = 5.5;
        const centroids = [];
        let maxDisplacement = 0;
        for (let yi = 0; yi <= 28; yi++) {
            const y = keyY - 3.5 + (yi / 28) * 7;
            let weightSum = 0;
            let weighted = 0;
            for (let r = scanCenter - 6.5; r <= scanCenter + 6.5; r += 0.25) {
                ray.set(
                    new THREE.Vector3(r * radialDir.x + outward.x * 6, y, r * radialDir.z + outward.z * 6),
                    new THREE.Vector3(-outward.x, 0, -outward.z)
                );
                ray.far = 12;
                const hits = ray.intersectObject(mesh);
                if (!hits.length) continue;
                const d = hits[0].point.x * outward.x + hits[0].point.z * outward.z;
                const magnitude = Math.abs(d);
                if (magnitude > keyDepthCap) continue;
                maxDisplacement = Math.max(maxDisplacement, magnitude);
                if (magnitude < 0.3) continue;
                weightSum += magnitude;
                weighted += magnitude * r;
            }
            if (weightSum > 2) centroids.push({ y, c: weighted / weightSum });
        }
        if (centroids.length < 12) return { drift: null, maxDisplacement };

        // Linear detrend: the key center legitimately follows the face's
        // smooth taper across the key height; ripple is what remains.
        const n = centroids.length;
        let sx = 0;
        let sy = 0;
        let sxx = 0;
        let sxy = 0;
        centroids.forEach(({ y, c }) => { sx += y; sy += c; sxx += y * y; sxy += y * c; });
        const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
        const intercept = (sy - slope * sx) / n;
        const residuals = centroids.map(({ y, c }) => c - (slope * y + intercept));
        const drift = Math.max(...residuals) - Math.min(...residuals);
        return { drift, maxDisplacement };
    };

    // Seam at angle 0: wall 2's END face carries the male key, wall 0's START
    // face the female socket (per-face roles, 3-wall mold).
    for (const fraction of [0.3, 0.7]) {
        const keyY = bb.min.y + (bb.max.y - bb.min.y) * fraction;
        const male = seamKeyCentroidDrift(
            exportResult.walls[2], Math.PI * 2, { x: 0, z: 1 }, keyY);
        const female = seamKeyCentroidDrift(
            exportResult.walls[0], 0, { x: 0, z: -1 }, keyY);
        for (const [role, probe] of [['male', male], ['female', female]]) {
            check(`Pattern_mug ${role} key present at ${fraction}h`,
                probe !== null && probe.maxDisplacement >= 2.75,
                probe ? `${probe.maxDisplacement.toFixed(2)}mm` : 'no face span');
            check(`Pattern_mug ${role} key smooth at ${fraction}h (detrended ripple < 0.2mm)`,
                probe?.drift !== null && probe?.drift !== undefined && probe.drift < 0.2,
                probe?.drift != null ? `${probe.drift.toFixed(3)}mm (pre-fix ~0.62mm)` : 'too few rows');
        }
    }
}

// ── Tier 1 vs Tier 2: knurled mug, analytic metadata ───────────────────────

{
    stateManager.setState('globalParameters.wallPatternType', 'knurl');
    stateManager.setState('globalParameters.wallPatternCount', 48);
    stateManager.setState('globalParameters.wallPatternDepth', 0.6);
    const projectState = JSON.parse(JSON.stringify(stateManager.getState()));
    const { geometry, patternMeta, errors } = buildDinnerwareItemForCastForm(projectState, 'mug');
    check('dinnerware import clean', errors.length === 0 && !!geometry, errors[0]);
    check('patternMeta derived', patternMeta?.surfaces?.[0]?.type === 'knurl');

    // Dinnerware authors the global count against the plate diameter, then
    // scales each item's count to preserve physical motif pitch across the
    // set (surfacePattern.getPatternParams). The default mug resolves the
    // reference count 48 to 15 periods. At this probe height the two crossing
    // knurl families produce two peaks per period. Check that independently
    // resolved count, then compare the cavity to rays against the actual source.
    const resolved = parameterResolver.getAllParameters('mug');
    const normalizedCount = Math.max(1, Math.round(
        resolved.wallPatternCount * resolved.dimensions.diameter / resolved.patternReferenceDiameter
    ));
    const wallMeta = patternMeta.surfaces.find((surface) => surface.region === 'wall');
    check('wall metadata count matches diameter-normalized reference count', wallMeta.count === normalizedCount,
        `reference=${resolved.wallPatternCount}, normalized=${normalizedCount}, metadata=${wallMeta.count}`);

    // A knurl ring's shape depends on height: the two helix families are
    // half a period out of phase (two equal peaks per period) only at some
    // heights. Probe at a fixed 49.5mm above the foot plane, where they are;
    // this is the height the gate has always measured (it used the bounding
    // box centre while the old base protruded 1mm below the foot ring).
    const midY = 49.5;

    // Vessel ground truth at mid-height (outside-in)
    const angles360 = Array.from({ length: 1024 }, (_, i) => (i / 1024) * Math.PI * 2);
    const vessel = measureRing(ringSignal(geometry, midY, angles360, 'inward'));
    check('vessel knurl ground truth: two peaks per normalized period',
        Math.round(vessel.cycles) === normalizedCount * 2, `${vessel.cycles} peaks / ${normalizedCount} periods`);

    // Tier 2 (no metadata)
    const gen2 = new MoldGenerator();
    const tier2 = gen2.generate(geometry, params(), { quality: 'export' });
    check('knurl without metadata -> measured tier', gen2.getLastSamplingInfo().tier === 'measured');
    const cav2 = measureCavity(tier2.walls[0], midY);

    // Tier 1 (metadata)
    const gen1 = new MoldGenerator();
    const t0 = performance.now();
    const tier1 = gen1.generate(geometry, params(), { quality: 'export', patternMeta });
    const s1 = (performance.now() - t0) / 1000;
    check('knurl with metadata -> analytic tier', gen1.getLastSamplingInfo().tier === 'analytic');
    check('analytic export < 10s', s1 < 10, `${s1.toFixed(2)}s`);
    check('analytic mold parts manifold', moldIsManifold(tier1));

    const cav1 = measureCavity(tier1.walls[0], midY);
    const sourceAtCav1 = measureRing(ringSignal(geometry, midY, cav1.angles, 'inward'));
    const sourceAtCav2 = measureRing(ringSignal(geometry, midY, cav2.angles, 'inward'));
    check('tier 1 cavity frequency matches source at the same angles', cav1.cycles === sourceAtCav1.cycles,
        `source=${sourceAtCav1.cycles}, cavity=${cav1.cycles}`);
    check('tier 2 cavity frequency matches source at the same angles', cav2.cycles === sourceAtCav2.cycles,
        `source=${sourceAtCav2.cycles}, cavity=${cav2.cycles}`);
    // Both tiers are anchored to the vessel. (Tier 1 used to also beat Tier 2
    // outright, but that relied on the vessel undersampling knurl apexes; the
    // pattern engine's commensurate grid now captures them exactly, so the
    // measured tier legitimately tracks the vessel above the analytic tier's
    // own height-row ceiling.)
    check('tier 1 relief >= 75% of tier 2 relief', cav1.p2p >= cav2.p2p * 0.75,
        `tier1=${cav1.p2p.toFixed(3)}mm tier2=${cav2.p2p.toFixed(3)}mm`);
    check('tier 2 relief >= 85% of vessel relief', cav2.p2p >= vessel.p2p * 0.85,
        `vessel=${vessel.p2p.toFixed(3)}mm tier2=${cav2.p2p.toFixed(3)}mm (${(cav2.p2p / vessel.p2p * 100).toFixed(0)}%)`);
    check('tier 1 relief >= 75% of vessel relief', cav1.p2p >= vessel.p2p * 0.75,
        `vessel=${vessel.p2p.toFixed(3)}mm tier1=${cav1.p2p.toFixed(3)}mm (${(cav1.p2p / vessel.p2p * 100).toFixed(0)}%)`);

    // Phase alignment: cavity radius must track vessel radius + clearance at
    // the same angles (the preview overlays the vessel inside the cavity)
    if (cav1.angles) {
        const vSig = ringSignal(geometry, midY, cav1.angles, 'inward');
        const cSig = ringSignal(tier1.walls[0], midY, cav1.angles, 'outward');
        let maxDev = 0;
        let n = 0;
        for (let i = 0; i < cav1.angles.length; i++) {
            if (!Number.isFinite(vSig[i]) || !Number.isFinite(cSig[i])) continue;
            maxDev = Math.max(maxDev, Math.abs(cSig[i] - vSig[i] - 0.1));
            n++;
        }
        check('tier 1 cavity phase-locked to vessel (max dev < 0.2mm)',
            n > 400 && maxDev < 0.2, `maxDev=${maxDev.toFixed(3)}mm over ${n} rays`);
    }
}

// ── Footring motif: formed by the wall molds' lower band ───────────────────

{
    stateManager.setState('globalParameters.wallPatternType', 'none');
    stateManager.setState('globalParameters.footringPatternType', 'vertical');
    stateManager.setState('globalParameters.footringPatternCount', 36);
    stateManager.setState('globalParameters.footringPatternDepth', 0.5);
    const projectState = JSON.parse(JSON.stringify(stateManager.getState()));
    const { geometry, patternMeta } = buildDinnerwareItemForCastForm(projectState, 'mug');

    // Vessel ground truth at footring mid-height (y=5)
    const angles360 = Array.from({ length: 1024 }, (_, i) => (i / 1024) * Math.PI * 2);
    const vessel = measureRing(ringSignal(geometry, 5, angles360, 'inward'));
    check('footring vessel ground truth: 36 ridges', Math.round(vessel.cycles) === 36, `${vessel.cycles}`);

    // Tier 2 preview (STL-import path, no metadata): detector must find the
    // footring band pattern and raise density
    const gen2 = new MoldGenerator();
    const tier2 = gen2.generate(geometry, params(), { quality: 'preview' });
    check('footring-only, no metadata -> measured tier', gen2.getLastSamplingInfo().tier === 'measured',
        gen2.getLastSamplingInfo().tier);
    const cav2 = measureCavity(tier2.walls[0], 5);
    check('tier 2 preview footring cavity: 6 cycles per 60°', cav2.cycles === 6, `${cav2.cycles}`);
    check('tier 2 preview footring relief >= 85% of vessel', cav2.p2p >= vessel.p2p * 0.85,
        `vessel=${vessel.p2p.toFixed(3)}mm cavity=${cav2.p2p.toFixed(3)}mm (${(cav2.p2p / vessel.p2p * 100).toFixed(0)}%)`);

    // Tier 1 export with a FINER footring (60) under a wall knurl (reference 48):
    // grid must stay an exact wall multiple while covering the footring
    stateManager.setState('globalParameters.wallPatternType', 'knurl');
    stateManager.setState('globalParameters.wallPatternCount', 48);
    stateManager.setState('globalParameters.wallPatternDepth', 0.6);
    stateManager.setState('globalParameters.footringPatternCount', 60);
    const mixed = buildDinnerwareItemForCastForm(
        JSON.parse(JSON.stringify(stateManager.getState())), 'mug');
    const gen1 = new MoldGenerator();
    const tier1 = gen1.generate(mixed.geometry, params(), { quality: 'export', patternMeta: mixed.patternMeta });
    const info1 = gen1.getLastSamplingInfo();
    const mixedWallCount = mixed.patternMeta.surfaces.find((surface) => surface.region === 'wall').count;
    check('mixed analytic grid is exact normalized wall multiple', info1.angleSamples % mixedWallCount === 0,
        `${info1.angleSamples} samples / ${mixedWallCount} periods`);
    check('mixed analytic grid covers footring Nyquist', info1.angleSamples >= 60 * 8, `${info1.angleSamples}`);
    const footCav = measureCavity(tier1.walls[0], 5);
    check('mixed: footring band 10 cycles per 60°', footCav.cycles === 10, `${footCav.cycles}`);
    mixed.geometry.computeBoundingBox();
    const wallProbeY = mixed.geometry.boundingBox.max.y / 2;
    const wallCav = measureCavity(tier1.walls[0], wallProbeY);
    const wallSource = measureRing(ringSignal(mixed.geometry, wallProbeY, wallCav.angles, 'inward'));
    check('mixed: wall band frequency matches source at the same angles', wallCav.cycles === wallSource.cycles,
        `source=${wallSource.cycles}, cavity=${wallCav.cycles}`);
    check('mixed mold parts manifold', moldIsManifold(tier1));
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
