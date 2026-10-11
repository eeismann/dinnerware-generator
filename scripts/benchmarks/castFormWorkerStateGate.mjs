import assert from 'node:assert/strict';
import { Worker as NodeWorker } from 'node:worker_threads';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import castFormState, { CastFormStateManager } from '../castForm/state/castFormState.js';
import { MoldWorkerClient, serializeMoldGeometry } from '../castForm/geometry/moldWorkerClient.js';
import { DEFAULT_PARAMS } from '../castForm/state/castFormDefaults.js';

const params = structuredClone(DEFAULT_PARAMS);
const input = () => {
    const geometry = new THREE.CylinderGeometry(30, 25, 60, 24, 12);
    geometry.translate(0, 30, 0);
    return geometry;
};
const disposeParts = parts => {
    parts?.foot?.dispose();
    parts?.walls?.forEach(wall => wall?.dispose());
};
const aborts = promise => assert.rejects(promise, { name: 'AbortError' });
const resultMessage = jobId => ({ type: 'result', jobId, result: { foot: null, walls: [] } });

class FakeWorker {
    constructor() { this.listeners = new Map(); this.messages = []; this.terminated = false; }
    addEventListener(type, callback) {
        if (!this.listeners.has(type)) this.listeners.set(type, []);
        this.listeners.get(type).push(callback);
    }
    postMessage(message) { this.messages.push(message); }
    emit(message, type = 'message') {
        for (const callback of this.listeners.get(type) || []) callback(type === 'message' ? { data: message } : message);
    }
    terminate() { this.terminated = true; }
}

function stateNotifications() {
    const state = new CastFormStateManager();
    const events = new Map();
    for (const path of ['params', 'params.mold.wallCount', 'input', 'input.geometry', 'output', 'project.name', 'project.isDirty', '*']) {
        events.set(path, []);
        state.subscribe(path, (value, changed) => events.get(path).push({ value, changed }));
    }
    state.batchUpdate([
        { path: 'params.mold.wallCount', value: 2 },
        { path: 'params.mold.spareHeight', value: 50 }
    ]);
    assert.equal(events.get('params').length, 1);
    assert.equal(events.get('params.mold.wallCount').length, 1);
    assert.equal(events.get('*').length, 1);
    assert.equal(events.get('*')[0].value, state.getState());
    assert.ok(Array.isArray(events.get('*')[0].changed));
    state.setInputGeometry(input(), 'fixture.stl');
    state.setState('project.name', 'Saved fixture');
    const saved = state.exportState();
    for (const list of events.values()) list.length = 0;
    state.loadState(saved);
    for (const [path, list] of events) assert.equal(list.length, 1, `load notifies ${path} once`);
    assert.equal(events.get('project.name')[0].value, 'Saved fixture');
    assert.equal(events.get('project.isDirty')[0].value, false);
    assert.equal(state.getState('input.isValid'), true);
    const currentGeometry = state.getState('input.geometry');
    assert.throws(() => state.loadState({ input: { geometryData: {
        uuid: 'broken', type: 'BufferGeometry', data: { attributes: {} }
    } } }));
    assert.equal(state.getState('input.geometry'), currentGeometry, 'bad load retains current geometry');
    for (const list of events.values()) list.length = 0;
    state.markSaved('2026-09-05T12:00:00.000Z');
    assert.equal(events.get('project.isDirty').length, 1);
    assert.equal(events.get('project.isDirty')[0].value, false);
    for (const list of events.values()) list.length = 0;
    state.reset();
    for (const [path, list] of events) assert.equal(list.length, 1, `reset notifies ${path} once`);
    assert.deepEqual(events.get('*')[0].changed, ['*']);
    console.log('PASS atomic load/reset, batched named notifications, wildcard contract and saved events');
}

async function fakeWorkerLifecycle() {
    const workers = [];
    const client = new MoldWorkerClient(() => { const worker = new FakeWorker(); workers.push(worker); return worker; });
    const geometry = input();
    const first = client.generate(geometry, params);
    const worker = workers[0];
    assert.ok(worker.messages[0].geometry);
    worker.emit(resultMessage(worker.messages[0].jobId));
    await first;
    const second = client.generate(geometry, params);
    assert.equal(workers.length, 1);
    assert.equal(worker.messages[1].geometry, null, 'input is uploaded once');
    worker.emit(resultMessage(worker.messages[1].jobId));
    await second;

    const obsolete = client.generate(geometry, params);
    const obsoleteCheck = aborts(obsolete);
    const middle = client.generate(geometry, { ...params, testRevision: 1 });
    const middleCheck = aborts(middle);
    const latest = client.generate(geometry, { ...params, testRevision: 2 });
    assert.equal(worker.messages.length, 3, 'only the running job is posted');
    worker.emit(resultMessage(worker.messages[2].jobId));
    assert.equal(worker.messages.length, 4, 'only latest queued settings are posted next');
    assert.equal(worker.messages[3].params.testRevision, 2);
    worker.emit(resultMessage(worker.messages[2].jobId)); // repeated stale response must do nothing
    worker.emit(resultMessage(worker.messages[3].jobId));
    await Promise.all([obsoleteCheck, middleCheck, latest]);

    const pending = client.generate(geometry, params);
    const pendingCheck = aborts(pending);
    client.cancel({ releaseInput: true });
    await pendingCheck;
    assert.equal(worker.terminated, true, 'input replacement interrupts running work');
    const recovered = client.generate(geometry, params);
    assert.equal(workers.length, 2);
    worker.emit(resultMessage(worker.messages.at(-1).jobId));
    workers[1].emit(resultMessage(workers[1].messages[0].jobId));
    await recovered;

    geometry.getAttribute('position').needsUpdate = true;
    const revised = client.generate(geometry, params);
    assert.ok(workers[1].messages[1].geometry, 'in-place input version uploads a new revision');
    workers[1].emit(resultMessage(workers[1].messages[1].jobId));
    await revised;
    for (let iteration = 0; iteration < 2; iteration++) {
        geometry.setAttribute('position', new THREE.BufferAttribute(geometry.getAttribute('position').array.slice(), 3));
        const replaced = client.generate(geometry, params);
        const request = workers[1].messages.at(-1);
        assert.ok(request.geometry, 'new attribute identity uploads even when both versions are zero');
        workers[1].emit(resultMessage(request.jobId));
        await replaced;
    }
    const failure = client.generate(geometry, params);
    const failureCheck = assert.rejects(failure, /bad settings/);
    workers[1].emit({ type: 'error', jobId: workers[1].messages.at(-1).jobId, error: 'bad settings' });
    await failureCheck;
    assert.equal(client.unavailable, false, 'generation error does not disable worker');
    const crash = client.generate(geometry, params);
    const crashCheck = assert.rejects(crash, /worker crashed/);
    workers[1].emit({ message: 'worker crashed' }, 'error');
    await crashCheck;
    assert.equal(client.unavailable, true, 'runtime failure signals fallback');
    const afterCrash = client.generate(geometry, params);
    workers[2].emit(resultMessage(workers[2].messages[0].jobId));
    await afterCrash;
    client.cancel({ releaseInput: true });
    assert.equal(workers[2].messages.at(-1).type, 'clear-input', 'idle reset clears retained worker input');
    client.dispose();
    geometry.dispose();
    console.log('PASS persistent worker/input, latest-only queue, hard cancellation, stale replies and input revisions');
}

async function appStateRaces() {
    const elements = new Map([
        ['projectName', { textContent: '' }], ['unsavedIndicator', { style: {} }],
        ['saveProjectName', { value: 'Named project' }]
    ]);
    globalThis.document = {
        getElementById: id => elements.get(id) || null,
        addEventListener() {},
        documentElement: { setAttribute() {}, style: { setProperty() {} } }
    };
    globalThis.window = { location: { pathname: '/cast-form-generator/' } };
    globalThis.alert = () => {};
    const storage = new Map();
    globalThis.localStorage = {
        getItem: key => storage.get(key) || null,
        setItem: () => { throw new Error('quota exceeded'); }
    };
    const { CastFormApp } = await import('../castForm/castFormMain.js');
    castFormState.reset();
    const app = new CastFormApp({ initialize: false });
    app.showLoading = () => {};
    app.updateStatus = () => {};
    app.renderPartLegend = () => {};
    app.validateMold = () => {};
    app.hideModal = () => {};
    app.setExportControlsBusy = () => {};
    app.setupStateSubscriptions();
    castFormState.setInputGeometry(input());
    clearTimeout(app.regenerateTimeout);
    let finish;
    app.generateMold = () => new Promise(resolve => { finish = resolve; });
    let disposed = 0;
    const staleParts = () => ({ foot: { dispose: () => disposed++ }, walls: [] });
    const resetPending = app.regenerateMold();
    castFormState.reset();
    finish(staleParts());
    await resetPending;
    assert.equal(castFormState.getState('output.footShell'), null);
    assert.equal(disposed, 1);
    assert.equal(elements.get('projectName').textContent, 'Untitled Cast Form');

    castFormState.setInputGeometry(input());
    const changedPending = app.regenerateMold();
    castFormState.setState('params.mold.spareHeight', 48);
    finish(staleParts());
    await changedPending;
    clearTimeout(app.regenerateTimeout);
    assert.equal(castFormState.getState('output.footShell'), null, 'debounce interval rejects old geometry');
    assert.equal(disposed, 2);

    const exportPending = app.generateExportParts();
    const exportCheck = aborts(exportPending);
    castFormState.reset();
    finish(staleParts());
    await exportCheck;
    assert.equal(disposed, 3, 'reset disposes pending export result');
    assert.equal(app.isExporting, false);

    castFormState.setInputGeometry(input());
    const loaded = castFormState.exportState();
    loaded.project.name = 'Replacement project';
    const loadPending = app.regenerateMold();
    castFormState.loadState(loaded);
    finish(staleParts());
    await loadPending;
    clearTimeout(app.regenerateTimeout);
    assert.equal(disposed, 4, 'load discards output from the previous project');
    assert.equal(elements.get('projectName').textContent, 'Replacement project');
    assert.equal(castFormState.getState('output.footShell'), null);

    let exportSnapshot;
    app.generateMold = (_geometry, settings) => {
        exportSnapshot = settings;
        return new Promise(resolve => { finish = resolve; });
    };
    const prioritizedExport = app.generateExportParts();
    const savedSpareHeight = exportSnapshot.mold.spareHeight;
    castFormState.setState('params.mold.spareHeight', savedSpareHeight + 3);
    assert.equal(exportSnapshot.mold.spareHeight, savedSpareHeight, 'export params are an immutable snapshot');
    assert.equal(app.pendingRegenerateAfterExport, true);
    finish({ foot: null, walls: [] });
    await prioritizedExport;
    assert.ok(app.regenerateTimeout, 'parameter changes during export schedule the next preview');
    clearTimeout(app.regenerateTimeout);

    castFormState.setState('params.mold.spareHeight', 49);
    const oldError = console.error;
    try {
        console.error = () => {};
        assert.equal(app.saveProject(), false);
    } finally { console.error = oldError; }
    assert.equal(castFormState.getState('project.isDirty'), true, 'failed save stays dirty');
    assert.equal(elements.get('unsavedIndicator').style.display, 'inline');
    globalThis.localStorage.setItem = (key, value) => storage.set(key, value);
    assert.equal(app.saveProject(), true);
    assert.equal(castFormState.getState('project.isDirty'), false);
    assert.equal(elements.get('unsavedIndicator').style.display, 'none');
    const written = JSON.parse(storage.get('playground_ceramics_castform_projects'))[0];
    assert.equal(written.project.lastModified, castFormState.getState('project.lastModified'));
    clearTimeout(app.regenerateTimeout);
    app.workerClient.dispose();
    castFormState.listeners.clear();
    castFormState.reset();
    delete globalThis.document;
    delete globalThis.alert;
    delete globalThis.localStorage;
    delete globalThis.window;
    console.log('PASS app reset/parameter/export races, stale-result disposal and storage-failure dirty state');
}

// Run the actual browser worker module under a minimal worker_threads bridge.
// This exercises transfer ownership and persistent generator caches, not a mock.
async function actualWorker() {
    const workerUrl = new URL('../castForm/geometry/moldWorker.js', import.meta.url).href;
    const workers = [];
    const posts = [];
    class WorkerBridge {
        constructor() {
            this.listeners = new Map();
            this.pending = [];
            this.ready = false;
            this.worker = new NodeWorker(`
                const { parentPort } = require('node:worker_threads');
                globalThis.self = {
                    addEventListener(type, callback) { if (type === 'message') parentPort.on('message', data => callback({ data })); },
                    postMessage(message, transfer) { parentPort.postMessage(message, transfer); }
                };
                import(${JSON.stringify(workerUrl)}).then(() => parentPort.postMessage({ type: 'bridge-ready' }));
            `, { eval: true });
            this.worker.on('message', message => {
                if (message.type === 'bridge-ready') {
                    this.ready = true;
                    for (const [data, transfer] of this.pending) this.worker.postMessage(data, transfer);
                    this.pending.length = 0;
                } else {
                    for (const callback of this.listeners.get('message') || []) callback({ data: message });
                }
            });
            this.worker.on('error', error => {
                for (const callback of this.listeners.get('error') || []) callback(error);
            });
        }
        addEventListener(type, callback) {
            if (!this.listeners.has(type)) this.listeners.set(type, []);
            this.listeners.get(type).push(callback);
        }
        postMessage(data, transfer) {
            posts.push({ type: data.type, uploaded: !!data.geometry });
            if (this.ready) this.worker.postMessage(data, transfer);
            else this.pending.push([data, transfer]);
        }
        terminate() { this.worker.terminate(); }
    }
    const client = new MoldWorkerClient(() => { const worker = new WorkerBridge(); workers.push(worker); return worker; });
    const geometry = input();
    const settings = structuredClone(params);
    settings.mold.wallCount = 1;
    const fingerprint = parts => {
        const hash = createHash('sha256');
        for (const part of [parts.foot, ...parts.walls]) {
            const serialized = serializeMoldGeometry(part, false);
            for (const array of [serialized.position, serialized.index]) {
                if (array) hash.update(new Uint8Array(array.buffer, array.byteOffset, array.byteLength));
            }
        }
        return hash.digest('hex');
    };
    const outputs = [];
    try {
        const start = performance.now();
        outputs.push(await client.generate(geometry, settings, { quality: 'preview', natchesEnabled: false }));
        const coldMs = performance.now() - start;
        const warmStart = performance.now();
        outputs.push(await client.generate(geometry, settings, { quality: 'preview', natchesEnabled: false }));
        const warmMs = performance.now() - warmStart;
        assert.equal(workers.length, 1);
        assert.deepEqual(posts.slice(0, 2).map(post => post.uploaded), [true, false]);
        assert.equal(fingerprint(outputs[0]), fingerprint(outputs[1]), 'warm cache matches cold output exactly');
        assert.ok(geometry.getAttribute('position').array.byteLength > 0, 'input ownership stays with caller');
        settings.mold.spareHeight += 2;
        outputs.push(await client.generate(geometry, settings, { quality: 'preview', natchesEnabled: false }));
        assert.notEqual(fingerprint(outputs[2]), fingerprint(outputs[1]), 'new params produce new geometry');
        assert.equal(posts[2].uploaded, false);
        console.log(`PASS actual worker transfer/cache parity; cold=${coldMs.toFixed(1)}ms warm=${warmMs.toFixed(1)}ms (single local sample)`);
    } finally {
        outputs.forEach(disposeParts);
        client.dispose();
        geometry.dispose();
    }
}

stateNotifications();
await fakeWorkerLifecycle();
await appStateRaces();
await actualWorker();
console.log('Cast Form worker/state gate passed');
