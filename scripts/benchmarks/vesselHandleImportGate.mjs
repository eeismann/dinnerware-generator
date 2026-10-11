/** Source-mesh-to-handle contact parity, without browser storage or WebGL. */
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { getDefaultVesselV2State } from '../vesselV2/state/vesselV2Defaults.js';
import { getDefaultVesselV3State } from '../vesselV3/state/vesselV3Defaults.js';
import { VesselV2MeshGenerator } from '../vesselV2/geometry/vesselV2MeshGenerator.js';
import { VesselV3MeshGenerator } from '../vesselV3/geometry/vesselV3MeshGenerator.js';
import { compileVesselContactProfile, getOuterContactRadius, VESSEL_CONTACT_POLICY } from '../handle/geometry/vesselContactProfile.js';
import { getMugRadiusAtHeight, generateHandlePath } from '../handle/geometry/handlePathGenerator.js';
import { DEFAULT_HANDLE_PARAMS, handleStateManager } from '../handle/state/handleState.js';
import { importVesselFromProject, importMugFromProject, getVesselV3Projects } from '../handle/ui/mugImporter.js';

const fixture = (version, mode = 'bezier') => {
    const state = version === 3 ? getDefaultVesselV3State() : getDefaultVesselV2State();
    state.appType = `vessel-v${version}`;
    state.profile.mode = mode;
    if (mode === 'straight-rounded') state.profile.points.forEach((point) => { point.cornerRadius = 12; });
    return state;
};

const cases = [
    ['V2 Bezier', fixture(2)], ['V3 Bezier', fixture(3)],
    ['V2 rounded', fixture(2, 'straight-rounded')], ['V3 rounded', fixture(3, 'straight-rounded')]
];
const folded = fixture(3);
folded.profile.allowFooterOverlap = true;
folded.profile.points = [[0, 0], [34, 0], [50, 50], [30, 25], [60, 80], [38, 138]]
    .map(([r, h], i) => ({ id: `p${i}`, r, h, inHandle: null, outHandle: null }));
cases.push(['V3 folded profile', folded]);

for (const [label, state] of cases) {
    const { radiusProfile, policy } = compileVesselContactProfile(state);
    const mugData = { loaded: true, height: 138, radiusProfile, radiusProfilePolicy: policy };
    const Generator = state.appType === 'vessel-v3' ? VesselV3MeshGenerator : VesselV2MeshGenerator;
    const source = new Generator(state).generate();
    source.updateMatrixWorld(true);
    const outer = source.getObjectByName('outer');
    let maxError = 0;
    for (const height of [15, 30, 43, 69, 95, 110, 125]) {
        const ray = new THREE.Raycaster(new THREE.Vector3(0, height, 2000), new THREE.Vector3(0, 0, -1));
        const hit = ray.intersectObject(outer)[0];
        assert.ok(hit, `${label}: source exterior ray hits at h=${height}`);
        const radius = getMugRadiusAtHeight(mugData, height);
        maxError = Math.max(maxError, Math.abs(radius - hit.point.z));
        assert.ok(Math.abs(radius - hit.point.z) < 0.005, `${label}: contact matches source at h=${height}`);
    }
    const path = generateHandlePath({ ...DEFAULT_HANDLE_PARAMS, bottomAttachmentHeight: 30, topAttachmentHeight: 110 }, mugData);
    assert.ok(Math.abs(path.getPoint(0).x - getMugRadiusAtHeight(mugData, 30)) < 1e-6);
    assert.ok(Math.abs(path.getPoint(1).x - getMugRadiusAtHeight(mugData, 110)) < 1e-6);
    source.traverse((child) => child.geometry?.dispose());
    console.log(`[PASS] ${label}: compiled import and handle endpoint/source-mesh parity; max error ${maxError.toFixed(6)} mm`);
}

assert.equal(getOuterContactRadius([{ y: 0, radius: 40 }, { y: 40, radius: 40 }, { y: 40, radius: 60 }, { y: 100, radius: 60 }], 40), 60);
assert.equal(getOuterContactRadius([{ y: 0, radius: 40 }, { y: 40, radius: 40 }, { y: 40, radius: 60 }, { y: 100, radius: 60 }], 39), 40);

const unsupportedSpout = fixture(3);
unsupportedSpout.id = 'spout';
unsupportedSpout.spout.enabled = true;
assert.throws(() => compileVesselContactProfile(unsupportedSpout), /does not yet support spouts/);
const unsupportedMotif = fixture(3);
unsupportedMotif.id = 'motif';
unsupportedMotif.profile.points[2].motif.type = 'knurl';
assert.throws(() => compileVesselContactProfile(unsupportedMotif), /does not yet support surface motifs/);
const invalid = fixture(3);
invalid.profile.points[1].r = NaN;
assert.throws(() => compileVesselContactProfile(invalid), /non-numeric/);

const valid = fixture(3);
valid.id = 'valid';
const store = new Map([
    ['playground_ceramics_vessel_v3_projects', JSON.stringify([unsupportedSpout, unsupportedMotif, valid])],
    ['playground_ceramics_projects', JSON.stringify([{ id: 'mug', name: 'Mug', state: { globalParameters: {} } }])]
]);
globalThis.localStorage = { getItem: (key) => store.get(key) || null };
const meta = getVesselV3Projects();
assert.equal(meta.length, 3, 'Unsupported sources remain visible with reasons');
assert.match(meta.find((project) => project.id === 'spout').incompatibilityReason, /spouts/);
assert.match(meta.find((project) => project.id === 'motif').incompatibilityReason, /motifs/);
const imported = importVesselFromProject('vessel-v3', 'valid');
assert.equal(imported.radiusProfilePolicy, VESSEL_CONTACT_POLICY);
assert.ok(imported.radiusProfile.length > valid.profile.points.length);
const beforeRefusal = JSON.stringify(handleStateManager.getState());
const errorLog = console.error;
try {
    console.error = () => {};
    assert.equal(importVesselFromProject('vessel-v3', 'spout'), null);
} finally { console.error = errorLog; }
assert.equal(JSON.stringify(handleStateManager.getState()), beforeRefusal, 'Unsupported import must not alter the current handle');
assert.ok(importMugFromProject('mug'));
assert.equal(handleStateManager.getState().mugData.radiusProfile, null, 'Switching to a mug clears prior vessel contact geometry');
assert.equal(handleStateManager.getState().mugData.radiusProfilePolicy, null);
console.log('[PASS] Horizontal ledge, incompatible source reasons, failed-import preservation, and vessel-to-mug reset');
console.log('GATE PASSED');
