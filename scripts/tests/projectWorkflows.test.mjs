import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { StateManager } from '../state/projectState.js';
import { ProjectFileFormat } from '../storage/fileFormat.js';
import { parseProjectFile, importProjectData, duplicateStoredProject } from '../storage/projectTransfer.js';
import { getAllProjects, saveProject, saveVesselProject, saveVesselV2Project, saveVesselV3Project } from '../dashboard/projectStorage.js';
import { selectDinnerwareState, saveDinnerwareDraft, startDinnerwareProject, clearDinnerwareDrafts } from '../storage/dinnerwareDrafts.js';
import { getDefaultState } from '../vessel/state/vesselDefaults.js';
import { getDefaultVesselV2State } from '../vesselV2/state/vesselV2Defaults.js';
import { getDefaultVesselV3State } from '../vesselV3/state/vesselV3Defaults.js';
import { DEFAULT_HANDLE_PARAMS } from '../handle/state/handleState.js';
import { DEFAULT_PARAMS } from '../castForm/state/castFormDefaults.js';

class MemoryStorage {
    data = new Map();
    get length() { return this.data.size; }
    key(i) { return [...this.data.keys()][i] ?? null; }
    getItem(key) { return this.data.get(key) ?? null; }
    setItem(key, value) { this.data.set(key, String(value)); }
    removeItem(key) { this.data.delete(key); }
}
beforeEach(() => { globalThis.localStorage = new MemoryStorage(); });
function manager() {
    const state = new StateManager();
    state.scheduleAutoSave = () => {};
    return state;
}
const fixtures = {
    dinnerware: () => manager().getInitialState(),
    vessel: getDefaultState,
    'vessel-v2': getDefaultVesselV2State,
    // vessel-v3 is retired from the dashboard list; its saver is still checked below
    handle: () => ({ handleParams: structuredClone(DEFAULT_HANDLE_PARAMS), mugData: { loaded: false } }),
    castform: () => ({ params: structuredClone(DEFAULT_PARAMS), input: { sourceApp: 'vessel' } })
};

test('reload and project switching retain newer drafts without touching the saved design', () => {
    const sm = manager();
    sm.state.project.id = 'a';
    sm.state.globalParameters.wallThickness = 2.5;
    const saved = { id: 'a', state: structuredClone(sm.state), lastModified: '2025-01-01T00:00:00Z' };
    localStorage.setItem('dinnerware_editing_project_id', 'a');
    sm.setState('globalParameters.wallThickness', 7);
    saveDinnerwareDraft(sm.state);
    assert.equal(selectDinnerwareState(saved, 'a').globalParameters.wallThickness, 7);
    startDinnerwareProject('b');
    assert.equal(selectDinnerwareState(null, 'b'), null);
    startDinnerwareProject('a');
    assert.equal(selectDinnerwareState(saved, 'a').globalParameters.wallThickness, 7);
    assert.equal(saved.state.globalParameters.wallThickness, 2.5);
});

test('migrates untagged legacy drafts before changing the active project', () => {
    const state = manager().state;
    state.globalParameters.wallThickness = 7;
    localStorage.setItem('dinnerware_editing_project_id', 'old');
    localStorage.setItem('dinnerware_current_project', JSON.stringify({ state, timestamp: '2026-01-02T00:00:00Z' }));
    startDinnerwareProject('new');
    assert.equal(selectDinnerwareState(null, 'new'), null);
    assert.equal(selectDinnerwareState(null, 'old').globalParameters.wallThickness, 7);
});

test('an anonymous tab never borrows another tab\'s project identity', () => {
    const state = manager().state;
    state.globalParameters.wallThickness = 9;
    localStorage.setItem('dinnerware_editing_project_id', 'saved-b');
    saveDinnerwareDraft(state);
    const savedB = { state: { globalParameters: { wallThickness: 2 } }, lastModified: '2025-01-01' };
    assert.equal(selectDinnerwareState(savedB, 'saved-b').globalParameters.wallThickness, 2);
    assert.equal(localStorage.getItem('dinnerware_draft:saved-b'), null);
});

test('starting or importing another project leaves anonymous work discoverable on the dashboard', () => {
    const state = manager().state;
    state.project.name = 'Recover this draft';
    state.globalParameters.wallThickness = 9;
    saveDinnerwareDraft(state);
    const nextId = startDinnerwareProject(null);
    const previous = getAllProjects().find(project => project.projectName === 'Recover this draft');
    assert.ok(previous?.draftOnly);
    assert.notEqual(previous.id, nextId);
    assert.equal(selectDinnerwareState(previous, previous.id).globalParameters.wallThickness, 9);
});

test('newer explicit saves win; clearing projects removes their recoverable drafts', () => {
    const state = manager().state;
    state.project.id = 'a';
    localStorage.setItem('dinnerware_draft:a', JSON.stringify({ state, timestamp: '2025-01-01T00:00:00Z' }));
    const saved = { state: { marker: 'newer' }, lastModified: '2026-01-01T00:00:00Z' };
    assert.equal(selectDinnerwareState(saved, 'a').marker, 'newer');
    clearDinnerwareDrafts();
    assert.equal(localStorage.length, 0);
});

test('dirty notifications and markSaved agree with persisted state', () => {
    const sm = manager();
    const notifications = [];
    sm.subscribe('project.isDirty', value => notifications.push(value));
    sm.setState('globalParameters.wallThickness', 7);
    sm.setState('globalParameters.wallAngle', 10);
    const saved = saveProject({ projectName: 'Saved', state: sm.state });
    sm.markSaved(saved);
    assert.equal(sm.state.project.isDirty, false);
    assert.equal(sm.state.project.id, saved.id);
    assert.equal(getAllProjects()[0].state.project.isDirty, false);
    assert.deepEqual(notifications, [true, false]);
});

test('hidden dinnerware stays hidden through export/import and draft restore', () => {
    const sm = manager(); sm.state.ui.visibleItems = ['mug'];
    const restored = manager(); restored.importState(sm.exportState());
    assert.deepEqual(restored.state.ui.visibleItems, ['mug']);
    assert.deepEqual(sm.mergeWithDefaults(sm.state).ui.visibleItems, ['mug']);
});

for (const [appType, makeState] of Object.entries(fixtures)) {
    test(`${appType}: enhanced/legacy import and duplicate preserve type, state and original identity`, () => {
        const state = makeState();
        state.project = { ...state.project, id: 'source-id', name: 'Source' };
        state.id = 'source-id';
        const source = structuredClone(state);
        const enhanced = ProjectFileFormat.serialize({ projectName: 'Imported', state }, appType);
        const first = importProjectData(parseProjectFile(JSON.stringify(enhanced)));
        const storedState = appType === 'dinnerware' ? first.state : first;
        for (const key of ['globalParameters', 'itemRatios', 'profile', 'global', 'sections', 'spout', 'lid', 'handleParams', 'mugData', 'params']) {
            if (state[key] !== undefined) assert.deepEqual(storedState[key], state[key], `${appType} preserves ${key}`);
        }
        const normalized = getAllProjects()[0];
        assert.equal(normalized.appType, appType);
        assert.equal(normalized.projectName, 'Imported');
        assert.notEqual(first.id, 'source-id');
        const copied = duplicateStoredProject(normalized);
        assert.notEqual(copied.id, first.id);
        assert.notEqual(copied.project?.id, first.id);
        assert.equal(getAllProjects().length, 2);
        assert.equal(getAllProjects().find(p => p.id === copied.id).appType, appType);
        assert.equal(getAllProjects().find(p => p.id === copied.id).projectName, 'Imported (Copy)');
        assert.deepEqual(state, source);
        const raw = appType === 'dinnerware' ? state : { ...state, appType };
        const legacy = importProjectData(parseProjectFile(JSON.stringify(raw)));
        assert.equal(getAllProjects().find(p => p.id === legacy.id).appType, appType);
        assert.equal(getAllProjects().find(p => p.id === first.id).projectName, 'Imported');
    });
}

test('unknown/mismatched/malformed files fail without storing anything', () => {
    for (const invalid of [null, [], {}, { version: '1' },
        { fileFormat: { type: ProjectFileFormat.TYPE, version: '1', appType: 'unknown' }, project: {}, state: {} },
        { fileFormat: { type: ProjectFileFormat.TYPE, version: '1', appType: 'handle' }, project: {}, state: fixtures.dinnerware() }
    ]) assert.throws(() => importProjectData(invalid));
    assert.equal(localStorage.length, 0);
});

test('failed writes throw for every shared saver and leave the old collection intact', () => {
    const sm = manager();
    const original = saveProject({ projectName: 'Original', state: sm.state });
    const before = localStorage.getItem('playground_ceramics_projects');
    localStorage.setItem = () => { throw Object.assign(new Error('blocked'), { name: 'SecurityError' }); };
    for (const save of [() => saveProject({ id: original.id, projectName: 'Changed', state: sm.state }),
        () => saveVesselProject(fixtures.vessel()), () => saveVesselV2Project(fixtures['vessel-v2']()),
        () => saveVesselV3Project(getDefaultVesselV3State())]) assert.throws(save, /blocked/);
    assert.equal(localStorage.getItem('playground_ceramics_projects'), before);
});

test('quota retry still throws if insufficient, and corrupt data is never overwritten', () => {
    const storage = localStorage;
    storage.setItem('playground_ceramics_projects', '{corrupt');
    assert.throws(() => saveProject({ projectName: 'New', state: manager().state }));
    assert.equal(storage.getItem('playground_ceramics_projects'), '{corrupt');
    storage.removeItem('playground_ceramics_projects');
    let attempts = 0;
    storage.setItem = () => { attempts++; throw Object.assign(new Error('full'), { name: 'QuotaExceededError' }); };
    assert.throws(() => saveProject({ projectName: 'New', state: manager().state }), /full/);
    assert.equal(attempts, 2);
});
