/**
 * Shared STL export core used across all generator apps.
 */

import * as THREE from 'three';
import { validateGeometryForPrint, summarizeValidation } from './meshQuality.js';

const DEFAULTS = {
    header: 'Dinnerware Generator STL Export',
    validationMode: 'warn', // off | warn | strict
    validationOptions: undefined,
    trackOrientationConflicts: false,
    logLabel: 'stl-export',
    // 'y' keeps the app's Y-up frame (Cast Form, three.js tools); 'z' rotates
    // to the Z-up frame slicers expect, so pieces open standing upright.
    upAxis: 'y'
};

// Marker written into Z-up STL headers so platform importers can restore Y-up
export const Z_UP_HEADER_TAG = '[Z-up]';

function assertGeometry(geometry) {
    if (!geometry?.isBufferGeometry) {
        throw new Error('Expected THREE.BufferGeometry');
    }

    const position = geometry.getAttribute('position');
    if (!position || position.itemSize !== 3 || position.count < 3) {
        throw new Error('Geometry has no valid position attribute');
    }
}

function sanitizeHeader(header = DEFAULTS.header) {
    const text = String(header).replace(/[\r\n]/g, ' ');
    return text.length <= 80 ? text : text.slice(0, 80);
}

function writeHeader(view, headerText) {
    const header = sanitizeHeader(headerText);

    for (let i = 0; i < 80; i++) {
        const code = i < header.length ? header.charCodeAt(i) : 0;
        view.setUint8(i, code & 0xff);
    }
}

function getTriangleCount(geometry) {
    const index = geometry.getIndex();
    if (index) return Math.floor(index.count / 3);

    const position = geometry.getAttribute('position');
    return Math.floor(position.count / 3);
}

function withTriangleVertices(geometry, callback, upAxis = 'y') {
    const position = geometry.getAttribute('position');
    const index = geometry.getIndex();
    const positions = position.array;

    // +90° about X maps (x, y, z) to (x, -z, y): a proper rotation, so face
    // winding and outward normals are preserved.
    const readVertex = upAxis === 'z'
        ? (vertexIndex) => {
            const offset = vertexIndex * 3;
            return [positions[offset], -positions[offset + 2], positions[offset + 1]];
        }
        : (vertexIndex) => {
            const offset = vertexIndex * 3;
            return [
                positions[offset],
                positions[offset + 1],
                positions[offset + 2]
            ];
        };

    if (index) {
        const indices = index.array;
        const triangleCount = Math.floor(index.count / 3);

        for (let tri = 0; tri < triangleCount; tri++) {
            const i0 = indices[tri * 3];
            const i1 = indices[tri * 3 + 1];
            const i2 = indices[tri * 3 + 2];

            callback(readVertex(i0), readVertex(i1), readVertex(i2), tri);
        }
        return;
    }

    const triangleCount = Math.floor(position.count / 3);
    for (let tri = 0; tri < triangleCount; tri++) {
        const i0 = tri * 3;
        const i1 = i0 + 1;
        const i2 = i0 + 2;

        callback(readVertex(i0), readVertex(i1), readVertex(i2), tri);
    }
}

function computeFaceNormal(v0, v1, v2) {
    const abx = v1[0] - v0[0];
    const aby = v1[1] - v0[1];
    const abz = v1[2] - v0[2];

    const acx = v2[0] - v0[0];
    const acy = v2[1] - v0[1];
    const acz = v2[2] - v0[2];

    let nx = aby * acz - abz * acy;
    let ny = abz * acx - abx * acz;
    let nz = abx * acy - aby * acx;

    const length = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (!Number.isFinite(length) || length <= 1e-12) {
        return [0, 0, 0];
    }

    nx /= length;
    ny /= length;
    nz /= length;

    return [nx, ny, nz];
}

function applyValidationGate(geometry, options) {
    const validationMode = options.validationMode ?? DEFAULTS.validationMode;

    if (validationMode === 'off') {
        return null;
    }

    const validation = validateGeometryForSTL(geometry, options.validationOptions);

    const label = options.logLabel ?? DEFAULTS.logLabel;

    if (options.trackOrientationConflicts && validation.details.orientationConflictEdges > 0) {
        console.warn(`${label}: orientation-conflict edges tracked: ${validation.details.orientationConflictEdges}`);
    }

    if (!validation.valid) {
        const message = `${label}: ${summarizeValidation(validation.details)}; ${validation.warnings.join('; ')}`;

        if (validationMode === 'strict') {
            throw new Error(message);
        }

        if (validationMode === 'warn') {
            console.warn(message);
        }
    }

    return validation;
}

export function validateGeometryForSTL(geometry, options = {}) {
    assertGeometry(geometry);

    const details = validateGeometryForPrint(geometry, options);

    return {
        valid: details.valid,
        warnings: [...details.errors],
        triangleCount: details.triangleCount,
        vertexCount: geometry.getAttribute('position').count,
        details
    };
}

export function geometryToBinarySTLBuffer(geometry, options = {}) {
    assertGeometry(geometry);

    const mergedOptions = {
        ...DEFAULTS,
        ...options
    };

    applyValidationGate(geometry, mergedOptions);

    const triangleCount = getTriangleCount(geometry);
    const bufferSize = 80 + 4 + triangleCount * 50;
    const buffer = new ArrayBuffer(bufferSize);
    const view = new DataView(buffer);

    const header = mergedOptions.upAxis === 'z'
        ? `${Z_UP_HEADER_TAG} ${mergedOptions.header}`
        : mergedOptions.header;
    writeHeader(view, header);
    view.setUint32(80, triangleCount, true);

    let offset = 84;

    withTriangleVertices(geometry, (v0, v1, v2) => {
        const [nx, ny, nz] = computeFaceNormal(v0, v1, v2);

        view.setFloat32(offset, nx, true); offset += 4;
        view.setFloat32(offset, ny, true); offset += 4;
        view.setFloat32(offset, nz, true); offset += 4;

        view.setFloat32(offset, v0[0], true); offset += 4;
        view.setFloat32(offset, v0[1], true); offset += 4;
        view.setFloat32(offset, v0[2], true); offset += 4;

        view.setFloat32(offset, v1[0], true); offset += 4;
        view.setFloat32(offset, v1[1], true); offset += 4;
        view.setFloat32(offset, v1[2], true); offset += 4;

        view.setFloat32(offset, v2[0], true); offset += 4;
        view.setFloat32(offset, v2[1], true); offset += 4;
        view.setFloat32(offset, v2[2], true); offset += 4;

        view.setUint16(offset, 0, true); offset += 2;
    }, mergedOptions.upAxis);

    return buffer;
}

export function geometryToBinarySTLBlob(geometry, options = {}) {
    const buffer = geometryToBinarySTLBuffer(geometry, options);
    return new Blob([buffer], { type: 'application/octet-stream' });
}

export function geometryToASCIISTLString(geometry, options = {}) {
    assertGeometry(geometry);

    const mergedOptions = {
        ...DEFAULTS,
        ...options
    };

    applyValidationGate(geometry, mergedOptions);

    const baseName = String(options.solidName || 'model').replace(/\s+/g, '_');
    const solidName = mergedOptions.upAxis === 'z' ? `${Z_UP_HEADER_TAG}_${baseName}` : baseName;
    const lines = [`solid ${solidName}`];

    withTriangleVertices(geometry, (v0, v1, v2) => {
        const [nx, ny, nz] = computeFaceNormal(v0, v1, v2);

        lines.push(`  facet normal ${nx.toExponential(6)} ${ny.toExponential(6)} ${nz.toExponential(6)}`);
        lines.push('    outer loop');
        lines.push(`      vertex ${v0[0].toExponential(6)} ${v0[1].toExponential(6)} ${v0[2].toExponential(6)}`);
        lines.push(`      vertex ${v1[0].toExponential(6)} ${v1[1].toExponential(6)} ${v1[2].toExponential(6)}`);
        lines.push(`      vertex ${v2[0].toExponential(6)} ${v2[1].toExponential(6)} ${v2[2].toExponential(6)}`);
        lines.push('    endloop');
        lines.push('  endfacet');
    }, mergedOptions.upAxis);

    lines.push(`endsolid ${solidName}`);
    return `${lines.join('\n')}\n`;
}

export function geometryToASCIISTLBlob(geometry, options = {}) {
    const stl = geometryToASCIISTLString(geometry, options);
    return new Blob([stl], { type: 'text/plain' });
}

export function mergeGeometriesToNonIndexed(geometries) {
    if (!Array.isArray(geometries) || geometries.length === 0) {
        return new THREE.BufferGeometry();
    }

    const chunks = [];
    let totalFloats = 0;

    for (const geometry of geometries) {
        if (!geometry?.isBufferGeometry) continue;

        const expanded = geometry.getIndex() ? geometry.toNonIndexed() : geometry;
        const position = expanded.getAttribute('position');

        if (!position || position.count === 0) {
            if (expanded !== geometry) expanded.dispose();
            continue;
        }

        const chunk = new Float32Array(position.array);
        chunks.push(chunk);
        totalFloats += chunk.length;

        if (expanded !== geometry) {
            expanded.dispose();
        }
    }

    const mergedArray = new Float32Array(totalFloats);
    let offset = 0;
    for (const chunk of chunks) {
        mergedArray.set(chunk, offset);
        offset += chunk.length;
    }

    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(mergedArray, 3));
    return merged;
}

export function groupToMergedGeometry(group) {
    if (!group?.isObject3D) {
        throw new Error('Expected THREE.Object3D group');
    }

    const transformedGeometries = [];

    group.updateMatrixWorld(true);
    group.traverse((child) => {
        if (!child.isMesh || !child.geometry) return;

        const geometry = child.geometry.clone();
        geometry.applyMatrix4(child.matrixWorld);
        transformedGeometries.push(geometry);
    });

    const merged = mergeGeometriesToNonIndexed(transformedGeometries);
    transformedGeometries.forEach((geometry) => geometry.dispose());

    return merged;
}

const LOCAL_DOWNLOADS_ROUTE = '/api/downloads/';

function normalizeDownloadFilename(filename) {
    const rawName = String(filename || 'model.stl').trim() || 'model.stl';
    const withExtension = rawName.endsWith('.stl') || rawName.endsWith('.zip')
        ? rawName
        : `${rawName}.stl`;

    return withExtension.replace(/[\\/:*?"<>|]/g, '_');
}

function triggerBrowserDownload(blob, filename) {
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);

    return {
        method: 'browser-download',
        filename
    };
}

async function saveBlobToDownloads(blob, filename) {
    if (typeof window === 'undefined' || window.location.protocol === 'file:') {
        return null;
    }

    try {
        const response = await fetch(`${LOCAL_DOWNLOADS_ROUTE}${encodeURIComponent(filename)}`, {
            method: 'POST',
            headers: {
                'Content-Type': blob.type || 'application/octet-stream'
            },
            body: blob
        });

        if (!response.ok) {
            return null;
        }

        const payload = await response.json().catch(() => ({}));
        if (payload?.ok !== true) {
            return null;
        }

        return {
            method: 'downloads-folder',
            filename: payload.filename || filename,
            path: payload.path || null
        };
    } catch {
        return null;
    }
}

export async function downloadBlob(blob, filename) {
    const normalizedFilename = normalizeDownloadFilename(filename);
    const downloadsResult = await saveBlobToDownloads(blob, normalizedFilename);

    if (downloadsResult) {
        return downloadsResult;
    }

    return triggerBrowserDownload(blob, normalizedFilename);
}

export default {
    validateGeometryForSTL,
    geometryToBinarySTLBuffer,
    geometryToBinarySTLBlob,
    geometryToASCIISTLString,
    geometryToASCIISTLBlob,
    mergeGeometriesToNonIndexed,
    groupToMergedGeometry,
    downloadBlob
};
