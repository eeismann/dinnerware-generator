#!/usr/bin/env node
/**
 * Cast-form two-part registration-key gate.
 *
 * Verifies the two-part registration baseline: wall 1 gets positive keys at
 * both split faces, wall 2 gets matching negative sockets at the same seam
 * angles and heights (legacy per-wall role mapping), and the 1-wall closed
 * ring remains key-invariant — this invariance permanently guards against the
 * dormant radial computeNatchOffset path waking on the wrap seam.
 *
 * 3- and 4-wall molds now legitimately grow per-face registration keys
 * (END face = male, START face = female); they are asserted by
 * castFormMultiWallRegistrationKeyGate.mjs (npm run verify:cast-registration).
 */

import fs from 'fs';
import { fileURLToPath } from 'url';
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';

import { MoldGenerator } from '../castForm/geometry/moldGenerator.js';
import { InputProcessor } from '../castForm/geometry/inputProcessor.js';
import { DEFAULT_PARAMS } from '../castForm/state/castFormDefaults.js';

const DEFAULT_INPUT = fileURLToPath(new URL('../../test-files/Cast_registration_mug.stl', import.meta.url));
const TAU = Math.PI * 2;
const POSITION_EPSILON = 1e-5;

function readArg(name, fallback = null) {
    const prefix = `--${name}=`;
    const match = process.argv.find((arg) => arg.startsWith(prefix));
    return match ? match.slice(prefix.length) : fallback;
}

function normalizeAngle(angle) {
    const wrapped = angle % TAU;
    return wrapped < 0 ? wrapped + TAU : wrapped;
}

function angleDistance(a, b) {
    const diff = Math.abs(normalizeAngle(a) - normalizeAngle(b));
    return Math.min(diff, TAU - diff);
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

function cloneParams({ wallCount, registrationEnabled = true } = {}) {
    const params = JSON.parse(JSON.stringify(DEFAULT_PARAMS));
    params.mold.wallCount = wallCount;
    params.natches.enabled = registrationEnabled;
    params.experimental = {
        ...(params.experimental || {}),
        volumeWallCompiler: true,
        connectedWallTopology: true
    };
    return params;
}

function generate(input, { wallCount, natchesEnabled, registrationEnabled = true, quality = 'preview' }) {
    const params = cloneParams({ wallCount, registrationEnabled });
    const generator = new MoldGenerator();
    return generator.generate(input, params, {
        quality,
        natchesEnabled
    });
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
    const radialDirection = {
        x: Math.cos(sideAngle),
        z: Math.sin(sideAngle)
    };
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

    return {
        count,
        minRadial,
        maxRadial
    };
}

function sampleFaceNormal(geometry, { sideAngle, outwardNormal, y, yWindow, radialCenter, radialWindow }) {
    const position = geometry.getAttribute('position');
    const radialDirection = {
        x: Math.cos(sideAngle),
        z: Math.sin(sideAngle)
    };
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

    return {
        count,
        minNormal,
        maxNormal
    };
}

function maxPositionDelta(a, b) {
    const posA = a.getAttribute('position');
    const posB = b.getAttribute('position');
    if (!posA || !posB || posA.count !== posB.count) {
        return {
            comparable: false,
            countA: posA?.count ?? 0,
            countB: posB?.count ?? 0,
            maxDelta: Infinity
        };
    }

    let maxDelta = 0;
    for (let i = 0; i < posA.array.length; i++) {
        maxDelta = Math.max(maxDelta, Math.abs(posA.array[i] - posB.array[i]));
    }

    return {
        comparable: true,
        countA: posA.count,
        countB: posB.count,
        maxDelta
    };
}

function assertTwoPartRegistration(input, quality, failures) {
    input.computeBoundingBox();
    const bounds = input.boundingBox;
    const keyFractions = getNatchHeightFractions(DEFAULT_PARAMS.natches.countPerSeam);
    const yWindow = Math.max(1.5, DEFAULT_PARAMS.natches.diameter * 0.2);
    const radialWindow = Math.max(1.5, DEFAULT_PARAMS.natches.diameter * 0.22);
    const boundaryWindow = Math.max(0.8, DEFAULT_PARAMS.natches.diameter * 0.12);
    const normalWindow = 0.2;
    const minDelta = DEFAULT_PARAMS.natches.depth * 0.55;

    const keyed = generate(input, { wallCount: 2, natchesEnabled: true, quality });
    const baseline = generate(input, { wallCount: 2, natchesEnabled: false, quality });

    if (keyed.walls.length !== 2) {
        failures.push(`two-part wall count: generated ${keyed.walls.length}, expected 2`);
    }

    const footDelta = maxPositionDelta(keyed.foot, baseline.foot);
    if (!footDelta.comparable || footDelta.maxDelta > POSITION_EPSILON) {
        failures.push(`foot unchanged: max position delta ${footDelta.maxDelta}`);
    }

    const facePairs = [
        {
            label: '0',
            positive: { wallIndex: 0, sideAngle: 0, isStartSide: true },
            negative: { wallIndex: 1, sideAngle: Math.PI * 2, isStartSide: false }
        },
        {
            label: 'pi',
            positive: { wallIndex: 0, sideAngle: Math.PI, isStartSide: false },
            negative: { wallIndex: 1, sideAngle: Math.PI, isStartSide: true }
        }
    ];

    for (const pair of facePairs) {
        for (const fraction of keyFractions) {
            const y = bounds.min.y + (bounds.max.y - bounds.min.y) * fraction;
            const positiveOutward = getSideOutwardNormal(pair.positive.sideAngle, pair.positive.isStartSide);
            const negativeOutward = getSideOutwardNormal(pair.negative.sideAngle, pair.negative.isStartSide);
            const positiveSpan = sampleFaceSpan(baseline.walls[pair.positive.wallIndex], {
                sideAngle: pair.positive.sideAngle,
                outwardNormal: positiveOutward,
                y,
                yWindow,
                normalWindow
            });
            const negativeSpan = sampleFaceSpan(baseline.walls[pair.negative.wallIndex], {
                sideAngle: pair.negative.sideAngle,
                outwardNormal: negativeOutward,
                y,
                yWindow,
                normalWindow
            });

            if (positiveSpan.count === 0 || negativeSpan.count === 0) {
                failures.push(`mating-face span missing: seam ${pair.label}, y ${y.toFixed(2)}`);
                continue;
            }

            const positiveCenter = positiveSpan.minRadial + (positiveSpan.maxRadial - positiveSpan.minRadial) * 0.62;
            const negativeCenter = negativeSpan.minRadial + (negativeSpan.maxRadial - negativeSpan.minRadial) * 0.62;
            const positive = sampleFaceNormal(keyed.walls[pair.positive.wallIndex], {
                sideAngle: pair.positive.sideAngle,
                outwardNormal: positiveOutward,
                y,
                yWindow,
                radialCenter: positiveCenter,
                radialWindow
            });
            const negative = sampleFaceNormal(keyed.walls[pair.negative.wallIndex], {
                sideAngle: pair.negative.sideAngle,
                outwardNormal: negativeOutward,
                y,
                yWindow,
                radialCenter: negativeCenter,
                radialWindow
            });

            if (positive.count === 0 || negative.count === 0) {
                failures.push(`mating-face key sample missing: seam ${pair.label}, y ${y.toFixed(2)}`);
                continue;
            }

            if (positive.maxNormal < minDelta) {
                failures.push(`positive key too shallow on mating face: seam ${pair.label}, y ${y.toFixed(2)}, normal ${positive.maxNormal.toFixed(3)} mm`);
            }
            if (negative.minNormal > -minDelta) {
                failures.push(`negative socket too shallow on mating face: seam ${pair.label}, y ${y.toFixed(2)}, normal ${negative.minNormal.toFixed(3)} mm`);
            }

            for (const [name, radialTarget] of [
                ['cavity', positiveSpan.minRadial],
                ['exterior', positiveSpan.maxRadial]
            ]) {
                const baselineBoundary = sampleFaceNormal(baseline.walls[pair.positive.wallIndex], {
                    sideAngle: pair.positive.sideAngle,
                    outwardNormal: positiveOutward,
                    y,
                    yWindow,
                    radialCenter: radialTarget,
                    radialWindow: boundaryWindow
                });
                const boundary = sampleFaceNormal(keyed.walls[pair.positive.wallIndex], {
                    sideAngle: pair.positive.sideAngle,
                    outwardNormal: positiveOutward,
                    y,
                    yWindow,
                    radialCenter: radialTarget,
                    radialWindow: boundaryWindow
                });
                if (
                    baselineBoundary.count > 0
                    && boundary.count > 0
                    && (
                        Math.abs(boundary.minNormal - baselineBoundary.minNormal) > normalWindow
                        || Math.abs(boundary.maxNormal - baselineBoundary.maxNormal) > normalWindow
                    )
                ) {
                    failures.push(`positive ${name} boundary moved: seam ${pair.label}, y ${y.toFixed(2)}`);
                }
            }

            for (const [name, radialTarget] of [
                ['cavity', negativeSpan.minRadial],
                ['exterior', negativeSpan.maxRadial]
            ]) {
                const baselineBoundary = sampleFaceNormal(baseline.walls[pair.negative.wallIndex], {
                    sideAngle: pair.negative.sideAngle,
                    outwardNormal: negativeOutward,
                    y,
                    yWindow,
                    radialCenter: radialTarget,
                    radialWindow: boundaryWindow
                });
                const boundary = sampleFaceNormal(keyed.walls[pair.negative.wallIndex], {
                    sideAngle: pair.negative.sideAngle,
                    outwardNormal: negativeOutward,
                    y,
                    yWindow,
                    radialCenter: radialTarget,
                    radialWindow: boundaryWindow
                });
                if (
                    baselineBoundary.count > 0
                    && boundary.count > 0
                    && (
                        Math.abs(boundary.minNormal - baselineBoundary.minNormal) > normalWindow
                        || Math.abs(boundary.maxNormal - baselineBoundary.maxNormal) > normalWindow
                    )
                ) {
                    failures.push(`negative ${name} boundary moved: seam ${pair.label}, y ${y.toFixed(2)}`);
                }
            }
        }
    }

    disposeResult(keyed);
    disposeResult(baseline);
}

function assertNonTwoPartUnchanged(input, quality, failures) {
    // Only the 1-wall closed ring must stay key-invariant (guards the dormant
    // radial natch path at the wrap seam). 3/4-wall molds now grow per-face
    // registration keys — covered by castFormMultiWallRegistrationKeyGate.mjs.
    for (const wallCount of [1]) {
        const enabled = generate(input, { wallCount, natchesEnabled: true, quality });
        const disabled = generate(input, { wallCount, natchesEnabled: false, quality });

        if (enabled.walls.length !== wallCount) {
            failures.push(`wall-count ${wallCount}: generated ${enabled.walls.length}`);
        }

        const footDelta = maxPositionDelta(enabled.foot, disabled.foot);
        if (!footDelta.comparable || footDelta.maxDelta > POSITION_EPSILON) {
            failures.push(`wall-count ${wallCount}: foot changed with registration enabled`);
        }

        for (let i = 0; i < Math.min(enabled.walls.length, disabled.walls.length); i++) {
            const wallDelta = maxPositionDelta(enabled.walls[i], disabled.walls[i]);
            if (!wallDelta.comparable || wallDelta.maxDelta > POSITION_EPSILON) {
                failures.push(`wall-count ${wallCount}, wall ${i + 1}: registration changed non-two-part output`);
            }
        }

        disposeResult(enabled);
        disposeResult(disabled);
    }
}

function main() {
    const inputPath = readArg('input', DEFAULT_INPUT);
    const quality = readArg('quality', 'preview');
    const input = loadProcessedInput(inputPath);
    const failures = [];

    console.log('Cast-form two-part registration-key gate');
    console.log(`input: ${inputPath}`);
    console.log(`quality: ${quality}`);

    assertTwoPartRegistration(input, quality, failures);
    assertNonTwoPartUnchanged(input, quality, failures);

    input.dispose?.();

    if (failures.length > 0) {
        console.error('FAIL');
        failures.forEach((failure) => console.error(`- ${failure}`));
        process.exit(1);
    }

    console.log('PASS');
    console.log('- two-part wall 1 positive keys detected on mating faces');
    console.log('- two-part wall 2 matching negative sockets detected on mating faces');
    console.log('- cavity/exterior face boundaries, foot, and 1-wall closed ring remain unchanged');
    console.log('- (3/4-wall registration is asserted by castFormMultiWallRegistrationKeyGate.mjs)');
}

main();
