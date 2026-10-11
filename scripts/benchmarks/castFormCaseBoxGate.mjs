#!/usr/bin/env node
/**
 * Cast-form polymer case box gate.
 *
 * Validates the two pour boxes built around the mold forms for polymer
 * case-mold casting:
 *   - wall box (rectangular): wall form lies outer-face-down in a floor
 *     indent; consistent side gap; interior = seated form height + headspace
 *   - foot box (circular): same construction around the foot form
 *
 * Asserted per box against INDEPENDENT form measurements (not the builder's
 * own userData):
 *   1. mesh: manifold, orientation-consistent, single component, volume > 0
 *   2. pocket footprint = form base silhouette + fitClearance
 *   3. inner walls = form max silhouette + gap, spanning ledge -> brim
 *   4. outer extents = inner + wallThickness
 *   5. interior height = seated form height + headspace (open top: nothing
 *      above the brim, no faces spanning the opening)
 *   6. wall congruence: one box serves every wall (max-|v| spread across
 *      walls <= 1e-3, guaranteed by the shared mold-global half-width)
 */

import fs from 'fs';
import { fileURLToPath } from 'url';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';

import { MoldGenerator } from '../castForm/geometry/moldGenerator.js';
import { InputProcessor } from '../castForm/geometry/inputProcessor.js';
import { DEFAULT_PARAMS } from '../castForm/state/castFormDefaults.js';
import {
    buildWallCaseBox,
    buildFootCaseBox,
    measureWallLaidFlat,
    measureFootFootprint
} from '../castForm/geometry/caseBoxGenerator.js';
import { summarizeValidation, validateGeometryForPrint } from '../geometry/meshQuality.js';

const DEFAULT_INPUT = fileURLToPath(new URL('../../output/fixtures/untitled_mug_6.stl', import.meta.url));
const TOLERANCE = 0.05;

function readArg(name, fallback = null) {
    const prefix = `--${name}=`;
    const match = process.argv.find((arg) => arg.startsWith(prefix));
    return match ? match.slice(prefix.length) : fallback;
}

function loadProcessedInput(path) {
    const data = fs.readFileSync(path);
    const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    const raw = new STLLoader().parse(arrayBuffer);
    const processed = InputProcessor.processGeometry(raw);
    if (!processed.geometry) {
        throw new Error(`Could not process STL: ${processed.errors.join('; ')}`);
    }
    return processed.geometry;
}

function signedVolume(geometry) {
    const position = geometry.getAttribute('position');
    const index = geometry.getIndex();
    const count = index ? index.count : position.count;
    const at = (i) => (index ? index.getX(i) : i);
    let volume = 0;
    for (let i = 0; i < count; i += 3) {
        const a = at(i); const b = at(i + 1); const c = at(i + 2);
        const ax = position.getX(a); const ay = position.getY(a); const az = position.getZ(a);
        const bx = position.getX(b); const by = position.getY(b); const bz = position.getZ(b);
        const cx = position.getX(c); const cy = position.getY(c); const cz = position.getZ(c);
        volume += (ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)) / 6;
    }
    return volume;
}

function vertexKey(position, vertexIndex, decimals = 5) {
    const scale = 10 ** decimals;
    return [
        Math.round(position.getX(vertexIndex) * scale),
        Math.round(position.getY(vertexIndex) * scale),
        Math.round(position.getZ(vertexIndex) * scale)
    ].join(':');
}

function connectedSurfaceComponentCount(geometry, decimals = 5) {
    const position = geometry.getAttribute('position');
    const index = geometry.getIndex();
    const triangleCount = (index ? index.count : position.count) / 3;
    const edgeToTriangles = new Map();
    const adjacency = Array.from({ length: triangleCount }, () => []);

    const triangleKeys = (triangleIndex) => {
        const base = triangleIndex * 3;
        const ids = index
            ? [index.getX(base), index.getX(base + 1), index.getX(base + 2)]
            : [base, base + 1, base + 2];
        return ids.map((id) => vertexKey(position, id, decimals));
    };
    const edgeKey = (a, b) => a < b ? `${a}|${b}` : `${b}|${a}`;

    for (let t = 0; t < triangleCount; t++) {
        const keys = triangleKeys(t);
        for (const [s, e] of [[keys[0], keys[1]], [keys[1], keys[2]], [keys[2], keys[0]]]) {
            const key = edgeKey(s, e);
            if (!edgeToTriangles.has(key)) edgeToTriangles.set(key, []);
            edgeToTriangles.get(key).push(t);
        }
    }
    for (const triangles of edgeToTriangles.values()) {
        for (let i = 0; i < triangles.length; i++) {
            for (let j = i + 1; j < triangles.length; j++) {
                adjacency[triangles[i]].push(triangles[j]);
                adjacency[triangles[j]].push(triangles[i]);
            }
        }
    }

    const visited = new Uint8Array(triangleCount);
    let components = 0;
    for (let t = 0; t < triangleCount; t++) {
        if (visited[t]) continue;
        components++;
        const stack = [t];
        visited[t] = 1;
        while (stack.length > 0) {
            for (const next of adjacency[stack.pop()]) {
                if (!visited[next]) { visited[next] = 1; stack.push(next); }
            }
        }
    }
    return components;
}

/** Collect the sorted distinct |value| plateaus present in a vertex scalar. */
function nearAny(value, targets, tolerance = TOLERANCE) {
    return targets.some((t) => Math.abs(value - t) <= tolerance);
}

function checkBoxMesh(label, geometry, failures) {
    const validation = validateGeometryForPrint(geometry, {
        weldDecimalPlaces: 5,
        enforceOrientationConsistency: true
    });
    const components = connectedSurfaceComponentCount(geometry);
    const volume = signedVolume(geometry);
    console.log(`  ${label}: ${summarizeValidation(validation)} components=${components} volume=${(volume / 1000).toFixed(1)}cm³`);
    if (!validation.valid) failures.push(`${label}: ${validation.errors.join('; ')}`);
    if (components !== 1) failures.push(`${label}: ${components} connected components`);
    if (volume <= 0) failures.push(`${label}: non-positive signed volume (inverted orientation)`);
}

function main() {
    const inputPath = readArg('input', DEFAULT_INPUT);
    const quality = readArg('quality', 'preview');
    const wallCount = Math.round(Number(readArg('wall-count', 3)));
    const failures = [];

    console.log('Cast-form polymer case box gate');
    console.log(`input: ${inputPath}`);
    console.log(`quality: ${quality}  wall-count: ${wallCount}`);

    const input = loadProcessedInput(inputPath);
    const params = JSON.parse(JSON.stringify(DEFAULT_PARAMS));
    params.mold.wallCount = wallCount;
    const box = params.caseBox;

    const generator = new MoldGenerator();
    generator.applySamplingPreset(input, quality);
    const result = generator.generate(input, params, { quality, natchesEnabled: true });

    // ── Wall congruence: one box must serve every wall ───────────────────────
    const wallMeasures = result.walls.map((wall, i) => measureWallLaidFlat(wall, wallCount, i));
    const widths = wallMeasures.map((m) => m.halfWidth);
    const spread = Math.max(...widths) - Math.min(...widths);
    console.log(`  wall half-widths: [${widths.map((w) => w.toFixed(3)).join(', ')}] spread=${spread.toFixed(4)}`);
    if (spread > 1e-3) {
        failures.push(`walls not congruent (half-width spread ${spread.toFixed(4)}mm) — one box cannot serve all walls`);
    }

    // ── Wall box ─────────────────────────────────────────────────────────────
    const wallBox = buildWallCaseBox(result.walls[0], wallCount, box);
    checkBoxMesh('wallBox', wallBox, failures);
    {
        const m = wallMeasures[0];
        const pos = wallBox.getAttribute('position');
        const pocketX = m.baseHalfWidth + box.fitClearance;
        const pocketZ = m.baseHalfLength + box.fitClearance;
        const innerX = m.halfWidth + box.gap;
        const innerZ = m.halfLength + box.gap;
        const outerX = innerX + box.wallThickness;
        const outerZ = innerZ + box.wallThickness;
        const brim = box.floorThickness + m.height + box.headspace;

        let maxX = 0; let maxZ = 0; let maxY = -Infinity; let minY = Infinity;
        let sawInnerWallLow = false; let sawInnerWallHigh = false; let sawPocket = false;
        let openTopViolations = 0; let unexpectedPlateau = 0;

        for (let i = 0; i < pos.count; i++) {
            const x = Math.abs(pos.getX(i));
            const y = pos.getY(i);
            const z = Math.abs(pos.getZ(i));
            maxX = Math.max(maxX, x); maxZ = Math.max(maxZ, z);
            maxY = Math.max(maxY, y); minY = Math.min(minY, y);
            if (!nearAny(x, [pocketX, innerX, outerX]) && !nearAny(x, [0])) unexpectedPlateau++;
            if (Math.abs(x - innerX) <= TOLERANCE) {
                if (Math.abs(y - (box.floorThickness + box.indentDepth)) <= TOLERANCE) sawInnerWallLow = true;
                if (Math.abs(y - brim) <= TOLERANCE) sawInnerWallHigh = true;
            }
            if (Math.abs(x - pocketX) <= TOLERANCE && y <= box.floorThickness + box.indentDepth + TOLERANCE) sawPocket = true;
            // open top: nothing above the brim, nothing at brim height inside the inner walls
            if (y > brim + TOLERANCE) openTopViolations++;
            if (Math.abs(y - brim) <= TOLERANCE && x < innerX - TOLERANCE && z < innerZ - TOLERANCE) openTopViolations++;
        }

        if (Math.abs(maxX - outerX) > TOLERANCE || Math.abs(maxZ - outerZ) > TOLERANCE) {
            failures.push(`wallBox: outer extents ${maxX.toFixed(2)}×${maxZ.toFixed(2)} != expected ${outerX.toFixed(2)}×${outerZ.toFixed(2)}`);
        }
        if (Math.abs(maxY - brim) > 0.1) {
            failures.push(`wallBox: brim ${maxY.toFixed(2)} != form height + headspace (${brim.toFixed(2)})`);
        }
        if (Math.abs(minY) > TOLERANCE) failures.push(`wallBox: bottom not at y=0 (${minY.toFixed(3)})`);
        if (!sawPocket) failures.push('wallBox: pocket walls missing at base silhouette + clearance');
        if (!sawInnerWallLow || !sawInnerWallHigh) failures.push('wallBox: inner walls do not span ledge → brim');
        if (openTopViolations > 0) failures.push(`wallBox: ${openTopViolations} vertices violate the open top`);
        if (unexpectedPlateau > 0) failures.push(`wallBox: ${unexpectedPlateau} vertices off the expected wall planes`);

        console.log(
            `  wallBox dims: ${((m.halfWidth + box.gap + box.wallThickness) * 2).toFixed(1)} × `
            + `${((m.halfLength + box.gap + box.wallThickness) * 2).toFixed(1)} × ${maxY.toFixed(1)} `
            + `(form ${(m.halfWidth * 2).toFixed(1)}×${(m.halfLength * 2).toFixed(1)}×${m.height.toFixed(1)}, headspace ${box.headspace})`
        );
    }

    // ── Foot box ─────────────────────────────────────────────────────────────
    const footBox = buildFootCaseBox(result.foot, box);
    checkBoxMesh('footBox', footBox, failures);
    {
        const m = measureFootFootprint(result.foot);
        const pos = footBox.getAttribute('position');
        const pocketR = m.baseRadius + box.fitClearance;
        const innerR = m.radius + box.gap;
        const outerR = innerR + box.wallThickness;
        const brim = box.floorThickness + m.height + box.headspace;

        let maxR = 0; let maxY = -Infinity; let minY = Infinity;
        let sawInnerLow = false; let sawInnerHigh = false; let sawPocket = false;
        let openTopViolations = 0;

        for (let i = 0; i < pos.count; i++) {
            const r = Math.hypot(pos.getX(i), pos.getZ(i));
            const y = pos.getY(i);
            maxR = Math.max(maxR, r); maxY = Math.max(maxY, y); minY = Math.min(minY, y);
            if (Math.abs(r - innerR) <= TOLERANCE) {
                if (Math.abs(y - (box.floorThickness + box.indentDepth)) <= TOLERANCE) sawInnerLow = true;
                if (Math.abs(y - brim) <= TOLERANCE) sawInnerHigh = true;
            }
            if (Math.abs(r - pocketR) <= TOLERANCE && y <= box.floorThickness + box.indentDepth + TOLERANCE) sawPocket = true;
            if (y > brim + TOLERANCE) openTopViolations++;
            if (Math.abs(y - brim) <= TOLERANCE && r < innerR - TOLERANCE) openTopViolations++;
        }

        if (Math.abs(maxR - outerR) > TOLERANCE) {
            failures.push(`footBox: outer radius ${maxR.toFixed(2)} != expected ${outerR.toFixed(2)}`);
        }
        if (Math.abs(maxY - brim) > 0.1) {
            failures.push(`footBox: brim ${maxY.toFixed(2)} != form height + headspace (${brim.toFixed(2)})`);
        }
        if (Math.abs(minY) > TOLERANCE) failures.push(`footBox: bottom not at y=0 (${minY.toFixed(3)})`);
        if (!sawPocket) failures.push('footBox: pocket walls missing at base radius + clearance');
        if (!sawInnerLow || !sawInnerHigh) failures.push('footBox: inner walls do not span ledge → brim');
        if (openTopViolations > 0) failures.push(`footBox: ${openTopViolations} vertices violate the open top`);

        console.log(
            `  footBox dims: Ø${(outerR * 2).toFixed(1)} × ${maxY.toFixed(1)} `
            + `(form Ø${(m.radius * 2).toFixed(1)}×${m.height.toFixed(1)}, headspace ${box.headspace})`
        );
    }

    wallBox.dispose?.();
    footBox.dispose?.();
    result.foot?.dispose?.();
    result.walls?.forEach((wall) => wall?.dispose?.());
    input.dispose?.();

    if (failures.length > 0) {
        console.error('\nFAIL');
        failures.forEach((failure) => console.error(`- ${failure}`));
        process.exit(1);
    }

    console.log('\nPASS');
    console.log('- both case boxes are manifold single-component open-top tubs');
    console.log('- pocket = form base + clearance; walls = form + gap; brim = form + headspace');
    console.log('- one wall box serves every (congruent) wall form');
}

main();
