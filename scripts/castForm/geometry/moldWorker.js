/**
 * Cast Form Generator - Mold Worker
 * Offloads mold generation from main thread.
 */

import { MoldGenerator } from './moldGenerator.js';
import { serializeMoldGeometry, deserializeMoldGeometry, moldGeometryTransfers } from './moldWorkerClient.js';

const generator = new MoldGenerator();
generator.cacheLimit = 4;
generator.resultCacheLimit = 2;
const MAX_RETAINED_CACHE_BYTES = 128 * 1024 * 1024;
let inputGeometry = null;
let inputRevision = null;

function clearInput() {
    generator.clearCaches();
    if (inputGeometry) {
        inputGeometry.boundsTree = null;
        inputGeometry.dispose();
    }
    inputGeometry = null;
    inputRevision = null;
}

function estimatedBytes(value, seen = new Set()) {
    if (typeof value === 'number') return 8;
    if (!value || typeof value !== 'object' || seen.has(value)) return 0;
    seen.add(value);
    if (ArrayBuffer.isView(value)) return value.byteLength;
    if (Array.isArray(value) && typeof value[0] === 'number') return value.length * 8;
    if (value.isBufferGeometry) {
        return Object.values(value.attributes).reduce((sum, attr) => sum + estimatedBytes(attr.array, seen), 0)
            + estimatedBytes(value.index?.array, seen);
    }
    if (value instanceof Map) return [...value.values()].reduce((sum, item) => sum + estimatedBytes(item, seen), 0);
    return Object.values(value).reduce((sum, item) => sum + estimatedBytes(item, seen), 0);
}

function limitCacheMemory() {
    // Bound cached numeric/mesh payloads as well as entry counts. Keep only one
    // input/BVH; evict bulky output clones before reusable sampled profiles.
    const caches = [generator.resultCache, generator.bottomGridCache, generator.profileCache, generator.patternSignatureCache]
        .filter(Boolean);
    let bytes = caches.reduce((sum, cache) => sum + estimatedBytes(cache), 0);
    for (const cache of caches) {
        while (bytes > MAX_RETAINED_CACHE_BYTES && cache.size) {
            const key = cache.keys().next().value;
            const value = cache.get(key);
            bytes -= estimatedBytes(value);
            if (cache === generator.resultCache) generator.disposeMoldResult(value);
            cache.delete(key);
        }
    }
}

self.addEventListener('message', (event) => {
    const { type, jobId, geometry, params, options, inputRevision: requestedRevision } = event.data || {};

    if (type === 'clear-input') {
        clearInput();
        return;
    }

    if (type !== 'generate') {
        return;
    }

    let result = null;
    try {
        if (geometry) {
            clearInput();
            inputGeometry = deserializeMoldGeometry(geometry);
            inputRevision = requestedRevision;
        }
        if (!inputGeometry || requestedRevision !== inputRevision) {
            throw new Error('Mold worker input revision is unavailable');
        }

        result = generator.generate(inputGeometry, params, {
            ...options,
            onProgress: (progress) => {
                self.postMessage({
                    type: 'progress',
                    jobId,
                    progress
                });
            }
        });

        // The generator retains independent cache clones. Transfer ownership of
        // these returned arrays directly instead of cloning each output again.
        const serializedFoot = result.foot ? serializeMoldGeometry(result.foot, false) : null;
        const serializedWalls = result.walls.map((wall) => wall ? serializeMoldGeometry(wall, false) : null);

        const transferList = [...new Set([
            ...moldGeometryTransfers(serializedFoot),
            ...serializedWalls.flatMap((wall) => moldGeometryTransfers(wall))
        ])];

        self.postMessage(
            {
                type: 'result',
                jobId,
                sampling: generator.getLastSamplingInfo(),
                result: {
                    foot: serializedFoot,
                    walls: serializedWalls
                }
            },
            transferList
        );
    } catch (error) {
        self.postMessage({
            type: 'error',
            jobId,
            error: error instanceof Error ? error.message : String(error)
        });
    } finally {
        generator.disposeMoldResult(result);
        // Relief evaluators close over sampled profiles; release those closures
        // so evicted cache entries can actually be collected between jobs.
        generator.analyticRelief = null;
        generator.wallVolumeCompiler.analyticRelief = null;
        limitCacheMemory();
    }
});
