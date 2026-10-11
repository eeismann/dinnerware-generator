/**
 * Regression gate: Vessel V3's lid (Phase 3) must build as an INDEPENDENT
 * manifold/watertight body — never merged into the vessel mesh — for both
 * fit modes (`inset`, `overcap`) across a couple of parameter combinations,
 * and its skirt-to-neck fit math must match the intended design:
 *   - inset: skirt outer radius < neck inner radius, by ~clearance
 *   - overcap: skirt inner radius > neck outer radius, by ~clearance
 *
 * Runs headless (no WebGL) — exercises only geometry generation + validation.
 *   node scripts/benchmarks/vesselV3LidGate.mjs
 */

import { getDefaultVesselV3State } from '../vesselV3/state/vesselV3Defaults.js';
import { VesselV3MeshGenerator } from '../vesselV3/geometry/vesselV3MeshGenerator.js';
import {
    deriveVesselNeckContext,
    buildLidGeometry,
    computeLidFitContext
} from '../vesselV3/geometry/lidGenerator.js';
import { groupToMergedGeometry, validateGeometryForSTL } from '../geometry/stlCore.js';

function withLid(state, patch) {
    const next = JSON.parse(JSON.stringify(state));
    next.lid = { ...next.lid, ...patch, knob: { ...next.lid.knob, ...(patch.knob || {}) } };
    return next;
}

function runManifoldCheck(label, group) {
    const merged = groupToMergedGeometry(group);
    const result = validateGeometryForSTL(merged, { enforceOrientationConsistency: false });
    merged.dispose();

    const status = result.valid ? 'PASS' : 'FAIL';
    const detail = `tris=${result.triangleCount} boundaryEdges=${result.details.boundaryEdges} overConnected=${result.details.overConnectedEdges} degenerate=${result.details.degenerateCount}`;
    console.log(`[${status}] ${label} — ${detail}`);
    if (!result.valid) console.log(`        errors: ${result.warnings.join('; ')}`);
    return result.valid;
}

function approxLessThan(a, b, tolerance) {
    return a < b + tolerance;
}

function approxGreaterThan(a, b, tolerance) {
    return a > b - tolerance;
}

const base = getDefaultVesselV3State();
let allPass = true;

// 0. Sanity: vessel body itself must still be watertight (lid never touches it).
const vesselGroup = new VesselV3MeshGenerator(base).generate();
allPass = runManifoldCheck('vessel body baseline (lid disabled entirely)', vesselGroup) && allPass;

const neckContext = deriveVesselNeckContext(base);
if (!neckContext) {
    console.log('[FAIL] could not derive vessel neck context from the default profile');
    process.exit(1);
}
console.log(`neck context: outerR=${neckContext.neckOuterRadius.toFixed(2)} innerR=${neckContext.neckInnerRadius.toFixed(2)} rimHeight=${neckContext.rimHeight.toFixed(2)}`);

const cases = [
    ['inset, default params', withLid(base, { enabled: true, fit: 'inset', domeHeight: 20, wallThickness: 2.4, clearance: 0.4, flangeDepth: 8, knob: { style: 'ball', height: 10, width: 12 } })],
    ['inset, tight clearance + flat knob', withLid(base, { enabled: true, fit: 'inset', domeHeight: 14, wallThickness: 1.8, clearance: 0.15, flangeDepth: 4, knob: { style: 'flat', height: 6, width: 20 } })],
    ['inset, deep dome + loop knob', withLid(base, { enabled: true, fit: 'inset', domeHeight: 38, wallThickness: 3, clearance: 0.6, flangeDepth: 16, knob: { style: 'loop', height: 22, width: 10 } })],
    ['overcap, default params', withLid(base, { enabled: true, fit: 'overcap', domeHeight: 20, wallThickness: 2.4, clearance: 0.4, flangeDepth: 8, knob: { style: 'ball', height: 10, width: 12 } })],
    ['overcap, tight clearance + flat knob', withLid(base, { enabled: true, fit: 'overcap', domeHeight: 16, wallThickness: 2, clearance: 0.2, flangeDepth: 6, knob: { style: 'flat', height: 8, width: 18 } })],
    ['overcap, deep dome + loop knob', withLid(base, { enabled: true, fit: 'overcap', domeHeight: 36, wallThickness: 3.2, clearance: 0.5, flangeDepth: 14, knob: { style: 'loop', height: 20, width: 12 } })]
];

cases.forEach(([label, state]) => {
    const lidGroup = buildLidGeometry(neckContext, state.lid);
    if (!lidGroup) {
        allPass = false;
        console.log(`[FAIL] ${label} — buildLidGeometry() returned null`);
        return;
    }

    allPass = runManifoldCheck(`lid manifold — ${label}`, lidGroup) && allPass;

    const fitContext = computeLidFitContext(neckContext, state.lid);
    const tolerance = 0.05;

    if (state.lid.fit === 'inset') {
        // skirt outer radius < neck inner radius, by ~clearance
        const skirtOuterR = neckContext.neckInnerRadius - fitContext.actualClearance;
        const ok =
            approxLessThan(skirtOuterR, neckContext.neckInnerRadius, tolerance) &&
            Math.abs(fitContext.actualClearance - fitContext.requestedClearance) < tolerance;
        console.log(
            `${ok ? '[PASS]' : '[FAIL]'} ${label} — inset fit math: skirtOuterR=${skirtOuterR.toFixed(2)} neckInnerR=${neckContext.neckInnerRadius.toFixed(2)} actualClearance=${fitContext.actualClearance.toFixed(2)} requestedClearance=${fitContext.requestedClearance.toFixed(2)}`
        );
        allPass = ok && allPass;
    } else {
        // skirt inner radius > neck outer radius, by ~clearance
        const skirtInnerR = neckContext.neckOuterRadius + fitContext.actualClearance;
        const ok =
            approxGreaterThan(skirtInnerR, neckContext.neckOuterRadius, tolerance) &&
            Math.abs(fitContext.actualClearance - fitContext.requestedClearance) < tolerance;
        console.log(
            `${ok ? '[PASS]' : '[FAIL]'} ${label} — overcap fit math: skirtInnerR=${skirtInnerR.toFixed(2)} neckOuterR=${neckContext.neckOuterRadius.toFixed(2)} actualClearance=${fitContext.actualClearance.toFixed(2)} requestedClearance=${fitContext.requestedClearance.toFixed(2)}`
        );
        allPass = ok && allPass;
    }
});

// Disabled lid must not add anything for the app's own updateLid() path —
// covered at the app-wiring level, not here (this gate is geometry-only).

console.log(allPass ? '\nGATE PASSED ✓' : '\nGATE FAILED ✗');
process.exit(allPass ? 0 : 1);
