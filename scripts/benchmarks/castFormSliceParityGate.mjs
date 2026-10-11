#!/usr/bin/env node
/**
 * Cast-form slice parity gate.
 *
 * Verifies that seam-side wall material persists across horizontal slices,
 * reducing the risk of viewport-visible geometry being dropped by slicers.
 */

import * as THREE from 'three';

import { MoldGenerator } from '../castForm/geometry/moldGenerator.js';
import { DEFAULT_PARAMS } from '../castForm/state/castFormDefaults.js';

const EPS = 1e-6;

function readArg(name, fallback = null) {
    const prefix = `--${name}=`;
    const match = process.argv.find((arg) => arg.startsWith(prefix));
    return match ? match.slice(prefix.length) : fallback;
}

function cloneParams() {
    return JSON.parse(JSON.stringify(DEFAULT_PARAMS));
}

function createInputGeometry() {
    const profile = [];
    const steps = 84;

    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const y = t * 118;
        const radius =
            24
            + 18 * Math.sin(t * Math.PI * 0.9)
            + 3.8 * Math.sin(t * Math.PI * 6.5)
            + (t > 0.74 ? 7.5 * ((t - 0.74) / 0.26) : 0);

        profile.push(new THREE.Vector2(Math.max(14, radius), y));
    }

    const geometry = new THREE.LatheGeometry(profile, 200).toNonIndexed();
    geometry.computeBoundingBox();
    return geometry;
}

function iterateTriangles(geometry, callback) {
    const position = geometry.getAttribute('position');
    const index = geometry.getIndex();

    const readVertex = (vertexIndex) => {
        const x = position.getX(vertexIndex);
        const y = position.getY(vertexIndex);
        const z = position.getZ(vertexIndex);
        return [x, y, z];
    };

    if (index) {
        const triangleCount = Math.floor(index.count / 3);
        for (let tri = 0; tri < triangleCount; tri++) {
            const i0 = index.getX(tri * 3);
            const i1 = index.getX(tri * 3 + 1);
            const i2 = index.getX(tri * 3 + 2);
            callback(readVertex(i0), readVertex(i1), readVertex(i2));
        }
        return;
    }

    const triangleCount = Math.floor(position.count / 3);
    for (let tri = 0; tri < triangleCount; tri++) {
        const i0 = tri * 3;
        const i1 = i0 + 1;
        const i2 = i0 + 2;
        callback(readVertex(i0), readVertex(i1), readVertex(i2));
    }
}

function edgePlaneIntersection(v0, v1, yPlane) {
    const y0 = v0[1] - yPlane;
    const y1 = v1[1] - yPlane;

    const above0 = y0 > EPS;
    const below0 = y0 < -EPS;
    const above1 = y1 > EPS;
    const below1 = y1 < -EPS;

    if ((above0 && above1) || (below0 && below1)) {
        return null;
    }

    if ((Math.abs(y0) <= EPS && Math.abs(y1) <= EPS) || Math.abs(v1[1] - v0[1]) <= EPS) {
        return null;
    }

    if (Math.abs(y0) <= EPS) {
        return [v0[0], yPlane, v0[2]];
    }

    if (Math.abs(y1) <= EPS) {
        return [v1[0], yPlane, v1[2]];
    }

    if (!((above0 && below1) || (below0 && above1))) {
        return null;
    }

    const t = (yPlane - v0[1]) / (v1[1] - v0[1]);
    if (t < -EPS || t > 1 + EPS) {
        return null;
    }

    return [
        v0[0] + (v1[0] - v0[0]) * t,
        yPlane,
        v0[2] + (v1[2] - v0[2]) * t
    ];
}

function collectSliceSegments(geometry, yPlane) {
    const segments = [];

    iterateTriangles(geometry, (v0, v1, v2) => {
        const intersections = [];

        const p01 = edgePlaneIntersection(v0, v1, yPlane);
        const p12 = edgePlaneIntersection(v1, v2, yPlane);
        const p20 = edgePlaneIntersection(v2, v0, yPlane);

        if (p01) intersections.push(p01);
        if (p12) intersections.push(p12);
        if (p20) intersections.push(p20);

        if (intersections.length < 2) {
            return;
        }

        const pA = intersections[0];
        let pB = intersections[1];

        if (
            Math.abs(pA[0] - pB[0]) <= EPS
            && Math.abs(pA[2] - pB[2]) <= EPS
            && intersections.length >= 3
        ) {
            pB = intersections[2];
        }

        const dx = pB[0] - pA[0];
        const dz = pB[2] - pA[2];
        const len = Math.hypot(dx, dz);

        if (len <= EPS) {
            return;
        }

        segments.push([pA, pB, len]);
    });

    return segments;
}

function normalizeAngle(angle) {
    const tau = Math.PI * 2;
    const wrapped = angle % tau;
    return wrapped < 0 ? wrapped + tau : wrapped;
}

function angularDistance(a, b) {
    const tau = Math.PI * 2;
    const diff = Math.abs(normalizeAngle(a) - normalizeAngle(b));
    return Math.min(diff, tau - diff);
}

function seamBandLength(segments, seamAngle, seamBandMm) {
    let total = 0;

    for (const [pA, pB, segLength] of segments) {
        const mx = (pA[0] + pB[0]) * 0.5;
        const mz = (pA[2] + pB[2]) * 0.5;
        const radius = Math.hypot(mx, mz);
        if (radius <= EPS) continue;

        const angle = normalizeAngle(Math.atan2(mz, mx));
        const arcDistance = angularDistance(angle, seamAngle) * radius;

        if (arcDistance <= seamBandMm) {
            total += segLength;
        }
    }

    return total;
}

function checkWallSliceParity(wallGeometry, wallIndex, options = {}) {
    const seamBandMm = options.seamBandMm ?? 1.6;
    const minSeamLengthMm = options.minSeamLengthMm ?? 1.2;
    const layerCount = options.layerCount ?? 42;
    const minHitRatio = options.minHitRatio ?? 0.86;
    const wallCount = options.wallCount ?? 3;

    if (wallCount <= 1) {
        wallGeometry.computeBoundingBox();
        const yMin = wallGeometry.boundingBox.min.y + 1.2;
        const yMax = wallGeometry.boundingBox.max.y - 1.2;
        let sampledLayers = 0;

        for (let i = 0; i < layerCount; i++) {
            const t = layerCount <= 1 ? 0.5 : i / (layerCount - 1);
            const y = yMin + (yMax - yMin) * t;
            if (collectSliceSegments(wallGeometry, y).length > 0) {
                sampledLayers++;
            }
        }

        return {
            ok: sampledLayers > 0,
            reason: sampledLayers > 0 ? '' : 'No slice intersections found for closed wall geometry',
            sampledLayers,
            startHitRatio: 1,
            endHitRatio: 1
        };
    }

    wallGeometry.computeBoundingBox();
    const box = wallGeometry.boundingBox;

    const yMin = box.min.y + 1.2;
    const yMax = box.max.y - 1.2;

    const segmentAngle = (Math.PI * 2) / wallCount;
    const startAngle = wallIndex * segmentAngle;
    const endAngle = (wallIndex + 1) * segmentAngle;

    let startHits = 0;
    let endHits = 0;
    let sampledLayers = 0;

    for (let i = 0; i < layerCount; i++) {
        const t = layerCount <= 1 ? 0.5 : i / (layerCount - 1);
        const y = yMin + (yMax - yMin) * t;

        const segments = collectSliceSegments(wallGeometry, y);
        if (segments.length === 0) {
            continue;
        }

        sampledLayers++;

        const startLength = seamBandLength(segments, startAngle, seamBandMm);
        const endLength = seamBandLength(segments, endAngle, seamBandMm);

        if (startLength >= minSeamLengthMm) startHits++;
        if (endLength >= minSeamLengthMm) endHits++;
    }

    if (sampledLayers === 0) {
        return {
            ok: false,
            reason: 'No slice intersections found for wall geometry',
            sampledLayers,
            startHitRatio: 0,
            endHitRatio: 0
        };
    }

    const startHitRatio = startHits / sampledLayers;
    const endHitRatio = endHits / sampledLayers;

    const ok = startHitRatio >= minHitRatio && endHitRatio >= minHitRatio;

    return {
        ok,
        sampledLayers,
        startHitRatio,
        endHitRatio,
        reason: ok
            ? ''
            : `startHitRatio=${startHitRatio.toFixed(2)}, endHitRatio=${endHitRatio.toFixed(2)}, expected>=${minHitRatio.toFixed(2)}`
    };
}

function main() {
    console.log('Cast-form slice parity gate');

    const inputGeometry = createInputGeometry();
    const params = cloneParams();
    const wallCount = Math.max(1, Math.min(4, Math.round(Number(readArg('wall-count', '3')) || 3)));
    const cornerCutArg = readArg('corner-cut');
    const cornerCutWidth = cornerCutArg === null ? NaN : Number(cornerCutArg);
    params.mold.wallCount = wallCount;
    if (Number.isFinite(cornerCutWidth)) {
        params.mold.cornerCutWidth = cornerCutWidth;
    }

    params.experimental = {
        ...(params.experimental || {}),
        volumeWallCompiler: true
    };

    const generator = new MoldGenerator();
    const result = generator.generate(inputGeometry, params, { quality: 'export' });

    let failed = false;

    if (result.walls.length !== wallCount) {
        failed = true;
        console.error(`- wall-count: FAIL generated ${result.walls.length}, expected ${wallCount}`);
    }

    result.walls.forEach((wall, index) => {
        const parity = checkWallSliceParity(wall, index, { wallCount });
        const label = `wall-${index + 1}`;

        if (parity.ok) {
            console.log(`- ${label}: PASS layers=${parity.sampledLayers} start=${parity.startHitRatio.toFixed(2)} end=${parity.endHitRatio.toFixed(2)}`);
            return;
        }

        failed = true;
        console.error(`- ${label}: FAIL ${parity.reason}`);
    });

    result.foot?.dispose();
    result.walls?.forEach((wall) => wall?.dispose());
    inputGeometry.dispose();

    if (failed) {
        console.error('Slice parity gate failed');
        process.exitCode = 1;
        return;
    }

    console.log('Slice parity gate passed');
}

main();
