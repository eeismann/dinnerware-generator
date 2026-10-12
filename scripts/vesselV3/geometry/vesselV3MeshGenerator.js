/**
 * Vessel Designer V3 - Mesh Generator Adapter
 *
 * Extends the vessel lathe generator with per-segment surface motifs and the
 * spout graft. When any profile segment carries an active motif, OR the
 * spout is enabled, the OUTER wall is built as a set of per-segment lathe
 * runs: motif runs are displaced by the shared surface-pattern engine
 * (fading to zero at their boundaries), and the spout (scripts/vesselV3/
 * geometry/spoutGraft.js) additionally displaces the single ring belonging
 * to its target run/segment outward + down within its angular window. All
 * runs share one radial resolution, so the parts weld watertight (the
 * strict STL validator rejects boundary edges). Inner wall, rim and base
 * stay smooth.
 */

import * as THREE from 'three';
import { mergeVertices, mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { VesselMeshGenerator } from '../../vessel/geometry/vesselMeshGenerator.js';
import {
    getMotifPattern,
    computePatternRadialSegments,
    latheWithOptionalPattern
} from '../../geometry/surfacePattern.js';
import {
    buildVesselV3InnerProfile,
    sampleVesselV3Profile,
    validateVesselV3Profile
} from './profileSampler.js';
import { applySpoutGraft, spoutAngularEnvelope } from './spoutGraft.js';

// Displacement fade margins (mm) — matched to the dinnerware engine.
const FOOT_FADE = 1.0;
const JUNCTION_FADE = 1.5;
const RIM_FADE = 2.0;
// Run id for the unpatterned flat base (never a segment owner id)
const BASE_RUN = Symbol('base');

/**
 * Index of the last sample on the underside: the run out from the axis while
 * the profile stays level or descends (a flat floor, or a raised foot dome
 * with Footer Overlap). -1 when the profile rises straight from the axis.
 */
function leadingFloorEnd(profile) {
    let end = 0;
    while (end + 1 < profile.length && profile[end + 1].h <= profile[end].h + 1e-6) end++;
    return end > 0 ? end : -1;
}

class VesselV3ProfileGenerator {
    constructor(state) {
        this.state = state;
        this.lastValidation = { valid: true, errors: [], warnings: [] };
    }

    generate() {
        const result = sampleVesselV3Profile(this.state);
        this.lastValidation = result.validation;
        return result.profile;
    }

    generateInnerProfile() {
        const outerProfile = this.generate();
        return buildVesselV3InnerProfile(
            outerProfile,
            this.state?.global?.wallThickness
        );
    }
}

function createCompatibleVesselState(state) {
    return {
        global: {
            wallThickness: state?.global?.wallThickness ?? 3
        },
        sections: {
            foot: {
                enabled: true
            }
        }
    };
}

export class VesselV3MeshGenerator extends VesselMeshGenerator {
    constructor(state) {
        super(createCompatibleVesselState(state));
        this.sourceState = state;
        this.profileGenerator = new VesselV3ProfileGenerator(state);
        this.baseRadialSegments = Math.max(32, Math.min(160, state?.global?.radialSegments ?? 96));
        this.radialSegments = this.baseRadialSegments;
    }

    /** Normalized pattern objects for every segment that carries an active motif. */
    collectPatterns() {
        const points = this.sourceState?.profile?.points || [];
        return points
            .map((point) => getMotifPattern(point && point.motif))
            .filter(Boolean);
    }

    /** Map from segment owner id -> normalized pattern (or absent when smooth). */
    patternByOwnerId() {
        const map = new Map();
        (this.sourceState?.profile?.points || []).forEach((point) => {
            if (!point || !point.id) return;
            const pattern = getMotifPattern(point.motif);
            if (pattern) map.set(point.id, pattern);
        });
        return map;
    }

    generate() {
        // All meshes (outer runs, inner, rim, base) must share one radial
        // resolution so their boundary rings coincide and weld watertight.
        const patterns = this.collectPatterns();
        this.radialSegments = patterns.length
            ? Math.max(this.baseRadialSegments, computePatternRadialSegments(...patterns))
            : this.baseRadialSegments;
        return super.generate();
    }

    /**
     * Outer wall: build per-segment patterned runs when motifs are present.
     * All other surfaces (inner, rim, section-color previews) fall through to
     * the plain lathe path.
     */
    createLatheMesh(profile, name = 'vessel', isInnerSurface = false, color = null) {
        if (name !== 'outer') {
            return super.createLatheMesh(profile, name, isInnerSurface, color);
        }

        const patternsByOwner = this.patternByOwnerId();
        const spoutActive = this.sourceState?.spout?.enabled === true;
        if (patternsByOwner.size === 0 && !spoutActive) {
            return super.createLatheMesh(profile, name, isInnerSurface, color);
        }

        const mesh = this.buildPatternedOuterMesh(profile, patternsByOwner);
        return mesh || super.createLatheMesh(profile, name, isInnerSurface, color);
    }

    /**
     * Split the (already sanitized) outer profile into per-segment runs by the
     * segmentId tags, apply each segment's motif via the shared engine, and
     * merge into one watertight outer shell.
     */
    buildPatternedOuterMesh(profile, patternsByOwner) {
        if (!Array.isArray(profile) || profile.length < 2) return null;

        // The underside (centre out to the base corner) never takes a motif:
        // displacing it along its downward normal hangs ridges below the
        // floor, so the vessel would neither stand nor print flat.
        const floorEnd = leadingFloorEnd(profile);

        // Group consecutive samples by their owning segment.
        const groups = [];
        profile.forEach((point, index) => {
            const sid = index <= floorEnd ? BASE_RUN : point.segmentId;
            const last = groups[groups.length - 1];
            if (last && last.ownerId === sid) {
                last.points.push(point);
            } else {
                groups.push({ ownerId: sid, points: [point] });
            }
        });

        // Build runs sharing one boundary point with the previous run so the
        // revolved boundary rings coincide exactly.
        const runs = [];
        groups.forEach((group, gi) => {
            let pts = group.points;
            if (gi > 0) {
                const prev = groups[gi - 1].points;
                pts = [prev[prev.length - 1], ...pts];
            }
            if (pts.length < 2 && runs.length > 0) {
                // Degenerate group: fold into the previous run instead of leaving a hole.
                runs[runs.length - 1].points.push(...pts);
                return;
            }
            runs.push({ ownerId: group.ownerId, points: pts });
        });

        const wallThickness = Math.max(0.5, Number(this.sourceState?.global?.wallThickness) || 3);
        const maxRecessDepth = Math.max(0, wallThickness - 1.0);
        const geometries = [];

        runs.forEach((run, index) => {
            const vec = run.points.map((p) => new THREE.Vector2(p.r, p.h));
            const pattern = patternsByOwner.get(run.ownerId) || null;
            const opts = {
                fadeStart: index === 0 || runs[index - 1].ownerId === BASE_RUN ? FOOT_FADE : JUNCTION_FADE,
                fadeEnd: index === runs.length - 1 ? RIM_FADE : JUNCTION_FADE,
                maxRecessDepth
            };
            const geo = latheWithOptionalPattern(vec, this.radialSegments, pattern, opts);
            geometries.push(geo);
        });

        this.applySpoutToRuns(runs, geometries, this.resolveSpoutTargetOwnerId(profile));

        // Normalize attributes so runs from both paths merge cleanly.
        geometries.forEach((geo) => {
            geo.deleteAttribute('normal');
            geo.deleteAttribute('uv');
        });

        if (geometries.length === 0) return null;

        let merged = geometries.length === 1
            ? geometries[0]
            : mergeGeometries(geometries, false);

        if (!merged) {
            geometries.forEach((g) => g.dispose());
            return null;
        }

        // Weld coincident boundary rings between runs, then recompute smooth normals.
        merged = mergeVertices(merged);
        merged.computeVertexNormals();

        if (geometries.length > 1) {
            geometries.forEach((g) => g.dispose());
        }

        const mesh = new THREE.Mesh(merged, this.previewMaterial);
        mesh.name = 'outer';
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        return mesh;
    }

    /**
     * Resolve which segment owner the spout graft targets: `spout.segmentId`
     * when it names a segment actually present in this profile, otherwise
     * the topmost segment (the vessel's own rim) — covers both the
     * documented null/unset fallback and a stale id left behind by a later
     * profile edit. Returns null when the spout isn't active. Shared by
     * `applySpoutToRuns()` (the outer wall) and `createRimMesh()` (the rim
     * cap, when the target happens to be the topmost segment) so both
     * agree on exactly which ring is grafted.
     */
    resolveSpoutTargetOwnerId(profile) {
        const spout = this.sourceState?.spout;
        if (!spout?.enabled) return null;
        if (!(Number(spout.length) > 0 || Number(spout.drop) > 0)) return null;
        if (!Array.isArray(profile) || profile.length === 0) return null;

        const ownerIds = [];
        const seen = new Set();
        profile.forEach((point) => {
            if (seen.has(point.segmentId)) return;
            seen.add(point.segmentId);
            ownerIds.push(point.segmentId);
        });
        if (ownerIds.length === 0) return null;

        return ownerIds.includes(spout.segmentId) ? spout.segmentId : ownerIds[ownerIds.length - 1];
    }

    /**
     * Graft the spout (Phase 2) onto the run whose ownerId is
     * `targetOwnerId` (from resolveSpoutTargetOwnerId). Displaces the
     * target run's own top ring in place.
     *
     * The target run's top ring is, by construction of `runs` above, also
     * duplicated as row 0 of the NEXT run whenever the target isn't the
     * topmost run (each run after the first repeats the previous group's
     * last sample so boundary rings coincide). Both copies must receive the
     * identical displacement, or they stop coinciding after the graft and
     * the later mergeVertices() weld would leave a boundary seam.
     */
    applySpoutToRuns(runs, geometries, targetOwnerId) {
        if (!targetOwnerId) return;
        const spout = this.sourceState.spout;

        const targetIndex = runs.findIndex((run) => run.ownerId === targetOwnerId);
        if (targetIndex < 0) return;

        const rowCount = runs[targetIndex].points.length;
        applySpoutGraft(geometries[targetIndex], spout, {
            radialSegments: this.radialSegments,
            rowCount,
            targetRow: rowCount - 1
        });

        if (targetIndex < runs.length - 1) {
            const nextRowCount = runs[targetIndex + 1].points.length;
            applySpoutGraft(geometries[targetIndex + 1], spout, {
                radialSegments: this.radialSegments,
                rowCount: nextRowCount,
                targetRow: 0
            });
        }
    }

    /**
     * Rim cap: THREE.RingGeometry (the base class's rim builder) uses its
     * own vertex convention, independent of LatheGeometry's, so it has no
     * way to know the outer wall's top ring moved. When the spout targets
     * the topmost segment (the actual rim), the base rim cap's outer edge
     * would stay put while the wall's rim ring is grafted out from under
     * it — a boundary seam. Rebuild the ring by hand instead, matching
     * LatheGeometry's exact (r*sin(phi), y, r*cos(phi)) convention and
     * column count, and apply the identical graft displacement to its
     * outer edge so the two meshes' rim vertices stay bit-for-bit
     * coincident. The inner edge (against the inner wall) never moves —
     * the graft only pulls the outer wall.
     */
    createRimMesh(outerProfile, innerProfile) {
        const targetOwnerId = this.resolveSpoutTargetOwnerId(outerProfile);
        const topOwnerId = outerProfile[outerProfile.length - 1]?.segmentId;
        if (!targetOwnerId || targetOwnerId !== topOwnerId) {
            return super.createRimMesh(outerProfile, innerProfile);
        }
        return this.createGraftedRimMesh(outerProfile, innerProfile);
    }

    createGraftedRimMesh(outerProfile, innerProfile) {
        if (outerProfile.length < 1 || innerProfile.length < 1) return null;

        const outerTop = outerProfile[outerProfile.length - 1];
        const innerTop = innerProfile[innerProfile.length - 1];
        const outerRadius = outerTop.r;
        const innerRadius = Math.max(0.1, innerTop.r);
        const height = outerTop.h;
        if (outerRadius <= innerRadius) return null;

        const spout = this.sourceState.spout;
        const centerRad = ((Number(spout.angle) || 0) * Math.PI) / 180;
        const halfWidthRad = Math.max(0.001, ((Number(spout.width) || 0) * Math.PI) / 360);
        const length = Math.max(0, Number(spout.length) || 0);
        const drop = Math.max(0, Number(spout.drop) || 0);

        const segs = this.radialSegments;
        const positions = new Float32Array((segs + 1) * 2 * 3);
        let offset = 0;
        for (let i = 0; i <= segs; i++) {
            const phi = (i / segs) * Math.PI * 2;
            const sin = Math.sin(phi);
            const cos = Math.cos(phi);
            const env = spoutAngularEnvelope(phi, centerRad, halfWidthRad);
            const rOuter = outerRadius + length * env;
            const yOuter = height - drop * env;

            positions[offset++] = rOuter * sin;
            positions[offset++] = yOuter;
            positions[offset++] = rOuter * cos;

            positions[offset++] = innerRadius * sin;
            positions[offset++] = height;
            positions[offset++] = innerRadius * cos;
        }

        const indices = [];
        for (let i = 0; i < segs; i++) {
            const outerCurrent = i * 2;
            const innerCurrent = outerCurrent + 1;
            const outerNext = outerCurrent + 2;
            const innerNext = outerNext + 1;
            indices.push(outerCurrent, innerCurrent, outerNext);
            indices.push(outerNext, innerCurrent, innerNext);
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();

        const mesh = new THREE.Mesh(geometry, this.previewMaterial);
        mesh.name = 'rim';
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        return mesh;
    }

    validate() {
        return validateVesselV3Profile(this.sourceState);
    }
}

export default VesselV3MeshGenerator;
