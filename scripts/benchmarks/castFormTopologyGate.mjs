#!/usr/bin/env node
/** Generated print topology, including the continuous one-wall mold.
 * Run: node scripts/benchmarks/castFormTopologyGate.mjs
 * No downloads, screenshots, or output files are created.
 */
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MoldGenerator } from '../castForm/geometry/moldGenerator.js';
import { CastFormSTLExporter } from '../castForm/geometry/castFormSTLExporter.js';
import { DEFAULT_PARAMS } from '../castForm/state/castFormDefaults.js';
import { validateGeometryForPrint } from '../geometry/meshQuality.js';

const validationOptions = { weldDecimalPlaces: 5, enforceOrientationConsistency: true };

function signedVolume(geometry) {
    const p = geometry.getAttribute('position');
    const index = geometry.getIndex();
    const count = index?.count ?? p.count;
    let volume = 0;
    for (let i = 0; i < count; i += 3) {
        const a = index ? index.getX(i) : i;
        const b = index ? index.getX(i + 1) : i + 1;
        const c = index ? index.getX(i + 2) : i + 2;
        volume += (
            p.getX(a) * (p.getY(b) * p.getZ(c) - p.getZ(b) * p.getY(c))
            + p.getY(a) * (p.getZ(b) * p.getX(c) - p.getX(b) * p.getZ(c))
            + p.getZ(a) * (p.getX(b) * p.getY(c) - p.getY(b) * p.getX(c))
        ) / 6;
    }
    return volume;
}

function makeInput(patterned) {
    const geometry = new THREE.CylinderGeometry(50, 50, 80, 192, patterned ? 48 : 1);
    geometry.translate(0, 40, 0);
    if (patterned) {
        const p = geometry.getAttribute('position');
        for (let i = 0; i < p.count; i++) {
            const x = p.getX(i); const y = p.getY(i); const z = p.getZ(i);
            const radius = Math.hypot(x, z);
            if (radius < 1) continue;
            const relief = Math.sin(Math.PI * y / 80)
                * (0.8 * Math.cos(12 * Math.atan2(z, x)) + 0.6 * Math.cos(2 * Math.PI * y / 10));
            p.setXYZ(i, x * (radius + relief) / radius, y, z * (radius + relief) / radius);
        }
        geometry.computeVertexNormals();
    }
    return geometry;
}

let checkedParts = 0;
for (const patterned of [false, true]) {
    const input = makeInput(patterned);
    const generator = new MoldGenerator();
    // A print gate does not need to retain four additional complete outputs.
    generator.resultCacheLimit = 0;
    for (const quality of ['preview', 'export']) {
        for (const wallCount of [1, 2, 3, 4]) {
            const params = structuredClone(DEFAULT_PARAMS);
            params.mold.wallCount = wallCount;
            const result = generator.generate(input, params, { quality });
            const label = `${patterned ? 'patterned' : 'smooth'} ${quality} walls=${wallCount}`;
            assert.equal(result.walls.length, wallCount, label);
            for (const [i, part] of [result.foot, ...result.walls].entries()) {
                const validation = validateGeometryForPrint(part, validationOptions);
                assert.ok(validation.valid, `${label} part=${i}: ${validation.errors.join('; ')}`);
                assert.ok(signedVolume(part) > 0, `${label} part=${i}: inward or empty volume`);
                checkedParts++;
            }
            if (wallCount === 1) {
                // Exercise the actual strict serializer at both quality levels.
                const blob = CastFormSTLExporter.geometryToSTLBinary(result.walls[0]);
                assert.equal(blob.size, 84 + result.walls[0].getIndex().count / 3 * 50, label);
            }
            generator.disposeMoldResult(result);
            console.log(`PASS ${label}`);
        }
    }
    generator.dispose();
    input.dispose();
}

// Export must stop on open boundaries, duplicate faces, degenerates and local
// winding conflicts instead of only logging a warning and returning a file.
for (const defect of ['open', 'duplicate', 'degenerate', 'orientation']) {
    const geometry = new THREE.BoxGeometry(10, 10, 10);
    const original = Array.from(geometry.getIndex().array);
    if (defect === 'open') geometry.setIndex(original.slice(3));
    if (defect === 'duplicate') geometry.setIndex([...original, ...original.slice(0, 3)]);
    if (defect === 'degenerate') geometry.setIndex([original[0], original[0], original[2], ...original.slice(3)]);
    if (defect === 'orientation') geometry.setIndex([original[0], original[2], original[1], ...original.slice(3)]);
    assert.throws(() => CastFormSTLExporter.geometryToSTLBinary(geometry), /castform-export: FAIL/, defect);
    geometry.dispose();
}

console.log(`Cast Form topology gate passed (${checkedParts} generated parts; strict export rejects four defect classes).`);
