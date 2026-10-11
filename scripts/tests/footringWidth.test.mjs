import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    ITEM_TYPES,
    ParameterResolver,
    StateManager,
    stateManager
} from '../state/projectState.js';
import { generateItemMesh } from '../geometry/meshGenerator.js';
import { exportToBinarySTL } from '../geometry/stlExporter.js';

function fixture() {
    const state = new StateManager();
    state.scheduleAutoSave = () => {};
    return { state, resolver: new ParameterResolver(state) };
}

function assertNear(actual, expected, tolerance = 1e-10) {
    assert.ok(Math.abs(actual - expected) < tolerance, `${actual} should equal ${expected}`);
}

function measureContactRingWidth(geometry) {
    const positions = geometry.getAttribute('position');
    let innerRadius = Infinity;
    let outerRadius = -Infinity;
    for (let i = 0; i < positions.count; i++) {
        if (Math.abs(positions.getY(i)) > 1e-7) continue;
        const radius = Math.hypot(positions.getX(i), positions.getZ(i));
        innerRadius = Math.min(innerRadius, radius);
        outerRadius = Math.max(outerRadius, radius);
    }
    assert.ok(Number.isFinite(innerRadius) && innerRadius > 0);
    return outerRadius - innerRadius;
}

// Independent expected widths for an 8 mm plate reference, ordered by
// no reduction, halfway reduction, and full baseline-proportional reduction.
const expectedWidths = {
    plate: [8, 8, 8],
    soup_bowl: [8, 46 / 7, 36 / 7],
    pasta_bowl: [8, 52 / 7, 48 / 7],
    mug: [8, 37 / 7, 18 / 7],
    tumbler: [8, 5, 2],
    saucer: [8, 43 / 7, 30 / 7],
    serving_bowl: [8, 8, 8]
};
const reductions = [0, 50, 100];

test('fixed mode preserves the authored millimeter width across all items', () => {
    const { state, resolver } = fixture();
    assert.equal(state.getState('globalParameters.footringWidthProportional'), false);
    state.setState('globalParameters.footringBaseWidth', 11);
    state.setState('globalParameters.footringWidthReduction', 50);
    for (const item of ITEM_TYPES) {
        assert.equal(resolver.getAllParameters(item).footringBaseWidth, 11);
    }
});

test('reduction changes smaller item widths while the plate remains the maximum reference', () => {
    const { state, resolver } = fixture();
    state.setState('globalParameters.footringWidthProportional', true);
    for (const [index, reduction] of reductions.entries()) {
        state.setState('globalParameters.footringWidthReduction', reduction);
        for (const [item, widths] of Object.entries(expectedWidths)) {
            const width = resolver.getAllParameters(item).footringBaseWidth;
            assertNear(width, widths[index]);
            assert.ok(width <= resolver.getAllParameters('plate').footringBaseWidth);
        }
        assert.equal(state.getState('globalParameters.footringBaseWidth'), 8);
        assert.deepEqual(state.getState('itemOverrides'), {});
    }
});

test('changing the plate reference scales all derived widths and toggling retains the reduction', () => {
    const { state, resolver } = fixture();
    state.setState('globalParameters.footringWidthProportional', true);
    state.setState('globalParameters.footringWidthReduction', 50);
    state.setState('globalParameters.footringBaseWidth', 12);
    for (const [item, widths] of Object.entries(expectedWidths)) {
        assertNear(resolver.getAllParameters(item).footringBaseWidth, widths[1] * 1.5);
    }

    state.setState('globalParameters.footringWidthProportional', false);
    for (const item of ITEM_TYPES) {
        assert.equal(resolver.getAllParameters(item).footringBaseWidth, 12);
    }
    assert.equal(state.getState('globalParameters.footringWidthReduction'), 50);
    state.setState('globalParameters.footringWidthProportional', true);
    assertNear(resolver.getAllParameters('tumbler').footringBaseWidth, 7.5);
});

test('the default reduction preserves the original 8 mm plate and 2 mm tumbler proportions', () => {
    const { state, resolver } = fixture();
    state.setState('globalParameters.footringWidthProportional', true);
    assert.equal(state.getState('globalParameters.footringWidthReduction'), 100);
    assertNear(resolver.getAllParameters('plate').footringBaseWidth, 8);
    assertNear(resolver.getAllParameters('tumbler').footringBaseWidth, 2);
});

test('baseline proportions stay independent of item scaling and wall shape', () => {
    const { state, resolver } = fixture();
    state.setState('globalParameters.footringWidthProportional', true);
    state.setState('globalParameters.footringWidthReduction', 50);
    state.setState('globalParameters.globalWidthScale', 175);
    state.setState('globalParameters.globalHeightScale', 150);
    state.setState('itemMultipliers.plate.width', 200);
    state.setState('itemMultipliers.mug.width', 50);
    state.setState('globalParameters.wallAngle', 40);
    state.setState('globalParameters.positiveWallAngleAnchor', 'rim');
    state.setState('globalParameters.bottomCornerRadius', 10);

    assert.equal(resolver.getFinalDimensions('plate').diameter, 980);
    assert.equal(resolver.getFinalDimensions('mug').diameter, 78.75);
    for (const [item, widths] of Object.entries(expectedWidths)) {
        assertNear(resolver.getAllParameters(item).footringBaseWidth, widths[1]);
    }
});

test('item width overrides remain absolute millimeters and reset back to the reduced width', () => {
    const { state, resolver } = fixture();
    state.setState('globalParameters.footringWidthProportional', true);
    state.setState('itemOverrides.mug.footringBaseWidth', 6);
    state.setState('globalParameters.footringWidthReduction', 50);
    assert.equal(resolver.getAllParameters('mug').footringBaseWidth, 6);
    assertNear(resolver.getAllParameters('plate').footringBaseWidth, 8);
    assertNear(resolver.getAllParameters('tumbler').footringBaseWidth, 5);

    state.setState('itemOverrides.mug.footringBaseWidth', undefined);
    assertNear(resolver.getAllParameters('mug').footringBaseWidth, 37 / 7);
});

test('an explicit plate width becomes the reference while other item overrides stay absolute', () => {
    const { state, resolver } = fixture();
    state.setState('globalParameters.footringWidthProportional', true);
    state.setState('globalParameters.footringWidthReduction', 50);
    state.setState('itemOverrides.plate.footringBaseWidth', 12);
    state.setState('itemOverrides.mug.footringBaseWidth', 6);
    assert.equal(resolver.getAllParameters('plate').footringBaseWidth, 12);
    assert.equal(resolver.getAllParameters('mug').footringBaseWidth, 6);
    assertNear(resolver.getAllParameters('tumbler').footringBaseWidth, 7.5);
    assertNear(resolver.getAllParameters('serving_bowl').footringBaseWidth, 12);
    assert.equal(state.getState('globalParameters.footringBaseWidth'), 8);

    state.setState('globalParameters.footringBaseWidth', 16);
    assertNear(resolver.getAllParameters('tumbler').footringBaseWidth, 7.5);
    assert.equal(resolver.getAllParameters('mug').footringBaseWidth, 6);

    state.setState('itemOverrides.plate.footringBaseWidth', undefined);
    assert.equal(resolver.getAllParameters('plate').footringBaseWidth, 16);
    assertNear(resolver.getAllParameters('tumbler').footringBaseWidth, 10);
    assert.equal(resolver.getAllParameters('mug').footringBaseWidth, 6);
});

test('plate overrides do not become a shared reference when proportional mode is off', () => {
    const { state, resolver } = fixture();
    state.setState('globalParameters.footringWidthReduction', 50);
    state.setState('itemOverrides.plate.footringBaseWidth', 12);
    assert.equal(resolver.getAllParameters('plate').footringBaseWidth, 12);
    for (const item of ITEM_TYPES.filter(item => item !== 'plate')) {
        assert.equal(resolver.getAllParameters(item).footringBaseWidth, 8);
    }
});

test('legacy imports and restored drafts retain fixed widths when the setting is absent', () => {
    const source = fixture();
    const legacy = source.state.exportState();
    delete legacy.globalParameters.footringWidthProportional;
    delete legacy.globalParameters.footringWidthReduction;
    legacy.globalParameters.footringBaseWidth = 9;
    legacy.itemOverrides = { tumbler: { footringBaseWidth: 4 } };

    const imported = fixture();
    imported.state.importState(legacy);
    const restored = fixture();
    restored.state.state = restored.state.mergeWithDefaults(legacy);
    for (const { state, resolver } of [imported, restored]) {
        assert.equal(state.getState('globalParameters.footringWidthProportional'), false);
        assert.equal(state.getState('globalParameters.footringWidthReduction'), 100);
        assert.equal(resolver.getAllParameters('mug').footringBaseWidth, 9);
        assert.equal(resolver.getAllParameters('tumbler').footringBaseWidth, 4);
    }
});

test('obsolete diameter ratios are discarded while the authored plate reference is retained', () => {
    const source = fixture();
    const legacy = source.state.exportState();
    delete legacy.globalParameters.footringWidthReduction;
    legacy.globalParameters.footringWidthRatio = 3;
    legacy.globalParameters.footringWidthProportional = true;
    legacy.globalParameters.footringBaseWidth = 12;
    legacy.itemOverrides = { mug: { footringBaseWidth: 6 } };

    const imported = fixture();
    imported.state.importState(legacy);
    const restored = fixture();
    restored.state.state = restored.state.mergeWithDefaults(legacy);
    for (const { state, resolver } of [imported, restored]) {
        assert.equal(state.getState('globalParameters.footringWidthRatio'), undefined);
        assert.equal(state.getState('globalParameters.footringWidthReduction'), 100);
        assert.equal(state.getState('globalParameters.footringBaseWidth'), 12);
        assertNear(resolver.getAllParameters('plate').footringBaseWidth, 12);
        assertNear(resolver.getAllParameters('tumbler').footringBaseWidth, 3);
        assert.equal(resolver.getAllParameters('mug').footringBaseWidth, 6);
    }
});

test('a directly restored older state defaults to full reduction and ignores an obsolete ratio', () => {
    const { state, resolver } = fixture();
    state.state.globalParameters.footringWidthProportional = true;
    state.state.globalParameters.footringBaseWidth = 12;
    state.state.globalParameters.footringWidthRatio = 15;
    delete state.state.globalParameters.footringWidthReduction;
    assertNear(resolver.getAllParameters('plate').footringBaseWidth, 12);
    assertNear(resolver.getAllParameters('tumbler').footringBaseWidth, 3);
});

for (const reduction of [0, 50]) {
    test(`export/import and draft merge preserve ${reduction}% reduction and absolute overrides`, () => {
        const source = fixture();
        source.state.setState('globalParameters.footringWidthProportional', true);
        source.state.setState('globalParameters.footringBaseWidth', 12);
        source.state.setState('globalParameters.footringWidthReduction', reduction);
        source.state.setState('itemOverrides.mug.footringBaseWidth', 6);
        const exported = JSON.parse(JSON.stringify(source.state.exportState()));

        const imported = fixture();
        imported.state.importState(exported);
        const restored = fixture();
        restored.state.state = restored.state.mergeWithDefaults(JSON.parse(JSON.stringify(source.state.state)));
        for (const { state, resolver } of [imported, restored]) {
            assert.equal(state.getState('globalParameters.footringWidthProportional'), true);
            assert.equal(state.getState('globalParameters.footringBaseWidth'), 12);
            assert.equal(state.getState('globalParameters.footringWidthReduction'), reduction);
            assert.equal(resolver.getAllParameters('mug').footringBaseWidth, 6);
            assertNear(resolver.getAllParameters('plate').footringBaseWidth, 12);
            assertNear(resolver.getAllParameters('tumbler').footringBaseWidth, reduction === 0 ? 12 : 7.5);
        }
    });
}

for (const [item, widths] of Object.entries(expectedWidths)) {
    test(`${item}: contact ring matches 0%, 50%, and 100% reduction and passes strict STL export`, () => {
        const originalState = stateManager.state;
        try {
            stateManager.state = stateManager.getInitialState();
            stateManager.state.globalParameters.footringWidthProportional = true;
            for (const [index, reduction] of reductions.entries()) {
                stateManager.state.globalParameters.footringWidthReduction = reduction;
                const geometry = generateItemMesh(item);
                try {
                    // Measure actual geometry, so a correct resolver result
                    // cannot conceal a missing integration in the mesh.
                    assertNear(measureContactRingWidth(geometry), widths[index], 5e-5);
                    const stl = exportToBinarySTL(geometry, `reduction-${reduction}-${item}`);
                    const triangleCount = new DataView(stl).getUint32(80, true);
                    assert.ok(triangleCount > 100);
                    assert.equal(stl.byteLength, 84 + triangleCount * 50);
                } finally {
                    geometry.dispose();
                }
            }
        } finally {
            stateManager.state = originalState;
        }
    });
}

test('full reduction from the minimum reference keeps fractional footrings and all minimum-size forms export', () => {
    const { state, resolver } = fixture();
    state.setState('globalParameters.footringWidthProportional', true);
    state.setState('globalParameters.footringBaseWidth', 2);
    state.setState('globalParameters.footringWidthReduction', 100);
    state.setState('globalParameters.globalWidthScale', 50);
    for (const item of ITEM_TYPES) state.setState(`itemMultipliers.${item}.width`, 50);
    assertNear(resolver.getAllParameters('plate').footringBaseWidth, 2);
    assertNear(resolver.getAllParameters('tumbler').footringBaseWidth, 0.5);

    const originalState = stateManager.state;
    try {
        stateManager.state = state.state;
        for (const [item, widths] of Object.entries(expectedWidths)) {
            const geometry = generateItemMesh(item);
            try {
                assertNear(measureContactRingWidth(geometry), widths[2] / 4, 5e-5);
                const stl = exportToBinarySTL(geometry, `minimum-proportional-${item}`);
                const triangleCount = new DataView(stl).getUint32(80, true);
                assert.ok(triangleCount > 100);
                assert.equal(stl.byteLength, 84 + triangleCount * 50);
            } finally {
                geometry.dispose();
            }
        }
    } finally {
        stateManager.state = originalState;
    }
});
