/**
 * Stacked Cylinder Mold - watertight solid builder
 *
 * Printable parts are built directly from welded vertex loops, strips, fans
 * and triangulated planar faces (no CSG), the way caseBoxGenerator.js builds
 * its tubs. Vertices weld by quantized position, so two faces that compute the
 * same boundary points (same function, same arguments) share edges and the
 * part closes into one oriented 2-manifold. Every shared edge must carry the
 * same subdivision on both sides; `analyzeSolid()` checks that.
 *
 * Conventions: Y up. Lathe angle θ maps (ρ, y) to (ρ cos θ, y, −ρ sin θ), so
 * loops with increasing θ run counter-clockwise seen from +Y. Planar faces
 * take 2D polygons plus a mapping to 3D and the outward normal they must face.
 */

import { ShapeUtils, Vector2 } from 'three';

const TAU = Math.PI * 2;

export const at = (rho, theta, y) => [rho * Math.cos(theta), y, -rho * Math.sin(theta)];

export function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
export function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
export function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

/** Segments for a circle of radius r with chords about `chord` mm long. */
export function circleSegments(r, chord = 1.6, min = 24, max = 256) {
    return Math.max(min, Math.min(max, Math.ceil(TAU * r / chord / 4) * 4));
}

/** Signed area of a 2D polygon [[u, w], ...] (CCW positive). */
export function signedArea2(poly) {
    let s = 0;
    for (let i = 0; i < poly.length; i++) {
        const [x0, y0] = poly[i];
        const [x1, y1] = poly[(i + 1) % poly.length];
        s += x0 * y1 - x1 * y0;
    }
    return s / 2;
}

export class SolidBuilder {
    constructor({ weld = 1e-4 } = {}) {
        this.positions = [];
        this.indices = [];
        this.lookup = new Map();
        this.inv = 1 / weld;
    }

    vertex(p) {
        const key = `${Math.round(p[0] * this.inv)},${Math.round(p[1] * this.inv)},${Math.round(p[2] * this.inv)}`;
        let id = this.lookup.get(key);
        if (id === undefined) {
            id = this.positions.length / 3;
            this.positions.push(p[0], p[1], p[2]);
            this.lookup.set(key, id);
        }
        return id;
    }

    point(id) {
        return [this.positions[id * 3], this.positions[id * 3 + 1], this.positions[id * 3 + 2]];
    }

    tri(a, b, c) {
        if (a === b || b === c || a === c) return;
        this.indices.push(a, b, c);
    }

    /** Quad split along a–c. */
    quad(a, b, c, d) {
        this.tri(a, b, c);
        this.tri(a, c, d);
    }

    loop(points) {
        return points.map(p => this.vertex(p));
    }

    /**
     * Quads between two loops of equal length: (a[i], a[i+1], b[i+1], b[i]).
     * For CCW loops (seen from +Y) with b above a this faces outward (away from
     * the loops' centre).
     */
    strip(a, b, closed = true) {
        const n = a.length;
        const last = closed ? n : n - 1;
        for (let i = 0; i < last; i++) {
            const j = (i + 1) % n;
            this.quad(a[i], a[j], b[j], b[i]);
        }
    }

    /**
     * Strip whose quads are each oriented to face away from (`away`) or toward
     * the line through `axisPoint` along `axisDir`. Used for cones and tubes
     * whose loops lie in arbitrary planes.
     */
    axialStrip(a, b, axisPoint, axisDir, away, closed = true) {
        const n = a.length;
        const last = closed ? n : n - 1;
        for (let i = 0; i < last; i++) {
            const j = (i + 1) % n;
            const ids = [a[i], a[j], b[j], b[i]].filter((id, k, arr) => arr.indexOf(id) === k);
            if (ids.length < 3) continue;
            const pts = ids.map(id => this.point(id));
            const nrm = cross(sub(pts[1], pts[0]), sub(pts[2], pts[0]));
            const c = pts.reduce((m, p) => [m[0] + p[0] / pts.length, m[1] + p[1] / pts.length, m[2] + p[2] / pts.length], [0, 0, 0]);
            const rel = sub(c, axisPoint);
            const along = dot(rel, axisDir);
            const radial = sub(rel, axisDir.map(v => v * along));
            const facesAway = dot(nrm, radial) > 0;
            if (facesAway === away) this.quad(a[i], a[j], b[j], b[i]);
            else this.quad(b[i], b[j], a[j], a[i]);
        }
    }

    /**
     * Planar polygon with holes. `outer` and `holes` are 2D [[u, w], ...];
     * `to3d(u, w)` maps them into space; triangles are wound to face `normal`.
     */
    face(outer, holes, to3d, normal) {
        const contour = outer.map(([u, w]) => new Vector2(u, w));
        const holeVecs = holes.map(h => h.map(([u, w]) => new Vector2(u, w)));
        const all = [...outer, ...holes.flat()];
        const ids = all.map(([u, w]) => this.vertex(to3d(u, w)));
        const tris = ShapeUtils.triangulateShape(contour, holeVecs);
        for (const [i, j, k] of tris) {
            const a = ids[i], b = ids[j], c = ids[k];
            if (a === b || b === c || a === c) continue;
            const pa = this.point(a), pb = this.point(b), pc = this.point(c);
            const nrm = cross(sub(pb, pa), sub(pc, pa));
            if (dot(nrm, normal) >= 0) this.tri(a, b, c);
            else this.tri(a, c, b);
        }
    }

    /** Horizontal face at height y; polygons in (x, −z). */
    hface(y, outer, holes, up) {
        this.face(outer, holes, (u, w) => [u, y, -w], [0, up ? 1 : -1, 0]);
    }

    /**
     * Surface of revolution through `profile` [[ρ, y], ...]. Walk the profile
     * with the solid on the left (CCW around the cross-section) for outward
     * normals. Points on the axis (ρ = 0) collapse to one vertex.
     * Returns the rings (vertex ids per profile point).
     */
    lathe(profile, { n = 128, theta0 = 0, theta1 = TAU } = {}) {
        const closed = Math.abs(theta1 - theta0 - TAU) < 1e-9;
        const count = closed ? n : n + 1;
        const rings = profile.map(([rho, y]) => {
            const ring = [];
            for (let k = 0; k < count; k++) {
                const th = theta0 + (theta1 - theta0) * k / n;
                ring.push(this.vertex(rho <= 1e-9 ? [0, y, 0] : at(rho, th, y)));
            }
            return ring;
        });
        for (let j = 0; j < rings.length - 1; j++) this.strip(rings[j], rings[j + 1], closed);
        return rings;
    }

    build() {
        return {
            positions: new Float32Array(this.positions),
            indices: this.indices.length > 65535 ? new Uint32Array(this.indices) : new Uint16Array(this.indices)
        };
    }
}

/** Circle points at height y (CCW from above). */
export function circlePoints(rho, y, n, phase = 0) {
    return Array.from({ length: n }, (_, k) => at(rho, phase + TAU * k / n, y));
}

/** The same circle as 2D (x, −z) points, matching `circlePoints`. */
export function circle2(cx, cw, rho, n, phase = 0) {
    return Array.from({ length: n }, (_, k) => {
        const th = phase + TAU * k / n;
        return [cx + rho * Math.cos(th), cw + rho * Math.sin(th)];
    });
}

/**
 * Check a solid: every edge used exactly twice, once in each direction
 * (closed, consistently oriented 2-manifold), plus signed volume.
 */
export function analyzeSolid({ positions, indices }) {
    const edges = new Map();
    let bad = 0;
    for (let t = 0; t < indices.length; t += 3) {
        for (let e = 0; e < 3; e++) {
            const a = indices[t + e];
            const b = indices[t + (e + 1) % 3];
            const key = a < b ? `${a},${b}` : `${b},${a}`;
            const rec = edges.get(key) || { fwd: 0, rev: 0 };
            if (a < b) rec.fwd++; else rec.rev++;
            edges.set(key, rec);
        }
    }
    let boundary = 0;
    let nonManifold = 0;
    let misoriented = 0;
    for (const { fwd, rev } of edges.values()) {
        const total = fwd + rev;
        if (total === 1) boundary++;
        else if (total > 2) nonManifold++;
        else if (fwd !== 1 || rev !== 1) misoriented++;
    }
    bad = boundary + nonManifold + misoriented;
    let volume = 0;
    for (let t = 0; t < indices.length; t += 3) {
        const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3;
        const ax = positions[a], ay = positions[a + 1], az = positions[a + 2];
        const bx = positions[b], by = positions[b + 1], bz = positions[b + 2];
        const cx = positions[c], cy = positions[c + 1], cz = positions[c + 2];
        volume += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
    }
    return {
        watertight: bad === 0,
        boundaryEdges: boundary,
        nonManifoldEdges: nonManifold,
        misorientedEdges: misoriented,
        triangles: indices.length / 3,
        volume
    };
}

/** Apply a 3×4 transform ([m00..m02, t0, m10..m12, t1, m20..m22, t2]) to a solid's positions. */
export function transformSolid(solid, m) {
    const p = solid.positions;
    const out = new Float32Array(p.length);
    for (let i = 0; i < p.length; i += 3) {
        const x = p[i], y = p[i + 1], z = p[i + 2];
        out[i] = m[0] * x + m[1] * y + m[2] * z + m[3];
        out[i + 1] = m[4] * x + m[5] * y + m[6] * z + m[7];
        out[i + 2] = m[8] * x + m[9] * y + m[10] * z + m[11];
    }
    return { positions: out, indices: solid.indices };
}

/** Translate a solid so its lowest point sits on y = 0. */
export function dropToBed(solid) {
    let yMin = Infinity;
    for (let i = 1; i < solid.positions.length; i += 3) yMin = Math.min(yMin, solid.positions[i]);
    return transformSolid(solid, [1, 0, 0, 0, 0, 1, 0, -yMin, 0, 0, 1, 0]);
}

/**
 * Downward-facing area steeper than `maxDeg` from vertical, ignoring faces on
 * the bed (y ≈ min). Returns { worstDeg, area } in print orientation.
 */
export function measureOverhang({ positions, indices }, maxDeg = 45, tolDeg = 0.5) {
    let yMin = Infinity;
    for (let i = 1; i < positions.length; i += 3) yMin = Math.min(yMin, positions[i]);
    const limit = -Math.sin((maxDeg + tolDeg) * Math.PI / 180);
    let worst = 0;
    let area = 0;
    for (let t = 0; t < indices.length; t += 3) {
        const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3;
        const pa = [positions[a], positions[a + 1], positions[a + 2]];
        const pb = [positions[b], positions[b + 1], positions[b + 2]];
        const pc = [positions[c], positions[c + 1], positions[c + 2]];
        if (Math.max(pa[1], pb[1], pc[1]) < yMin + 1e-3) continue; // on the bed
        const n = cross(sub(pb, pa), sub(pc, pa));
        const len = Math.hypot(...n);
        if (len < 0.02) continue; // < 0.01 mm²: collinear slivers from triangulation
        const ny = n[1] / len;
        if (ny < 0) {
            const deg = Math.asin(Math.min(1, -ny)) * 180 / Math.PI; // 90 = flat ceiling
            if (ny < limit) {
                area += len / 2;
                worst = Math.max(worst, deg);
            }
        }
    }
    return { worstDeg: worst, area };
}
