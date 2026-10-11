/**
 * Vessel Designer V3 - Lid Generator (Phase 3)
 *
 * Builds the lid as an INDEPENDENT revolved body, sized off the vessel's own
 * neck/rim radius (read from the vessel's own sampled profile). Never
 * merged into the vessel body mesh — it's exported as its own STL part,
 * mirroring how Cast Form emits N independent mold parts from one project
 * (scripts/castForm/geometry/castFormSTLExporter.js).
 *
 * Shape (outer profile, local lid space: h=0 at the skirt's open bottom
 * edge, rising to the dome apex):
 *   - skirt: a short cylindrical band sized to slide inside the neck
 *     (`fit: 'inset'`, outer radius = neckInnerRadius - clearance) or slip
 *     over the rim (`fit: 'overcap'`, inner radius = neckOuterRadius + clearance)
 *   - inset only: a flat seat lip flares out to rest on the rim's top edge
 *   - dome: a quarter-ellipse profile rising from the seat/skirt radius to a
 *     closed apex at `domeHeight` above the seat
 *   - knob: a small closed bump (THREE.SphereGeometry for 'ball', a lathed
 *     nub otherwise) sitting on the apex — an independent, slightly
 *     overlapping closed shell, the same "several disjoint watertight parts
 *     merged into one export" approach this codebase already uses for rim/
 *     base caps (see scripts/vessel/geometry/vesselMeshGenerator.js).
 *
 * Wall thickness is applied the same way `profileSampler.buildVesselV3InnerProfile`
 * already does for the vessel body: inner radius = outer radius - wallThickness
 * at the same height (a radius-only offset, not a true normal offset — matches
 * the existing convention, not a new technique).
 *
 * Revolution reuses THREE.LatheGeometry directly — the exact primitive
 * `VesselMeshGenerator.createLatheMesh` already wraps for the vessel body.
 * No new revolution code.
 */

import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { sampleVesselV3Profile, buildVesselV3InnerProfile } from './profileSampler.js';

const MIN_RADIUS = 0.4;
const DOME_STEPS = 20;
const MIN_SKIRT_DEPTH = 0.5;

let sharedLidMaterial = null;
function getSharedLidMaterial() {
    if (!sharedLidMaterial) {
        sharedLidMaterial = new THREE.MeshStandardMaterial({
            color: 0xE8E0D5,
            roughness: 0.7,
            metalness: 0.0,
            side: THREE.DoubleSide,
            flatShading: false
        });
    }
    return sharedLidMaterial;
}

/**
 * Read the vessel's own rim/neck opening from its compiled profile: outer
 * radius + wall thickness at the topmost sampled point — the exact same
 * data VesselV3MeshGenerator's outer wall is revolved from
 * (profileSampler.sampleVesselV3Profile / buildVesselV3InnerProfile).
 *
 * @returns {{neckOuterRadius:number, neckInnerRadius:number, rimHeight:number, radialSegments:number}|null}
 */
export function deriveVesselNeckContext(state) {
    const { profile, validation } = sampleVesselV3Profile(state);
    if (!validation.valid || !Array.isArray(profile) || profile.length === 0) return null;

    const wallThickness = Math.max(0.5, Number(state?.global?.wallThickness) || 3);
    const inner = buildVesselV3InnerProfile(profile, wallThickness);
    const outerTop = profile[profile.length - 1];
    const innerTop = inner[inner.length - 1];

    return {
        neckOuterRadius: Math.max(MIN_RADIUS, outerTop.r),
        neckInnerRadius: Math.max(MIN_RADIUS, innerTop.r),
        rimHeight: outerTop.h,
        radialSegments: Math.max(32, Math.min(160, Number(state?.global?.radialSegments) || 96))
    };
}

/**
 * Build the lid's outer-surface profile points (bottom skirt -> dome apex).
 * Shared by buildLidGeometry() and computeLidFitContext() so both agree on
 * exactly the same fit math.
 */
function buildOuterProfilePoints(neckContext, lidState) {
    const wall = Math.max(0.8, Number(lidState.wallThickness) || 2.4);
    const clearance = Math.max(0, Number(lidState.clearance) || 0.4);
    const domeHeight = Math.max(2, Number(lidState.domeHeight) || 20);
    const skirtDepth = Math.max(MIN_SKIRT_DEPTH, Number(lidState.flangeDepth) || 8);
    const isInset = lidState.fit !== 'overcap';

    const points = [];
    let domeBaseR;
    let domeBaseH;
    let skirtOuterR;
    let skirtInnerR;

    if (isInset) {
        // Slides inside the neck opening; a flat seat lip flares out to rest
        // on the rim's top edge.
        skirtOuterR = Math.max(MIN_RADIUS, neckContext.neckInnerRadius - clearance);
        skirtInnerR = neckContext.neckInnerRadius; // for fit reporting only
        const seatOuterR = Math.max(skirtOuterR + wall * 0.5, neckContext.neckOuterRadius);

        points.push({ r: skirtOuterR, h: 0 });
        points.push({ r: skirtOuterR, h: skirtDepth });
        points.push({ r: seatOuterR, h: skirtDepth });
        points.push({ r: seatOuterR, h: skirtDepth + wall });

        domeBaseR = seatOuterR;
        domeBaseH = skirtDepth + wall;
    } else {
        // Caps over the outside of the rim, like a jar lid.
        skirtInnerR = neckContext.neckOuterRadius + clearance;
        skirtOuterR = skirtInnerR + wall;

        points.push({ r: skirtOuterR, h: 0 });
        points.push({ r: skirtOuterR, h: skirtDepth });

        domeBaseR = skirtOuterR;
        domeBaseH = skirtDepth;
    }

    // Sample the quarter-ellipse dome down to (but not exactly at) r=0 at the
    // apex — mirrors VesselMeshGenerator.sanitizeProfile's own
    // `Math.max(MIN_PROFILE_RADIUS, point.r)` clamp. THREE.LatheGeometry
    // still generates a full 2-triangles-per-cell quad grid for a row whose
    // radius is exactly 0, so BOTH triangles in the top cell end up with two
    // coincident vertices once mergeVertices() welds the (identical, r=0)
    // apex column — a degenerate, over-connected fan. A tiny nonzero radius
    // avoids that without visibly changing the dome (mirrors the vessel's
    // own base-point convention, which is never truly r=0 either).
    for (let i = 1; i <= DOME_STEPS; i++) {
        const t = i / DOME_STEPS;
        const angle = (t * Math.PI) / 2;
        const r = Math.max(MIN_RADIUS, domeBaseR * Math.cos(angle));
        const h = domeBaseH + domeHeight * Math.sin(angle);
        points.push({ r, h });
    }

    return {
        points,
        domeBaseR,
        domeBaseH,
        skirtOuterR,
        skirtInnerR,
        isInset
    };
}

/**
 * Offset the outer profile inward by the shell wall thickness, but trim the
 * points nearest the dome apex once the offset radius collapses to ~0.
 *
 * The outer lathe already closes into a single apex vertex where its own
 * radius hits 0 (solid material at the very tip). If the inner offset also
 * reached exactly r=0 at that same height, its own lathe would independently
 * close into a SECOND coincident apex fan sitting on top of the first one —
 * the strict STL validator (edge-adjacency based) flags the resulting
 * duplicate edges as over-connected/degenerate. Instead, stop the inner
 * surface one (or more) rows short of the apex and cap that opening with a
 * flat disc (see createCapDiscMesh) — the same "separate cap mesh closes an
 * inner cavity" technique VesselMeshGenerator already uses for the vessel's
 * own base/foot.
 */
function offsetInner(points, wallThickness) {
    const raw = points.map((p) => ({ r: p.r - wallThickness, h: p.h }));
    let cut = raw.length;
    while (cut > 2 && raw[cut - 1].r <= MIN_RADIUS) cut -= 1;
    return raw.slice(0, cut).map((p) => ({ r: Math.max(MIN_RADIUS, p.r), h: p.h }));
}

function toVec2(points) {
    return points.map((p) => new THREE.Vector2(p.r, p.h));
}

function createLatheMesh(points, radialSegments, name, material) {
    if (!Array.isArray(points) || points.length < 2) return null;
    let geometry = new THREE.LatheGeometry(toVec2(points), radialSegments, 0, Math.PI * 2);
    geometry = mergeVertices(geometry);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
}

/**
 * Close the lid's open bottom edge (the skirt's mouth) between the outer
 * and inner walls — the same role `VesselMeshGenerator.createRimMesh` plays
 * for the vessel's own rim, just facing the opposite direction (the lid's
 * mouth faces down onto/into the vessel, not up like a vessel's own rim).
 */
function createMouthCapMesh(outerBottomR, innerBottomR, radialSegments, material) {
    const outer = Math.max(MIN_RADIUS, outerBottomR);
    const inner = Math.max(0, Math.min(innerBottomR, outer - 0.01));
    if (outer <= inner) return null;

    const geometry = new THREE.RingGeometry(inner, outer, radialSegments, 1);
    geometry.rotateX(Math.PI / 2); // face -Y (downward, toward the vessel it seats onto)
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'lid-mouth';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
}

/**
 * Flat disc closing an open lathe ring — used both for the inner cavity
 * where the offset inner surface stops short of the outer shell's apex, and
 * for the outer shell's own apex (which, since buildOuterProfilePoints()
 * stops at a tiny nonzero MIN_RADIUS rather than a literal 0, is left open
 * by LatheGeometry rather than auto-closed).
 *
 * `faceUp` picks which way the disc's normal points: true faces +Y (closes
 * the outer shell's top, seen from outside/above), false faces -Y (closes
 * the inner cavity from inside, matching the mouth cap's orientation
 * convention).
 */
function createCapDiscMesh(radius, height, radialSegments, material, name, faceUp = false) {
    if (!(radius > 0)) return null;
    const geometry = new THREE.CircleGeometry(radius, radialSegments);
    geometry.rotateX(faceUp ? -Math.PI / 2 : Math.PI / 2);
    geometry.translate(0, height, 0);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
}

/**
 * Small closed knob bump sitting on the dome apex. 'ball' uses
 * THREE.SphereGeometry directly (trivial primitive, per the phase brief);
 * any other style is a simple lathed nub reusing the same revolution
 * utility as the rest of the lid instead of hand-rolled geometry.
 */
function buildKnobMesh(knobState, apexY, radialSegments, material) {
    const style = knobState?.style || 'ball';
    const height = Math.max(2, Number(knobState?.height) || 10);
    const width = Math.max(3, Number(knobState?.width) || 12);
    const radius = width / 2;
    const sink = Math.min(height * 0.25, radius * 0.5);

    if (style === 'ball') {
        const geometry = new THREE.SphereGeometry(radius, Math.max(16, Math.round(radialSegments / 2)), 12);
        geometry.scale(1, height / width, 1);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = 'lid-knob';
        mesh.position.y = apexY - sink + height / 2;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        return mesh;
    }

    // 'loop' / 'flat' / any other style: a small lathed nub — a rounded bump
    // ('loop') or a flatter disc-like bump ('flat'). Both ends of this
    // profile sit at a tiny nonzero MIN_RADIUS rather than a literal 0 (same
    // LatheGeometry-apex bug as the outer dome — see buildOuterProfilePoints'
    // comment), so each end is closed with its own flat cap disc instead of
    // relying on the lathe to auto-close.
    const steps = 10;
    const points = [{ r: MIN_RADIUS, h: 0 }];
    for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const angle = (t * Math.PI) / 2;
        const r = i === steps ? MIN_RADIUS : Math.max(MIN_RADIUS, radius * Math.sin(angle));
        const h = style === 'flat' ? height * t : height * Math.sin(angle);
        points.push({ r, h });
    }

    const group = new THREE.Group();
    group.name = 'lid-knob';

    const nubMesh = createLatheMesh(points, radialSegments, 'lid-knob-nub', material);
    if (nubMesh) group.add(nubMesh);

    const bottom = points[0];
    const bottomCap = createCapDiscMesh(bottom.r, bottom.h, radialSegments, material, 'lid-knob-cap-bottom', false);
    if (bottomCap) group.add(bottomCap);

    const top = points[points.length - 1];
    const topCap = createCapDiscMesh(top.r, top.h, radialSegments, material, 'lid-knob-cap-top', true);
    if (topCap) group.add(topCap);

    group.position.y = apexY - sink;
    return group;
}

/**
 * Build the lid as an independent, manifold THREE.Group. Local coordinates:
 * y=0 is the skirt's open bottom edge (what seats onto/into the vessel's
 * neck); the caller positions the group at the vessel's own rim height for
 * a seated preview, or leaves it at the origin for a standalone/export view.
 *
 * @param {{neckOuterRadius:number, neckInnerRadius:number, radialSegments:number}} vesselProfileContext
 * @param {Object} lidState - state.lid
 * @returns {THREE.Group|null}
 */
export function buildLidGeometry(vesselProfileContext, lidState) {
    if (!vesselProfileContext || !lidState) return null;

    const radialSegments = vesselProfileContext.radialSegments || 96;
    const wall = Math.max(0.8, Number(lidState.wallThickness) || 2.4);
    const material = getSharedLidMaterial();

    const { points: outerPoints } = buildOuterProfilePoints(vesselProfileContext, lidState);
    if (outerPoints.length < 2) return null;
    const innerPoints = offsetInner(outerPoints, wall);

    const group = new THREE.Group();
    group.name = 'lid';

    const outerMesh = createLatheMesh(outerPoints, radialSegments, 'lid-outer', material);
    if (outerMesh) group.add(outerMesh);

    const innerMesh = createLatheMesh(innerPoints, radialSegments, 'lid-inner', material);
    if (innerMesh) group.add(innerMesh);

    const mouthMesh = createMouthCapMesh(outerPoints[0].r, innerPoints[0].r, radialSegments, material);
    if (mouthMesh) group.add(mouthMesh);

    const innerTop = innerPoints[innerPoints.length - 1];
    const innerCapMesh = createCapDiscMesh(innerTop.r, innerTop.h, radialSegments, material, 'lid-inner-cap');
    if (innerCapMesh) group.add(innerCapMesh);

    // The outer lathe's own apex row now stops at a tiny nonzero MIN_RADIUS
    // (see buildOuterProfilePoints()'s dome loop) rather than a literal 0,
    // so LatheGeometry leaves that top ring open instead of auto-closing it
    // — cap it, facing up, the same way the inner cavity is capped below it.
    const outerTop = outerPoints[outerPoints.length - 1];
    const outerCapMesh = createCapDiscMesh(outerTop.r, outerTop.h, radialSegments, material, 'lid-outer-cap', true);
    if (outerCapMesh) group.add(outerCapMesh);

    const apexY = outerPoints[outerPoints.length - 1].h;
    const knobMesh = buildKnobMesh(lidState.knob, apexY, radialSegments, material);
    if (knobMesh) group.add(knobMesh);

    return group;
}

/**
 * Estimate the dome's overhang angle (degrees from vertical) for validation.
 *
 * The dome profile is a quarter ellipse (see buildOuterProfilePoints): its
 * radius is monotonically non-increasing as height increases, so — unlike a
 * true bulging hemisphere — it never overhangs in the strict "wider above
 * than below" sense. But a literal max-over-all-sampled-segments tangent
 * angle is a degenerate metric here: the profile's slope approaches purely
 * horizontal as it nears the closed apex for ANY dome proportions (tall or
 * shallow), because DOME_STEPS samples an angular parameter `a` that always
 * sweeps to pi/2, not because the print is actually risky there — a printed
 * dome's last few near-apex layers are a small, naturally self-supporting
 * point, not a real bridging/overhang hazard. (Verified numerically: even a
 * tall, narrow dome's last non-degenerate segment reads ~77-89 degrees.)
 *
 * Instead this evaluates the tangent angle at the sweep's angular midpoint
 * (a = 45 degrees) — a fixed, non-degenerate reference point away from the
 * apex singularity, where a wide/shallow dome (domeBaseRadius > domeHeight)
 * is already leaning past 45 degrees from vertical and a tall/narrow one
 * is not. For this profile shape, `atan(domeBaseRadius / domeHeight)` is
 * exactly that midpoint angle.
 */
export function estimateDomeOverhangAngleDeg(domeBaseRadius, domeHeight) {
    const r = Number(domeBaseRadius);
    const h = Number(domeHeight);
    if (!(r >= 0) || !(h > 0)) return 0;
    return (Math.atan2(r, h) * 180) / Math.PI;
}

/**
 * Derive geometry-backed context for validation (Phase 3, task item 5):
 * the actual skirt-to-neck clearance the fit math produced (which can be
 * pinned to a floor radius and differ from the requested `lid.clearance`
 * when the neck is very small), plus the dome's base radius/estimated
 * overhang angle so validation can flag a shallow/wide dome as a print risk.
 */
export function computeLidFitContext(neckContext, lidState) {
    if (!neckContext || !lidState) return {};

    const { domeBaseR, skirtOuterR, isInset } = buildOuterProfilePoints(neckContext, lidState);
    const requestedClearance = Math.max(0, Number(lidState.clearance) || 0);
    const actualClearance = isInset
        ? neckContext.neckInnerRadius - skirtOuterR
        : skirtOuterR - Math.max(0.8, Number(lidState.wallThickness) || 2.4) - neckContext.neckOuterRadius;
    const domeHeight = Math.max(2, Number(lidState.domeHeight) || 20);

    return {
        requestedClearance,
        actualClearance,
        domeBaseRadius: domeBaseR,
        domeHeight,
        domeOverhangAngleDeg: estimateDomeOverhangAngleDeg(domeBaseR, domeHeight),
        neckOuterRadius: neckContext.neckOuterRadius,
        neckInnerRadius: neckContext.neckInnerRadius
    };
}

export default buildLidGeometry;
