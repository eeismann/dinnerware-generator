#!/usr/bin/env node
/** Cleanup repair/fidelity regression, with an optional isolated benchmark.
 * Run: node scripts/benchmarks/castFormCleanupGate.mjs [--benchmark]
 * The reference implementation is intentionally the pre-optimization path.
 * Benchmark children report CPU time and peak process RSS; no files are written.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { MoldGenerator } from '../castForm/geometry/moldGenerator.js';
import { InputProcessor } from '../castForm/geometry/inputProcessor.js';
import { DEFAULT_PARAMS } from '../castForm/state/castFormDefaults.js';

function legacyCleanup(geometry) {
    const expanded = geometry.getIndex() ? geometry.toNonIndexed() : geometry.clone();
    const position = expanded.getAttribute('position');
    const seen = new Set();
    const kept = [];
    const read = (i) => [position.array[i * 3], position.array[i * 3 + 1], position.array[i * 3 + 2]];
    const quantize = (value) => Math.round(value / 1e-5);
    for (let tri = 0; tri < position.count / 3; tri++) {
        const a = read(tri * 3); const b = read(tri * 3 + 1); const c = read(tri * 3 + 2);
        const abx = b[0] - a[0]; const aby = b[1] - a[1]; const abz = b[2] - a[2];
        const acx = c[0] - a[0]; const acy = c[1] - a[1]; const acz = c[2] - a[2];
        const nx = aby * acz - abz * acy;
        const ny = abz * acx - abx * acz;
        const nz = abx * acy - aby * acx;
        const area2 = Math.sqrt(nx * nx + ny * ny + nz * nz);
        if (!Number.isFinite(area2) || area2 <= 1e-8) continue;
        const key = [a, b, c].map((v) => `${quantize(v[0])},${quantize(v[1])},${quantize(v[2])}`).sort().join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        kept.push(...a, ...b, ...c);
    }
    const cleaned = new THREE.BufferGeometry();
    cleaned.setAttribute('position', new THREE.Float32BufferAttribute(kept, 3));
    const welded = mergeVertices(cleaned, 1e-5);
    welded.computeVertexNormals();
    cleaned.dispose();
    expanded.dispose();
    return welded;
}

function compareCleanup(geometry, label) {
    const originalPosition = geometry.getAttribute('position').array.slice();
    const originalIndex = geometry.getIndex()?.array.slice();
    const expected = legacyCleanup(geometry);
    const actual = new MoldGenerator().cleanupGeometryForOutput(geometry);
    for (const attribute of ['position', 'normal']) {
        assert.deepEqual(actual.getAttribute(attribute).array, expected.getAttribute(attribute).array, `${label}: ${attribute}`);
    }
    assert.deepEqual(Array.from(actual.getIndex().array), Array.from(expected.getIndex().array), `${label}: indices`);
    assert.deepEqual(geometry.getAttribute('position').array, originalPosition, `${label}: input positions mutated`);
    assert.deepEqual(geometry.getIndex()?.array, originalIndex, `${label}: input indices mutated`);
    expected.dispose(); actual.dispose();
}

function rawPatternedWall() {
    const data = fs.readFileSync(new URL('../../test-files/Pattern_mug.stl', import.meta.url));
    const raw = new STLLoader().parse(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
    const { geometry: input, errors } = InputProcessor.processGeometry(raw);
    assert.ok(input && errors.length === 0, errors.join('; '));
    const generator = new MoldGenerator();
    generator.cleanupGeometryForOutput = (geometry) => geometry;
    generator.setCachedResult = () => {};
    const params = structuredClone(DEFAULT_PARAMS);
    params.mold.wallCount = 1;
    const result = generator.generate(input, params, { quality: 'preview' });
    result.foot.dispose();
    input.dispose(); raw.dispose(); generator.dispose();
    return result.walls[0];
}

const measure = process.argv.find((arg) => arg.startsWith('--measure='))?.split('=')[1];
if (measure) {
    const raw = rawPatternedWall();
    global.gc?.();
    const rssBeforeKiB = process.memoryUsage().rss / 1024;
    const start = performance.now();
    const result = measure === 'legacy' ? legacyCleanup(raw) : new MoldGenerator().cleanupGeometryForOutput(raw);
    const elapsedMs = performance.now() - start;
    console.log(JSON.stringify({ algorithm: measure, elapsedMs, peakRssKiB: process.resourceUsage().maxRSS,
        rssBeforeKiB, triangles: result.getIndex().count / 3,
        outputBytes: result.getIndex().array.byteLength + result.getAttribute('position').array.byteLength + result.getAttribute('normal').array.byteLength }));
    result.dispose(); raw.dispose();
} else {
    // Duplicate triangles of either winding, invalid/degenerate triangles, and
    // near-tolerance negative coordinates exercise the old repair contract.
    const fixture = new THREE.BufferGeometry();
    fixture.setAttribute('position', new THREE.BufferAttribute(new Float64Array([
        0, 0, 0, 1, 0, 0, 0, 1, 0,
        0, 1, 0, 1, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0,
        NaN, 0, 0, 1, 0, 0, 0, 1, 0,
        -0.000009, 0, 0, -1, 0, 0, -1, -1, 0,
        -0.000005, 0, 0, -1, 0, 0, -1, 0, 1,
        42949.67296, 0, 0, 42950.67296, 0, 0, 42949.67296, 1, 0
    ]), 3));
    compareCleanup(fixture, 'repair/tolerance/hash-collision fixture');
    fixture.dispose();
    const indexed = new THREE.TorusGeometry(40, 8, 24, 96);
    const original = Array.from(indexed.getIndex().array);
    indexed.setIndex([...original, ...original.slice(0, 3).reverse(), original[0], original[0], original[0]]);
    compareCleanup(indexed, 'indexed torus with duplicate and degenerate faces');
    indexed.dispose();

    const generator = new MoldGenerator();
    const input = new THREE.CylinderGeometry(50, 50, 80, 96);
    input.translate(0, 40, 0);
    generator.cleanupGeometryForOutput = (geometry) => geometry;
    generator.setCachedResult = () => {};
    for (const wallCount of [1, 2, 3, 4]) {
        const params = structuredClone(DEFAULT_PARAMS);
        params.mold.wallCount = wallCount;
        const parts = generator.generate(input, params, { quality: 'preview' });
        compareCleanup(parts.foot, `foot walls=${wallCount}`);
        for (const [i, wall] of parts.walls.entries()) compareCleanup(wall, `wall ${i} walls=${wallCount}`);
        generator.disposeMoldResult(parts);
    }
    generator.dispose(); input.dispose();
    console.log('Cast Form cleanup gate passed (exact positions, indices, normals; repair and input immutability).');

    if (process.argv.includes('--benchmark')) {
        const raw = rawPatternedWall();
        compareCleanup(raw, 'Pattern_mug.stl generated one-wall mold');
        raw.dispose();
        for (const algorithm of ['legacy', 'numeric']) {
            const child = spawnSync(process.execPath, ['--expose-gc', fileURLToPath(import.meta.url), `--measure=${algorithm}`], {
                encoding: 'utf8', maxBuffer: 1024 * 1024
            });
            assert.equal(child.status, 0, child.stderr || child.stdout);
            process.stdout.write(child.stdout);
        }
    }
}
