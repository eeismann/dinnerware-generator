#!/usr/bin/env node
/**
 * Cast-form assembled top-down gate.
 *
 * Verifies the user-facing acceptance view: provided STL, three mold walls,
 * corner cut width at 100mm, explosion distance 0, top-down assembly. The gate
 * fails when wall bodies overlap in assembled horizontal slices and writes a
 * top-down proof image of the actual generated wall geometry.
 */

import fs from 'fs';
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';

import { MoldGenerator } from '../castForm/geometry/moldGenerator.js';
import { InputProcessor } from '../castForm/geometry/inputProcessor.js';
import { DEFAULT_PARAMS } from '../castForm/state/castFormDefaults.js';
import { summarizeValidation, validateGeometryForPrint } from '../geometry/meshQuality.js';

const DEFAULT_INPUT = '/Users/ethan.eismann/Downloads/Untitled_mug (6).stl';
const DEFAULT_OUTPUT = 'output/visuals/cast_form_assembled_topdown_corner100.svg';
const EPSILON = 1e-6;

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

function generateParts(input, quality = 'preview') {
    const params = JSON.parse(JSON.stringify(DEFAULT_PARAMS));
    params.mold.wallCount = 3;
    params.mold.cornerCutWidth = 100;
    params.experimental = {
        ...(params.experimental || {}),
        volumeWallCompiler: true,
        connectedWallTopology: true
    };

    const generator = new MoldGenerator();
    return generator.generate(input, params, {
        quality,
        natchesEnabled: false
    });
}

function triangleVertices(geometry) {
    const position = geometry.getAttribute('position');
    const index = geometry.getIndex();
    const triangles = [];
    const readVertex = (vertexIndex) => new THREE.Vector3(
        position.getX(vertexIndex),
        position.getY(vertexIndex),
        position.getZ(vertexIndex)
    );

    const count = index ? index.count : position.count;
    for (let i = 0; i < count; i += 3) {
        const ids = index
            ? [index.getX(i), index.getX(i + 1), index.getX(i + 2)]
            : [i, i + 1, i + 2];
        triangles.push(ids.map(readVertex));
    }

    return triangles;
}

function sliceSegments(geometry, yPlane) {
    const segments = [];

    for (const triangle of triangleVertices(geometry)) {
        const intersections = [];
        const edges = [
            [triangle[0], triangle[1]],
            [triangle[1], triangle[2]],
            [triangle[2], triangle[0]]
        ];

        for (const [a, b] of edges) {
            const da = a.y - yPlane;
            const db = b.y - yPlane;

            if (Math.abs(da) <= EPSILON && Math.abs(db) <= EPSILON) continue;
            if ((da > EPSILON && db > EPSILON) || (da < -EPSILON && db < -EPSILON)) continue;
            if (Math.abs(a.y - b.y) <= EPSILON) continue;

            const t = (yPlane - a.y) / (b.y - a.y);
            if (t < -EPSILON || t > 1 + EPSILON) continue;

            intersections.push({
                x: a.x + (b.x - a.x) * t,
                z: a.z + (b.z - a.z) * t
            });
        }

        if (intersections.length < 2) continue;

        const start = intersections[0];
        const end = intersections.find((point) => (
            Math.hypot(point.x - start.x, point.z - start.z) > 1e-5
        ));

        if (end) {
            segments.push([start, end]);
        }
    }

    return segments;
}

function pointInsideSlice(segments, x, z) {
    let intersections = 0;

    for (const [a, b] of segments) {
        if ((a.z > z) === (b.z > z)) continue;
        const xIntersection = a.x + ((z - a.z) * (b.x - a.x)) / (b.z - a.z);
        if (xIntersection > x) {
            intersections++;
        }
    }

    return intersections % 2 === 1;
}

function sampleAssembledOverlap(walls, options = {}) {
    const step = options.step ?? 1.5;
    const yFractions = options.yFractions ?? [0.18, 0.35, 0.5, 0.65, 0.82];
    const bounds = new THREE.Box3();

    walls.forEach((wall) => {
        wall.computeBoundingBox();
        bounds.union(wall.boundingBox);
    });

    const sliceResults = [];
    let maxOverlapArea = 0;
    let maxOverlapSamples = 0;

    for (const fraction of yFractions) {
        const y = bounds.min.y + (bounds.max.y - bounds.min.y) * fraction;
        const wallSegments = walls.map((wall) => sliceSegments(wall, y));
        let occupiedSamples = 0;
        let overlapSamples = 0;
        let maxMultiplicity = 0;

        for (let x = bounds.min.x; x <= bounds.max.x; x += step) {
            for (let z = bounds.min.z; z <= bounds.max.z; z += step) {
                const hitCount = wallSegments.reduce(
                    (count, segments) => count + (pointInsideSlice(segments, x, z) ? 1 : 0),
                    0
                );

                if (hitCount > 0) occupiedSamples++;
                if (hitCount > 1) overlapSamples++;
                maxMultiplicity = Math.max(maxMultiplicity, hitCount);
            }
        }

        const overlapArea = overlapSamples * step * step;
        maxOverlapArea = Math.max(maxOverlapArea, overlapArea);
        maxOverlapSamples = Math.max(maxOverlapSamples, overlapSamples);
        sliceResults.push({
            y,
            occupiedSamples,
            overlapSamples,
            overlapArea,
            maxMultiplicity
        });
    }

    return {
        bounds,
        step,
        sliceResults,
        maxOverlapArea,
        maxOverlapSamples
    };
}

function projectTopTriangles(geometry) {
    const position = geometry.getAttribute('position');
    const index = geometry.getIndex();
    const triangles = [];

    const readPoint = (vertexIndex) => new THREE.Vector3(
        position.getX(vertexIndex),
        position.getY(vertexIndex),
        position.getZ(vertexIndex)
    );

    const count = index ? index.count : position.count;
    for (let i = 0; i < count; i += 3) {
        const ids = index
            ? [index.getX(i), index.getX(i + 1), index.getX(i + 2)]
            : [i, i + 1, i + 2];
        const points = ids.map(readPoint);
        const normal = points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0]));
        if (normal.lengthSq() <= 1e-10) continue;
        normal.normalize();
        if (Math.abs(normal.y) >= 0.72) {
            triangles.push(points);
        }
    }

    return triangles;
}

function renderSvg({ walls, overlap, outputPath }) {
    const width = 1400;
    const height = 1100;
    const pad = 72;
    const bounds = overlap.bounds;
    const xSpan = Math.max(bounds.max.x - bounds.min.x, 1);
    const zSpan = Math.max(bounds.max.z - bounds.min.z, 1);
    const scale = Math.min((width - pad * 2) / xSpan, (height - pad * 2) / zSpan);
    const tx = (x) => pad + (x - bounds.min.x) * scale;
    const tz = (z) => pad + (bounds.max.z - z) * scale;
    const colors = ['#5d8295', '#86a26f', '#9b9185'];

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;
    svg += '<rect width="100%" height="100%" fill="#151719"/>';
    svg += '<defs><pattern id="grid" width="44" height="44" patternUnits="userSpaceOnUse"><path d="M44 0H0V44" fill="none" stroke="#2b3034" stroke-width="1"/></pattern></defs>';
    svg += '<rect width="100%" height="100%" fill="url(#grid)" opacity="0.86"/>';
    svg += '<text x="44" y="46" fill="#f5f0e8" font-family="Arial" font-size="24" font-weight="700">Actual assembled mold walls - provided STL, corner cut width 100 mm, explosion 0, top-down</text>';
    svg += '<text x="44" y="78" fill="#c4d0d6" font-family="Arial" font-size="16">All three wall bodies are generated by the mold tool and placed at the origin as in Assembly view.</text>';

    walls.forEach((wall, wallIndex) => {
        for (const triangle of projectTopTriangles(wall)) {
            const points = triangle.map((point) => `${tx(point.x)},${tz(point.z)}`).join(' ');
            svg += `<polygon points="${points}" fill="${colors[wallIndex % colors.length]}" fill-opacity="0.76" stroke="#d9edf2" stroke-opacity="0.2" stroke-width="0.35"/>`;
        }
    });

    const status = overlap.maxOverlapSamples === 0 ? 'PASS' : 'FAIL';
    const statusColor = overlap.maxOverlapSamples === 0 ? '#aee8bf' : '#ff94c8';
    svg += `<text x="44" y="${height - 64}" fill="${statusColor}" font-family="Arial" font-size="16" font-weight="700">Assembly overlap: ${status} (max sampled overlap area ${overlap.maxOverlapArea.toFixed(2)} mm^2)</text>`;
    svg += `<text x="44" y="${height - 36}" fill="#f5f0e8" font-family="Arial" font-size="15">Verification: top-down wall assembly, explosion distance 0, no sampled wall-to-wall overlap across ${overlap.sliceResults.length} height slices.</text>`;
    svg += '</svg>';

    fs.mkdirSync(outputPath.slice(0, outputPath.lastIndexOf('/')), { recursive: true });
    fs.writeFileSync(outputPath, svg);
}

function main() {
    const inputPath = readArg('input', DEFAULT_INPUT);
    const outputPath = readArg('output', DEFAULT_OUTPUT);
    const quality = readArg('quality', 'preview');
    const input = loadProcessedInput(inputPath);
    const result = generateParts(input, quality);
    const failures = [];

    if (result.walls.length !== 3) {
        failures.push(`Generated ${result.walls.length} walls, expected 3`);
    }

    result.walls.forEach((wall, index) => {
        const validation = validateGeometryForPrint(wall, {
            weldDecimalPlaces: 5,
            enforceOrientationConsistency: true
        });
        console.log(`wall-${index + 1}: ${summarizeValidation(validation)}`);
        if (!validation.valid) {
            failures.push(`wall-${index + 1}: ${validation.errors.join('; ')}`);
        }
    });

    const overlap = sampleAssembledOverlap(result.walls);
    overlap.sliceResults.forEach((slice, index) => {
        console.log(
            `slice-${index + 1}: y=${slice.y.toFixed(2)} occupied=${slice.occupiedSamples} `
            + `overlap=${slice.overlapSamples} area=${slice.overlapArea.toFixed(2)} max=${slice.maxMultiplicity}`
        );
    });

    if (overlap.maxOverlapSamples > 0) {
        failures.push(`Assembly overlap detected: ${overlap.maxOverlapArea.toFixed(2)} mm^2 max sampled overlap area`);
    }

    renderSvg({ walls: result.walls, overlap, outputPath });
    console.log(`wrote ${outputPath}`);

    result.foot?.dispose?.();
    result.walls?.forEach((wall) => wall?.dispose?.());
    input.dispose?.();

    if (failures.length > 0) {
        console.error('Assembled top-down gate failed');
        failures.forEach((failure) => console.error(`- ${failure}`));
        process.exitCode = 1;
    }
}

main();
