#!/usr/bin/env node
/**
 * Cast-form multi-wall registration-key gate (3- and 4-wall molds).
 *
 * Every wall-to-wall seam must carry mating registration features using
 * per-face roles: each wall's END face (higher angle) grows male hemisphere
 * keys, each START face grows matching female sockets (enlarged by the
 * tolerance offset). Per-face assignment is required because per-wall
 * male/female is a 2-coloring of the seam cycle — impossible on the odd
 * 3-wall cycle.
 *
 * Also asserts the shared mold-global lateral half-width: keyed multi-wall
 * molds derive one W = max over per-wall estimates so mating seam faces have
 * identical radial spans and male/female key centers coincide exactly
 * (center = inner + 0.62·faceLength). Without the hoist, the asymmetric
 * handle-mug fixture produces a measurable per-wall W spread and the
 * centers drift apart — bump rides the socket rim, faces are held apart,
 * and slip leaks through the seam.
 *
 * Coverage map: 2-wall behavior + 1-wall invariance live in
 * castFormTwoPartRegistrationKeyGate.mjs; natches-off compact-block
 * invariants live in castFormCompactWallBlockGate.mjs.
 */

import fs from 'fs';
import { fileURLToPath } from 'url';
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';

import { MoldGenerator } from '../castForm/geometry/moldGenerator.js';
import { InputProcessor } from '../castForm/geometry/inputProcessor.js';
import { DEFAULT_PARAMS } from '../castForm/state/castFormDefaults.js';
import { summarizeValidation, validateGeometryForPrint } from '../geometry/meshQuality.js';

const DEFAULT_INPUT = fileURLToPath(new URL('../../test-files/Cast_registration_mug.stl', import.meta.url));
const POSITION_EPSILON = 1e-5;

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

function generate(input, { wallCount, natchesEnabled, quality = 'preview' }) {
    const params = JSON.parse(JSON.stringify(DEFAULT_PARAMS));
    params.mold.wallCount = wallCount;
    params.natches.enabled = true;
    params.experimental = {
        ...(params.experimental || {}),
        volumeWallCompiler: true,
        connectedWallTopology: true,
        compactWallBlocks: true
    };
    const generator = new MoldGenerator();
    return generator.generate(input, params, { quality, natchesEnabled });
}

function disposeResult(result) {
    result?.foot?.dispose?.();
    result?.walls?.forEach((wall) => wall?.dispose?.());
}

function getNatchHeightFractions(countPerSeam) {
    return countPerSeam === 1
        ? [0.5]
        : countPerSeam === 2
            ? [0.3, 0.7]
            : countPerSeam === 3
                ? [0.2, 0.5, 0.8]
                : [0.18, 0.38, 0.62, 0.82];
}

function getSideOutwardNormal(sideAngle, isStartSide) {
    return isStartSide
        ? { x: Math.sin(sideAngle), z: -Math.cos(sideAngle) }
        : { x: -Math.sin(sideAngle), z: Math.cos(sideAngle) };
}

function sampleFaceSpan(geometry, { sideAngle, outwardNormal, y, yWindow, normalWindow }) {
    const position = geometry.getAttribute('position');
    const radialDirection = { x: Math.cos(sideAngle), z: Math.sin(sideAngle) };
    let count = 0;
    let minRadial = Infinity;
    let maxRadial = -Infinity;

    for (let i = 0; i < position.count; i++) {
        const x = position.getX(i);
        const vertexY = position.getY(i);
        const z = position.getZ(i);

        if (Math.abs(vertexY - y) > yWindow) continue;
        const normal = x * outwardNormal.x + z * outwardNormal.z;
        if (Math.abs(normal) > normalWindow) continue;

        const radial = x * radialDirection.x + z * radialDirection.z;
        if (radial <= POSITION_EPSILON) continue;

        count++;
        minRadial = Math.min(minRadial, radial);
        maxRadial = Math.max(maxRadial, radial);
    }

    return { count, minRadial, maxRadial };
}

function sampleFaceNormal(geometry, { sideAngle, outwardNormal, y, yWindow, radialCenter, radialWindow }) {
    const position = geometry.getAttribute('position');
    const radialDirection = { x: Math.cos(sideAngle), z: Math.sin(sideAngle) };
    let count = 0;
    let minNormal = Infinity;
    let maxNormal = -Infinity;

    for (let i = 0; i < position.count; i++) {
        const x = position.getX(i);
        const vertexY = position.getY(i);
        const z = position.getZ(i);

        if (Math.abs(vertexY - y) > yWindow) continue;
        const radial = x * radialDirection.x + z * radialDirection.z;
        if (Math.abs(radial - radialCenter) > radialWindow) continue;

        const normal = x * outwardNormal.x + z * outwardNormal.z;
        count++;
        minNormal = Math.min(minNormal, normal);
        maxNormal = Math.max(maxNormal, normal);
    }

    return { count, minNormal, maxNormal };
}

function maxPositionDelta(a, b) {
    const posA = a.getAttribute('position');
    const posB = b.getAttribute('position');
    if (!posA || !posB || posA.count !== posB.count) {
        return { comparable: false, maxDelta: Infinity };
    }

    let maxDelta = 0;
    for (let i = 0; i < posA.array.length; i++) {
        maxDelta = Math.max(maxDelta, Math.abs(posA.array[i] - posB.array[i]));
    }

    return { comparable: true, maxDelta };
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
        for (const [start, end] of [[keys[0], keys[1]], [keys[1], keys[2]], [keys[2], keys[0]]]) {
            const key = edgeKey(start, end);
            if (!edgeToTriangles.has(key)) edgeToTriangles.set(key, []);
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

function measureHalfWidth(wall, wallIndex, wallCount) {
    const segmentAngle = (Math.PI * 2) / wallCount;
    const phi = (wallIndex + 0.5) * segmentAngle;
    const tangent = { x: -Math.sin(phi), z: Math.cos(phi) };
    const normal = { x: Math.cos(phi), z: Math.sin(phi) };
    const position = wall.getAttribute('position');
    let halfWidth = 0;
    let maxU = -Infinity;

    for (let i = 0; i < position.count; i++) {
        const x = position.getX(i);
        const z = position.getZ(i);
        const v = Math.abs(x * tangent.x + z * tangent.z);
        const u = x * normal.x + z * normal.z;
        if (v > halfWidth) halfWidth = v;
        if (u > maxU) maxU = u;
    }

    return { halfWidth, maxU };
}

function assertMultiWallRegistration(input, wallCount, quality, failures) {
    input.computeBoundingBox();
    const bounds = input.boundingBox;
    const keyFractions = getNatchHeightFractions(DEFAULT_PARAMS.natches.countPerSeam);
    const yWindow = Math.max(1.5, DEFAULT_PARAMS.natches.diameter * 0.2);
    const radialWindow = Math.max(1.5, DEFAULT_PARAMS.natches.diameter * 0.22);
    const boundaryWindow = Math.max(0.8, DEFAULT_PARAMS.natches.diameter * 0.12);
    const normalWindow = 0.2;
    const minDelta = DEFAULT_PARAMS.natches.depth * 0.55;
    const segmentAngle = (Math.PI * 2) / wallCount;
    const label = `${wallCount}-wall`;

    const keyed = generate(input, { wallCount, natchesEnabled: true, quality });
    const baseline = generate(input, { wallCount, natchesEnabled: false, quality });

    // G1: structure + foot untouched by keys.
    if (keyed.walls.length !== wallCount) {
        failures.push(`${label}: generated ${keyed.walls.length} walls, expected ${wallCount}`);
    }
    const footDelta = maxPositionDelta(keyed.foot, baseline.foot);
    if (!footDelta.comparable || footDelta.maxDelta > POSITION_EPSILON) {
        failures.push(`${label}: foot changed with keys (max delta ${footDelta.maxDelta})`);
    }

    // G2: mesh validity + single component per keyed wall.
    keyed.walls.forEach((wall, wallIndex) => {
        const validation = validateGeometryForPrint(wall, {
            weldDecimalPlaces: 5,
            enforceOrientationConsistency: true
        });
        const componentSizes = connectedSurfaceComponentSizes(wall, 5);
        console.log(`  ${label} W${wallIndex + 1}: ${summarizeValidation(validation)} components=${componentSizes.length}`);
        if (!validation.valid) {
            failures.push(`${label} W${wallIndex + 1}: ${validation.errors.join('; ')}`);
        }
        if (componentSizes.length !== 1) {
            failures.push(`${label} W${wallIndex + 1}: ${componentSizes.length} connected components`);
        }
    });

    // G3/G4: shared mold-global half-width, not oversized, and bump containment.
    const keyedW = keyed.walls.map((wall, i) => measureHalfWidth(wall, i, wallCount));
    const baselineW = baseline.walls.map((wall, i) => measureHalfWidth(wall, i, wallCount));
    const keyedSpread = Math.max(...keyedW.map((w) => w.halfWidth)) - Math.min(...keyedW.map((w) => w.halfWidth));
    const baselineMax = Math.max(...baselineW.map((w) => w.halfWidth));
    console.log(
        `  ${label}: keyed W = [${keyedW.map((w) => w.halfWidth.toFixed(3)).join(', ')}] `
        + `spread=${keyedSpread.toFixed(4)} baselineMax=${baselineMax.toFixed(3)}`
    );
    if (keyedSpread > 1e-3) {
        failures.push(`${label}: keyed half-width spread ${keyedSpread.toFixed(4)}mm — shared mold-global W not applied`);
    }
    keyedW.forEach((w, i) => {
        // Equal to the max per-wall derivation, no more (oversize guard) and no
        // less; doubles as bump containment — an escaped male bump would raise
        // max|v| above the bump-free baseline maximum. (If a future fixture's
        // natch floor binds, relax the upper bound by the recomputed floor.)
        if (Math.abs(w.halfWidth - baselineMax) > 1e-3) {
            failures.push(
                `${label} W${i + 1}: keyed half-width ${w.halfWidth.toFixed(3)} != baseline max ${baselineMax.toFixed(3)} `
                + `(oversized, undersized, or a male bump escaped the lateral plane)`
            );
        }
        // Outer flat face untouched by keys or the shared-W hoist.
        if (Math.abs(w.maxU - baselineW[i].maxU) > 1e-3) {
            failures.push(`${label} W${i + 1}: outer flat face moved (${w.maxU.toFixed(3)} vs ${baselineW[i].maxU.toFixed(3)})`);
        }
    });

    // G5: per-seam mating. Seam k at angle k*segmentAngle pairs the END face of
    // wall k-1 (male) with the START face of wall k (female).
    for (let k = 0; k < wallCount; k++) {
        const seamAngle = k * segmentAngle;
        const maleWallIndex = (k - 1 + wallCount) % wallCount;
        const femaleWallIndex = k;
        // Wall N-1's end face sits at angle N*segmentAngle === 2π ≡ seam 0.
        const maleSideAngle = k === 0 ? Math.PI * 2 : seamAngle;
        const maleOutward = getSideOutwardNormal(maleSideAngle, false);
        const femaleOutward = getSideOutwardNormal(seamAngle, true);
        const seamLabel = `${label} seam@${Math.round(seamAngle * 180 / Math.PI)}°`;

        for (const fraction of keyFractions) {
            const y = bounds.min.y + (bounds.max.y - bounds.min.y) * fraction;

            // Spans on the KEYED walls (normalWindow excludes bump/socket
            // vertices) — with the shared W these must agree between the sides.
            const maleSpan = sampleFaceSpan(keyed.walls[maleWallIndex], {
                sideAngle: maleSideAngle,
                outwardNormal: maleOutward,
                y,
                yWindow,
                normalWindow
            });
            const femaleSpan = sampleFaceSpan(keyed.walls[femaleWallIndex], {
                sideAngle: seamAngle,
                outwardNormal: femaleOutward,
                y,
                yWindow,
                normalWindow
            });

            if (maleSpan.count === 0 || femaleSpan.count === 0) {
                failures.push(`${seamLabel}: mating-face span missing at y ${y.toFixed(2)}`);
                continue;
            }

            const maleCenter = maleSpan.minRadial + (maleSpan.maxRadial - maleSpan.minRadial) * 0.62;
            const femaleCenter = femaleSpan.minRadial + (femaleSpan.maxRadial - femaleSpan.minRadial) * 0.62;

            // Center agreement — the mating guarantee the shared W exists for.
            if (Math.abs(maleCenter - femaleCenter) > 0.5) {
                failures.push(
                    `${seamLabel}: key centers misaligned at y ${y.toFixed(2)} `
                    + `(male ${maleCenter.toFixed(3)} vs female ${femaleCenter.toFixed(3)})`
                );
            }
            if (Math.abs(maleSpan.minRadial - femaleSpan.minRadial) > 0.5
                || Math.abs(maleSpan.maxRadial - femaleSpan.maxRadial) > 0.5) {
                failures.push(
                    `${seamLabel}: mating spans disagree at y ${y.toFixed(2)} `
                    + `(male ${maleSpan.minRadial.toFixed(2)}..${maleSpan.maxRadial.toFixed(2)} vs `
                    + `female ${femaleSpan.minRadial.toFixed(2)}..${femaleSpan.maxRadial.toFixed(2)})`
                );
            }

            // Male protrusion on the END face.
            const male = sampleFaceNormal(keyed.walls[maleWallIndex], {
                sideAngle: maleSideAngle,
                outwardNormal: maleOutward,
                y,
                yWindow,
                radialCenter: maleCenter,
                radialWindow
            });
            // Female recess on the START face.
            const female = sampleFaceNormal(keyed.walls[femaleWallIndex], {
                sideAngle: seamAngle,
                outwardNormal: femaleOutward,
                y,
                yWindow,
                radialCenter: femaleCenter,
                radialWindow
            });

            if (male.count === 0 || female.count === 0) {
                failures.push(`${seamLabel}: key sample missing at y ${y.toFixed(2)}`);
                continue;
            }
            if (male.maxNormal < minDelta) {
                failures.push(`${seamLabel}: male key too shallow at y ${y.toFixed(2)} (${male.maxNormal.toFixed(3)}mm)`);
            }
            if (female.minNormal > -minDelta) {
                failures.push(`${seamLabel}: female socket too shallow at y ${y.toFixed(2)} (${female.minNormal.toFixed(3)}mm)`);
            }

            // Cavity boundary preserved on both sides (keys must not disturb the
            // vessel-facing edge of the seam face). The seam tip is intentionally
            // NOT compared to baseline — it legitimately moves on non-max walls
            // under the shared W; the flat-face check in G4 covers the exterior.
            for (const side of [
                { name: 'male', wallIndex: maleWallIndex, sideAngle: maleSideAngle, outward: maleOutward, span: maleSpan },
                { name: 'female', wallIndex: femaleWallIndex, sideAngle: seamAngle, outward: femaleOutward, span: femaleSpan }
            ]) {
                const baselineBoundary = sampleFaceNormal(baseline.walls[side.wallIndex], {
                    sideAngle: side.sideAngle,
                    outwardNormal: side.outward,
                    y,
                    yWindow,
                    radialCenter: side.span.minRadial,
                    radialWindow: boundaryWindow
                });
                const keyedBoundary = sampleFaceNormal(keyed.walls[side.wallIndex], {
                    sideAngle: side.sideAngle,
                    outwardNormal: side.outward,
                    y,
                    yWindow,
                    radialCenter: side.span.minRadial,
                    radialWindow: boundaryWindow
                });
                if (
                    baselineBoundary.count > 0
                    && keyedBoundary.count > 0
                    && (
                        Math.abs(keyedBoundary.minNormal - baselineBoundary.minNormal) > normalWindow
                        || Math.abs(keyedBoundary.maxNormal - baselineBoundary.maxNormal) > normalWindow
                    )
                ) {
                    failures.push(`${seamLabel}: ${side.name} cavity boundary moved at y ${y.toFixed(2)}`);
                }
            }
        }
    }

    disposeResult(keyed);
    disposeResult(baseline);
}

function main() {
    const inputPath = readArg('input', DEFAULT_INPUT);
    const quality = readArg('quality', 'preview');
    const wallCountArg = readArg('wall-count', null);
    const wallCounts = wallCountArg ? [Math.round(Number(wallCountArg))] : [3, 4];
    const failures = [];

    console.log('Cast-form multi-wall registration-key gate');
    console.log(`input: ${inputPath}`);
    console.log(`quality: ${quality}`);
    console.log(`wall-counts: ${wallCounts.join(', ')}`);

    for (const wallCount of wallCounts) {
        console.log(`\n== wallCount=${wallCount} ==`);
        const input = loadProcessedInput(inputPath);
        assertMultiWallRegistration(input, wallCount, quality, failures);
        input.dispose?.();
    }

    if (failures.length > 0) {
        console.error('\nFAIL');
        failures.forEach((failure) => console.error(`- ${failure}`));
        process.exit(1);
    }

    console.log('\nPASS');
    console.log('- every seam pairs a male END face with a female START face');
    console.log('- male/female key centers coincide (shared mold-global half-width)');
    console.log('- cavity boundaries, outer flat faces, and the foot are unchanged by keys');
}

main();
