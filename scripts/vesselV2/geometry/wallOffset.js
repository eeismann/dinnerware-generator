/**
 * Vessel V2/V3 inner wall: a true inward offset of the outer profile.
 *
 * The outer profile runs from the axis out along the underside (a flat floor,
 * or a raised foot dome with Footer Overlap), then up the wall to the rim.
 * Offsetting every segment by the wall thickness along its inward normal gives
 * a floor as thick as the wall and a wall of constant thickness measured at
 * right angles to the surface, rather than horizontally (which thins sloped
 * walls and leaves no floor at all).
 *
 * The offset starts on the axis and ends at the rim height, where the rim
 * ring joins it to the outer wall.
 */

const EPSILON = 1e-6;
// Convex-side corners whose miter would reach past this many thicknesses
// get a bevel instead of a long spike
const MITER_LIMIT = 2;

/**
 * Radius where the outer and inner surfaces meet the axis. Each is closed by
 * a small fan there; the ring must stay wider than the STL validator's
 * 0.001mm weld at the densest motif resolution (960 segments needs > 0.153).
 */
export const AXIS_SEAM_RADIUS = 0.25;

const sub = (a, b) => ({ r: a.r - b.r, h: a.h - b.h });
const add = (a, b) => ({ r: a.r + b.r, h: a.h + b.h });
const scale = (a, s) => ({ r: a.r * s, h: a.h * s });
const cross = (a, b) => a.r * b.h - a.h * b.r;

function normalize(v) {
    const length = Math.hypot(v.r, v.h);
    return length > EPSILON ? { r: v.r / length, h: v.h / length } : null;
}

/** Intersection of lines p + u*s and q + v*t, or null when parallel. */
function intersectLines(p, u, q, v) {
    const denom = cross(u, v);
    if (Math.abs(denom) < 1e-9) return null;
    const s = cross(sub(q, p), v) / denom;
    return add(p, scale(u, s));
}

/** Proper intersection of segments ab and cd (excluding shared endpoints). */
function intersectSegments(a, b, c, d) {
    const u = sub(b, a);
    const v = sub(d, c);
    const denom = cross(u, v);
    if (Math.abs(denom) < 1e-12) return null;
    const w = sub(c, a);
    const s = cross(w, v) / denom;
    const t = cross(w, u) / denom;
    if (s <= EPSILON || s >= 1 - EPSILON || t <= EPSILON || t >= 1 - EPSILON) return null;
    return add(a, scale(u, s));
}

/**
 * Cut out the loops an offset forms inside tight bends: wherever a segment
 * crosses a later one, everything between is dropped for the crossing point.
 */
function removeLoops(points) {
    const result = points.slice();
    for (let i = 0; i < result.length - 1; i++) {
        for (let j = result.length - 2; j > i + 1; j--) {
            const hit = intersectSegments(result[i], result[i + 1], result[j], result[j + 1]);
            if (hit) {
                result.splice(i + 1, j - i, hit);
                break;
            }
        }
    }
    return result;
}

/** Shortest distance from p to the polyline. */
function distanceToPolyline(p, polyline) {
    let best = Infinity;
    for (let i = 0; i < polyline.length - 1; i++) {
        const a = polyline[i];
        const d = sub(polyline[i + 1], a);
        const lengthSq = d.r * d.r + d.h * d.h;
        const s = lengthSq > 0
            ? Math.max(0, Math.min(1, ((p.r - a.r) * d.r + (p.h - a.h) * d.h) / lengthSq))
            : 0;
        best = Math.min(best, Math.hypot(p.r - a.r - d.r * s, p.h - a.h - d.h * s));
    }
    return best;
}

/**
 * Start on the axis where the offset leaves it for the last time: a curve
 * rising from the axis can carry the offset back across it.
 */
function startOnAxis(points) {
    let last = -1;
    points.forEach((point, index) => {
        if (point.r <= EPSILON) last = index;
    });
    if (last <= 0 || last >= points.length - 1) return points;
    const a = points[last];
    const b = points[last + 1];
    const s = (0 - a.r) / (b.r - a.r || 1);
    return [{ r: 0, h: a.h + (b.h - a.h) * s }, ...points.slice(last + 1)];
}

/**
 * @param {Array<{r:number,h:number}>} outerProfile - Axis -> rim, as sampled
 * @param {number} thickness - Wall (and floor) thickness in mm
 * @returns {Array<{r:number,h:number}>} Inner profile, axis -> rim height
 */
export function offsetProfileInward(outerProfile, thickness) {
    const points = [];
    outerProfile.forEach((point) => {
        const last = points[points.length - 1];
        if (!last || Math.hypot(point.r - last.r, point.h - last.h) > EPSILON) {
            points.push({ r: point.r, h: point.h });
        }
    });
    if (points.length < 2) return points.map((point) => ({ ...point }));

    // Per-segment direction and inward normal (the tangent turned +90°:
    // up along the floor, toward the axis up the wall)
    const segments = [];
    for (let i = 0; i < points.length - 1; i++) {
        const u = normalize(sub(points[i + 1], points[i]));
        if (u) segments.push({ start: points[i], end: points[i + 1], u, n: { r: -u.h, h: u.r } });
    }
    if (segments.length === 0) return points.map((point) => ({ ...point }));

    const offsetStart = (segment) => add(segment.start, scale(segment.n, thickness));
    const offsetEnd = (segment) => add(segment.end, scale(segment.n, thickness));

    // Start where the first offset line meets the axis
    const first = segments[0];
    const firstStart = offsetStart(first);
    const inner = [first.u.r > 0.05
        ? add(firstStart, scale(first.u, -firstStart.r / first.u.r))
        : { r: 0, h: first.start.h + thickness }];

    for (let i = 1; i < segments.length; i++) {
        const prev = segments[i - 1];
        const next = segments[i];
        const corner = prev.end;
        const miter = intersectLines(offsetEnd(prev), prev.u, offsetStart(next), next.u);
        if (!miter) {
            inner.push(offsetStart(next));
        } else if (Math.hypot(miter.r - corner.r, miter.h - corner.h) > thickness * MITER_LIMIT) {
            inner.push(offsetEnd(prev), offsetStart(next));
        } else {
            inner.push(miter);
        }
    }

    // End on the rim height: extend or trim along the last segment
    const last = segments[segments.length - 1];
    const rimHeight = last.end.h;
    const lastEnd = offsetEnd(last);
    inner.push(Math.abs(last.u.h) > 0.05
        ? add(lastEnd, scale(last.u, (rimHeight - lastEnd.h) / last.u.h))
        : { r: lastEnd.r, h: rimHeight });

    let cleaned = removeLoops(startOnAxis(inner));

    // Short segments in a tight inside bend fold back without crossing;
    // drop anything nearer the outer wall than the thickness allows
    const minGap = thickness * 0.98;
    cleaned = removeLoops(cleaned.filter((point, index) =>
        index === 0 || index === cleaned.length - 1 || distanceToPolyline(point, points) >= minGap
    ));

    // Trim anything past the rim: stop at the first crossing of its height
    for (let i = 1; i < cleaned.length; i++) {
        const a = cleaned[i - 1];
        const b = cleaned[i];
        if (a.h < rimHeight - EPSILON && b.h >= rimHeight - EPSILON) {
            const s = (rimHeight - a.h) / (b.h - a.h);
            cleaned = [...cleaned.slice(0, i), { r: a.r + (b.r - a.r) * s, h: rimHeight }];
            break;
        }
    }
    cleaned[cleaned.length - 1].h = rimHeight;

    // A neck narrower than the wall would cross the axis; validation reports
    // it, the mesh just pins it to the axis seam
    return cleaned.map((point, index) => ({
        r: index === 0 ? 0 : Math.max(AXIS_SEAM_RADIUS, point.r),
        h: point.h
    }));
}

/**
 * Flat fan closing a surface's axis seam ring. Vertices follow
 * LatheGeometry's (sin, cos) layout so the rim matches the lathe's first ring.
 * @param {THREE} THREE - three.js namespace (keeps this module headless-light)
 */
export function createAxisFanGeometry(THREE, y, radius, segments, faceUp) {
    const positions = new Float32Array((segments + 2) * 3);
    const indices = [];
    positions[1] = y;
    for (let i = 0; i <= segments; i++) {
        const phi = (i / segments) * Math.PI * 2;
        const o = (i + 1) * 3;
        positions[o] = radius * Math.sin(phi);
        positions[o + 1] = y;
        positions[o + 2] = radius * Math.cos(phi);
    }
    for (let i = 1; i <= segments; i++) {
        if (faceUp) indices.push(0, i, i + 1);
        else indices.push(0, i + 1, i);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
}
