/**
 * Cast Form Generator - Polymer Case Box Generator
 *
 * Builds the two open-top pour boxes used to cast polymer case molds around
 * the printed mold forms:
 *
 *   - Wall case box (rectangular): the wall form lies outer-face-down on the
 *     box floor, nested into a shallow indent that registers it and seals the
 *     underside. One box serves every wall of the mold — wall forms are
 *     congruent (shared mold-global half-width).
 *   - Foot case box (circular): same construction around the foot form.
 *
 * Each box is a single closed manifold "terraced tub" solid built directly
 * from quads/fans (no CSG, no stitching): base slab, pocket floor, pocket
 * walls, ledge ring, inner walls up to the brim, rim ring, outer walls.
 * Interior height = seated form height + headspace (default 1 inch), so a
 * pour to the brim leaves that much polymer over the form.
 */

import * as THREE from 'three';

const EPSILON = 1e-6;
const CIRCLE_SEGMENTS = 128;
const BASE_SLAB_BAND = 0.5; // mm band above the seated face used to measure the pocket footprint

/**
 * Measure a wall segment in its laid-flat frame (outer face down).
 * worldX = tangent (v), worldY = D - u (up), worldZ = mold-Y (centered).
 * @param {import('three').BufferGeometry} wallGeometry - compiled wall (mold space)
 * @param {number} wallCount - segments in the mold (wall 0 assumed: bisector at segment/2)
 * @param {number} wallIndex - which wall the geometry is (default 0)
 */
export function measureWallLaidFlat(wallGeometry, wallCount, wallIndex = 0) {
    const segmentAngle = (Math.PI * 2) / Math.max(1, wallCount);
    const phi = (wallIndex + 0.5) * segmentAngle;
    const cos = Math.cos(phi);
    const sin = Math.sin(phi);
    const position = wallGeometry.getAttribute('position');

    let outerFaceDistance = -Infinity;
    let uMin = Infinity;
    let yMin = Infinity;
    let yMax = -Infinity;
    for (let i = 0; i < position.count; i++) {
        const u = position.getX(i) * cos + position.getZ(i) * sin;
        if (u > outerFaceDistance) outerFaceDistance = u;
        if (u < uMin) uMin = u;
        const y = position.getY(i);
        if (y < yMin) yMin = y;
        if (y > yMax) yMax = y;
    }

    // Overall footprint (walls clearance) and base-slab footprint (pocket) —
    // identical for compact blocks (the outer face is the full silhouette),
    // measured separately to stay correct for any future geometry.
    let halfWidth = 0;
    let halfLength = 0;
    let baseHalfWidth = 0;
    let baseHalfLength = 0;
    const zMid = (yMin + yMax) / 2;
    for (let i = 0; i < position.count; i++) {
        const x = position.getX(i);
        const z = position.getZ(i);
        const u = x * cos + z * sin;
        const v = -x * sin + z * cos;
        const av = Math.abs(v);
        const az = Math.abs(position.getY(i) - zMid);
        if (av > halfWidth) halfWidth = av;
        if (az > halfLength) halfLength = az;
        if (outerFaceDistance - u <= BASE_SLAB_BAND) {
            if (av > baseHalfWidth) baseHalfWidth = av;
            if (az > baseHalfLength) baseHalfLength = az;
        }
    }

    return {
        phi,
        zMid,
        outerFaceDistance,
        halfWidth,
        halfLength,
        baseHalfWidth,
        baseHalfLength,
        height: outerFaceDistance - uMin
    };
}

/**
 * Measure the foot form footprint (sits flat-bottom-down as generated).
 */
export function measureFootFootprint(footGeometry) {
    const position = footGeometry.getAttribute('position');
    let yMin = Infinity;
    let yMax = -Infinity;
    for (let i = 0; i < position.count; i++) {
        const y = position.getY(i);
        if (y < yMin) yMin = y;
        if (y > yMax) yMax = y;
    }

    let radius = 0;
    let baseRadius = 0;
    for (let i = 0; i < position.count; i++) {
        const r = Math.hypot(position.getX(i), position.getZ(i));
        if (r > radius) radius = r;
        if (position.getY(i) - yMin <= BASE_SLAB_BAND && r > baseRadius) baseRadius = r;
    }

    return { yMin, yMax, height: yMax - yMin, radius, baseRadius };
}

// ── Loop + solid construction ────────────────────────────────────────────────

/** Rectangle loop, CCW in XZ (viewed from +Y). */
function rectLoop(halfX, halfZ) {
    return [
        { x: halfX, z: -halfZ },
        { x: halfX, z: halfZ },
        { x: -halfX, z: halfZ },
        { x: -halfX, z: -halfZ }
    ];
}

/** Circle loop, CCW in XZ. */
function circleLoop(radius, segments = CIRCLE_SEGMENTS) {
    const points = [];
    for (let i = 0; i < segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        points.push({ x: radius * Math.cos(angle), z: radius * Math.sin(angle) });
    }
    return points;
}

/**
 * Terraced open-top tub as ONE closed manifold solid.
 *
 * Loops share point count and CCW winding. Surface (outward normals):
 *   pocket floor cap (+Y, y=0) -> pocket walls (in-facing, 0..indentDepth) ->
 *   ledge ring (+Y, indentDepth) -> inner walls (in-facing, indentDepth..brim) ->
 *   rim ring (+Y, brim) -> outer walls (out-facing, brim..-floorThickness) ->
 *   bottom cap (-Y, -floorThickness).
 * Returned geometry is translated so the bottom face sits at y = 0 (print bed).
 */
function buildTubSolid({ pocketLoop, innerLoop, outerLoop, floorThickness, indentDepth, brimHeight }) {
    const loopSize = pocketLoop.length;
    if (innerLoop.length !== loopSize || outerLoop.length !== loopSize) {
        throw new Error('case box loops must share point counts');
    }

    const positions = [];
    const indices = [];
    const addVertex = (point, y) => {
        positions.push(point.x, y, point.z);
        return positions.length / 3 - 1;
    };
    const addLoop = (loop, y) => loop.map((point) => addVertex(point, y));
    const centroid = (loop) => {
        const sum = loop.reduce((acc, p) => ({ x: acc.x + p.x, z: acc.z + p.z }), { x: 0, z: 0 });
        return { x: sum.x / loop.length, z: sum.z / loop.length };
    };
    const quad = (a, b, c, d) => {
        indices.push(a, b, c, a, c, d);
    };

    const pocketBottom = addLoop(pocketLoop, 0);                 // A
    const pocketTop = addLoop(pocketLoop, indentDepth);          // B
    const innerBottom = addLoop(innerLoop, indentDepth);         // C
    const innerTop = addLoop(innerLoop, brimHeight);             // D
    const outerTop = addLoop(outerLoop, brimHeight);             // E
    const outerBottom = addLoop(outerLoop, -floorThickness);     // F
    const pocketCenter = addVertex(centroid(pocketLoop), 0);
    const bottomCenter = addVertex(centroid(outerLoop), -floorThickness);

    // Winding note: loops are ordered by increasing atan2(z, x). In three.js
    // coordinates that direction is CLOCKWISE seen from +Y (r-hat x theta-hat
    // = -y-hat), so with edge1 ~ theta-hat: (P_i, P_j, Q_j, Q_i) with Q above P
    // yields an inward (-radial) normal, and ring quads (Inner_i, Inner_j,
    // Outer_j, Outer_i) yield +Y. Each emission below is chosen so the solid's
    // normals all point out of the material.
    for (let i = 0; i < loopSize; i++) {
        const j = (i + 1) % loopSize;
        // Pocket floor cap, +Y.
        indices.push(pocketCenter, pocketBottom[j], pocketBottom[i]);
        // Pocket walls: material outside the loop -> normal into the pocket void (-radial).
        quad(pocketBottom[i], pocketBottom[j], pocketTop[j], pocketTop[i]);
        // Ledge ring, +Y (material below).
        quad(pocketTop[i], pocketTop[j], innerBottom[j], innerBottom[i]);
        // Inner walls, inward-facing (-radial).
        quad(innerBottom[i], innerBottom[j], innerTop[j], innerTop[i]);
        // Rim ring, +Y.
        quad(innerTop[i], innerTop[j], outerTop[j], outerTop[i]);
        // Outer walls, outward-facing (+radial).
        quad(outerTop[i], outerTop[j], outerBottom[j], outerBottom[i]);
        // Bottom cap, -Y.
        indices.push(bottomCenter, outerBottom[i], outerBottom[j]);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.translate(0, floorThickness, 0); // bottom face -> y = 0 (print bed)
    geometry.computeVertexNormals();

    if (signedVolume(geometry) <= 0) {
        // Winding derivation above guarantees outward normals for CCW loops;
        // a negative volume means a construction bug, not a recoverable state.
        console.warn('[castform] case box solid has inverted orientation — check loop winding');
    }

    return geometry;
}

function signedVolume(geometry) {
    const position = geometry.getAttribute('position');
    const index = geometry.getIndex();
    const count = index ? index.count : position.count;
    const at = (i) => (index ? index.getX(i) : i);
    let volume = 0;
    for (let i = 0; i < count; i += 3) {
        const a = at(i);
        const b = at(i + 1);
        const c = at(i + 2);
        const ax = position.getX(a); const ay = position.getY(a); const az = position.getZ(a);
        const bx = position.getX(b); const by = position.getY(b); const bz = position.getZ(b);
        const cx = position.getX(c); const cy = position.getY(c); const cz = position.getZ(c);
        volume += (ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)) / 6;
    }
    return volume;
}

// ── Public builders ──────────────────────────────────────────────────────────

export const DEFAULT_CASE_BOX_PARAMS = {
    enabled: true,
    gap: 10,             // mm, consistent side gap form -> box wall
    headspace: 25.4,     // mm interior above the seated form (1 inch)
    wallThickness: 3,    // mm box wall
    floorThickness: 3,   // mm below the pocket floor
    indentDepth: 2.5,    // mm pocket the form nests into
    fitClearance: 0.25   // mm pocket oversize per side
};

function resolveParams(params) {
    return { ...DEFAULT_CASE_BOX_PARAMS, ...(params || {}) };
}

/**
 * Rectangular pour box for the wall forms (one box serves all walls).
 * @param {import('three').BufferGeometry} wallGeometry - any compiled wall segment
 * @param {number} wallCount
 * @param {object} caseBoxParams - see DEFAULT_CASE_BOX_PARAMS
 */
export function buildWallCaseBox(wallGeometry, wallCount, caseBoxParams) {
    const p = resolveParams(caseBoxParams);
    const m = measureWallLaidFlat(wallGeometry, wallCount);

    const pocketLoop = rectLoop(m.baseHalfWidth + p.fitClearance, m.baseHalfLength + p.fitClearance);
    const innerLoop = rectLoop(m.halfWidth + p.gap, m.halfLength + p.gap);
    const outerLoop = rectLoop(
        m.halfWidth + p.gap + p.wallThickness,
        m.halfLength + p.gap + p.wallThickness
    );

    const geometry = buildTubSolid({
        pocketLoop,
        innerLoop,
        outerLoop,
        floorThickness: p.floorThickness,
        indentDepth: p.indentDepth,
        brimHeight: m.height + p.headspace
    });
    geometry.userData.caseBox = {
        kind: 'wall',
        form: m,
        interiorHeight: m.height + p.headspace,
        params: p
    };
    return geometry;
}

/**
 * Circular pour box for the foot form.
 * @param {import('three').BufferGeometry} footGeometry
 * @param {object} caseBoxParams
 */
export function buildFootCaseBox(footGeometry, caseBoxParams) {
    const p = resolveParams(caseBoxParams);
    const m = measureFootFootprint(footGeometry);

    const geometry = buildTubSolid({
        pocketLoop: circleLoop(m.baseRadius + p.fitClearance),
        innerLoop: circleLoop(m.radius + p.gap),
        outerLoop: circleLoop(m.radius + p.gap + p.wallThickness),
        floorThickness: p.floorThickness,
        indentDepth: p.indentDepth,
        brimHeight: m.height + p.headspace
    });
    geometry.userData.caseBox = {
        kind: 'foot',
        form: m,
        interiorHeight: m.height + p.headspace,
        params: p
    };
    return geometry;
}

/**
 * Circular pour box for a one-piece wall mold.
 *
 * The continuous wall form is rotational, so it is seated upside down in the
 * same cylindrical tub construction used by the foot form. Its existing lower
 * cavity remains the foot-mold receiving socket after inversion.
 */
export function buildContinuousWallCaseBox(wallGeometry, caseBoxParams) {
    const geometry = buildFootCaseBox(wallGeometry, caseBoxParams);
    geometry.userData.caseBox.kind = 'continuous-wall';
    return geometry;
}

export default {
    measureWallLaidFlat,
    measureFootFootprint,
    buildWallCaseBox,
    buildFootCaseBox,
    buildContinuousWallCaseBox,
    DEFAULT_CASE_BOX_PARAMS
};
