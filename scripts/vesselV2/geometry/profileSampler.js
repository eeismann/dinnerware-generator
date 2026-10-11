/**
 * Vessel Designer V2 - Profile Sampling and Validation
 */

const MIN_SIDE_RADIUS = 0.1;
const EPSILON = 1e-5;
const MAX_CORNER_RADIUS = 80;

function anchorToPoint(anchor) {
    return { r: Number(anchor.r) || 0, h: Number(anchor.h) || 0 };
}

function addHandle(anchor, handle) {
    return {
        r: anchor.r + (handle?.r || 0),
        h: anchor.h + (handle?.h || 0)
    };
}

function cubicAt(t, p0, p1, p2, p3) {
    const mt = 1 - t;
    const mt2 = mt * mt;
    const mt3 = mt2 * mt;
    const t2 = t * t;
    const t3 = t2 * t;

    return {
        r: mt3 * p0.r + 3 * mt2 * t * p1.r + 3 * mt * t2 * p2.r + t3 * p3.r,
        h: mt3 * p0.h + 3 * mt2 * t * p1.h + 3 * mt * t2 * p2.h + t3 * p3.h
    };
}

function distance(a, b) {
    return Math.hypot(b.r - a.r, b.h - a.h);
}

function normalizeVector(vector) {
    const length = Math.hypot(vector.r, vector.h);
    if (!Number.isFinite(length) || length <= EPSILON) return null;
    return {
        r: vector.r / length,
        h: vector.h / length
    };
}

function addPoint(a, vector, scale) {
    return {
        r: a.r + vector.r * scale,
        h: a.h + vector.h * scale
    };
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function segmentControls(start, end) {
    const p0 = anchorToPoint(start);
    const p3 = anchorToPoint(end);
    const dr = p3.r - p0.r;
    const dh = p3.h - p0.h;

    return {
        p0,
        p1: start.outHandle ? addHandle(p0, start.outHandle) : { r: p0.r + dr / 3, h: p0.h + dh / 3 },
        p2: end.inHandle ? addHandle(p3, end.inHandle) : { r: p0.r + (dr * 2) / 3, h: p0.h + (dh * 2) / 3 },
        p3
    };
}

function pushPoint(points, point) {
    const last = points[points.length - 1];
    if (
        last &&
        Math.abs(last.r - point.r) <= EPSILON &&
        Math.abs(last.h - point.h) <= EPSILON
    ) {
        return;
    }
    points.push(point);
}

function sampleCornerArc(center, start, end, steps) {
    const startAngle = Math.atan2(start.h - center.h, start.r - center.r);
    const endAngle = Math.atan2(end.h - center.h, end.r - center.r);
    let sweep = endAngle - startAngle;

    while (sweep > Math.PI) sweep -= Math.PI * 2;
    while (sweep < -Math.PI) sweep += Math.PI * 2;

    const samples = [];
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const angle = startAngle + sweep * t;
        const radius = distance(center, start);
        samples.push({
            r: center.r + Math.cos(angle) * radius,
            h: center.h + Math.sin(angle) * radius
        });
    }

    return samples;
}

function sampleRoundedPolyline(points, samplesPerCorner) {
    if (points.length < 2) return [];

    const anchors = points.map(anchorToPoint);
    const sampled = [];
    pushPoint(sampled, anchors[0]);

    for (let i = 1; i < anchors.length - 1; i++) {
        const prev = anchors[i - 1];
        const current = anchors[i];
        const next = anchors[i + 1];
        const requestedRadius = clamp(Number(points[i].cornerRadius) || 0, 0, MAX_CORNER_RADIUS);
        const incomingLength = distance(current, prev);
        const outgoingLength = distance(current, next);
        const incoming = normalizeVector({
            r: prev.r - current.r,
            h: prev.h - current.h
        });
        const outgoing = normalizeVector({
            r: next.r - current.r,
            h: next.h - current.h
        });

        if (
            requestedRadius <= EPSILON ||
            !incoming ||
            !outgoing ||
            incomingLength <= EPSILON ||
            outgoingLength <= EPSILON
        ) {
            pushPoint(sampled, current);
            continue;
        }

        const angle = Math.acos(clamp(
            incoming.r * outgoing.r + incoming.h * outgoing.h,
            -1,
            1
        ));
        const straightish = Math.abs(Math.PI - angle) <= 0.01;
        const tooSharp = angle <= 0.01;
        if (straightish || tooSharp) {
            pushPoint(sampled, current);
            continue;
        }

        const tangentForRequestedRadius = requestedRadius / Math.tan(angle / 2);
        const maxTangent = Math.min(incomingLength, outgoingLength) * 0.45;
        const tangent = clamp(tangentForRequestedRadius, 0, maxTangent);
        if (tangent <= EPSILON) {
            pushPoint(sampled, current);
            continue;
        }

        const effectiveRadius = tangent * Math.tan(angle / 2);
        const bisector = normalizeVector({
            r: incoming.r + outgoing.r,
            h: incoming.h + outgoing.h
        });
        if (!bisector) {
            pushPoint(sampled, current);
            continue;
        }

        const start = addPoint(current, incoming, tangent);
        const end = addPoint(current, outgoing, tangent);
        const centerDistance = effectiveRadius / Math.sin(angle / 2);
        const center = addPoint(current, bisector, centerDistance);
        const arcSteps = Math.max(3, Math.ceil(samplesPerCorner * Math.abs(Math.PI - angle) / Math.PI));

        pushPoint(sampled, start);
        sampleCornerArc(center, start, end, arcSteps).forEach((point) => pushPoint(sampled, point));
        pushPoint(sampled, end);
    }

    pushPoint(sampled, anchors[anchors.length - 1]);
    return sampled;
}

function toProfileSamples(rawPoints, options = {}) {
    const profile = [];
    let lastH = 0;
    const preserveOverlaps = options.preserveOverlaps === true;

    rawPoints.forEach((sampled, index) => {
        const h = preserveOverlaps
            ? Math.max(0, Number(sampled.h) || 0)
            : Math.max(lastH, Number(sampled.h) || 0);
        profile.push({
            r: Math.max(index === 0 ? 0 : MIN_SIDE_RADIUS, Number(sampled.r) || 0),
            h,
            section: 'profile',
            isTransition: false
        });
        lastH = h;
    });

    return profile;
}

export function cloneProfilePoints(points) {
    return JSON.parse(JSON.stringify(points || []));
}

/**
 * Assign each sampled profile point to the segment that owns it.
 *
 * A segment is the span points[i-1] -> points[i]; its owner is the upper anchor
 * points[i].id (matching the per-segment motif storage). Attribution is by
 * height band: the first segment whose top anchor height is >= the sample
 * height. This is mode-agnostic (works for bezier and straight-rounded) and
 * unambiguous for monotonic profiles; shared boundary anchors resolve to the
 * lower segment, which is exactly what the mesh run-splitter wants.
 */
function tagProfileWithSegments(profile, anchors) {
    if (!Array.isArray(anchors) || anchors.length < 2) return profile;

    const topOwnerId = anchors[anchors.length - 1].id;
    const bandOwner = (h) => {
        for (let i = 1; i < anchors.length; i++) {
            const hi = Math.max(Number(anchors[i - 1].h) || 0, Number(anchors[i].h) || 0);
            if (h <= hi + EPSILON) return anchors[i].id;
        }
        return topOwnerId;
    };

    profile.forEach((point) => {
        point.segmentId = bandOwner(point.h);
    });
    return profile;
}

export function sampleVesselV2Profile(state, options = {}) {
    const samplesPerSegment = options.samplesPerSegment || 28;
    const samplesPerCorner = options.samplesPerCorner || 14;
    const points = cloneProfilePoints(state?.profile?.points);
    const preserveOverlaps = state?.profile?.allowFooterOverlap === true;
    const validation = validateVesselV2Profile(state);

    if (validation.errors.length > 0) {
        return { profile: [], validation };
    }

    if (state?.profile?.mode === 'straight-rounded') {
        const profile = toProfileSamples(sampleRoundedPolyline(points, samplesPerCorner), { preserveOverlaps });
        return { profile: tagProfileWithSegments(profile, points), validation };
    }

    const rawProfile = [];
    for (let i = 1; i < points.length; i++) {
        const start = points[i - 1];
        const end = points[i];
        const { p0, p1, p2, p3 } = segmentControls(start, end);
        const curved = Boolean(start.outHandle || end.inHandle);
        const steps = curved ? samplesPerSegment : 1;

        for (let step = 0; step <= steps; step++) {
            if (i > 1 && step === 0) continue;
            const t = step / steps;
            const sampled = curved ? cubicAt(t, p0, p1, p2, p3) : {
                r: p0.r + (p3.r - p0.r) * t,
                h: p0.h + (p3.h - p0.h) * t
            };
            pushPoint(rawProfile, sampled);
        }
    }

    const profile = toProfileSamples(rawProfile, { preserveOverlaps });
    return { profile: tagProfileWithSegments(profile, points), validation };
}

export function buildVesselV2InnerProfile(outerProfile, wallThickness) {
    const thickness = Math.max(0.5, Number(wallThickness) || 3);

    return outerProfile.map((point, index) => ({
        r: index === 0 ? 0 : Math.max(0, point.r - thickness),
        h: point.h,
        section: 'profile-inner',
        isTransition: false
    }));
}

export function validateVesselV2Profile(state) {
    const errors = [];
    const warnings = [];
    const points = state?.profile?.points || [];
    const wallThickness = Math.max(0.5, Number(state?.global?.wallThickness) || 3);
    const allowFooterOverlap = state?.profile?.allowFooterOverlap === true;

    if (!Array.isArray(points) || points.length < 2) {
        errors.push('Add at least one profile point beyond the centerline start.');
        return { valid: false, errors, warnings };
    }

    const first = points[0];
    if (Math.abs((first?.r || 0)) > EPSILON || (!allowFooterOverlap && Math.abs((first?.h || 0)) > EPSILON)) {
        errors.push(allowFooterOverlap
            ? 'The first point must stay on the centerline.'
            : 'The first point must stay locked to the centerline base.'
        );
    }

    for (let i = 0; i < points.length; i++) {
        const point = points[i];
        if (!Number.isFinite(Number(point.r)) || !Number.isFinite(Number(point.h))) {
            errors.push('Profile contains a non-numeric point.');
            break;
        }

        if (point.r < -EPSILON) {
            errors.push('Profile radius cannot cross left of the centerline.');
        }

        if (!allowFooterOverlap && i > 0 && point.h + EPSILON < points[i - 1].h) {
            errors.push('Profile points must move upward or stay level from the base.');
        }
    }

    const sideRadii = points
        .slice(1)
        .filter((point) => Number(point.r) > MIN_SIDE_RADIUS)
        .map((point) => Number(point.r));

    if (sideRadii.length === 0) {
        errors.push('Profile needs at least one point outside the centerline.');
    }

    const minRadius = Math.min(...sideRadii);
    if (Number.isFinite(minRadius) && minRadius <= wallThickness + MIN_SIDE_RADIUS) {
        errors.push('Wall thickness exceeds the available radius in part of the profile.');
    }

    const totalHeight = Math.max(...points.map((point) => Number(point.h) || 0));
    if (totalHeight < 20) {
        warnings.push('Profile height is very short for a printable vessel.');
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
}
