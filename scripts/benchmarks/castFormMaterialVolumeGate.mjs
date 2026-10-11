import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
    calculateMasterMoldFillVolume,
    computeMoldPartFillVolumeMm3
} from '../castForm/geometry/moldVolumeCalculator.js';
import { calculateCaseBoxMaterialVolume } from '../castForm/geometry/caseBoxVolumeCalculator.js';

function combineNonIndexed(...geometries) {
    const arrays = geometries.map((geometry) => geometry.toNonIndexed().getAttribute('position').array);
    const positions = new Float32Array(arrays.reduce((count, array) => count + array.length, 0));
    let offset = 0;
    arrays.forEach((array) => {
        positions.set(array, offset);
        offset += array.length;
    });
    const combined = new THREE.BufferGeometry();
    combined.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return combined;
}

const solidBox = new THREE.BoxGeometry(10, 20, 30);
assert.ok(Math.abs(computeMoldPartFillVolumeMm3(solidBox) - 6000) < 0.01);

// A generated mold part contains an exterior surface plus a smaller interior
// hollow. Fill volume must use the exterior envelope, not printed shell volume.
const hollowBox = combineNonIndexed(
    new THREE.BoxGeometry(10, 10, 10),
    new THREE.BoxGeometry(8, 8, 8)
);
assert.ok(Math.abs(computeMoldPartFillVolumeMm3(hollowBox) - 1000) < 0.01);

const result = calculateMasterMoldFillVolume({
    foot: solidBox,
    walls: [hollowBox, new THREE.BoxGeometry(5, 10, 20)]
});
assert.ok(Math.abs(result.totalMl - 8) < 0.00001);
assert.deepEqual(result.wallPartsMl.map((value) => Number(value.toFixed(5))), [1, 1]);

// wallCount=1 uses one continuous annular body rather than split wall shells.
// Its fill volume is the annulus between the vessel-facing and outer radii.
const innerRadius = 30;
const outerRadius = 50;
const annularHeight = 80;
const oneSidedWall = new THREE.LatheGeometry([
    new THREE.Vector2(innerRadius, 0),
    new THREE.Vector2(outerRadius, 0),
    new THREE.Vector2(outerRadius, annularHeight),
    new THREE.Vector2(innerRadius, annularHeight),
    new THREE.Vector2(innerRadius, 0)
], 128);
const expectedAnnularVolume = Math.PI
    * (outerRadius ** 2 - innerRadius ** 2)
    * annularHeight;
const oneSidedVolume = computeMoldPartFillVolumeMm3(oneSidedWall);
assert.ok(
    Math.abs(oneSidedVolume - expectedAnnularVolume) / expectedAnnularVolume < 0.001,
    `Expected one-sided annular volume near ${expectedAnnularVolume}, received ${oneSidedVolume}`
);

const footForm = new THREE.CylinderGeometry(10, 10, 20, 128);
footForm.translate(0, 10, 0);
const baseCaseBoxParams = {
    gap: 5,
    headspace: 10,
    wallThickness: 3,
    floorThickness: 3,
    indentDepth: 2,
    fitClearance: 0.25
};
const basePour = calculateCaseBoxMaterialVolume({ foot: footForm }, baseCaseBoxParams);
const tallerPour = calculateCaseBoxMaterialVolume(
    { foot: footForm },
    { ...baseCaseBoxParams, headspace: 20 }
);
const widerPour = calculateCaseBoxMaterialVolume(
    { foot: footForm },
    { ...baseCaseBoxParams, gap: 10 }
);
assert.ok(tallerPour.totalMl > basePour.totalMl, 'Headspace must increase material required');
assert.ok(widerPour.totalMl > basePour.totalMl, 'Side gap must increase material required');
assert.ok(
    Math.abs((tallerPour.totalMm3 - basePour.totalMm3) - Math.PI * 15 ** 2 * 10) < 0.01,
    'Headspace delta must equal case-box interior area times added height'
);

solidBox.dispose();
hollowBox.dispose();
oneSidedWall.dispose();
footForm.dispose();

console.log('Cast Form material-volume gate passed (form displacement, one-sided, side-gap, headspace, and total checks).');
