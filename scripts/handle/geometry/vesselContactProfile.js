import { sampleVesselV2Profile } from '../../vesselV2/geometry/profileSampler.js';
import { sampleVesselV3Profile } from '../../vesselV3/geometry/profileSampler.js';
import { VesselMeshGenerator } from '../../vessel/geometry/vesselMeshGenerator.js';
import { normalizeMotif } from '../../geometry/surfacePatternOptions.js';

export const VESSEL_CONTACT_POLICY = 'outermost-compiled-profile-v1';
const EPSILON = 1e-7;

/**
 * A handle approaches the vessel from outside. For a folded/reentrant profile,
 * its contact is the outermost intersection of a horizontal ray with the
 * compiled exterior, including both sides of a horizontal ledge. Preserve
 * segment order: sorting the vertices would connect unrelated profile branches.
 * Outside the profile's height range, clamp to its nearest height boundary.
 */
export function getOuterContactRadius(profile, height) {
    if (!Array.isArray(profile) || profile.length < 2 || !Number.isFinite(height)) return null;
    let minHeight = Infinity;
    let maxHeight = -Infinity;
    for (const point of profile) {
        minHeight = Math.min(minHeight, point.y);
        maxHeight = Math.max(maxHeight, point.y);
    }
    const y = Math.max(minHeight, Math.min(maxHeight, height));
    let radius = -Infinity;
    for (let i = 1; i < profile.length; i++) {
        const a = profile[i - 1];
        const b = profile[i];
        if (y < Math.min(a.y, b.y) - EPSILON || y > Math.max(a.y, b.y) + EPSILON) continue;
        if (Math.abs(b.y - a.y) <= EPSILON) {
            radius = Math.max(radius, a.radius, b.radius);
        } else {
            const t = Math.max(0, Math.min(1, (y - a.y) / (b.y - a.y)));
            radius = Math.max(radius, a.radius + (b.radius - a.radius) * t);
        }
    }
    return Number.isFinite(radius) ? radius : null;
}

/**
 * Compile the same Bezier/rounded samples and sanitation used by vessel meshes.
 * Contact is supported for smooth axisymmetric exteriors. Motifs and spouts
 * are refused explicitly: a radius-at-height handle has no angular contact
 * selector and cannot represent their displaced surface faithfully.
 */
export function compileVesselContactProfile(project, sourceType = project?.appType) {
    if (!['vessel-v2', 'vessel-v3'].includes(sourceType)) {
        throw new Error('Select a Vessel V2 or V3 project.');
    }
    if (!Array.isArray(project?.profile?.points)) {
        throw new Error('The vessel project has no valid profile point list.');
    }
    if (project?.spout?.enabled === true) {
        throw new Error('Handle attachment does not yet support spouts. Import a saved copy with the spout disabled.');
    }
    if (project?.profile?.points?.some((point) => normalizeMotif(point?.motif).type !== 'none')) {
        throw new Error('Handle attachment does not yet support surface motifs. Import a saved copy with smooth segments.');
    }
    const sample = sourceType === 'vessel-v3' ? sampleVesselV3Profile : sampleVesselV2Profile;
    const result = sample(project);
    if (!result.validation.valid) {
        throw new Error(`Fix the vessel profile before importing: ${result.validation.errors.join(' ')}`);
    }
    // Reuse the exact pure sanitation method used before the source lathe.
    const sampled = VesselMeshGenerator.prototype.sanitizeProfile(result.profile);
    const radiusProfile = sampled.map(({ h, r }) => ({ y: h, radius: r }));
    if (radiusProfile.length < 2) throw new Error('The vessel profile has no usable exterior.');
    const bounds = {
        min: Math.min(...radiusProfile.map((point) => point.y)),
        max: Math.max(...radiusProfile.map((point) => point.y))
    };
    if (bounds.max - bounds.min <= EPSILON) throw new Error('The vessel must have a wall with nonzero height.');
    return { radiusProfile, bounds, policy: VESSEL_CONTACT_POLICY };
}
