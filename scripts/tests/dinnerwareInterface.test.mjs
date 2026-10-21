import assert from 'node:assert/strict';
import { test } from 'node:test';
import { StateManager } from '../state/projectState.js';
import { DesignHistory } from '../state/history.js';
import { inflateRawSync } from 'node:zlib';
import { createZip, crc32 } from '../storage/zipWriter.js';
import {
    BUILT_IN_PRESETS, applyPreset, matchingPreset, loadUserPresets, saveUserPreset, deleteUserPreset
} from '../state/presets.js';
import { generateItemMesh } from '../geometry/meshGenerator.js';
import { validateGeometryForPrint } from '../geometry/meshQuality.js';
import { warningSystem } from '../utils/validation.js';
import { planSetLayout, restingHeight, sectionEnvelope } from '../geometry/setLayout.js';
import { ITEM_TYPES, parameterResolver, stateManager } from '../state/projectState.js';
import { buildItemCrossSection, calculateGeometryValues } from '../geometry/meshGenerator.js';

function manager() {
    const state = new StateManager();
    state.scheduleAutoSave = () => {};
    return state;
}

const settle = (ms = 30) => new Promise(resolve => setTimeout(resolve, ms));

test('a burst of edits is one undo step; undo and redo restore it', async () => {
    const state = manager();
    const applied = [];
    const history = new DesignHistory(state, { settleMs: 10, onApply: s => applied.push(s) });
    for (const value of [3, 3.5, 4, 4.5]) state.setState('globalParameters.wallThickness', value);
    await settle();
    state.setState('itemOverrides.mug', { wallAngle: 5 });
    await settle();

    assert.equal(history.undoStack.length, 2);
    assert.equal(history.undo(), true);
    assert.deepEqual(state.getState('itemOverrides'), {});
    assert.equal(state.getState('globalParameters.wallThickness'), 4.5);
    assert.equal(history.undo(), true);
    assert.equal(state.getState('globalParameters.wallThickness'), 2.5);
    assert.equal(history.undo(), false);
    assert.equal(applied.length, 2);

    assert.equal(history.redo(), true);
    assert.equal(state.getState('globalParameters.wallThickness'), 4.5);
    assert.equal(history.redo(), true);
    assert.deepEqual(state.getState('itemOverrides.mug'), { wallAngle: 5 });
    assert.equal(history.redo(), false);
    history.dispose();
});

test('undo commits a pending edit first, and a new edit clears redo', async () => {
    const state = manager();
    const history = new DesignHistory(state, { settleMs: 1000 });
    state.setState('globalParameters.wallAngle', 30);
    assert.equal(history.canUndo(), true, 'pending edit is undoable');
    history.undo();
    assert.equal(state.getState('globalParameters.wallAngle'), 15);
    assert.equal(history.canRedo(), true);
    state.setState('globalParameters.wallAngle', 20);
    history.commit();
    assert.equal(history.canRedo(), false);
    history.dispose();
});

test('a held gesture is one step however slowly it moves', async () => {
    const state = manager();
    const history = new DesignHistory(state, { settleMs: 5 });
    history.hold();
    for (const value of [16, 17, 18]) {
        state.setState('globalParameters.wallAngle', value);
        await settle(15); // pauses longer than the idle window
    }
    assert.equal(history.undoStack.length, 0, 'no idle commits while held');
    history.release();
    await settle(15);
    assert.equal(history.undoStack.length, 1);
    history.undo();
    assert.equal(state.getState('globalParameters.wallAngle'), 15);
    history.dispose();
});

test('UI, project and warning changes are not recorded', async () => {
    const state = manager();
    const history = new DesignHistory(state, { settleMs: 5 });
    state.setState('ui.layoutMode', 'grid');
    state.setState('project.name', 'Renamed');
    state.setState('warnings', [{ id: 'x' }]);
    await settle();
    assert.equal(history.canUndo(), false);
    history.dispose();
});

test('undo marks the project dirty and survives reset', async () => {
    const state = manager();
    const history = new DesignHistory(state, { settleMs: 5 });
    state.setState('globalParameters.footCavityDepth', 40);
    await settle();
    state.state.project.isDirty = false;
    history.undo();
    assert.equal(state.getState('project.isDirty'), true);
    history.reset();
    assert.equal(history.canUndo(), false);
    assert.equal(history.canRedo(), false);
    history.dispose();
});

function sections() {
    const result = {};
    for (const item of ITEM_TYPES) {
        const params = parameterResolver.getAllParameters(item);
        result[item] = buildItemCrossSection(params, calculateGeometryValues(params));
    }
    return result;
}

test('stacked pieces rest on, and never sink into, the piece below', () => {
    const original = stateManager.state;
    try {
        for (const parameters of [{}, { bottomCornerRadius: 10, wallCurveAmount: 10 }, { footCavityDepth: 0, wallAngle: 30 }]) {
            stateManager.state = stateManager.getInitialState();
            Object.assign(stateManager.state.globalParameters, parameters);
            const all = sections();
            for (const [lower, upper] of [['saucer', 'mug'], ['plate', 'soup_bowl'], ['plate', 'pasta_bowl'], ['pasta_bowl', 'soup_bowl']]) {
                const lift = restingHeight(all[lower], all[upper], 0);
                const a = sectionEnvelope(all[lower]);
                const b = sectionEnvelope(all[upper]);
                let touching = false;
                for (let k = 0; k < Math.min(a.top.length, b.bottom.length); k++) {
                    if (!Number.isFinite(a.top[k]) || !Number.isFinite(b.bottom[k])) continue;
                    const clearance = b.bottom[k] + lift - a.top[k];
                    assert.ok(clearance > -1e-9, `${upper} sinks into ${lower} at r=${k * 0.5}`);
                    if (clearance < 1e-6) touching = true;
                }
                assert.ok(touching, `${upper} rests on ${lower}`);
            }
            // A mug's foot ring lands on the saucer's interior floor
            const saucer = calculateGeometryValues(parameterResolver.getAllParameters('saucer'));
            const lift = restingHeight(all.saucer, all.mug, 0);
            assert.ok(Math.abs(lift - (saucer.footringHeight + saucer.thickness)) < 0.6,
                `mug rests at ${lift} on a ${saucer.footringHeight + saucer.thickness}mm saucer floor`);
        }
    } finally {
        stateManager.state = original;
    }
});

test('set layouts place every visible item once and skip hidden ones', () => {
    const all = sections();
    for (const mode of ['stack', 'table']) {
        const layout = planSetLayout(mode, all, ITEM_TYPES);
        assert.deepEqual(Object.keys(layout).sort(), [...ITEM_TYPES].sort(), mode);
        assert.ok(layout.mug.y > 0 && layout.mug.x === layout.saucer.x && layout.mug.z === layout.saucer.z);
        const partial = planSetLayout(mode, all, ['saucer', 'tumbler']);
        assert.deepEqual(Object.keys(partial).sort(), ['saucer', 'tumbler']);
        assert.equal(partial.saucer.y, 0);
    }
    // Hiding the middle of a stack rests the top piece on the bottom one
    const layout = planSetLayout('stack', all, ['plate', 'soup_bowl']);
    assert.ok(Math.abs(layout.soup_bowl.y - restingHeight(all.plate, all.soup_bowl)) < 1e-9);
});

function readZip(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const end = bytes.length - 22;
    assert.equal(view.getUint32(end, true), 0x06054b50);
    const count = view.getUint16(end + 10, true);
    let cursor = view.getUint32(end + 16, true);
    const files = {};
    for (let i = 0; i < count; i++) {
        assert.equal(view.getUint32(cursor, true), 0x02014b50);
        const method = view.getUint16(cursor + 10, true);
        const crc = view.getUint32(cursor + 16, true);
        const size = view.getUint32(cursor + 20, true);
        const nameLength = view.getUint16(cursor + 28, true);
        const localOffset = view.getUint32(cursor + 42, true);
        const name = new TextDecoder().decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
        const localNameLength = view.getUint16(localOffset + 26, true);
        const body = bytes.subarray(localOffset + 30 + localNameLength, localOffset + 30 + localNameLength + size);
        const data = method === 8 ? new Uint8Array(inflateRawSync(body)) : body;
        assert.equal(crc32(data), crc, `${name} crc`);
        files[name] = data;
        cursor += 46 + nameLength;
    }
    return files;
}

test('ZIP archives round-trip compressed and stored entries', async () => {
    assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
    const stl = new Uint8Array(5000).map((_, i) => i % 7);
    const files = [
        { name: 'Set_plate.stl', data: stl },
        { name: 'Ünïcode mug.stl', data: new Uint8Array([1, 2, 3]).buffer }
    ];
    for (const compress of [true, false]) {
        const zip = await createZip(files, { compress });
        const read = readZip(zip);
        assert.deepEqual([...read['Set_plate.stl']], [...stl]);
        assert.deepEqual([...read['Ünïcode mug.stl']], [1, 2, 3]);
        if (compress) assert.ok(zip.length < 5000, 'repetitive STL data deflates');
    }
});

test('every built-in preset builds closed meshes, prints without warnings and is one undo step', async () => {
    const original = stateManager.state;
    try {
        for (const preset of BUILT_IN_PRESETS) {
            stateManager.state = stateManager.getInitialState();
            stateManager.scheduleAutoSave = () => {};
            const history = new DesignHistory(stateManager, { settleMs: 5 });
            applyPreset(stateManager, preset);
            await settle(15);
            assert.equal(history.undoStack.length, preset.id === 'default' ? 0 : 1, preset.name);
            assert.equal(matchingPreset(stateManager.state.globalParameters, BUILT_IN_PRESETS)?.id, preset.id);
            for (const item of ITEM_TYPES) {
                const geometry = generateItemMesh(item);
                const result = validateGeometryForPrint(geometry, { enforceOrientationConsistency: true });
                assert.equal(result.valid, true, `${preset.name} ${item}: ${result.errors}`);
                geometry.dispose();
            }
            const problems = warningSystem.validate().filter(w => w.severity !== 'info');
            assert.deepEqual(problems.map(w => `${w.itemType}: ${w.message}`), [], `${preset.name} prints cleanly`);
            history.dispose();
        }
    } finally {
        stateManager.state = original;
        delete stateManager.scheduleAutoSave;
    }
});

test('user presets save, replace by name, load and delete', () => {
    const storage = new Map();
    const store = { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) };
    const params = { ...stateManager.getInitialState().globalParameters, wallAngle: 33, rimStyle: 'rounded', globalWidthScale: 150 };
    saveUserPreset('Mine', params, store);
    const replaced = saveUserPreset('Mine', { ...params, wallAngle: 34 }, store);
    const presets = loadUserPresets(store);
    assert.equal(presets.length, 1);
    assert.equal(presets[0].params.wallAngle, 34);
    assert.equal('globalWidthScale' in presets[0].params, false, 'scaling is not part of a style');
    deleteUserPreset(replaced.id, store);
    assert.deepEqual(loadUserPresets(store), []);
    store.setItem('playground_ceramics_dinnerware_presets', 'not json');
    assert.deepEqual(loadUserPresets(store), []);
});
