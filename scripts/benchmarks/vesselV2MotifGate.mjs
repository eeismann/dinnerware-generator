/**
 * Regression gate: Vessel V2 per-segment surface motifs must produce watertight,
 * manifold geometry that passes the strict STL validator.
 *
 * Runs headless (no WebGL) — exercises only geometry generation + validation.
 *   node scripts/benchmarks/vesselV2MotifGate.mjs
 */

import { getDefaultVesselV2State } from '../vesselV2/state/vesselV2Defaults.js';
import { VesselV2MeshGenerator } from '../vesselV2/geometry/vesselV2MeshGenerator.js';
import { groupToMergedGeometry, validateGeometryForSTL } from '../geometry/stlCore.js';

function withMotif(state, ownerId, motif) {
    const next = JSON.parse(JSON.stringify(state));
    const point = next.profile.points.find((p) => p.id === ownerId);
    if (point) point.motif = { ...point.motif, ...motif };
    return next;
}

function run(label, state) {
    const group = new VesselV2MeshGenerator(state).generate();
    const merged = groupToMergedGeometry(group);
    const result = validateGeometryForSTL(merged, { enforceOrientationConsistency: false });
    merged.dispose();

    const status = result.valid ? 'PASS' : 'FAIL';
    const detail = `tris=${result.triangleCount} boundaryEdges=${result.details.boundaryEdges} overConnected=${result.details.overConnectedEdges} degenerate=${result.details.degenerateCount}`;
    console.log(`[${status}] ${label} — ${detail}`);
    if (!result.valid) console.log(`        errors: ${result.warnings.join('; ')}`);
    return result.valid;
}

const base = getDefaultVesselV2State();

const cases = [
    ['smooth baseline (no motifs)', base],
    ['vertical flutes on body (p2)', withMotif(base, 'p2', { type: 'vertical', count: 28, depth: 0.5 })],
    ['horizontal rings on neck (p3)', withMotif(base, 'p3', { type: 'horizontal', pitch: 5, depth: 0.45 })],
    ['knurl on body (p2)', withMotif(base, 'p2', { type: 'knurl', count: 40, angle: 30, depth: 0.6 })],
    ['crosshatch on body (p2)', withMotif(base, 'p2', { type: 'crosshatch', count: 24, angle: 45, depth: 0.4 })],
    ['diagonal recessed on body (p2)', withMotif(base, 'p2', { type: 'diagonal', count: 30, depth: 0.5, relief: 'recessed', direction: 'left' })],
    ['multiple segments patterned', withMotif(withMotif(base, 'p2', { type: 'vertical', count: 32, depth: 0.5 }), 'p3', { type: 'knurl', count: 36, angle: 30, depth: 0.5 })]
];

let allPass = true;
for (const [label, state] of cases) {
    try {
        allPass = run(label, state) && allPass;
    } catch (err) {
        allPass = false;
        console.log(`[ERROR] ${label} — ${err.message}`);
    }
}

console.log(allPass ? '\nGATE PASSED ✓' : '\nGATE FAILED ✗');
process.exit(allPass ? 0 : 1);
