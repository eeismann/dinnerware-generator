/**
 * Vessel Designer V2 - Mesh Generator Adapter
 *
 * Extends the vessel lathe generator with per-segment surface motifs. When any
 * profile segment carries an active motif, the OUTER wall is built as a set of
 * per-segment lathe runs displaced by the shared surface-pattern engine; every
 * run fades to zero displacement at its boundaries and all meshes share one
 * radial resolution, so the parts weld watertight (the strict STL validator
 * rejects boundary edges). Inner wall, rim and base stay smooth.
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
    buildVesselV2InnerProfile,
    sampleVesselV2Profile,
    validateVesselV2Profile
} from './profileSampler.js';
import { AXIS_SEAM_RADIUS, createAxisFanGeometry } from './wallOffset.js';

// Displacement fade margins (mm) — matched to the dinnerware engine.
const FOOT_FADE = 1.0;
const JUNCTION_FADE = 1.5;
const RIM_FADE = 2.0;
// Closest two profile samples may sit (mm), well above the STL weld
const MIN_SAMPLE_SPACING = 0.005;
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

/** Start a profile on the axis seam ring, where an axis fan closes it. */
function withAxisSeam(profile) {
    if (!profile.length) return profile;
    return [{ ...profile[0], r: AXIS_SEAM_RADIUS }, ...profile.slice(1)];
}

class VesselV2ProfileGenerator {
    constructor(state) {
        this.state = state;
        this.lastValidation = { valid: true, errors: [], warnings: [] };
    }

    generate() {
        const result = sampleVesselV2Profile(this.state);
        this.lastValidation = result.validation;
        return withAxisSeam(result.profile);
    }

    generateInnerProfile() {
        const outerProfile = this.generate();
        return withAxisSeam(buildVesselV2InnerProfile(
            outerProfile,
            this.state?.global?.wallThickness
        ));
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

export class VesselV2MeshGenerator extends VesselMeshGenerator {
    constructor(state) {
        super(createCompatibleVesselState(state));
        this.sourceState = state;
        this.profileGenerator = new VesselV2ProfileGenerator(state);
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
        this.axisSeams = {};
        const group = super.generate();
        this.addAxisCaps(group);
        return group;
    }

    /**
     * Drop samples nearer than MIN_SAMPLE_SPACING to the previous one. The STL
     * check welds within 0.001mm, so a pair like a rounded corner meeting a
     * zero-radius one would collapse a whole ring of triangles.
     */
    sanitizeProfile(profile) {
        const points = super.sanitizeProfile(profile);
        const spaced = [];
        points.forEach((point, index) => {
            const last = spaced[spaced.length - 1];
            if (last && Math.hypot(point.r - last.r, point.h - last.h) < MIN_SAMPLE_SPACING) {
                // Keep the rim point itself
                if (index === points.length - 1 && spaced.length > 1) spaced[spaced.length - 1] = point;
                return;
            }
            spaced.push(point);
        });
        return spaced;
    }

    /**
     * Close the outer underside and the inner floor at the axis. They are
     * separate surfaces a floor's thickness apart, each ending on the seam ring.
     */
    addAxisCaps(group) {
        [['outer', false], ['inner', true]].forEach(([name, faceUp]) => {
            const seam = this.axisSeams[name];
            if (!seam || Math.abs(seam.r - AXIS_SEAM_RADIUS) > 1e-6) return;
            const geometry = createAxisFanGeometry(THREE, seam.h, seam.r, this.radialSegments, faceUp);
            const mesh = new THREE.Mesh(geometry, this.previewMaterial);
            mesh.name = `${name}-axis-cap`;
            mesh.receiveShadow = true;
            group.add(mesh);
        });
    }

    /**
     * Outer wall: build per-segment patterned runs when motifs are present.
     * All other surfaces (inner, rim, section-color previews) fall through to
     * the plain lathe path.
     */
    createLatheMesh(profile, name = 'vessel', isInnerSurface = false, color = null) {
        if ((name === 'outer' || name === 'inner') && profile.length) {
            this.axisSeams = { ...this.axisSeams, [name]: profile[0] };
        }
        if (name === 'inner') {
            // Lathed rim -> axis so its faces point into the cavity
            return super.createLatheMesh([...profile].reverse(), name, isInnerSurface, color);
        }
        if (name !== 'outer') {
            return super.createLatheMesh(profile, name, isInnerSurface, color);
        }

        const patternsByOwner = this.patternByOwnerId();
        if (patternsByOwner.size === 0) {
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
            // Normalize attributes so runs from both paths merge cleanly.
            geo.deleteAttribute('normal');
            geo.deleteAttribute('uv');
            geometries.push(geo);
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
     * Rim ring as a two-point lathe (outer top -> inner top, facing up).
     * RingGeometry lays vertices out as (cos, sin) where LatheGeometry uses
     * (sin, cos); the two only coincide at multiples of 4 segments, so any
     * other Segments value left a gap at both rim edges.
     */
    createRimMesh(outerProfile, innerProfile) {
        const outerTop = outerProfile[outerProfile.length - 1];
        const innerTop = innerProfile[innerProfile.length - 1];
        if (!outerTop || !innerTop || outerTop.r <= innerTop.r) return null;
        const geometry = new THREE.LatheGeometry([
            new THREE.Vector2(outerTop.r, outerTop.h),
            new THREE.Vector2(innerTop.r, outerTop.h)
        ], this.radialSegments);
        const mesh = new THREE.Mesh(geometry, this.previewMaterial);
        mesh.name = 'rim';
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        return mesh;
    }

    validate() {
        return validateVesselV2Profile(this.sourceState);
    }
}

export default VesselV2MeshGenerator;
