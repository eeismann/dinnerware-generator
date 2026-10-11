#!/usr/bin/env node
/**
 * Cast-form compact wall block gate (default product behavior).
 *
 * Each generated wall must be a compact "lay-flat prism" block instead of the
 * legacy triangle wedge: flat outer face at outerWallDistance, two vertical
 * lateral faces exactly perpendicular to it at +/- halfWidth from the bisector,
 * radial seam faces near the vessel, and zero undercuts along the bisector.
 * These invariants let the printed form lie outer-face-down and release straight
 * up out of a cast polymer case mold.
 *
 * Asserted per wall (wall counts 2, 3, 4):
 *   1. mesh validity + single connected component
 *   2. corners clipped (no longer a wedge) + angular span containment
 *   3. plane containment: outer face + both lateral planes
 *   4. lateral faces planar, vertical, exactly perpendicular to the outer face
 *   5. crisp 90-degree corner edges spanning the full part height
 *   6. prism property: outer + lateral planes touched at every height slab
 *   7. plaster guarantee: halfWidth covers the inner envelope (vessel + spare
 *      slip-well ring) by plasterWallThickness, independently recomputed
 *   8. seam faces reach the lateral-plane corner and descend to the cavity
 *
 * Runs with natchesEnabled: false ON PURPOSE. Registration keys (wall counts
 * >= 2) add seam-face bumps/sockets and, for 3/4-wall molds, a shared
 * mold-global half-width — the angular-span containment (check in
 * evaluateWall) and per-wall halfWidth-not-oversized assertions here would
 * reject both. Keyed multi-wall behavior is asserted by
 * castFormMultiWallRegistrationKeyGate.mjs (npm run verify:cast-registration).
 */

import fs from 'fs';
import path from 'path';
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';

import { MoldGenerator } from '../castForm/geometry/moldGenerator.js';
import { InputProcessor } from '../castForm/geometry/inputProcessor.js';
import { computeWallLateralPlanes, collectCutPlaneViolations } from '../castForm/geometry/sideStockCutPlanes.js';
import { BASE_MOLD_HEIGHT, DEFAULT_PARAMS } from '../castForm/state/castFormDefaults.js';
import { summarizeValidation, validateGeometryForPrint } from '../geometry/meshQuality.js';

const DEFAULT_INPUT = 'output/fixtures/untitled_mug_6.stl';
const DEFAULT_JSON = 'output/visuals/cast_form_compact_wall_block_gate.json';
const EPSILON = 1e-6;
const PLANE_TOLERANCE = 1e-3;
const FACE_TOLERANCE = 0.05;

function readArg(name, fallback = null) {
    const prefix = `--${name}=`;
    const match = process.argv.find((arg) => arg.startsWith(prefix));
    return match ? match.slice(prefix.length) : fallback;
}

function readNumberArg(name, fallback) {
    const value = Number(readArg(name, `${fallback}`));
    return Number.isFinite(value) ? value : fallback;
}

function loadProcessedInput(filePath) {
    const data = fs.readFileSync(filePath);
    const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    const raw = new STLLoader().parse(arrayBuffer);
    const processed = InputProcessor.processGeometry(raw);
    if (!processed.geometry) {
        throw new Error(`Could not process STL: ${processed.errors.join('; ')}`);
    }
    return processed.geometry;
}

function buildParams({ wallCount }) {
    const params = JSON.parse(JSON.stringify(DEFAULT_PARAMS));
    params.mold.wallCount = wallCount;
    params.experimental = {
        ...(params.experimental || {}),
        volumeWallCompiler: true,
        connectedWallTopology: true,
        compactWallBlocks: true
    };
    return params;
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

function generateParts(input, { wallCount, quality }) {
    const params = buildParams({ wallCount });
    const generator = new MoldGenerator();

    generator.applySamplingPreset(input, quality);
    input.computeBoundingBox();
    const bounds = input.boundingBox.clone();
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
        generator,
        profile,
        bounds,
        maxVesselRadius,
        outerWallDistance
    };
}

/**
 * Independent recomputation of the lateral cavity extent for one wall segment
 * (max of innerRadius * |sin(angle - bisector)|), using the compiler's inner
 * envelope primitive directly — not the halfWidth derivation under test.
 */
function computeSegmentEnvelopeStats({ generator, profile, bounds, params, startAngle, endAngle }) {
    const compiler = generator.wallVolumeCompiler;
    const wallNormalAngle = (startAngle + endAngle) * 0.5;
    const vesselHeight = bounds.max.y - bounds.min.y;
    const wallHeight = vesselHeight + params.mold.spareHeight + BASE_MOLD_HEIGHT;
    const baseY = bounds.min.y - BASE_MOLD_HEIGHT;
    const rows = compiler.buildConnectedWallRows({
        baseY,
        wallHeight,
        bounds,
        baseSteps: 64
    });
    const samplingOptions = {
        heightFeatureScores: compiler.buildHeightFeatureScores(profile),
        featureSnapThreshold: 0.22
    };
    const angleSteps = 64;

    let maxLateralExtent = 0;
    let minSeamInnerRadius = Infinity;

    for (const row of rows) {
        for (let a = 0; a <= angleSteps; a++) {
            const angle = startAngle + (a / angleSteps) * (endAngle - startAngle);
            const inner = compiler.computeConnectedInnerRadius({
                row,
                angle,
                profile,
                bounds,
                angleSamples: generator.angleSamples,
                samplingOptions
            });

            const lateralExtent = inner * Math.abs(Math.sin(angle - wallNormalAngle));
            if (lateralExtent > maxLateralExtent) {
                maxLateralExtent = lateralExtent;
            }
            if ((a === 0 || a === angleSteps) && inner < minSeamInnerRadius) {
                minSeamInnerRadius = inner;
            }
        }
    }

    return {
        maxLateralExtent,
        minSeamInnerRadius,
        baseY,
        wallHeight
    };
}

function evaluateWall({
    wall,
    wallIndex,
    wallCount,
    outerWallDistance,
    plasterWallThickness,
    envelopeStats
}) {
    const failures = [];
    const segmentAngle = (Math.PI * 2) / wallCount;
    const startAngle = wallIndex * segmentAngle;
    const endAngle = (wallIndex + 1) * segmentAngle;
    const halfSpan = segmentAngle * 0.5;
    const wallNormalAngle = (startAngle + endAngle) * 0.5;
    const normal = { x: Math.cos(wallNormalAngle), z: Math.sin(wallNormalAngle) };
    const tangent = { x: -Math.sin(wallNormalAngle), z: Math.cos(wallNormalAngle) };
    const D = outerWallDistance;

    const position = wall.getAttribute('position');
    const count = position.count;

    let measuredHalfWidth = 0;
    let maxU = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let maxHorizontalRadius = 0;
    let angularViolations = 0;

    const us = new Float64Array(count);
    const vs = new Float64Array(count);
    const ys = new Float64Array(count);

    for (let i = 0; i < count; i++) {
        const x = position.getX(i);
        const y = position.getY(i);
        const z = position.getZ(i);
        const u = x * normal.x + z * normal.z;
        const v = x * tangent.x + z * tangent.z;

        us[i] = u;
        vs[i] = v;
        ys[i] = y;

        if (Math.abs(v) > measuredHalfWidth) measuredHalfWidth = Math.abs(v);
        if (u > maxU) maxU = u;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;

        const radius = Math.hypot(x, z);
        if (radius > maxHorizontalRadius) maxHorizontalRadius = radius;

        // Angular span containment (with wraparound handling).
        if (radius > 1) {
            let theta = Math.atan2(z, x);
            while (theta < startAngle - 1e-3) theta += Math.PI * 2;
            if (theta > endAngle + 1e-3) {
                angularViolations += 1;
            }
        }
    }

    const W = measuredHalfWidth;
    const label = `W${wallIndex + 1}`;

    // 2. Corners clipped: strictly inside the legacy wedge for 3/4-wall molds.
    if (halfSpan < Math.PI * 0.5 - 0.001) {
        const cornerWidth = D * Math.tan(halfSpan);
        const cornerRadius = D / Math.cos(halfSpan);
        if (W > 0.95 * cornerWidth) {
            failures.push(
                `${label}: halfWidth ${W.toFixed(2)}mm not clipped below wedge corner width ${cornerWidth.toFixed(2)}mm`
            );
        }
        if (maxHorizontalRadius > 0.95 * cornerRadius) {
            failures.push(
                `${label}: max radius ${maxHorizontalRadius.toFixed(2)}mm still reaches wedge corner ${cornerRadius.toFixed(2)}mm`
            );
        }
    }
    if (maxHorizontalRadius > Math.hypot(D, W) + 1) {
        failures.push(
            `${label}: max radius ${maxHorizontalRadius.toFixed(2)}mm exceeds block corner ${Math.hypot(D, W).toFixed(2)}mm`
        );
    }
    if (angularViolations > 0) {
        failures.push(`${label}: ${angularViolations} vertices outside the segment's angular span`);
    }

    // 3. Plane containment: outer face + both lateral planes.
    const lateralPlanes = computeWallLateralPlanes({ wallNormalAngle, halfWidth: W });
    const containment = collectCutPlaneViolations(
        wall,
        [
            { name: 'outerFace', angle: wallNormalAngle, normal, distance: D },
            lateralPlanes.start,
            lateralPlanes.end
        ],
        { tolerance: PLANE_TOLERANCE }
    );
    if (!containment.valid) {
        failures.push(
            `${label}: ${containment.violationCount} vertices escape the block planes `
            + `(max ${containment.maxSignedDistance.toFixed(4)}mm)`
        );
    }

    // 4. Lateral faces: planar, vertical, perpendicular to the outer face.
    const index = wall.getIndex();
    const triangleCount = (index ? index.count : count) / 3;
    const heightSpan = maxY - minY;

    for (const side of [1, -1]) {
        const onPlane = (i) => Math.abs(side * vs[i] - W) <= FACE_TOLERANCE;
        let faceTriangles = 0;
        let badNormals = 0;
        let faceMinY = Infinity;
        let faceMaxY = -Infinity;
        let faceMinU = Infinity;
        let faceMaxU = -Infinity;

        for (let t = 0; t < triangleCount; t++) {
            const base = t * 3;
            const ids = index
                ? [index.getX(base), index.getX(base + 1), index.getX(base + 2)]
                : [base, base + 1, base + 2];
            if (!ids.every(onPlane)) continue;

            faceTriangles += 1;
            for (const id of ids) {
                if (ys[id] < faceMinY) faceMinY = ys[id];
                if (ys[id] > faceMaxY) faceMaxY = ys[id];
                if (us[id] < faceMinU) faceMinU = us[id];
                if (us[id] > faceMaxU) faceMaxU = us[id];
            }

            const [a, b, c] = ids.map((id) => new THREE.Vector3(
                position.getX(id), position.getY(id), position.getZ(id)
            ));
            const faceNormal = b.sub(a).cross(c.sub(a));
            if (faceNormal.lengthSq() <= 1e-12) continue;
            faceNormal.normalize();
            const dot = faceNormal.x * tangent.x + faceNormal.z * tangent.z;
            if (Math.abs(dot) < 0.999 || Math.abs(faceNormal.y) > 0.045) {
                badNormals += 1;
            }
        }

        const sideLabel = side > 0 ? 'end' : 'start';
        if (faceTriangles < 30) {
            failures.push(`${label} ${sideLabel}: only ${faceTriangles} lateral-face triangles (expected a full face)`);
            continue;
        }
        if (badNormals > 0) {
            failures.push(`${label} ${sideLabel}: ${badNormals} lateral-face triangles not perpendicular to the outer face`);
        }
        if (faceMinY > minY + 0.5 || faceMaxY < maxY - 0.5) {
            failures.push(
                `${label} ${sideLabel}: lateral face spans y ${faceMinY.toFixed(2)}..${faceMaxY.toFixed(2)}, `
                + `expected full height ${minY.toFixed(2)}..${maxY.toFixed(2)}`
            );
        }
        if (faceMaxU - faceMinU < 5) {
            failures.push(`${label} ${sideLabel}: lateral face u-width ${(faceMaxU - faceMinU).toFixed(2)}mm too narrow`);
        }
    }

    // 5. Crisp 90-degree corner edges spanning the full part height.
    for (const side of [1, -1]) {
        let edgeMinY = Infinity;
        let edgeMaxY = -Infinity;
        let edgeCount = 0;

        for (let i = 0; i < count; i++) {
            if (Math.abs(us[i] - D) > FACE_TOLERANCE) continue;
            if (Math.abs(side * vs[i] - W) > FACE_TOLERANCE) continue;
            edgeCount += 1;
            if (ys[i] < edgeMinY) edgeMinY = ys[i];
            if (ys[i] > edgeMaxY) edgeMaxY = ys[i];
        }

        const sideLabel = side > 0 ? 'end' : 'start';
        if (edgeCount < 10 || edgeMinY > minY + 0.5 || edgeMaxY < maxY - 0.5) {
            failures.push(
                `${label} ${sideLabel}: 90° corner edge missing or partial `
                + `(${edgeCount} vertices, y ${Number.isFinite(edgeMinY) ? edgeMinY.toFixed(2) : 'n/a'}..`
                + `${Number.isFinite(edgeMaxY) ? edgeMaxY.toFixed(2) : 'n/a'})`
            );
        }
    }

    // 6. Prism property: outer + lateral planes touched at every height slab.
    const slabCount = 6;
    for (let s = 0; s < slabCount; s++) {
        const slabMin = minY + (s / slabCount) * heightSpan;
        const slabMax = minY + ((s + 1) / slabCount) * heightSpan;
        let slabMaxU = -Infinity;
        let slabMaxAbsV = 0;

        for (let i = 0; i < count; i++) {
            if (ys[i] < slabMin - EPSILON || ys[i] > slabMax + EPSILON) continue;
            if (us[i] > slabMaxU) slabMaxU = us[i];
            if (Math.abs(vs[i]) > slabMaxAbsV) slabMaxAbsV = Math.abs(vs[i]);
        }

        if (slabMaxU < D - FACE_TOLERANCE || slabMaxAbsV < W - FACE_TOLERANCE) {
            failures.push(
                `${label}: height slab ${s + 1}/${slabCount} does not reach the block planes `
                + `(maxU=${slabMaxU.toFixed(3)} vs D=${D.toFixed(3)}, max|v|=${slabMaxAbsV.toFixed(3)} vs W=${W.toFixed(3)}) `
                + `— outer envelope is not a full-height prism`
            );
        }
    }

    // 7. Plaster guarantee vs independently recomputed inner envelope.
    const { maxLateralExtent, minSeamInnerRadius } = envelopeStats;
    if (W - maxLateralExtent < plasterWallThickness - 1) {
        failures.push(
            `${label}: lateral plaster ${(W - maxLateralExtent).toFixed(2)}mm below required `
            + `${plasterWallThickness}mm (halfWidth ${W.toFixed(2)}, cavity extent ${maxLateralExtent.toFixed(2)})`
        );
    }
    if (W > maxLateralExtent + plasterWallThickness + 2) {
        failures.push(
            `${label}: halfWidth ${W.toFixed(2)}mm oversized vs expected `
            + `${(maxLateralExtent + plasterWallThickness).toFixed(2)}mm (+0.5 alias margin)`
        );
    }

    // 8. Seam faces reach the lateral-plane corner and descend to the cavity.
    const seamTipRadius = halfSpan < Math.PI * 0.5 - 0.001 ? W / Math.sin(halfSpan) : W;
    for (const [seamAngle, seamLabel] of [[startAngle, 'start'], [endAngle, 'end']]) {
        let seamMaxRadius = 0;
        let seamMinRadius = Infinity;

        for (let i = 0; i < count; i++) {
            const x = position.getX(i);
            const z = position.getZ(i);
            const radius = Math.hypot(x, z);
            if (radius <= 1) continue;
            const seamDistance = Math.abs(
                x * -Math.sin(seamAngle) + z * Math.cos(seamAngle)
            );
            if (seamDistance > 0.2) continue;
            if (radius > seamMaxRadius) seamMaxRadius = radius;
            if (radius < seamMinRadius) seamMinRadius = radius;
        }

        if (Math.abs(seamMaxRadius - seamTipRadius) > 1.5) {
            failures.push(
                `${label} ${seamLabel} seam: outer edge at ${seamMaxRadius.toFixed(2)}mm, `
                + `expected lateral-plane corner ${seamTipRadius.toFixed(2)}mm`
            );
        }
        if (seamMinRadius > minSeamInnerRadius + 1.5) {
            failures.push(
                `${label} ${seamLabel} seam: face starts at ${seamMinRadius.toFixed(2)}mm, `
                + `expected to descend to cavity ${minSeamInnerRadius.toFixed(2)}mm`
            );
        }
    }

    return {
        wallIndex,
        halfWidth: W,
        maxU,
        maxHorizontalRadius,
        minY,
        maxY,
        failures
    };
}

function main() {
    const inputPath = readArg('input', DEFAULT_INPUT);
    const jsonPath = readArg('json', DEFAULT_JSON);
    const quality = readArg('quality', 'preview');
    const wallCountArg = readArg('wall-count', null);
    const wallCounts = wallCountArg
        ? [Math.round(readNumberArg('wall-count', 3))]
        : [2, 3, 4];
    const failures = [];
    const report = [];

    console.log('Cast-form compact wall block gate');
    console.log(`input: ${inputPath}`);
    console.log(`quality: ${quality}`);
    console.log(`wall-counts: ${wallCounts.join(', ')}`);

    for (const wallCount of wallCounts) {
        console.log(`\n== wallCount=${wallCount} ==`);
        const input = loadProcessedInput(inputPath);
        const { result, params, generator, profile, bounds, outerWallDistance } = generateParts(input, {
            wallCount,
            quality
        });

        if (result.walls.length !== wallCount) {
            failures.push(`wallCount=${wallCount}: generated ${result.walls.length} walls`);
        }

        const wallReports = result.walls.map((wall, wallIndex) => {
            const segmentAngle = (Math.PI * 2) / wallCount;
            const envelopeStats = computeSegmentEnvelopeStats({
                generator,
                profile,
                bounds,
                params,
                startAngle: wallIndex * segmentAngle,
                endAngle: (wallIndex + 1) * segmentAngle
            });

            const validation = validateGeometryForPrint(wall, {
                weldDecimalPlaces: 5,
                enforceOrientationConsistency: true
            });
            const componentSizes = connectedSurfaceComponentSizes(wall, 5);

            if (!validation.valid) {
                failures.push(`wallCount=${wallCount} W${wallIndex + 1}: ${validation.errors.join('; ')}`);
            }
            if (componentSizes.length !== 1) {
                failures.push(
                    `wallCount=${wallCount} W${wallIndex + 1}: ${componentSizes.length} connected components`
                );
            }

            const evaluation = evaluateWall({
                wall,
                wallIndex,
                wallCount,
                outerWallDistance,
                plasterWallThickness: params.mold.plasterWallThickness,
                envelopeStats
            });

            const wedgeCornerNote = wallCount >= 3
                ? `(wedge corner was ${(outerWallDistance / Math.cos(Math.PI / wallCount)).toFixed(2)}mm) `
                : '';
            console.log(
                `W${wallIndex + 1}: ${summarizeValidation(validation)} `
                + `halfWidth=${evaluation.halfWidth.toFixed(2)}mm `
                + `maxR=${evaluation.maxHorizontalRadius.toFixed(2)}mm `
                + wedgeCornerNote
                + `${evaluation.failures.length === 0 ? 'PASS' : 'FAIL'}`
            );
            evaluation.failures.forEach((failure) => console.log(`  - ${failure}`));
            failures.push(...evaluation.failures.map((f) => `wallCount=${wallCount} ${f}`));

            return {
                wallIndex,
                halfWidth: evaluation.halfWidth,
                maxHorizontalRadius: evaluation.maxHorizontalRadius,
                envelope: envelopeStats,
                validation: {
                    valid: validation.valid,
                    triangleCount: validation.triangleCount,
                    degenerateCount: validation.degenerateCount,
                    boundaryEdges: validation.boundaryEdges
                },
                componentCount: componentSizes.length,
                failures: evaluation.failures
            };
        });

        report.push({ wallCount, outerWallDistance, walls: wallReports });

        result.foot?.dispose?.();
        result.walls?.forEach((wall) => wall?.dispose?.());
        input.dispose?.();
    }

    fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
    fs.writeFileSync(jsonPath, JSON.stringify({
        inputPath,
        quality,
        valid: failures.length === 0,
        failures,
        runs: report
    }, null, 2));
    console.log(`\nwrote ${jsonPath}`);

    if (failures.length > 0) {
        console.error('\nFAIL');
        failures.forEach((failure) => console.error(`- ${failure}`));
        process.exitCode = 1;
        return;
    }

    console.log('\nPASS');
}

main();
