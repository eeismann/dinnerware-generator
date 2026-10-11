/**
 * Dinnerware Cross-Section Builder
 *
 * Builds each item's closed half-section in the (r, y) plane as a sequence of
 * chains that run counter-clockwise around the solid (solid on the left of
 * travel). Lathing every chain in that order gives LatheGeometry's outward
 * (right-hand) normals everywhere, so the revolved mesh has consistent
 * winding without per-segment flips.
 *
 * The inner surface is a true normal offset of the outer body, so the wall
 * keeps its authored thickness on slopes, curves, the bottom fillet (which
 * becomes concentric) and the stepped inset chamfer.
 *
 * Loop order (counter-clockwise):
 *   axis → foot cavity ceiling → cavity wall → contact ring → outer footring
 *   → bottom fillet → outer wall → rim → inner wall/fillet/floor → axis
 */

import * as THREE from 'three';

// Maximum chord deviation (mm) when sampling curves. Shared by preview and
// export so both meshes carry identical profiles.
export const PROFILE_TOLERANCE = 0.01;
export const CENTERLINE_SEAM_RADIUS = 0.1;
export const MIN_FOOT_CAVITY = 0.1;
// Interior turns above this split the inner surface into separately shaded
// lathe segments (crisp creases).
const SHARP_TURN_RAD = (25 * Math.PI) / 180;
// Points closer than this are merged; well above the 0.001mm STL weld grid.
const MIN_POINT_SPACING = 0.005;
const MIN_FOOT_WALL = 1.0;
// Fraction of wall thickness left at a tapered rim before its rounded tip
const TAPERED_RIM_FRACTION = 0.5;

export const RIM_STYLES = ['flat', 'rounded', 'tapered'];

const v2 = (x, y) => new THREE.Vector2(x, y);

function smoothstep(x) {
    const c = Math.min(1, Math.max(0, x));
    return c * c * (3 - 2 * c);
}

/**
 * Sample a quadratic Bezier so no chord deviates from the curve by more
 * than `tolerance` (recursive midpoint subdivision).
 */
export function sampleQuadraticBezier(p0, p1, p2, tolerance = PROFILE_TOLERANCE) {
    const at = (t) => {
        const u = 1 - t;
        return v2(
            u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
            u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y
        );
    };
    const points = [p0.clone()];
    const subdivide = (t0, a, t1, b, depth) => {
        const tm = (t0 + t1) / 2;
        const m = at(tm);
        // Deviation of the curve midpoint from the chord
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const deviation = Math.abs((m.x - a.x) * dy - (m.y - a.y) * dx) / len;
        if (depth < 14 && (depth < 2 || deviation > tolerance)) {
            subdivide(t0, a, tm, m, depth + 1);
            subdivide(tm, m, t1, b, depth + 1);
        } else {
            points.push(b);
        }
    };
    subdivide(0, p0, 1, p2.clone(), 0);
    return points;
}

/**
 * Sample a circular arc from angle a0 to a1 (radians, either direction) so
 * the chord deviation stays within `tolerance`.
 */
export function sampleArc(cx, cy, radius, a0, a1, tolerance = PROFILE_TOLERANCE) {
    const sweep = a1 - a0;
    const maxStep = 2 * Math.acos(Math.max(-1, 1 - tolerance / Math.max(radius, tolerance)));
    const segments = Math.max(4, Math.ceil(Math.abs(sweep) / Math.max(maxStep, 1e-3)));
    const points = [];
    for (let i = 0; i <= segments; i++) {
        const a = a0 + (sweep * i) / segments;
        points.push(v2(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius));
    }
    return points;
}

function closestPointOnPolyline(points, p) {
    let best = { distance: Infinity, point: null, segment: -1, s: 0 };
    for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len2 = dx * dx + dy * dy;
        const s = len2 > 0 ? Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
        const q = v2(a.x + dx * s, a.y + dy * s);
        const d = q.distanceTo(p);
        if (d < best.distance) best = { distance: d, point: q, segment: i, s };
    }
    return best;
}

/**
 * Fillet of radius `radius` tangent to the horizontal plane y = baseY (to the
 * inside of the wall) and to the wall polyline. Returns the arc center, its
 * tangent points and the wall polyline trimmed to start at the wall tangent.
 */
export function solveBottomFillet(wallPoints, baseY, radius) {
    if (!(radius >= 0.5) || wallPoints.length < 2) return null;
    const cy = baseY + radius;
    const wallX0 = wallPoints[0].x;
    const distanceError = (cx) => closestPointOnPolyline(wallPoints, v2(cx, cy)).distance - radius;

    // The center lies inside the wall: bracket it between the wall and a
    // point well inside, then bisect on the tangency condition.
    let hi = wallX0;
    for (const p of wallPoints) if (p.y <= cy + radius) hi = Math.min(hi, p.x);
    let lo = hi - 4 * radius;
    if (distanceError(lo) <= 0 || distanceError(hi) >= 0) return null;
    for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        if (distanceError(mid) > 0) lo = mid;
        else hi = mid;
    }
    const center = v2(lo, cy);
    const closest = closestPointOnPolyline(wallPoints, center);
    const tangent = closest.point;
    const trimmed = [tangent.clone(), ...wallPoints.slice(closest.segment + 1)
        .filter(p => p.distanceTo(tangent) > MIN_POINT_SPACING)];
    if (trimmed.length < 2) return null;
    return {
        center,
        radius,
        baseTangent: v2(center.x, baseY),
        wallTangent: tangent,
        wallPoints: trimmed,
        endAngle: Math.atan2(tangent.y - center.y, tangent.x - center.x)
    };
}

/**
 * Offset a polyline to its left (the solid side for counter-clockwise loop
 * chains) by a per-vertex distance. Joins are mitred; local loops produced
 * where curvature radius is below the offset distance are removed, so the
 * offset of a fillet tighter than the wall becomes a sharp inner corner.
 */
export function offsetPolylineLeft(points, distances) {
    const lines = [];
    for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy);
        if (len < 1e-9) continue;
        const nx = -dy / len;
        const ny = dx / len;
        lines.push({
            start: v2(a.x + nx * distances[i], a.y + ny * distances[i]),
            end: v2(b.x + nx * distances[i + 1], b.y + ny * distances[i + 1]),
            dir: v2(dx / len, dy / len)
        });
    }
    if (lines.length === 0) return points.map(p => p.clone());
    const maxMitre = 50 * Math.max(...distances);

    const intersect = (l1, l2) => {
        const d1 = l1.end.clone().sub(l1.start);
        const d2 = l2.end.clone().sub(l2.start);
        const cross = d1.x * d2.y - d1.y * d2.x;
        if (Math.abs(cross) < 1e-12 * Math.max(1, d1.lengthSq() * d2.lengthSq())) {
            return l1.end.clone().add(l2.start).multiplyScalar(0.5);
        }
        const w = l2.start.clone().sub(l1.start);
        const s = (w.x * d2.y - w.y * d2.x) / cross;
        return l1.start.clone().add(d1.multiplyScalar(s));
    };
    const buildVertices = (ls) => {
        const out = [ls[0].start.clone()];
        for (let i = 1; i < ls.length; i++) {
            const join = intersect(ls[i - 1], ls[i]);
            // Guard against runaway mitres on near-reversing segments; an
            // acute wedge legitimately mitres far beyond the offset distance.
            const fallback = ls[i - 1].end.clone().add(ls[i].start).multiplyScalar(0.5);
            out.push(join.distanceTo(fallback) > maxMitre ? fallback : join);
        }
        out.push(ls[ls.length - 1].end.clone());
        return out;
    };

    let active = lines;
    let vertices = buildVertices(active);
    for (let guard = 0; guard < lines.length; guard++) {
        let reversed = -1;
        for (let i = 0; i < active.length; i++) {
            const seg = vertices[i + 1].clone().sub(vertices[i]);
            if (seg.dot(active[i].dir) <= 0) {
                reversed = i;
                break;
            }
        }
        if (reversed < 0 || active.length <= 1) break;
        active = active.filter((_, i) => i !== reversed);
        vertices = buildVertices(active);
    }
    return vertices;
}

/**
 * Cut a bottom-to-top polyline at y = yTop: points above are dropped and the
 * crossing is interpolated; a polyline ending below is extended along its
 * last segment.
 */
function trimPolylineAtY(points, yTop) {
    for (let i = points.length - 1; i >= 1; i--) {
        if (points[i - 1].y <= yTop) {
            const a = points[i - 1];
            const b = points[i];
            const dy = b.y - a.y;
            const s = Math.abs(dy) > 1e-12 ? (yTop - a.y) / dy : 1;
            const end = v2(a.x + (b.x - a.x) * s, yTop);
            return [...points.slice(0, i), end];
        }
    }
    return points;
}

/**
 * Remove points closer than MIN_POINT_SPACING to their predecessor, keeping
 * both endpoints exactly.
 */
function dedupe(points) {
    if (points.length <= 2) return points;
    const out = [points[0]];
    for (let i = 1; i < points.length - 1; i++) {
        if (points[i].distanceTo(out[out.length - 1]) > MIN_POINT_SPACING) out.push(points[i]);
    }
    const last = points[points.length - 1];
    if (out.length > 1 && last.distanceTo(out[out.length - 1]) <= MIN_POINT_SPACING) out.pop();
    out.push(last);
    return out;
}

function splitAtSharpTurns(points) {
    const chains = [];
    let current = [points[0]];
    for (let i = 1; i < points.length - 1; i++) {
        current.push(points[i]);
        const a = points[i].clone().sub(points[i - 1]);
        const b = points[i + 1].clone().sub(points[i]);
        const turn = Math.abs(Math.atan2(a.x * b.y - a.y * b.x, a.dot(b)));
        if (turn > SHARP_TURN_RAD) {
            chains.push(current);
            current = [points[i]];
        }
    }
    current.push(points[points.length - 1]);
    chains.push(current);
    return chains.filter(chain => chain.length >= 2);
}

function interpolateRadiusAtY(points, y) {
    for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        if ((y >= a.y && y <= b.y) || (y <= a.y && y >= b.y)) {
            const dy = b.y - a.y;
            const s = Math.abs(dy) > 1e-12 ? (y - a.y) / dy : 0;
            return a.x + (b.x - a.x) * s;
        }
    }
    return points[points.length - 1].x;
}

function insertPointAtY(points, targetY) {
    if (points.some(p => Math.abs(p.y - targetY) < 1e-6)) return points;
    const out = [];
    for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        out.push(a);
        if (targetY > Math.min(a.y, b.y) && targetY < Math.max(a.y, b.y)) {
            const s = (targetY - a.y) / (b.y - a.y);
            out.push(v2(a.x + (b.x - a.x) * s, targetY));
        }
    }
    out.push(points[points.length - 1]);
    return out;
}

/**
 * Design wall curve from the (unfilleted) wall foot to the rim.
 */
export function designWallPoints(params, geoVals, tolerance = PROFILE_TOLERANCE) {
    const start = v2(geoVals.radiusAtWallBottom, geoVals.footringHeight);
    const end = v2(geoVals.radius, geoVals.h);
    const curveAmount = params.wallCurveAmount || 0;
    if (Math.abs(curveAmount) < 0.1) return [start, end];
    const curvePosition = params.wallCurvePosition || 0.5;
    const control = v2(
        start.x + (end.x - start.x) * curvePosition + curveAmount,
        start.y + (end.y - start.y) * curvePosition
    );
    return sampleQuadraticBezier(start, control, end, tolerance);
}

/**
 * Set-level stepped inset: the body below the step is scaled radially by
 * `radialScale`, joined to the full-size upper wall by a chamfer. The chamfer
 * rises one millimetre per millimetre of radial step (45°, printable without
 * supports) unless the wall is too short, in which case it steepens.
 */
export function computeWallInsetConfig(params, geoVals) {
    if (!params.wallInsetEnabled) return null;
    const depthPercent = THREE.MathUtils.clamp(Number(params.wallInsetDepth) || 0, 0, 25);
    if (depthPercent <= 0) return null;

    const fillet = geoVals.fillet;
    const outerWallStartY = fillet ? fillet.wallTangent.y : geoVals.footringHeight;
    const innerWallStartY = geoVals.footringHeight
        + Math.max(geoVals.thickness, fillet ? fillet.radius : 0);
    const wallStartY = Math.max(outerWallStartY, innerWallStartY);
    const usableHeight = geoVals.h - wallStartY;
    if (usableHeight <= 0.1) return null;

    const heightPercent = THREE.MathUtils.clamp(Number(params.wallInsetHeight) || 50, 10, 90);
    const stepY = wallStartY + usableHeight * (heightPercent / 100);
    const radialScale = 1 - depthPercent / 100;
    const wallPoints = geoVals.fillet ? geoVals.fillet.wallPoints : geoVals.wallPoints;
    const radiusAt = (y) => interpolateRadiusAtY(wallPoints, y);
    const radialStep = radiusAt(stepY) * (1 - radialScale);

    // Centre the chamfer on the authored step height, sliding it to stay
    // between the wall foot and the rim.
    const topLimit = Math.max(stepY, geoVals.h - Math.max(geoVals.thickness, 2));
    const place = (height) => {
        let lowerY = stepY - height / 2;
        let upperY = stepY + height / 2;
        if (upperY > topLimit) {
            lowerY -= upperY - topLimit;
            upperY = topLimit;
        }
        if (lowerY < wallStartY) {
            upperY = Math.min(topLimit, upperY + (wallStartY - lowerY));
            lowerY = wallStartY;
        }
        if (upperY - lowerY < 0.02) upperY = lowerY + 0.02;
        return { lowerY, upperY };
    };
    // The chamfer runs straight from the scaled lower wall to the full upper
    // wall. Its horizontal run includes the wall's own lean, so solve for the
    // height whose run equals its rise (45°); a wall too short for that gets
    // a steeper chamfer.
    let height = radialStep;
    let span = place(height);
    for (let i = 0; i < 30; i++) {
        span = place(height);
        const run = radiusAt(span.upperY) - radialScale * radiusAt(span.lowerY);
        if (Math.abs(run - height) < 1e-6 || run <= 0) break;
        height = run;
    }
    const chamferHeight = span.upperY - span.lowerY;
    const run = radiusAt(span.upperY) - radialScale * radiusAt(span.lowerY);

    return {
        lowerY: span.lowerY,
        upperY: span.upperY,
        wallStartY,
        usableHeight,
        radialScale,
        radialStep,
        chamferHeight,
        chamferAngleDeg: THREE.MathUtils.radToDeg(Math.atan2(run, chamferHeight))
    };
}

function insetScaleAtY(y, inset) {
    if (!inset || y >= inset.upperY) return 1;
    if (y <= inset.lowerY) return inset.radialScale;
    const s = (y - inset.lowerY) / (inset.upperY - inset.lowerY);
    return inset.radialScale + (1 - inset.radialScale) * s;
}

function applyInset(points, inset) {
    if (!inset) return points;
    const dense = insertPointAtY(insertPointAtY(points, inset.lowerY), inset.upperY);
    // Straight chamfer: drop the wall points between the step boundaries
    return dense
        .filter(p => p.y <= inset.lowerY + 1e-9 || p.y >= inset.upperY - 1e-9)
        .map(p => v2(p.x * insetScaleAtY(p.y, inset), p.y));
}

/**
 * Build the item's closed cross-section.
 * @returns {{
 *   chains: Array<{ id: string, points: THREE.Vector2[], pattern?: 'wall'|'footring' }>,
 *   axisCaps: Array<{ y: number, faceUp: boolean }>,
 *   inset: Object|null, seamRadius: number, cavityDepth: number,
 *   cavityRadius: number, rim: Object
 * }}
 */
export function buildCrossSection(params, geoVals, { seamRadius = CENTERLINE_SEAM_RADIUS } = {}) {
    const t = geoVals.thickness;
    const fh = geoVals.footringHeight;
    const inset = computeWallInsetConfig(params, geoVals);
    const scaleAt = (y) => insetScaleAtY(y, inset);
    const chains = [];
    const axisCaps = [];

    // === OUTER BODY (fillet + wall), bottom to top, before rim shaping ===
    const fillet = geoVals.fillet;
    const footTop = fillet ? fillet.center.x : geoVals.radiusAtWallBottom;
    const filletPoints = fillet
        ? sampleArc(fillet.center.x, fillet.center.y, fillet.radius, -Math.PI / 2, fillet.endAngle)
        : null;
    if (filletPoints) {
        filletPoints[0] = fillet.baseTangent.clone();
        filletPoints[filletPoints.length - 1] = fillet.wallTangent.clone();
    }
    let wall = applyInset(fillet ? fillet.wallPoints : geoVals.wallPoints, inset);
    const scaledFillet = filletPoints ? filletPoints.map(p => v2(p.x * scaleAt(p.y), p.y)) : null;

    // Inner surface: true normal offset of the body, starting from the
    // virtual floor plane at the foot top so the interior floor sits exactly
    // one wall thickness above it.
    const rimStyle = RIM_STYLES.includes(params.rimStyle) ? params.rimStyle : 'flat';
    const wallHeight = geoVals.h - fh;
    const taperHeight = Math.min(12, wallHeight * 0.3);
    const offsetDistance = (y) => {
        if (rimStyle !== 'tapered') return t;
        const s = smoothstep((y - (geoVals.h - taperHeight)) / taperHeight);
        return t * (1 - (1 - TAPERED_RIM_FRACTION) * s);
    };
    if (rimStyle === 'tapered') {
        // The taper varies the offset per vertex: give it vertices to vary
        const taperStart = geoVals.h - taperHeight;
        const dense = [wall[0]];
        for (let i = 1; i < wall.length; i++) {
            const a = wall[i - 1];
            const b = wall[i];
            if (Math.max(a.y, b.y) > taperStart) {
                const steps = Math.ceil(a.distanceTo(b) / 0.5);
                for (let k = 1; k < steps; k++) {
                    const p = a.clone().lerp(b, k / steps);
                    if (p.y > taperStart) dense.push(p);
                }
            }
            dense.push(b);
        }
        wall = insertPointAtY(dense, taperStart);
    }
    const footBase = v2(footTop * scaleAt(fh), fh);
    const body = dedupe([
        v2(0, fh),
        ...(scaledFillet ? scaledFillet : [footBase]),
        ...wall.slice(1)
    ]);
    let inner = offsetPolylineLeft(body, body.map(p => offsetDistance(p.y)));
    inner = trimPolylineAtY(inner, geoVals.h);
    const rimOuter = wall[wall.length - 1];
    let rimInner = inner[inner.length - 1];
    if (!(rimInner.x < rimOuter.x - 0.05)) {
        rimInner = v2(Math.max(rimOuter.x - t, 1), geoVals.h);
        inner[inner.length - 1] = rimInner;
    }

    // === RIM ===
    let rimPoints;
    if (rimStyle === 'flat') {
        rimPoints = [rimOuter, rimInner];
    } else {
        // Bullnose: cut both faces half a rim-width below the top and join
        // them with a semicircle whose crown sits at the authored height.
        const width = rimOuter.x - rimInner.x;
        const cutY = geoVals.h - width / 2;
        wall = trimPolylineAtY(wall, cutY);
        inner = trimPolylineAtY(inner, cutY);
        const po = wall[wall.length - 1];
        const pi = inner[inner.length - 1];
        const center = po.clone().add(pi).multiplyScalar(0.5);
        const radius = po.distanceTo(pi) / 2;
        const a0 = Math.atan2(po.y - center.y, po.x - center.x);
        let a1 = Math.atan2(pi.y - center.y, pi.x - center.x);
        if (a1 < a0) a1 += Math.PI * 2;
        rimPoints = sampleArc(center.x, center.y, radius, a0, a1);
        rimPoints[0] = po;
        rimPoints[rimPoints.length - 1] = pi;
    }

    // === UNDERSIDE (axis → outer foot top) ===
    let cavityDepth = 0;
    let cavityRadius = 0;
    if (geoVals.hasFootring) {
        const fIR = geoVals.footringInnerRadius;
        const fOR = geoVals.footringOuterRadius;
        const requested = fh * THREE.MathUtils.clamp(Number(params.footCavityDepth ?? 100), 0, 100) / 100;
        cavityDepth = Math.min(requested, fh);
        if (cavityDepth >= MIN_FOOT_CAVITY) {
            const innerAngle = THREE.MathUtils.degToRad(params.innerFootringAngle || 0);
            const outerAtCavity = fOR + (footTop - fOR) * (cavityDepth / Math.max(fh, 1e-9));
            cavityRadius = THREE.MathUtils.clamp(
                fIR - cavityDepth * Math.tan(innerAngle),
                1,
                Math.max(1, outerAtCavity - MIN_FOOT_WALL)
            );
            axisCaps.push({ y: cavityDepth, faceUp: false, radius: seamRadius });
            chains.push({ id: 'cavity-ceiling', points: [v2(seamRadius, cavityDepth), v2(cavityRadius, cavityDepth)] });
            chains.push({ id: 'cavity-wall', points: [v2(cavityRadius, cavityDepth), v2(fIR, 0)] });
            chains.push({ id: 'contact-ring', points: [v2(fIR, 0), v2(fOR, 0)] });
        } else {
            cavityDepth = 0;
            axisCaps.push({ y: 0, faceUp: false, radius: seamRadius });
            chains.push({ id: 'contact-ring', points: [v2(seamRadius, 0), v2(fOR, 0)] });
        }
        chains.push({ id: 'outer-footring', pattern: 'footring', points: [v2(fOR, 0), v2(footTop, fh)] });
    } else {
        axisCaps.push({ y: 0, faceUp: false, radius: seamRadius });
        chains.push({ id: 'underside', points: [v2(seamRadius, 0), v2(footTop, 0)] });
    }
    // Everything below the inset step is scaled radially
    if (inset) {
        chains.forEach(chain => {
            chain.points = chain.points.map(p => v2(p.x <= seamRadius ? p.x : p.x * scaleAt(p.y), p.y));
        });
    }

    if (scaledFillet) {
        // The fillet starts exactly where the outer footring/underside ends
        scaledFillet[0] = chains[chains.length - 1].points.at(-1);
        chains.push({ id: 'outer-fillet', points: dedupe(scaledFillet) });
    } else {
        wall[0] = chains[chains.length - 1].points.at(-1);
    }
    if (scaledFillet) wall[0] = chains[chains.length - 1].points.at(-1);
    chains.push({ id: 'outer-wall', pattern: 'wall', points: dedupe(wall) });

    rimPoints[0] = wall[wall.length - 1];
    chains.push({ id: 'rim', points: dedupe(rimPoints) });

    // === INNER SURFACE (rim → axis) ===
    inner[inner.length - 1] = rimPoints[rimPoints.length - 1];
    const innerDown = dedupe(inner.slice().reverse());
    innerDown[innerDown.length - 1] = v2(seamRadius, innerDown[innerDown.length - 1].y);
    splitAtSharpTurns(innerDown).forEach((points, i) => {
        chains.push({ id: `inner-${i}`, points });
    });
    axisCaps.push({ y: innerDown[innerDown.length - 1].y, faceUp: true, radius: seamRadius });

    return {
        chains,
        axisCaps,
        inset,
        seamRadius,
        cavityDepth,
        cavityRadius,
        rim: { style: rimStyle, outer: rimOuter, inner: rimInner }
    };
}

/**
 * Overhang angles (degrees from vertical) of every downward-facing segment of
 * the section, excluding the bed contact and the foot cavity ceiling (a
 * bridge, reported separately).
 */
export function measureOverhangs(section) {
    const results = [];
    section.chains.forEach(chain => {
        if (chain.id === 'cavity-ceiling' || chain.id === 'contact-ring' || chain.id === 'underside') return;
        for (let i = 0; i < chain.points.length - 1; i++) {
            const a = chain.points[i];
            const b = chain.points[i + 1];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const len = Math.hypot(dx, dy);
            if (len < 1e-6) continue;
            // Outward normal is the right-hand side of travel
            const nx = dy / len;
            const ny = -dx / len;
            if (ny >= -1e-6) continue;
            if (Math.min(a.y, b.y) < 1e-6 && Math.max(a.y, b.y) < 1e-6) continue;
            results.push({
                chain: chain.id,
                angleDeg: THREE.MathUtils.radToDeg(Math.atan2(-ny, Math.abs(nx))),
                y: (a.y + b.y) / 2,
                length: len,
                // Horizontal distance the surface steps out over this segment
                run: Math.abs(dx)
            });
        }
    });
    return results;
}
