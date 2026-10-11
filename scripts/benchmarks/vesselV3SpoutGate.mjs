/**
 * Regression gate: Vessel V3's spout graft must produce watertight, manifold
 * geometry that passes the strict STL validator, at both a typical spout
 * configuration and edge-case parameters (wide angular window, targeting a
 * mid-body segment so the graft's ring is shared with the next run up).
 * Also confirms disabling the spout reproduces the pre-Phase-2 baseline
 * vertex count exactly (zero geometry change when spout.enabled is false).
 *
 * Runs headless (no WebGL) — exercises only geometry generation + validation.
 *   node scripts/benchmarks/vesselV3SpoutGate.mjs
 */

import { getDefaultVesselV3State } from '../vesselV3/state/vesselV3Defaults.js';
import { VesselV3MeshGenerator } from '../vesselV3/geometry/vesselV3MeshGenerator.js';
import { groupToMergedGeometry, validateGeometryForSTL } from '../geometry/stlCore.js';

function withSpout(state, patch) {
    const next = JSON.parse(JSON.stringify(state));
    next.spout = { ...next.spout, ...patch };
    return next;
}

function build(state) {
    return new VesselV3MeshGenerator(state).generate();
}

function vertexCount(group) {
    let count = 0;
    group.traverse((child) => {
        if (child.isMesh && child.geometry) {
            count += child.geometry.getAttribute('position').count;
        }
    });
    return count;
}

function run(label, state) {
    const group = build(state);
    const merged = groupToMergedGeometry(group);
    const result = validateGeometryForSTL(merged, { enforceOrientationConsistency: false });
    merged.dispose();

    const status = result.valid ? 'PASS' : 'FAIL';
    const detail = `tris=${result.triangleCount} boundaryEdges=${result.details.boundaryEdges} overConnected=${result.details.overConnectedEdges} degenerate=${result.details.degenerateCount}`;
    console.log(`[${status}] ${label} — ${detail}`);
    if (!result.valid) console.log(`        errors: ${result.warnings.join('; ')}`);
    return result.valid;
}

const base = getDefaultVesselV3State();

let allPass = true;

// 1. Baseline: spout disabled must match the pre-Phase-2 vertex count exactly.
const baselineGroup = build(base);
const baselineVerts = vertexCount(baselineGroup);
allPass = run('smooth baseline (spout disabled)', base) && allPass;

const disabledExplicitly = withSpout(base, { enabled: false, segmentId: 'p3', length: 18, drop: 6 });
const disabledGroup = build(disabledExplicitly);
const disabledVerts = vertexCount(disabledGroup);
if (disabledVerts !== baselineVerts) {
    allPass = false;
    console.log(`[FAIL] disabled spout must reproduce baseline vertex count — baseline=${baselineVerts} got=${disabledVerts}`);
} else {
    console.log(`[PASS] disabled spout reproduces baseline vertex count (${baselineVerts})`);
}

// 2. Typical spout on the rim segment (p3), angle 0 / width 30 / length 18 / drop 6.
allPass = run(
    'spout on rim (p3) angle=0 width=30 length=18 drop=6',
    withSpout(base, { enabled: true, segmentId: 'p3', angle: 0, width: 30, length: 18, drop: 6 })
) && allPass;

// 3. Mid-body segment (p2): the graft's target ring is a boundary shared
//    with the next run up (p3's run) — exercises applySpoutToRuns()'s
//    duplicate-ring propagation, the case most likely to leave a seam.
allPass = run(
    'spout on mid-body (p2) angle=90 width=30 length=18 drop=6',
    withSpout(base, { enabled: true, segmentId: 'p2', angle: 90, width: 30, length: 18, drop: 6 })
) && allPass;

// 4. Edge case: wide angular window + long projection/drop.
allPass = run(
    'spout edge case: width=110 length=40 drop=10',
    withSpout(base, { enabled: true, segmentId: 'p3', angle: 180, width: 110, length: 40, drop: 10 })
) && allPass;

// 5. Fallback: segmentId unset should target the topmost (rim) run.
allPass = run(
    'spout with no segmentId (fallback to rim)',
    withSpout(base, { enabled: true, segmentId: null, angle: 45, width: 30, length: 18, drop: 6 })
) && allPass;

console.log(allPass ? '\nGATE PASSED ✓' : '\nGATE FAILED ✗');
process.exit(allPass ? 0 : 1);
