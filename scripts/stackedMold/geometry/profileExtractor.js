/**
 * Stacked Cylinder Mold - profile extraction
 *
 * The slicer needs the ware's outer profile r(z) and the underside of its
 * base. Sources:
 *
 *   - Meshes (STL/OBJ, Dinnerware items): sampled radially. At each height the
 *     mesh is cut by a horizontal plane; rays from the axis at evenly spaced
 *     angles find the outermost wall, and the median over angles is r(z), so a
 *     handle or other local feature is ignored (and reported as asymmetry).
 *     The underside is the lowest surface hit by vertical rays at each radius.
 *   - Vessel V2/V3 projects: their sampled profile runs from the axis along
 *     the base and up the outside, so it splits into underside + outer wall.
 *
 * Pure functions over plain position arrays (Y up, base at y = 0, centred on
 * the Y axis); no Three.js, so Node gates can call them.
 */

const ANGLES = 72;

/** Triangles as flat [ax, ay, az, bx, ...] from (optionally indexed) positions. */
export function toTriangleArray(positions, index = null) {
    if (!index) return positions instanceof Float32Array ? positions : Float32Array.from(positions);
    const out = new Float32Array(index.length * 3);
    for (let i = 0; i < index.length; i++) {
        const v = index[i] * 3;
        out[i * 3] = positions[v];
        out[i * 3 + 1] = positions[v + 1];
        out[i * 3 + 2] = positions[v + 2];
    }
    return out;
}

function bounds(tris) {
    let yMin = Infinity, yMax = -Infinity, rMax = 0;
    for (let i = 0; i < tris.length; i += 3) {
        const y = tris[i + 1];
        if (y < yMin) yMin = y;
        if (y > yMax) yMax = y;
        rMax = Math.max(rMax, Math.hypot(tris[i], tris[i + 2]));
    }
    return { yMin, yMax, rMax };
}

/** Plane y = z cut: segments [x0, z0, x1, z1] in the plane. */
function sliceAt(tris, z) {
    const segs = [];
    const pts = [];
    for (let t = 0; t < tris.length; t += 9) {
        pts.length = 0;
        for (let e = 0; e < 3; e++) {
            const a = t + e * 3;
            const b = t + ((e + 1) % 3) * 3;
            const ya = tris[a + 1] - z;
            const yb = tris[b + 1] - z;
            if ((ya < 0 && yb > 0) || (ya > 0 && yb < 0)) {
                const s = ya / (ya - yb);
                pts.push(tris[a] + s * (tris[b] - tris[a]), tris[a + 2] + s * (tris[b + 2] - tris[a + 2]));
            }
        }
        if (pts.length === 4) segs.push(pts[0], pts[1], pts[2], pts[3]);
    }
    return segs;
}

/** Outermost hit of a ray from the axis at angle th against plane segments. */
function rayMax(segs, dx, dz) {
    let best = -1;
    for (let i = 0; i < segs.length; i += 4) {
        const px = segs[i], pz = segs[i + 1];
        const ex = segs[i + 2] - px, ez = segs[i + 3] - pz;
        const den = dx * ez - dz * ex;
        if (Math.abs(den) < 1e-12) continue;
        const t = (px * ez - pz * ex) / den;
        const u = (px * dz - pz * dx) / den;
        if (t > 0 && u >= -1e-9 && u <= 1 + 1e-9 && t > best) best = t;
    }
    return best;
}

/** Lowest surface height under the point (x, z), or Infinity. */
function lowestHit(tris, x, z) {
    let best = Infinity;
    for (let t = 0; t < tris.length; t += 9) {
        const ax = tris[t], az = tris[t + 2];
        const bx = tris[t + 3], bz = tris[t + 5];
        const cx = tris[t + 6], cz = tris[t + 8];
        const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
        if (Math.abs(d) < 1e-12) continue;
        const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d;
        const l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d;
        const l3 = 1 - l1 - l2;
        if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue;
        const y = l1 * tris[t + 1] + l2 * tris[t + 4] + l3 * tris[t + 7];
        if (y < best) best = y;
    }
    return best;
}

const median = (values) => {
    const s = [...values].sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Sample a mesh's outer profile and base underside.
 * @param {Float32Array|number[]} positions - xyz triples, Y up
 * @param {Object} [options]
 * @param {Uint32Array|number[]} [options.index]
 * @param {number} [options.step] - height step (mm)
 * @returns {{ outer: Array<{z,r}>, underside: Array<{rho,z}>, H: number, asymmetry: number, maxRadius: number }}
 */
export function extractMeshProfile(positions, { index = null, step = 0.5 } = {}) {
    const tris = toTriangleArray(positions, index);
    if (tris.length < 9) throw new Error('The mesh has no triangles.');
    const { yMin, yMax } = bounds(tris);
    const H = yMax - yMin;
    if (!(H > 1)) throw new Error('The mesh is flat: it needs height along Y.');
    const dirs = Array.from({ length: ANGLES }, (_, k) => {
        const th = 2 * Math.PI * k / ANGLES;
        return [Math.cos(th), Math.sin(th)];
    });

    // Outer wall: just inside the base and lip so the cut never lies on a flat face
    const eps = Math.min(0.05, H / 1000);
    const heights = [];
    for (let z = eps; z < H - eps; z += step) heights.push(z);
    heights.push(H - eps);
    const outer = [];
    let asymmetry = 0;
    for (const z of heights) {
        const segs = sliceAt(tris, yMin + z);
        if (!segs.length) continue;
        const hits = dirs.map(([dx, dz]) => rayMax(segs, dx, dz)).filter(v => v > 0);
        if (hits.length < ANGLES / 2) continue;
        const r = median(hits);
        asymmetry = Math.max(asymmetry, Math.max(...hits) - Math.min(...hits));
        outer.push({ z: z === eps ? 0 : z === H - eps ? H : z, r });
    }
    if (outer.length < 2) throw new Error('Could not find an outer wall in the mesh.');

    // Underside: from the axis out to the base's outer edge
    const r0 = outer[0].r;
    const underside = [];
    const probe = [0, Math.PI / 2, Math.PI, 1.5 * Math.PI, Math.PI / 4, 1.25 * Math.PI];
    for (let rho = 0; rho <= r0 + 1e-9; rho = Math.min(r0, rho + step)) {
        const zs = probe
            .map(th => lowestHit(tris, (rho || 1e-3) * Math.cos(th), (rho || 1e-3) * Math.sin(th)))
            .filter(Number.isFinite);
        if (zs.length) underside.push({ rho, z: median(zs) - yMin });
        if (rho >= r0) break;
    }
    // The base edge meets the wall at z = 0
    if (underside.length) underside[underside.length - 1] = { rho: r0, z: 0 };

    return { outer, underside, H, asymmetry, maxRadius: Math.max(...outer.map(p => p.r)) };
}

/**
 * Vessel V2/V3 sampled profile ({ r, h } from the axis, along the base, up the
 * outside to the lip) → underside + outer wall.
 */
export function splitVesselProfile(samples) {
    const pts = samples.map(p => ({ r: p.r ?? p.radius, h: p.h ?? p.y }))
        .filter(p => Number.isFinite(p.r) && Number.isFinite(p.h));
    if (pts.length < 2) throw new Error('The vessel profile is empty.');
    // The base runs out from the axis while the profile stays level or descends
    let end = 0;
    while (end + 1 < pts.length && pts[end + 1].h <= pts[end].h + 1e-6 && pts[end + 1].r >= pts[end].r - 1e-6) end++;
    const yMin = Math.min(...pts.map(p => p.h));
    const underside = pts.slice(0, end + 1).map(p => ({ rho: Math.max(0, p.r), z: p.h - yMin }));
    const wall = pts.slice(end).map(p => ({ z: p.h - yMin, r: p.r }));
    // Keep the outer wall single-valued in z (outermost radius per height)
    const outer = [];
    for (const p of wall) {
        const last = outer[outer.length - 1];
        if (last && p.z <= last.z + 1e-6) { last.r = Math.max(last.r, p.r); continue; }
        outer.push({ ...p });
    }
    if (underside.length && underside[0].rho > 0.5) underside.unshift({ rho: 0, z: underside[0].z });
    return { outer, underside, H: outer[outer.length - 1].z, asymmetry: 0, maxRadius: Math.max(...outer.map(p => p.r)) };
}

/** Control-point form ([z, r] pairs) → the same shape, flat base. */
export function controlFormProfile(pts) {
    const r0 = pts[0][1];
    return {
        controlPoints: pts,
        outer: null,
        underside: [{ rho: 0, z: 0 }, { rho: r0, z: 0 }],
        H: pts[pts.length - 1][0],
        asymmetry: 0,
        maxRadius: Math.max(...pts.map(p => p[1]))
    };
}
