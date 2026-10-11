#!/usr/bin/env node
/**
 * Cast-form additive seam-stock gate — LEGACY ESCAPE HATCH COVERAGE.
 *
 * The product default is now compact wall blocks (experimental.compactWallBlocks,
 * validated by castFormCompactWallBlockGate.mjs): each wall is clipped to two
 * vertical lateral planes so the printed form can be cast into a polymer case
 * mold and released. This gate pins compactWallBlocks OFF and validates that the
 * legacy wedge + additive seam-stock path still behaves exactly as before:
 * generated mold walls must keep the existing body and add exterior seam/corner
 * stock past each wall side reference plane. Its corner-restore assertions are
 * fundamentally incompatible with compact blocks — do not run it with the flag on.
 */

import fs from 'fs';
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';

import { MoldGenerator } from '../castForm/geometry/moldGenerator.js';
import { InputProcessor } from '../castForm/geometry/inputProcessor.js';
import { computeWallSideCutPlanes } from '../castForm/geometry/sideStockCutPlanes.js';
import { DEFAULT_PARAMS } from '../castForm/state/castFormDefaults.js';
import { summarizeValidation, validateGeometryForPrint } from '../geometry/meshQuality.js';

const DEFAULT_INPUT = '/Users/ethan.eismann/Downloads/Untitled_mug (6).stl';
const DEFAULT_OUTPUT = 'output/visuals/cast_form_additive_seam_stock_gate.svg';
const DEFAULT_JSON = 'output/visuals/cast_form_additive_seam_stock_gate.json';
const EPSILON = 1e-6;

function readArg(name, fallback = null) {
    const prefix = `--${name}=`;
    const match = process.argv.find((arg) => arg.startsWith(prefix));
    return match ? match.slice(prefix.length) : fallback;
}

function readNumberArg(name, fallback) {
    const value = Number(readArg(name, `${fallback}`));
    return Number.isFinite(value) ? value : fallback;
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

function buildParams({ wallCount, cornerCutWidth }) {
    const params = JSON.parse(JSON.stringify(DEFAULT_PARAMS));
    params.mold.wallCount = wallCount;
    params.mold.cornerCutWidth = cornerCutWidth;
    params.experimental = {
        ...(params.experimental || {}),
        volumeWallCompiler: true,
        connectedWallTopology: true,
        // This gate covers the legacy wedge envelope; compact blocks ignore
        // cornerCutWidth and clip the corners this gate asserts must exist.
        compactWallBlocks: false
    };
    return params;
}

function generateParts(input, { wallCount, cornerCutWidth, quality }) {
    const params = buildParams({ wallCount, cornerCutWidth });
    const generator = new MoldGenerator();

    generator.applySamplingPreset(input, quality);
    input.computeBoundingBox();
    const bounds = input.boundingBox;
    const profile = generator.getCachedVesselProfile(input, bounds);
    const maxVesselRadius = generator.getMaxValue2D(profile.radii);
    const outerWallDistance = maxVesselRadius + params.mold.plasterWallThickness;
    const result = generator.generate(input, params, {
        quality,
        natchesEnabled: false
    });

    return {
        result,
        params,
        maxVesselRadius,
        outerWallDistance
    };
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

function projectTopTriangles(geometry) {
    return triangleVertices(geometry).filter((points) => {
        const normal = points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0]));
        if (normal.lengthSq() <= 1e-10) return false;
        normal.normalize();
        return Math.abs(normal.y) >= 0.72;
    });
}

function vertexKey(position, vertexIndex, decimals = 5) {
    const scale = 10 ** decimals;
    return [
        Math.round(position.getX(vertexIndex) * scale),
        Math.round(position.getY(vertexIndex) * scale),
        Math.round(position.getZ(vertexIndex) * scale)
    ].join(':');
}

function connectedSurfaceComponentSizes(geometry, decimals = 5) {
    const position = geometry.getAttribute('position');
    const index = geometry.getIndex();
    const triangleCount = (index ? index.count : position.count) / 3;
    const edgeToTriangles = new Map();
    const adjacency = Array.from({ length: triangleCount }, () => []);

    const triangleKeys = (triangleIndex) => {
        const base = triangleIndex * 3;
        const vertexIds = index
            ? [index.getX(base), index.getX(base + 1), index.getX(base + 2)]
            : [base, base + 1, base + 2];
        return vertexIds.map((vertexId) => vertexKey(position, vertexId, decimals));
    };

    const edgeKey = (a, b) => a < b ? `${a}|${b}` : `${b}|${a}`;

    for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex++) {
        const keys = triangleKeys(triangleIndex);
        const edges = [
            [keys[0], keys[1]],
            [keys[1], keys[2]],
            [keys[2], keys[0]]
        ];

        for (const [start, end] of edges) {
            const key = edgeKey(start, end);
            if (!edgeToTriangles.has(key)) {
                edgeToTriangles.set(key, []);
            }
            edgeToTriangles.get(key).push(triangleIndex);
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
    const sizes = [];

    for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex++) {
        if (visited[triangleIndex]) continue;

        const stack = [triangleIndex];
        visited[triangleIndex] = 1;
        let size = 0;

        while (stack.length > 0) {
            const current = stack.pop();
            size++;

            for (const next of adjacency[current]) {
                if (visited[next]) continue;
                visited[next] = 1;
                stack.push(next);
            }
        }

        sizes.push(size);
    }

    return sizes.sort((a, b) => b - a);
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

function signedDistanceToPlane(plane, x, z) {
    return x * plane.normal.x + z * plane.normal.z - plane.distance;
}

function plainPlane(plane) {
    return {
        name: plane.name,
        angle: plane.angle,
        normal: {
            x: plane.normal.x,
            z: plane.normal.z
        },
        distance: plane.distance
    };
}

function expectedRestoredStockForSide(planes, sideName) {
    const cornerDistance = sideName === 'start'
        ? planes.startCornerDistance
        : planes.endCornerDistance;
    const sidePlane = planes[sideName];

    if (!sidePlane || !Number.isFinite(cornerDistance)) {
        return 0;
    }

    return Math.max(0, cornerDistance - sidePlane.distance);
}

function plainBox(box) {
    return {
        min: {
            x: box.min.x,
            y: box.min.y,
            z: box.min.z
        },
        max: {
            x: box.max.x,
            y: box.max.y,
            z: box.max.z
        }
    };
}

function collectSliceStockEvidence(geometry, plane, options) {
    const {
        minStockMm,
        sampleStep,
        maxSamples,
        yFractions
    } = options;

    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox;
    const sliceResults = [];
    const samples = [];
    let sampleCount = 0;
    let maxSignedDistance = 0;

    for (const fraction of yFractions) {
        const y = bounds.min.y + (bounds.max.y - bounds.min.y) * fraction;
        const segments = sliceSegments(geometry, y);
        let sliceSampleCount = 0;
        let sliceMaxSignedDistance = 0;

        if (segments.length > 0) {
            for (let x = bounds.min.x + sampleStep * 0.5; x <= bounds.max.x; x += sampleStep) {
                for (let z = bounds.min.z + sampleStep * 0.5; z <= bounds.max.z; z += sampleStep) {
                    const signedDistance = signedDistanceToPlane(plane, x, z);
                    if (signedDistance < minStockMm - EPSILON) continue;
                    if (!pointInsideSlice(segments, x, z)) continue;

                    sliceSampleCount++;
                    sampleCount++;
                    sliceMaxSignedDistance = Math.max(sliceMaxSignedDistance, signedDistance);
                    maxSignedDistance = Math.max(maxSignedDistance, signedDistance);

                    if (samples.length < maxSamples) {
                        samples.push({
                            source: 'slice',
                            x,
                            y,
                            z,
                            signedDistance
                        });
                    }
                }
            }
        }

        sliceResults.push({
            y,
            segmentCount: segments.length,
            sampleCount: sliceSampleCount,
            stockAreaMm2: sliceSampleCount * sampleStep * sampleStep,
            maxSignedDistance: sliceMaxSignedDistance
        });
    }

    return {
        sampleStep,
        sampleCount,
        stockAreaMm2: sampleCount * sampleStep * sampleStep,
        maxSignedDistance,
        slices: sliceResults,
        samples
    };
}

function evaluateSideStock(geometry, plane, options = {}) {
    const minStockMm = options.minStockMm ?? 2;
    const positiveTolerance = options.positiveTolerance ?? 0.05;
    const maxSamples = options.maxSamples ?? 72;
    const sampleStep = options.sampleStep ?? 1.5;
    const yFractions = options.yFractions ?? [0.16, 0.32, 0.5, 0.68, 0.84];
    const position = geometry.getAttribute('position');
    const vertexSamples = [];
    let positiveVertexCount = 0;
    let vertexStockCount = 0;
    let maxPositiveSignedDistance = 0;
    let maxVertexSignedDistance = 0;
    let minStockY = Infinity;
    let maxStockY = -Infinity;

    for (let i = 0; i < position.count; i++) {
        const x = position.getX(i);
        const y = position.getY(i);
        const z = position.getZ(i);
        const signedDistance = signedDistanceToPlane(plane, x, z);

        if (signedDistance > positiveTolerance + EPSILON) {
            positiveVertexCount++;
            maxPositiveSignedDistance = Math.max(maxPositiveSignedDistance, signedDistance);
        }

        if (signedDistance >= minStockMm - EPSILON) {
            vertexStockCount++;
            maxVertexSignedDistance = Math.max(maxVertexSignedDistance, signedDistance);
            minStockY = Math.min(minStockY, y);
            maxStockY = Math.max(maxStockY, y);

            if (vertexSamples.length < maxSamples) {
                vertexSamples.push({
                    source: 'vertex',
                    x,
                    y,
                    z,
                    signedDistance
                });
            }
        }
    }

    const sliceEvidence = collectSliceStockEvidence(geometry, plane, {
        minStockMm,
        sampleStep,
        maxSamples: Math.max(0, maxSamples - vertexSamples.length),
        yFractions
    });
    const aggregateEvidenceCount = vertexStockCount + sliceEvidence.sampleCount;
    const maxSignedDistance = Math.max(maxVertexSignedDistance, sliceEvidence.maxSignedDistance);

    return {
        valid: aggregateEvidenceCount > 0 && maxSignedDistance >= minStockMm - EPSILON,
        minStockMm,
        positiveTolerance,
        vertexCount: position.count,
        positiveVertexCount,
        vertexStockCount,
        sliceStockSampleCount: sliceEvidence.sampleCount,
        aggregateEvidenceCount,
        stockAreaMm2: sliceEvidence.stockAreaMm2,
        maxPositiveSignedDistance,
        maxSignedDistance,
        minStockY: Number.isFinite(minStockY) ? minStockY : null,
        maxStockY: Number.isFinite(maxStockY) ? maxStockY : null,
        slices: sliceEvidence.slices,
        samples: [...vertexSamples, ...sliceEvidence.samples]
    };
}

function lineEndpointsForPlane(plane, bounds) {
    const points = [];
    const addPoint = (x, z) => {
        if (
            x < bounds.min.x - 1e-6 || x > bounds.max.x + 1e-6
            || z < bounds.min.z - 1e-6 || z > bounds.max.z + 1e-6
        ) {
            return;
        }
        if (points.some((point) => Math.hypot(point.x - x, point.z - z) < 1e-5)) {
            return;
        }
        points.push({ x, z });
    };

    if (Math.abs(plane.normal.z) > 1e-8) {
        addPoint(bounds.min.x, (plane.distance - plane.normal.x * bounds.min.x) / plane.normal.z);
        addPoint(bounds.max.x, (plane.distance - plane.normal.x * bounds.max.x) / plane.normal.z);
    }
    if (Math.abs(plane.normal.x) > 1e-8) {
        addPoint((plane.distance - plane.normal.z * bounds.min.z) / plane.normal.x, bounds.min.z);
        addPoint((plane.distance - plane.normal.z * bounds.max.z) / plane.normal.x, bounds.max.z);
    }

    return points.slice(0, 2);
}

function renderSvg({ walls, perWall, sides, outputPath, wallCount, cornerCutWidth, minStockMm }) {
    const width = 1480;
    const height = 1080;
    const pad = 76;
    const tableX = 44;
    const tableY = height - 240;
    const bounds = new THREE.Box3();
    walls.forEach((wall) => {
        wall.computeBoundingBox();
        bounds.union(wall.boundingBox);
    });
    bounds.expandByScalar(12);

    const xSpan = Math.max(bounds.max.x - bounds.min.x, 1);
    const zSpan = Math.max(bounds.max.z - bounds.min.z, 1);
    const scale = Math.min((width - pad * 2) / xSpan, (height - pad * 2 - 180) / zSpan);
    const tx = (x) => pad + (x - bounds.min.x) * scale;
    const tz = (z) => pad + (bounds.max.z - z) * scale;
    const colors = ['#5d8295', '#86a26f', '#9b9185', '#997ba8'];
    const overallValid = sides.every((side) => side.valid)
        && perWall.every((wall) => wall.validation.valid);
    const status = overallValid ? 'PASS' : 'FAIL';
    const statusColor = overallValid ? '#aee8bf' : '#ff94c8';

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;
    svg += '<rect width="100%" height="100%" fill="#151719"/>';
    svg += '<defs><pattern id="grid" width="44" height="44" patternUnits="userSpaceOnUse"><path d="M44 0H0V44" fill="none" stroke="#2b3034" stroke-width="1"/></pattern></defs>';
    svg += '<rect width="100%" height="100%" fill="url(#grid)" opacity="0.86"/>';
    svg += `<text x="44" y="46" fill="#f5f0e8" font-family="Arial" font-size="24" font-weight="700">Additive seam-stock gate - provided STL, wall count ${wallCount}, corner cut width ${cornerCutWidth} mm</text>`;
    svg += `<text x="44" y="78" fill="#c4d0d6" font-family="Arial" font-size="16">Each wall start/end side must contain generated stock at least ${minStockMm.toFixed(1)} mm beyond its reference side plane.</text>`;

    walls.forEach((wall, wallIndex) => {
        for (const triangle of projectTopTriangles(wall)) {
            const points = triangle.map((point) => `${tx(point.x)},${tz(point.z)}`).join(' ');
            svg += `<polygon points="${points}" fill="${colors[wallIndex % colors.length]}" fill-opacity="0.72" stroke="#d9edf2" stroke-opacity="0.18" stroke-width="0.35"/>`;
        }
    });

    sides.forEach((side) => {
        const endpoints = lineEndpointsForPlane(side.plane, bounds);
        if (endpoints.length === 2) {
            const color = side.valid ? '#8dffb0' : '#ff5fa9';
            const dash = side.valid ? '' : ' stroke-dasharray="10 8"';
            svg += `<line x1="${tx(endpoints[0].x)}" y1="${tz(endpoints[0].z)}" x2="${tx(endpoints[1].x)}" y2="${tz(endpoints[1].z)}" stroke="${color}" stroke-width="3.2" stroke-opacity="0.94"${dash}/>`;

            const labelX = (tx(endpoints[0].x) + tx(endpoints[1].x)) * 0.5;
            const labelY = (tz(endpoints[0].z) + tz(endpoints[1].z)) * 0.5;
            svg += `<text x="${labelX + 7}" y="${labelY - 7}" fill="${color}" font-family="Arial" font-size="12" font-weight="700">${side.label} ${side.valid ? 'PASS' : 'FAIL'}</text>`;
        }

        side.stock.samples.forEach((sample) => {
            const radius = sample.source === 'vertex' ? 4.2 : 3;
            const fill = sample.source === 'vertex' ? '#ffe66d' : '#50e3ff';
            svg += `<circle cx="${tx(sample.x)}" cy="${tz(sample.z)}" r="${radius}" fill="${fill}" fill-opacity="0.9"/>`;
        });
    });

    svg += `<text x="44" y="${tableY - 34}" fill="${statusColor}" font-family="Arial" font-size="18" font-weight="700">Overall: ${status}</text>`;
    svg += `<text x="170" y="${tableY - 34}" fill="#f5f0e8" font-family="Arial" font-size="15">Yellow = stock vertices, cyan = sampled stock area, green plane = side passed, pink plane = side failed.</text>`;

    sides.forEach((side, index) => {
        const rowY = tableY + index * 29;
        const fill = side.valid ? '#aee8bf' : '#ff94c8';
        const line = [
            `${side.label}: ${side.valid ? 'PASS' : 'FAIL'}`,
            `max ${side.stock.maxSignedDistance.toFixed(3)} mm`,
            `target ${side.expectedRestoredStockMm.toFixed(3)} mm`,
            `positive vertices ${side.stock.positiveVertexCount}`,
            `vertices>=${minStockMm.toFixed(0)}mm ${side.stock.vertexStockCount}`,
            `slice samples ${side.stock.sliceStockSampleCount}`,
            `area ${side.stock.stockAreaMm2.toFixed(1)} mm2`
        ].join('  |  ');
        svg += `<text x="${tableX}" y="${rowY}" fill="${fill}" font-family="Arial" font-size="15" font-weight="700">${line}</text>`;
    });

    const meshSummary = perWall.map((wall) => (
        `W${wall.wallIndex + 1} ${wall.validation.valid ? 'PASS' : 'FAIL'}`
    )).join('  |  ');
    svg += `<text x="${tableX}" y="${tableY + sides.length * 29 + 28}" fill="#c4d0d6" font-family="Arial" font-size="15">Mesh quality: ${meshSummary}</text>`;
    svg += '</svg>';

    fs.mkdirSync(outputPath.slice(0, outputPath.lastIndexOf('/')), { recursive: true });
    fs.writeFileSync(outputPath, svg);
}

function writeJson(path, payload) {
    fs.mkdirSync(path.slice(0, path.lastIndexOf('/')), { recursive: true });
    fs.writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`);
}

function main() {
    const inputPath = readArg('input', DEFAULT_INPUT);
    const outputPath = readArg('output', DEFAULT_OUTPUT);
    const jsonPath = readArg('json', DEFAULT_JSON);
    const quality = readArg('quality', 'preview');
    const wallCount = Math.max(1, Math.min(4, Math.round(readNumberArg('wall-count', 3))));
    const cornerCutWidth = readNumberArg('corner-cut', 100);
    const minStockMm = readNumberArg('min-stock', 2);
    const maxStockMm = readNumberArg('max-stock', Math.max(60, cornerCutWidth + 10));
    const minRestoredStockRatio = readNumberArg('min-restored-stock-ratio', 0.85);
    const maxRestoredStockOverage = readNumberArg('max-restored-stock-overage', 5);
    const minPositiveVertices = Math.max(1, Math.round(readNumberArg('min-positive-vertices', 512)));
    const minSliceSamples = Math.max(1, Math.round(readNumberArg('min-slice-samples', 100)));
    const minSliceSamplesPerSlice = Math.max(1, Math.round(readNumberArg('min-slice-samples-per-slice', 64)));
    const positiveTolerance = readNumberArg('positive-tolerance', 0.05);
    const sampleStep = readNumberArg('sample-step', 1.5);
    const failures = [];

    console.log('Cast-form additive seam-stock gate');
    console.log(`input: ${inputPath}`);
    console.log(`wall-count: ${wallCount}`);
    console.log(`corner-cut-width: ${cornerCutWidth}`);
    console.log(`min-stock: ${minStockMm}`);
    console.log(`max-stock: ${maxStockMm}`);
    console.log(`min-restored-stock-ratio: ${minRestoredStockRatio}`);
    console.log(`max-restored-stock-overage: ${maxRestoredStockOverage}`);
    console.log(`min-positive-vertices: ${minPositiveVertices}`);
    console.log(`min-slice-samples: ${minSliceSamples}`);
    console.log(`min-slice-samples-per-slice: ${minSliceSamplesPerSlice}`);
    console.log(`sample-step: ${sampleStep}`);

    const input = loadProcessedInput(inputPath);
    const { result, maxVesselRadius, outerWallDistance } = generateParts(input, {
        wallCount,
        cornerCutWidth,
        quality
    });

    if (result.walls.length !== wallCount) {
        failures.push(`Generated ${result.walls.length} walls, expected ${wallCount}`);
    }

    const perWall = result.walls.map((wall, wallIndex) => {
        const planes = computeWallSideCutPlanes({
            wallIndex,
            wallCount,
            outerWallDistance,
            cornerCutWidth
        });
        const validation = validateGeometryForPrint(wall, {
            weldDecimalPlaces: 5,
            enforceOrientationConsistency: true
        });
        const componentSizes = connectedSurfaceComponentSizes(wall, 5);

        console.log(
            `wall-${wallIndex + 1}: ${summarizeValidation(validation)} `
            + `components=${componentSizes.length}`
        );
        if (!validation.valid) {
            failures.push(`wall-${wallIndex + 1}: ${validation.errors.join('; ')}`);
        }
        if (componentSizes.length !== 1) {
            failures.push(
                `wall-${wallIndex + 1}: expected one connected wall body, found `
                + `${componentSizes.length} components (${componentSizes.slice(0, 6).join(', ')})`
            );
        }

        return {
            wallIndex,
            planes,
            validation,
            componentSizes
        };
    });

    const sides = perWall.flatMap((wall) => (
        ['start', 'end'].map((sideName) => {
            const plane = wall.planes[sideName];
            const expectedRestoredStockMm = expectedRestoredStockForSide(wall.planes, sideName);
            const stock = evaluateSideStock(result.walls[wall.wallIndex], plane, {
                minStockMm,
                positiveTolerance,
                sampleStep
            });
            const label = `W${wall.wallIndex + 1} ${sideName}`;
            console.log(
                `${label}: ${stock.valid ? 'PASS' : 'FAIL'} `
                + `max=${stock.maxSignedDistance.toFixed(3)}mm `
                + `target=${expectedRestoredStockMm.toFixed(3)}mm `
                + `positiveVertices=${stock.positiveVertexCount} `
                + `vertices>=${minStockMm}mm=${stock.vertexStockCount} `
                + `sliceSamples=${stock.sliceStockSampleCount}`
            );

            const sideFailures = [];
            if (!stock.valid) {
                sideFailures.push(
                    `no additive stock >= ${minStockMm.toFixed(3)} mm beyond `
                    + `${sideName} side plane (max ${stock.maxSignedDistance.toFixed(3)} mm)`
                );
            }
            if (stock.maxSignedDistance > maxStockMm + EPSILON) {
                sideFailures.push(
                    `stock extends ${stock.maxSignedDistance.toFixed(3)} mm beyond ${sideName} side plane, `
                    + `exceeding maximum restored-stock limit ${maxStockMm.toFixed(3)} mm`
                );
            }
            if (expectedRestoredStockMm > minStockMm + EPSILON) {
                const minimumRestoredStockMm = expectedRestoredStockMm * minRestoredStockRatio;
                if (stock.maxSignedDistance < minimumRestoredStockMm - EPSILON) {
                    sideFailures.push(
                        `stock restores only ${stock.maxSignedDistance.toFixed(3)} mm beyond `
                        + `${sideName} side plane, below ${(minRestoredStockRatio * 100).toFixed(0)}% `
                        + `of expected ${expectedRestoredStockMm.toFixed(3)} mm`
                    );
                }
                if (stock.maxSignedDistance > expectedRestoredStockMm + maxRestoredStockOverage + EPSILON) {
                    sideFailures.push(
                        `stock extends ${stock.maxSignedDistance.toFixed(3)} mm beyond ${sideName} side plane, `
                        + `more than ${maxRestoredStockOverage.toFixed(3)} mm past expected `
                        + `${expectedRestoredStockMm.toFixed(3)} mm restored corner`
                    );
                }
            }
            if (stock.positiveVertexCount < minPositiveVertices) {
                sideFailures.push(
                    `only ${stock.positiveVertexCount} generated envelope vertices protrude past `
                    + `${sideName} side plane, below minimum ${minPositiveVertices}`
                );
            }
            if (stock.sliceStockSampleCount < minSliceSamples) {
                sideFailures.push(
                    `only ${stock.sliceStockSampleCount} stock slice samples, `
                    + `below minimum ${minSliceSamples}`
                );
            }
            stock.slices.forEach((slice, index) => {
                if (slice.sampleCount >= minSliceSamplesPerSlice) return;
                sideFailures.push(
                    `slice ${index + 1} has only ${slice.sampleCount} stock samples, `
                    + `below per-slice minimum ${minSliceSamplesPerSlice}`
                );
            });

            if (sideFailures.length > 0) {
                failures.push(
                    ...sideFailures.map((failure) => `${label}: ${failure}`)
                );
            }

            return {
                wallIndex: wall.wallIndex,
                sideName,
                label,
                plane,
                expectedRestoredStockMm,
                stock,
                valid: sideFailures.length === 0
            };
        })
    ));

    renderSvg({
        walls: result.walls,
        perWall,
        sides,
        outputPath,
        wallCount,
        cornerCutWidth,
        minStockMm
    });

    writeJson(jsonPath, {
        inputPath,
        wallCount,
        cornerCutWidth,
        quality,
        minStockMm,
        maxStockMm,
        minRestoredStockRatio,
        maxRestoredStockOverage,
        minPositiveVertices,
        minSliceSamples,
        minSliceSamplesPerSlice,
        positiveTolerance,
        sampleStep,
        maxVesselRadius,
        outerWallDistance,
        valid: failures.length === 0,
        failures,
        walls: perWall.map((wall) => ({
            wallIndex: wall.wallIndex,
            validation: {
                valid: wall.validation.valid,
                errors: wall.validation.errors,
                triangleCount: wall.validation.triangleCount,
                degenerateCount: wall.validation.degenerateCount,
                boundaryEdges: wall.validation.boundaryEdges,
                overConnectedEdges: wall.validation.overConnectedEdges,
                orientationConflictEdges: wall.validation.orientationConflictEdges,
                weldedVertexCount: wall.validation.weldedVertexCount
            },
            componentSizes: wall.componentSizes
        })),
        sides: sides.map((side) => ({
            wallIndex: side.wallIndex,
            sideName: side.sideName,
            label: side.label,
            valid: side.valid,
            plane: plainPlane(side.plane),
            expectedRestoredStockMm: side.expectedRestoredStockMm,
            stock: side.stock
        })),
        bounds: plainBox(result.walls.reduce((box, wall) => {
            wall.computeBoundingBox();
            return box.union(wall.boundingBox);
        }, new THREE.Box3()))
    });

    console.log(`wrote ${outputPath}`);
    console.log(`wrote ${jsonPath}`);

    result.foot?.dispose?.();
    result.walls?.forEach((wall) => wall?.dispose?.());
    input.dispose?.();

    if (failures.length > 0) {
        console.error('\nFAIL');
        failures.forEach((failure) => console.error(`- ${failure}`));
        process.exitCode = 1;
        return;
    }

    console.log('\nPASS');
}

main();
