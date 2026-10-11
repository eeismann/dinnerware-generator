import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ITEM_TYPES, stateManager } from '../state/projectState.js';
import { generateItemMesh, generateItemExportMesh } from '../geometry/meshGenerator.js';
import { exportToBinarySTL } from '../geometry/stlExporter.js';
import { validateGeometryForSTL } from '../geometry/stlCore.js';

const FLOAT_TOLERANCE = 5e-5;

function assertNear(actual, expected, label) {
    assert.ok(Math.abs(actual - expected) <= FLOAT_TOLERANCE,
        `${label}: expected ${expected}, got ${actual}`);
}

function coordinateKey(x, y, z) {
    // Collapse the duplicated 0/2π seam without merging adjacent rim vertices.
    return [x, y, z].map(value => Math.round(value * 1e4)).join(',');
}

function geometryVertices(geometry) {
    const position = geometry.getAttribute('position');
    return Array.from({ length: position.count }, (_, i) => [
        position.getX(i), position.getY(i), position.getZ(i)
    ]);
}

function stlVertices(buffer) {
    const view = new DataView(buffer);
    const triangleCount = view.getUint32(80, true);
    assert.ok(triangleCount > 100);
    assert.equal(buffer.byteLength, 84 + triangleCount * 50);
    const vertices = [];
    for (let triangle = 0; triangle < triangleCount; triangle++) {
        for (let vertex = 0; vertex < 3; vertex++) {
            const offset = 84 + triangle * 50 + 12 + vertex * 12;
            vertices.push([
                view.getFloat32(offset, true),
                view.getFloat32(offset + 4, true),
                view.getFloat32(offset + 8, true)
            ]);
        }
    }
    return vertices;
}

function outerRimVertices(vertices) {
    let height = -Infinity;
    for (const [, y] of vertices) height = Math.max(height, y);
    const rim = vertices.filter(([, y]) => Math.abs(y - height) < FLOAT_TOLERANCE);
    let outerRadius = 0;
    for (const [x, , z] of rim) outerRadius = Math.max(outerRadius, Math.hypot(x, z));
    return new Set(rim
        .filter(([x, , z]) => Math.abs(Math.hypot(x, z) - outerRadius) < FLOAT_TOLERANCE)
        .map(([x, y, z]) => coordinateKey(x, y, z)));
}

function assertBoundsEqual(preview, exported) {
    preview.computeBoundingBox();
    exported.computeBoundingBox();
    for (const extent of ['min', 'max']) {
        for (const axis of ['x', 'y', 'z']) {
            assertNear(exported.boundingBox[extent][axis], preview.boundingBox[extent][axis],
                `${extent}.${axis}`);
        }
    }
}

function meridianProfile(geometry) {
    // Check the actual wall/fillet profile independently of radial density.
    // The tiny centerline closure ring can grow to remain safe for STL welding.
    return new Set(geometryVertices(geometry)
        .filter(([x, , z]) => Math.abs(x) < FLOAT_TOLERANCE && z > 1)
        .map(([x, y, z]) => coordinateKey(x, y, z)));
}

function withMeshes(item, parameters, callback) {
    const originalState = stateManager.state;
    let preview;
    let exported;
    try {
        stateManager.state = stateManager.getInitialState();
        Object.assign(stateManager.state.globalParameters, parameters);
        const before = structuredClone(stateManager.state);
        preview = generateItemMesh(item);
        exported = generateItemExportMesh(item);
        assert.deepEqual(stateManager.state, before, 'export generation must preserve authored state');

        const validation = validateGeometryForSTL(exported);
        assert.equal(validation.valid, true, validation.warnings.join('; '));
        assert.equal(validation.details.boundaryEdges, 0);
        assert.equal(validation.details.overConnectedEdges, 0);
        assert.equal(validation.details.degenerateCount, 0);

        // Exercise the production strict serializer and inspect its triangles,
        // so a geometry-only resolution change cannot conceal a coarse STL.
        const buffer = exportToBinarySTL(exported, `export-resolution-${item}`);
        callback({ preview, exported, vertices: stlVertices(buffer) });
        assert.deepEqual(stateManager.state, before, 'STL serialization must preserve authored state');
    } finally {
        preview?.dispose();
        exported?.dispose();
        stateManager.state = originalState;
    }
}

for (const item of ITEM_TYPES) {
    test(`${item}: default STL has 512 rim sides and preserves the 64-side preview and dimensions`, () => {
        withMeshes(item, {}, ({ preview, exported, vertices }) => {
            assert.equal(outerRimVertices(geometryVertices(preview)).size, 64);
            assert.equal(outerRimVertices(vertices).size, 512);
            assertBoundsEqual(preview, exported);
            assert.deepEqual(meridianProfile(exported), meridianProfile(preview));
        });
    });
}

for (const [name, parameters] of [
    ['curved walls and rounded bottom corners', { wallCurveAmount: 12, bottomCornerRadius: 10 }],
    ['a flat underside without a footring', { footringOriginHeight: 0 }],
    ['rounded bottom corners without a footring', { footringOriginHeight: 0, bottomCornerRadius: 10 }],
    ['a shallow foot cavity', { footCavityDepth: 50 }],
    ['a solid flush base', { footCavityDepth: 0 }],
    ['a rounded rim', { rimStyle: 'rounded' }],
    ['a tapered rim on a curved wall', { rimStyle: 'tapered', wallCurveAmount: -10 }],
    ['a stepped wall inset', { wallInsetEnabled: true, bottomCornerRadius: 6 }]
]) {
    test(`512-side export remains closed with ${name}`, () => {
        withMeshes('soup_bowl', parameters, ({ preview, exported, vertices }) => {
            assert.equal(outerRimVertices(geometryVertices(preview)).size, 64);
            assert.equal(outerRimVertices(vertices).size, 512);
            assertBoundsEqual(preview, exported);
            assert.deepEqual(meridianProfile(exported), meridianProfile(preview));
        });
    });
}

test('48 wall ridges export at 576 sides and retain every existing pattern sample', () => {
    withMeshes('plate', { wallPatternType: 'vertical', wallPatternCount: 48 },
        ({ preview, vertices }) => {
            assert.equal(outerRimVertices(geometryVertices(preview)).size, 288);
            assert.equal(outerRimVertices(vertices).size, 576);
            const serializedPositions = new Set(vertices.map(([x, y, z]) => coordinateKey(x, y, z)));
            for (const [x, y, z] of geometryVertices(preview)) {
                if (Math.hypot(x, z) <= 1) continue;
                assert.ok(serializedPositions.has(coordinateKey(x, y, z)),
                    `export must retain the existing pattern sample at ${x}, ${y}, ${z}`);
            }
        });
});

test('a diagonal footring stays watertight when its radial grid increases to 576 sides', () => {
    withMeshes('plate', { footringPatternType: 'diagonal', footringPatternCount: 24 },
        ({ preview, vertices }) => {
            assert.equal(outerRimVertices(geometryVertices(preview)).size, 144);
            assert.equal(outerRimVertices(vertices).size, 576);
        });
});

test('an existing 768-side pattern is preserved without a resolution downgrade', () => {
    withMeshes('plate', { wallPatternType: 'vertical', wallPatternCount: 128 },
        ({ preview, exported, vertices }) => {
            assert.equal(outerRimVertices(geometryVertices(preview)).size, 768);
            assert.equal(outerRimVertices(vertices).size, 768);
            assert.deepEqual(exported.getAttribute('position').array, preview.getAttribute('position').array);
            assert.deepEqual(exported.getIndex().array, preview.getIndex().array);
        });
});
