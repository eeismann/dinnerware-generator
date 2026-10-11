const CUBIC_MILLIMETERS_PER_MILLILITER = 1000;
const POSITION_WELD_TOLERANCE = 1e-5;

function triangleSignedVolume(position, a, b, c) {
    const ax = position.getX(a);
    const ay = position.getY(a);
    const az = position.getZ(a);
    const bx = position.getX(b);
    const by = position.getY(b);
    const bz = position.getZ(b);
    const cx = position.getX(c);
    const cy = position.getY(c);
    const cz = position.getZ(c);

    return (
        ax * (by * cz - bz * cy)
        + ay * (bz * cx - bx * cz)
        + az * (bx * cy - by * cx)
    ) / 6;
}

function createCanonicalVertexIds(position) {
    const canonicalIds = new Int32Array(position.count);
    const idsByPosition = new Map();
    const quantize = (value) => Math.round(value / POSITION_WELD_TOLERANCE);
    let uniqueCount = 0;

    for (let i = 0; i < position.count; i++) {
        const key = `${quantize(position.getX(i))},${quantize(position.getY(i))},${quantize(position.getZ(i))}`;
        let id = idsByPosition.get(key);
        if (id === undefined) {
            id = uniqueCount++;
            idsByPosition.set(key, id);
        }
        canonicalIds[i] = id;
    }

    return { canonicalIds, uniqueCount };
}

/**
 * Compute the solid volume enclosed by the exterior surface of a generated
 * mold part. Generated parts are hollow print shells, so summing every signed
 * triangle would return only the thin printed-wall volume. Separating the
 * closed surface components and selecting the largest one returns the volume
 * of the solid plaster part reproduced by the master mold.
 *
 * @param {import('three').BufferGeometry | null} geometry
 * @returns {number} Enclosed volume in cubic millimeters.
 */
export function computeMoldPartFillVolumeMm3(geometry) {
    const position = geometry?.getAttribute?.('position');
    if (!position || position.count < 3) return 0;

    const index = geometry.getIndex();
    const triangleIndexCount = index ? index.count : position.count;
    if (triangleIndexCount < 3) return 0;

    const { canonicalIds, uniqueCount } = createCanonicalVertexIds(position);
    const parent = new Int32Array(uniqueCount);
    const rank = new Uint8Array(uniqueCount);
    for (let i = 0; i < uniqueCount; i++) parent[i] = i;

    const find = (value) => {
        let root = value;
        while (parent[root] !== root) root = parent[root];
        while (parent[value] !== value) {
            const next = parent[value];
            parent[value] = root;
            value = next;
        }
        return root;
    };

    const union = (a, b) => {
        let rootA = find(a);
        let rootB = find(b);
        if (rootA === rootB) return;
        if (rank[rootA] < rank[rootB]) [rootA, rootB] = [rootB, rootA];
        parent[rootB] = rootA;
        if (rank[rootA] === rank[rootB]) rank[rootA]++;
    };

    const sourceVertex = (offset) => index ? index.getX(offset) : offset;

    for (let i = 0; i + 2 < triangleIndexCount; i += 3) {
        const a = canonicalIds[sourceVertex(i)];
        const b = canonicalIds[sourceVertex(i + 1)];
        const c = canonicalIds[sourceVertex(i + 2)];
        union(a, b);
        union(b, c);
    }

    const signedVolumesByComponent = new Map();
    for (let i = 0; i + 2 < triangleIndexCount; i += 3) {
        const sourceA = sourceVertex(i);
        const sourceB = sourceVertex(i + 1);
        const sourceC = sourceVertex(i + 2);
        const component = find(canonicalIds[sourceA]);
        const signedVolume = triangleSignedVolume(position, sourceA, sourceB, sourceC);
        signedVolumesByComponent.set(
            component,
            (signedVolumesByComponent.get(component) || 0) + signedVolume
        );
    }

    let exteriorVolume = 0;
    signedVolumesByComponent.forEach((signedVolume) => {
        exteriorVolume = Math.max(exteriorVolume, Math.abs(signedVolume));
    });
    return exteriorVolume;
}

/**
 * Calculate the material required to cast every generated master-mold part.
 *
 * @param {{foot?: import('three').BufferGeometry | null, walls?: Array<import('three').BufferGeometry | null>}} parts
 */
export function calculateMasterMoldFillVolume(parts = {}) {
    const footMm3 = computeMoldPartFillVolumeMm3(parts.foot);
    const wallPartsMm3 = (parts.walls || []).map(computeMoldPartFillVolumeMm3);
    const wallsMm3 = wallPartsMm3.reduce((total, volume) => total + volume, 0);
    const totalMm3 = footMm3 + wallsMm3;

    return {
        totalMm3,
        totalMl: totalMm3 / CUBIC_MILLIMETERS_PER_MILLILITER,
        footMm3,
        footMl: footMm3 / CUBIC_MILLIMETERS_PER_MILLILITER,
        wallsMm3,
        wallsMl: wallsMm3 / CUBIC_MILLIMETERS_PER_MILLILITER,
        wallPartsMm3,
        wallPartsMl: wallPartsMm3.map((volume) => volume / CUBIC_MILLIMETERS_PER_MILLILITER)
    };
}
