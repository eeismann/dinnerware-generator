import * as THREE from 'three';

export function abortMoldGeneration() {
    const error = new Error('Mold generation superseded');
    error.name = 'AbortError';
    return error;
}

export function serializeMoldGeometry(geometry, copy = true) {
    const position = geometry?.getAttribute('position');
    if (!position) throw new Error('Cannot generate mold: input geometry has no positions');
    const array = attribute => attribute
        ? (copy ? new attribute.array.constructor(attribute.array) : attribute.array)
        : null;
    return {
        position: array(position),
        normal: array(geometry.getAttribute('normal')),
        index: array(geometry.getIndex()),
        userData: geometry.userData
    };
}

export function deserializeMoldGeometry(payload) {
    if (!payload?.position) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(payload.position, 3));
    if (payload.normal) geometry.setAttribute('normal', new THREE.BufferAttribute(payload.normal, 3));
    if (payload.index) geometry.setIndex(new THREE.BufferAttribute(payload.index, 1));
    geometry.userData = payload.userData || {};
    if (!payload.normal) geometry.computeVertexNormals();
    return geometry;
}

export function moldGeometryTransfers(payload) {
    return payload ? [...new Set([payload.position, payload.normal, payload.index]
        .filter(Boolean).map(array => array.buffer))] : [];
}

/** One retained worker/input, one running request and at most one queued request. */
export class MoldWorkerClient {
    constructor(createWorker, onProgress = () => {}) {
        this.createWorker = createWorker;
        this.onProgress = onProgress;
        this.worker = null;
        this.active = null;
        this.queued = null;
        this.input = null;
        this.inputVersion = null;
        this.inputAttributes = null;
        this.nextJobId = 0;
        this.inputRevision = 0;
        this.unavailable = false;
    }

    generate(input, params, options = {}) {
        const attributes = [input.getAttribute('position'), input.getAttribute('normal'), input.getIndex()];
        const inputVersion = attributes.map(attribute => attribute?.version).join(':');
        return new Promise((resolve, reject) => {
            const request = {
                jobId: ++this.nextJobId, input, inputVersion, attributes,
                params: structuredClone(params), options: structuredClone(options), resolve, reject
            };
            if (this.active) {
                // A synchronous worker cannot process a cancel message during
                // generation. Let it finish, discard its response, then reuse its
                // sampling caches for the latest requested parameter values.
                this.cancel();
                this.queued = request;
            } else {
                this.start(request);
            }
        });
    }

    start(request) {
        try {
            if (!this.worker) {
                try {
                    this.worker = this.createWorker();
                } catch (error) {
                    this.unavailable = true;
                    throw error;
                }
                const worker = this.worker;
                worker.addEventListener('message', event => {
                    if (this.worker === worker) this.receive(event.data);
                });
                const fail = error => {
                    if (this.worker !== worker) return;
                    this.unavailable = true;
                    const failure = new Error(error?.message || 'Mold worker failed');
                    this.active?.reject(failure);
                    this.queued?.reject(failure);
                    this.releaseWorker();
                };
                worker.addEventListener('error', fail);
                worker.addEventListener('messageerror', fail);
            }
            const inputChanged = this.input !== request.input || this.inputVersion !== request.inputVersion
                || request.attributes.some((attribute, index) => attribute !== this.inputAttributes?.[index]);
            const geometry = inputChanged ? serializeMoldGeometry(request.input) : null;
            if (inputChanged) this.inputRevision++;
            this.active = request;
            this.worker.postMessage({
                type: 'generate', jobId: request.jobId, inputRevision: this.inputRevision,
                geometry, params: request.params, options: request.options
            }, moldGeometryTransfers(geometry));
            this.input = request.input;
            this.inputVersion = request.inputVersion;
            this.inputAttributes = request.attributes;
        } catch (error) {
            request.reject(error);
            this.releaseWorker();
        }
    }

    receive(message = {}) {
        const request = this.active;
        if (!request || message.jobId !== request.jobId) return;
        if (message.type === 'progress') {
            if (!request.cancelled) this.onProgress(message.progress);
            return;
        }
        if (message.type !== 'result' && message.type !== 'error') return;
        this.active = null;
        if (!request.cancelled) {
            if (message.type === 'error') {
                request.reject(new Error(message.error || 'Mold generation failed'));
            } else {
                const decoded = { foot: null, walls: [], sampling: message.sampling };
                try {
                    decoded.foot = deserializeMoldGeometry(message.result?.foot);
                    for (const wall of message.result?.walls || []) decoded.walls.push(deserializeMoldGeometry(wall));
                    request.resolve(decoded);
                } catch (error) {
                    decoded.foot?.dispose();
                    decoded.walls.forEach(wall => wall?.dispose());
                    request.reject(error);
                }
            }
        }
        const queued = this.queued;
        this.queued = null;
        if (queued) this.start(queued);
    }

    cancel({ releaseInput = false } = {}) {
        if (this.active && !this.active.cancelled) {
            this.active.cancelled = true;
            this.active.reject(abortMoldGeneration());
        }
        this.queued?.reject(abortMoldGeneration());
        this.queued = null;
        if (releaseInput) {
            if (this.active) {
                this.releaseWorker();
            } else {
                this.worker?.postMessage({ type: 'clear-input' });
                this.input = null;
                this.inputVersion = null;
                this.inputAttributes = null;
            }
        }
    }

    releaseWorker() {
        this.worker?.terminate();
        this.worker = null;
        this.active = null;
        this.queued = null;
        this.input = null;
        this.inputVersion = null;
        this.inputAttributes = null;
    }

    dispose() {
        this.cancel();
        this.releaseWorker();
    }
}
