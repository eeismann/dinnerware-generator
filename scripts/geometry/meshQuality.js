/**
 * Shared mesh-quality diagnostics for print validation.
 * Works on indexed and non-indexed THREE.BufferGeometry.
 */

import * as THREE from 'three';

const DEFAULTS = {
    degenerateArea2Epsilon: 1e-7,
    weldDecimalPlaces: 3,
    enforceOrientationConsistency: false
};

function assertGeometry(geometry) {
    if (!geometry || !geometry.isBufferGeometry) {
        throw new Error('Expected THREE.BufferGeometry');
    }

    const position = geometry.getAttribute('position');
    if (!position || position.itemSize !== 3 || position.count < 3) {
        throw new Error('Geometry has no valid position attribute');
    }
}

function forEachTriangleVertexIndices(geometry, callback) {
    const position = geometry.getAttribute('position');
    const index = geometry.getIndex();

    if (index) {
        const indices = index.array;
        for (let i = 0; i + 2 < index.count; i += 3) {
            callback(indices[i], indices[i + 1], indices[i + 2], i / 3);
        }
        return;
    }

    for (let i = 0; i < position.count; i += 3) {
        callback(i, i + 1, i + 2, i / 3);
    }
}

function getTriangleCount(geometry) {
    const index = geometry.getIndex();
    if (index) return Math.floor(index.count / 3);
    return Math.floor(geometry.getAttribute('position').count / 3);
}

export function toNonIndexedGeometry(geometry) {
    assertGeometry(geometry);
    const clone = geometry.clone();
    return clone.getIndex() ? clone.toNonIndexed() : clone;
}

export function countDegenerateTriangles(geometry, options = {}) {
    assertGeometry(geometry);
    const position = geometry.getAttribute('position');
    const epsilon = options.degenerateArea2Epsilon ?? DEFAULTS.degenerateArea2Epsilon;

    let degenerateCount = 0;
    const interleaved = position.isInterleavedBufferAttribute;
    const array = interleaved ? null : position.array;

    forEachTriangleVertexIndices(geometry, (a, b, c) => {
        let ax, ay, az, bx, by, bz, cx, cy, cz;
        if (array) {
            ax = array[a * 3]; ay = array[a * 3 + 1]; az = array[a * 3 + 2];
            bx = array[b * 3]; by = array[b * 3 + 1]; bz = array[b * 3 + 2];
            cx = array[c * 3]; cy = array[c * 3 + 1]; cz = array[c * 3 + 2];
        } else {
            ax = position.getX(a); ay = position.getY(a); az = position.getZ(a);
            bx = position.getX(b); by = position.getY(b); bz = position.getZ(b);
            cx = position.getX(c); cy = position.getY(c); cz = position.getZ(c);
        }

        const abx = bx - ax;
        const aby = by - ay;
        const abz = bz - az;

        const acx = cx - ax;
        const acy = cy - ay;
        const acz = cz - az;

        const nx = aby * acz - abz * acy;
        const ny = abz * acx - abx * acz;
        const nz = abx * acy - aby * acx;

        const area2 = Math.sqrt(nx * nx + ny * ny + nz * nz);
        if (!Number.isFinite(area2) || area2 <= epsilon) {
            degenerateCount++;
        }
    });

    return {
        triangleCount: getTriangleCount(geometry),
        degenerateCount
    };
}

/**
 * Weld vertices by quantized position. Keys are exact integers rather than
 * strings: an outer map on the quantized height, and an inner key packing
 * x and z into 21 bits each (±1m at 0.001mm resolution, well inside 2^53).
 * Falls back to string keys for coordinates beyond that range.
 * Returns welded ids per vertex and the welded vertex count.
 */
function weldVertexIds(position, decimalPlaces) {
    const scale = 10 ** decimalPlaces;
    const array = position.array;
    const stride = position.isInterleavedBufferAttribute ? position.data.stride : 3;
    const offset = position.isInterleavedBufferAttribute ? position.offset : 0;
    const ids = new Uint32Array(position.count);
    const byHeight = new Map();
    const fallback = new Map();
    const PACK = 2 ** 21;
    const HALF = PACK / 2;
    let next = 0;

    for (let i = 0; i < position.count; i++) {
        const o = i * stride + offset;
        const qx = Math.round(array[o] * scale);
        const qy = Math.round(array[o + 1] * scale);
        const qz = Math.round(array[o + 2] * scale);

        let id;
        if (Math.abs(qx) < HALF && Math.abs(qz) < HALF) {
            let row = byHeight.get(qy);
            if (!row) {
                row = new Map();
                byHeight.set(qy, row);
            }
            const key = (qx + HALF) * PACK + (qz + HALF);
            id = row.get(key);
            if (id === undefined) {
                id = next++;
                row.set(key, id);
            }
        } else {
            const key = `${qx},${qy},${qz}`;
            id = fallback.get(key);
            if (id === undefined) {
                id = next++;
                fallback.set(key, id);
            }
        }
        ids[i] = id;
    }
    return { ids, count: next };
}

export function getEdgeValenceStats(geometry, options = {}) {
    assertGeometry(geometry);
    const position = geometry.getAttribute('position');
    const decimalPlaces = options.weldDecimalPlaces ?? DEFAULTS.weldDecimalPlaces;
    const { ids: weldedIdsByVertex, count: weldedVertexCount } = weldVertexIds(position, decimalPlaces);

    // Edge key lo * N + hi is exact while N^2 < 2^53 (N up to ~94M vertices).
    // The value counts traversals: low 20 bits lo->hi, high bits hi->lo.
    const DIRECTION = 2 ** 20;
    const edgeMap = new Map();
    const addEdge = (a, b) => {
        if (a === b) return;
        const key = a < b ? a * weldedVertexCount + b : b * weldedVertexCount + a;
        edgeMap.set(key, (edgeMap.get(key) ?? 0) + (a < b ? 1 : DIRECTION));
    };

    forEachTriangleVertexIndices(geometry, (a, b, c) => {
        const wa = weldedIdsByVertex[a];
        const wb = weldedIdsByVertex[b];
        const wc = weldedIdsByVertex[c];

        addEdge(wa, wb);
        addEdge(wb, wc);
        addEdge(wc, wa);
    });

    let boundaryEdges = 0;
    let overConnectedEdges = 0;
    let nonManifoldEdges = 0;
    let orientationConflictEdges = 0;
    let maxValence = 0;

    edgeMap.forEach((packed) => {
        const loToHi = packed % DIRECTION;
        const hiToLo = Math.floor(packed / DIRECTION);
        const valence = loToHi + hiToLo;
        if (valence === 1) boundaryEdges++;
        if (valence > 2) overConnectedEdges++;
        if (valence !== 2) nonManifoldEdges++;
        if (valence === 2 && (loToHi !== 1 || hiToLo !== 1)) {
            orientationConflictEdges++;
        }
        if (valence > maxValence) maxValence = valence;
    });

    return {
        weldedVertexCount,
        uniqueEdgeCount: edgeMap.size,
        boundaryEdges,
        overConnectedEdges,
        nonManifoldEdges,
        orientationConflictEdges,
        maxValence
    };
}

export function validateGeometryForPrint(geometry, options = {}) {
    assertGeometry(geometry);

    const degenerate = countDegenerateTriangles(geometry, options);
    const edgeValence = getEdgeValenceStats(geometry, options);
    const enforceOrientationConsistency =
        options.enforceOrientationConsistency ?? DEFAULTS.enforceOrientationConsistency;

    const errors = [];
    if (degenerate.degenerateCount > 0) {
        errors.push(`degenerate triangles: ${degenerate.degenerateCount}`);
    }
    if (edgeValence.boundaryEdges > 0) {
        errors.push(`boundary edges: ${edgeValence.boundaryEdges}`);
    }
    if (edgeValence.overConnectedEdges > 0) {
        errors.push(`over-connected edges (>2): ${edgeValence.overConnectedEdges}`);
    }
    if (enforceOrientationConsistency && edgeValence.orientationConflictEdges > 0) {
        errors.push(`orientation-conflict edges: ${edgeValence.orientationConflictEdges}`);
    }

    return {
        valid: errors.length === 0,
        errors,
        triangleCount: degenerate.triangleCount,
        degenerateCount: degenerate.degenerateCount,
        ...edgeValence
    };
}

/**
 * Detect coplanar overlapping face groups with opposing normals.
 * Groups triangles by quantized plane (normal direction + signed distance from
 * origin). Opposing groups are only flagged when they also overlap spatially
 * in that plane (centroid-cell intersection) to avoid false positives from
 * disjoint inner/outer surfaces that happen to be coplanar.
 *
 * Returns { overlappingPairs: number, planeCount: number, candidatePairs: number }
 */
export function detectCoplanarOverlap(geometry, options = {}) {
    assertGeometry(geometry);
    const position = geometry.getAttribute('position');
    const decimalPlaces = options.weldDecimalPlaces ?? DEFAULTS.weldDecimalPlaces;
    const normalDecimalPlaces = options.normalDecimalPlaces ?? 2;
    const overlapCellDecimalPlaces = options.overlapCellDecimalPlaces ?? 1;
    const requireCellOverlap = options.requireCellOverlap !== false;

    const planeMap = new Map();

    const vA = new THREE.Vector3();
    const vB = new THREE.Vector3();
    const vC = new THREE.Vector3();
    const edge1 = new THREE.Vector3();
    const edge2 = new THREE.Vector3();
    const normal = new THREE.Vector3();

    const normalScale = 10 ** normalDecimalPlaces;
    const distScale = 10 ** decimalPlaces;
    const overlapCellScale = 10 ** overlapCellDecimalPlaces;

    const getProjectionAxes = (normalComponents) => {
        const ax = Math.abs(normalComponents[0]);
        const ay = Math.abs(normalComponents[1]);
        const az = Math.abs(normalComponents[2]);

        // Drop dominant axis for a stable 2D projection key.
        if (ax >= ay && ax >= az) return [1, 2];
        if (ay >= ax && ay >= az) return [0, 2];
        return [0, 1];
    };

    forEachTriangleVertexIndices(geometry, (a, b, c) => {
        vA.fromBufferAttribute(position, a);
        vB.fromBufferAttribute(position, b);
        vC.fromBufferAttribute(position, c);

        edge1.subVectors(vB, vA);
        edge2.subVectors(vC, vA);
        normal.crossVectors(edge1, edge2);

        const len = normal.length();
        if (len < 1e-10) return; // degenerate triangle
        normal.divideScalar(len);

        // Canonical direction: ensure the largest absolute component is positive
        // so that opposite normals map to different keys.
        const qnx = Math.round(normal.x * normalScale);
        const qny = Math.round(normal.y * normalScale);
        const qnz = Math.round(normal.z * normalScale);

        const centroidX = (vA.x + vB.x + vC.x) / 3;
        const centroidY = (vA.y + vB.y + vC.y) / 3;
        const centroidZ = (vA.z + vB.z + vC.z) / 3;
        const dist = normal.x * centroidX + normal.y * centroidY + normal.z * centroidZ;
        const qdist = Math.round(dist * distScale);

        const key = `${qnx},${qny},${qnz}:${qdist}`;
        let entry = planeMap.get(key);
        if (entry) {
            entry.count++;
        } else {
            entry = {
                normal: [qnx, qny, qnz],
                distance: qdist,
                count: 1,
                centroidCells: new Set(),
                projectionAxes: getProjectionAxes([qnx, qny, qnz])
            };
            planeMap.set(key, entry);
        }

        const [uAxis, vAxis] = entry.projectionAxes;
        const centroid = [centroidX, centroidY, centroidZ];
        const u = Math.round(centroid[uAxis] * overlapCellScale);
        const v = Math.round(centroid[vAxis] * overlapCellScale);
        entry.centroidCells.add(`${u},${v}`);
    });

    // Find opposing-normal pairs that share the same plane.
    let overlappingPairs = 0;
    let candidatePairs = 0;
    const visited = new Set();

    for (const [key, entry] of planeMap) {
        if (visited.has(key)) continue;

        const oppositeKey = `${-entry.normal[0]},${-entry.normal[1]},${-entry.normal[2]}:${-entry.distance}`;
        if (oppositeKey !== key && planeMap.has(oppositeKey) && !visited.has(oppositeKey)) {
            candidatePairs++;
            const opposite = planeMap.get(oppositeKey);

            if (requireCellOverlap) {
                const smaller = entry.centroidCells.size <= opposite.centroidCells.size
                    ? entry.centroidCells
                    : opposite.centroidCells;
                const larger = smaller === entry.centroidCells
                    ? opposite.centroidCells
                    : entry.centroidCells;

                let intersects = false;
                for (const cell of smaller) {
                    if (larger.has(cell)) {
                        intersects = true;
                        break;
                    }
                }

                if (intersects) {
                    overlappingPairs++;
                }
            } else {
                overlappingPairs++;
            }

            visited.add(key);
            visited.add(oppositeKey);
        }
    }

    return { overlappingPairs, planeCount: planeMap.size, candidatePairs };
}

export function summarizeValidation(result) {
    const status = result.valid ? 'PASS' : 'FAIL';
    return [
        status,
        `triangles=${result.triangleCount}`,
        `degenerate=${result.degenerateCount}`,
        `boundary=${result.boundaryEdges}`,
        `over2=${result.overConnectedEdges}`,
        `orient=${result.orientationConflictEdges}`,
        `weldedVerts=${result.weldedVertexCount}`
    ].join(' ');
}

export default {
    toNonIndexedGeometry,
    countDegenerateTriangles,
    getEdgeValenceStats,
    validateGeometryForPrint,
    detectCoplanarOverlap,
    summarizeValidation
};
