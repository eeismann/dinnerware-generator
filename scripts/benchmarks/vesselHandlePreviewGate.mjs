/** Real scene/application methods, stubbed DOM/rendering only; no GPU required. */
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import * as THREE from 'three';
import { getDefaultVesselV2State } from '../vesselV2/state/vesselV2Defaults.js';
import { getDefaultVesselV3State } from '../vesselV3/state/vesselV3Defaults.js';
import { VesselV2MeshGenerator } from '../vesselV2/geometry/vesselV2MeshGenerator.js';
import { VesselV3MeshGenerator } from '../vesselV3/geometry/vesselV3MeshGenerator.js';
import { DEFAULT_HANDLE_PARAMS, handleStateManager } from '../handle/state/handleState.js';
import { generateHandleMoldPackage, disposeHandleMoldPackage } from '../handle/mold/handleMoldGenerator.js';
import { compileVesselContactProfile } from '../handle/geometry/vesselContactProfile.js';

const elements = new Map();
for (const id of ['moldProofSize', 'moldFormerSize', 'moldWallSize', 'moldBottomSize', 'moldPlasterEstimate', 'moldFitStatus']) {
    elements.set(id, { textContent: '', classList: { add() {}, remove() {}, toggle() {} } });
}
globalThis.localStorage = { getItem() { return null; } };
globalThis.window = { location: { pathname: '/vessel-v3-generator/' } };
globalThis.document = {
    documentElement: { setAttribute() {}, style: { setProperty() {} } },
    addEventListener() {},
    getElementById(id) { return elements.get(id) || null; }
};
const { VesselViewport } = await import('../vessel/ui/vesselViewport.js');
const { default: VesselV3App } = await import('../vesselV3/vesselV3Main.js');
const { HandleViewport } = await import('../handle/ui/handleViewport.js');
const { updateMoldKitSummary } = await import('../handle/handleMain.js');

function makeVesselViewport(state, MeshGenerator) {
    return Object.assign(Object.create(VesselViewport.prototype), {
        vesselGroup: new THREE.Group(), scene: new THREE.Scene(), secondaryObjects: new Map(),
        MeshGenerator, state, vesselMaterial: new THREE.MeshBasicMaterial(), vesselMaterialClipped: new THREE.MeshBasicMaterial(),
        showCrossSection: false, updateClippingPlanePosition() {}, getBoundingBox() { return null; }, requestRender() {}
    });
}

for (const [state, Generator] of [[getDefaultVesselV2State(), VesselV2MeshGenerator], [getDefaultVesselV3State(), VesselV3MeshGenerator]]) {
    const viewport = makeVesselViewport(state, Generator);
    viewport.updateVessel();
    assert.deepEqual(viewport.vesselGroup.children.map((child) => child.name), ['outer', 'inner', 'rim']);
    const disposals = new Map();
    viewport.vesselGroup.children.forEach((mesh) => {
        disposals.set(mesh.name, 0);
        mesh.geometry.addEventListener('dispose', () => disposals.set(mesh.name, disposals.get(mesh.name) + 1));
    });
    viewport.showCrossSection = true;
    viewport.updateVessel();
    assert.deepEqual([...disposals.values()], [1, 1, 1], 'Replaced geometry is disposed exactly once');
    assert.ok(viewport.vesselGroup.children.every((mesh) => mesh.material === viewport.vesselMaterialClipped));
    viewport.disposeObject(viewport.vesselGroup, { disposeMaterial: false });
    viewport.vesselMaterial.dispose(); viewport.vesselMaterialClipped.dispose();
}
console.log('[PASS] Shared vessel preview keeps all surfaces, applies clipped material, and disposes replaced geometry');

const state = getDefaultVesselV3State();
state.lid.enabled = true;
let bodyBuilds = 0;
class CountingVesselGenerator extends VesselV3MeshGenerator {
    generate() { bodyBuilds++; return super.generate(); }
}
const viewport = makeVesselViewport(state, CountingVesselGenerator);
const app = Object.assign(Object.create(VesselV3App.prototype), {
    viewport, viewportUpdateDelayMs: 5, pendingViewportUpdate: null
});
let lidBuilds = 0;
app.updateLid = function (nextState) { lidBuilds++; return VesselV3App.prototype.updateLid.call(this, nextState); };
app.scheduleViewportUpdate(state, true);
assert.deepEqual([bodyBuilds, lidBuilds], [1, 1]);
const initialBody = viewport.vesselGroup.children[0].geometry;
const initialLid = viewport.getSecondaryMesh('lid');
assert.equal(initialLid.position.y + state.lid.flangeDepth, initialLid.userData.neckContext.rimHeight, 'Inset seat rests on vessel rim');
state.ui.lidPreviewMode = 'standalone';
app.scheduleViewportUpdate(state, true, ['ui.lidPreviewMode']);
assert.deepEqual([bodyBuilds, lidBuilds], [1, 1], 'View-only change performs zero geometry builds');
assert.equal(viewport.getSecondaryMesh('lid'), initialLid);
assert.equal(initialLid.position.y, 0);
state.lid.domeHeight += 1;
app.scheduleViewportUpdate(state, true, ['lid.domeHeight']);
assert.deepEqual([bodyBuilds, lidBuilds], [1, 2], 'Lid geometry change skips body generation');
assert.equal(viewport.vesselGroup.children[0].geometry, initialBody);
state.spout.enabled = true;
app.scheduleViewportUpdate(state, true, ['spout']);
assert.deepEqual([bodyBuilds, lidBuilds], [2, 2], 'Spout change skips independent lid generation');
assert.equal(app.shouldRegenerate(['global.snapSize']), false);
assert.equal(app.shouldRegenerate(['ui.selectedPointId']), false);
app.scheduleViewportUpdate(state, false, ['profile.points']);
const replacement = structuredClone(state);
replacement.lid.domeHeight = 25;
app.scheduleViewportUpdate(replacement, false, ['lid.domeHeight']);
await new Promise((resolve) => setTimeout(resolve, 30));
assert.deepEqual([bodyBuilds, lidBuilds], [3, 3], 'Coalesced edits retain both body and lid invalidations');
assert.equal(viewport.state, replacement, 'Coalesced update uses latest state object');
replacement.lid.enabled = false;
app.scheduleViewportUpdate(replacement, true, ['lid.enabled']);
assert.equal(viewport.getSecondaryMesh('lid'), null);
assert.equal(bodyBuilds, 3);
viewport.disposeObject(viewport.vesselGroup, { disposeMaterial: false });
app._lidGhostMaterial?.dispose(); app._lidSolidMaterial?.dispose();
console.log('[PASS] V3 invalidation counts: lid-only = 0 body builds; view-only = 0 builds; batched edits retain dependencies');

const mug = { loaded: true, height: 100, topDiameter: 90, bottomDiameter: 65, wallThickness: 2.5, wallAngle: 7 };
const material = new THREE.MeshBasicMaterial();
const lineMaterial = new THREE.LineBasicMaterial();
const handleViewport = Object.assign(Object.create(HandleViewport.prototype), {
    webglAvailable: true, scene: new THREE.Scene(), showMoldPreview: true,
    moldGroup: null, handleMesh: null, mugMesh: null, attachmentZones: null,
    moldMaterials: {}, moldLineMaterials: { handleMold: lineMaterial }, handleMaterial: material,
    moldConstructionView: {}, requestRender() {}, frameMoldPreview() {}, createMoldContactPlane() { return null; }
});
let moldBuilds = 0;
const oldPartDisposals = new Map();
handleViewport.generateMoldPackage = (params, source) => {
    moldBuilds++;
    const pkg = generateHandleMoldPackage(params, source);
    if (moldBuilds === 1) Object.entries(pkg.parts).forEach(([name, geometry]) => {
        oldPartDisposals.set(name, 0);
        geometry.addEventListener('dispose', () => oldPartDisposals.set(name, oldPartDisposals.get(name) + 1));
    });
    return pkg;
};
handleStateManager.setViewSetting('showMoldPreview', true);
handleViewport.updateHandle(DEFAULT_HANDLE_PARAMS, mug, { preview: true });
updateMoldKitSummary(handleViewport);
assert.equal(moldBuilds, 1, 'One package supplies both preview and summary');
assert.match(elements.get('moldProofSize').textContent, /mm$/);
assert.equal(elements.get('moldPlasterEstimate').textContent, `${handleViewport.getMoldSummary().plasterVolumeL.toFixed(2)} L`);
handleViewport.updateHandle(DEFAULT_HANDLE_PARAMS, mug, { preview: false });
updateMoldKitSummary(handleViewport);
assert.equal(moldBuilds, 1, 'Release/final-quality pass reuses identical mold geometry');
handleViewport.updateHandle({ ...DEFAULT_HANDLE_PARAMS, handleProtrusion: 36 }, mug);
updateMoldKitSummary(handleViewport);
assert.equal(moldBuilds, 2, 'Changed dimensions invalidate the package');
assert.ok([...oldPartDisposals.values()].every((count) => count === 1), 'Transferred/discarded package geometries dispose once');
handleViewport.disposeObject(handleViewport.moldGroup, { disposeMaterial: false });
handleViewport.moldGroup = null;

// Equal top/bottom dimensions with a changed intermediate profile must redraw.
handleViewport.showMoldPreview = false;
handleViewport.mugDisplayMode = 'solid';
handleViewport.mugMaterials = { solid: material };
handleViewport.camera = new THREE.PerspectiveCamera(45, 1.2, 0.1, 1000);
handleViewport.camera.position.set(150, 80, 0);
handleViewport.controls = {
    target: new THREE.Vector3(50, 50, 0),
    update() { handleViewport.camera.lookAt(this.target); handleViewport.camera.updateMatrixWorld(true); }
};
const contact = compileVesselContactProfile(getDefaultVesselV3State(), 'vessel-v3');
const importedMug = { ...mug, radiusProfile: contact.radiusProfile };
handleViewport.updateMug(importedMug);
const firstMugGeometry = handleViewport.mugMesh.geometry;
assert.equal(firstMugGeometry.type, 'LatheGeometry');
const positions = firstMugGeometry.getAttribute('position');
for (let i = 0; i < positions.count; i++) {
    const screen = new THREE.Vector3().fromBufferAttribute(positions, i).project(handleViewport.camera);
    assert.ok(Math.abs(screen.x) <= 1 && Math.abs(screen.y) <= 1, 'Imported source fits in the camera frame');
}
handleViewport.camera.position.x += 10;
const userCameraPosition = handleViewport.camera.position.clone();
handleViewport.updateMug(importedMug, { force: true });
assert.deepEqual(handleViewport.camera.position, userCameraPosition, 'Same-source redraw preserves the user camera');
const changedProfile = structuredClone(importedMug);
changedProfile.radiusProfile[10].radius += 2;
handleViewport.updateMug(changedProfile);
assert.notEqual(handleViewport.mugMesh.geometry, firstMugGeometry);
handleViewport.mugMesh.geometry.dispose(); material.dispose(); lineMaterial.dispose();
console.log('[PASS] Handle: one package per input, reusable summary/final pass, exact disposal, and compiled-profile preview invalidation');

// Informational CPU comparison, never a hardware-dependent pass/fail threshold.
const time = (fn) => {
    fn();
    const samples = [];
    for (let i = 0; i < 6; i++) { const start = performance.now(); fn(); samples.push(performance.now() - start); }
    return samples.sort((a, b) => a - b)[3];
};
const generateAndDispose = () => { const pkg = generateHandleMoldPackage(DEFAULT_HANDLE_PARAMS, mug); disposeHandleMoldPackage(pkg); };
const previousMs = time(() => { generateAndDispose(); generateAndDispose(); });
const currentMs = time(generateAndDispose);
console.log(`[MEASURE] Handle package CPU median, two builds -> one: ${previousMs.toFixed(1)} ms -> ${currentMs.toFixed(1)} ms (six warmed samples each; rendering excluded)`);
console.log('GATE PASSED');
