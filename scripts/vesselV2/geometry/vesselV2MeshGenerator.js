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

// Displacement fade margins (mm) — matched to the dinnerware engine.
const FOOT_FADE = 1.0;
const JUNCTION_FADE = 1.5;
const RIM_FADE = 2.0;
// Run id for the unpatterned flat base (never a segment owner id)
const BASE_RUN = Symbol('base');

/** Index of the last sample on the flat floor leading out from the axis (0 when none). */
function leadingFloorEnd(profile) {
    const floorH = profile[0].h;
    let end = 0;
    while (end + 1 < profile.length && Math.abs(profile[end + 1].h - floorH) <= 1e-6) end++;
    return end;
}

class VesselV2ProfileGenerator {
    constructor(state) {
        this.state = state;
        this.lastValidation = { valid: true, errors: [], warnings: [] };
    }

    generate() {
        const result = sampleVesselV2Profile(this.state);
        this.lastValidation = result.validation;
        return result.profile;
    }

    generateInnerProfile() {
        const outerProfile = this.generate();
        return buildVesselV2InnerProfile(
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

        // The flat underside (centre out to the base corner) never takes a
        // motif: displacing it along its downward normal hangs ridges below
        // the floor, so the vessel would neither stand nor print flat.
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

    validate() {
        return validateVesselV2Profile(this.sourceState);
    }
}

export default VesselV2MeshGenerator;
