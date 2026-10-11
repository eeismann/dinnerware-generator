/**
 * Surface Pattern Engine
 * Generates decorative surface motifs (vertical/horizontal/diagonal lines,
 * cross-hatch, knurling) on revolved surfaces via height-field displacement.
 *
 * Every motif is a periodic 2D height field over the unwrapped surface domain
 * (theta around the circumference, t = arc length along the profile). Vertices
 * of a densified lathe grid are displaced along the profile's outward normal.
 *
 * The sampling grid is aligned to the pattern field so ridges come out clean
 * and straight instead of aliased:
 *  - Radial segment counts are chosen commensurate with the ridge count
 *    (a multiple of it), so every ridge is sampled at identical phases.
 *  - Diagonal ridges use a sheared (helical) grid whose columns follow
 *    constant-phase lines: each ridge is an extruded strip with mesh edges
 *    running exactly along its flanks. The total shear twist is snapped to a
 *    whole number of ring steps so boundary rings still weld to neighbours.
 *  - Cross-hatch and knurl keep an axis-aligned grid but with uniform rows
 *    whose per-row phase advance is an exact rational fraction of the column
 *    quantum: every lattice cell is sampled identically (no moiré).
 *  - Horizontal patterns get rows inserted exactly at waveform breakpoints.
 *
 * The generated geometry replicates THREE.LatheGeometry's exact conventions
 * (phi sampling x = r*sin(phi) / z = r*cos(phi), (dy, -dx) profile normals,
 * index winding) so patterned segments merge watertight with the surrounding
 * smooth lathe segments. Displacement fades to exactly zero at both profile
 * ends, guaranteeing boundary rings coincide with adjacent segments.
 */

import * as THREE from 'three';

const TWO_PI = Math.PI * 2;

// Resolution limits
const BASE_RADIAL_SEGMENTS = 64;
const MIN_PATTERN_RADIAL_SEGMENTS = 96;
const MAX_PATTERN_RADIAL_SEGMENTS = 960;
const SEGMENTS_PER_RIDGE = 6;
// Under the segment cap a commensurate grid may run this lean per ridge
const MIN_SEGMENTS_PER_RIDGE = 4;

// Axial (along-profile) sampling
const AXIAL_STEP_VERTICAL_ONLY = 1.5;  // vertical lines have no axial variation
const AXIAL_STEP_MIN = 0.3;
const AXIAL_STEP_MAX = 1.2;
// Max helix twist between adjacent rows (radians of theta): keeps the sheared
// columns' straight-chord approximation of the helix tight
const MAX_TWIST_PER_ROW = 0.1;
// Interior profile vertices turning more than this are preserved as rows
const KINK_THRESHOLD_RAD = (3 * Math.PI) / 180;
// Minimum spacing between row stations (mm), well above the STL weld quantum
const MIN_ROW_SPACING = 0.02;

// Types whose height field varies around the circumference
const CIRCUMFERENTIAL_TYPES = ['vertical', 'diagonal', 'crosshatch', 'knurl'];

/**
 * Extract and normalize pattern parameters for one surface from resolved
 * item parameters. Returns null when the surface is smooth.
 * @param {Object} params - Resolved parameters from parameterResolver
 * @param {string} prefix - 'wall' or 'footring'
 */
export function getPatternParams(params, prefix) {
    const type = params[`${prefix}PatternType`];
    if (!type || type === 'none') return null;

    const depth = params[`${prefix}PatternDepth`];
    if (!depth || depth < 0.05) return null;

    const nominalCount = Math.max(1, Math.round(params[`${prefix}PatternCount`] || 48));
    const nominalDuty = Math.min(0.9, Math.max(0.1, (params[`${prefix}PatternLineWidth`] || 50) / 100));
    let count = nominalCount;
    let duty = nominalDuty;

    // A global wall count is a reference count, not a literal repetition
    // count on every object. Scale circumferential motifs by diameter so their
    // physical pitch matches across the set. Compensate duty after integer
    // count rounding so physical ridge width remains uniform too.
    if (prefix === 'wall' && CIRCUMFERENTIAL_TYPES.includes(type)) {
        const diameter = Number(params.dimensions?.diameter);
        const referenceDiameter = Number(params.patternReferenceDiameter);
        if (diameter > 0 && referenceDiameter > 0) {
            count = Math.max(1, Math.round(nominalCount * diameter / referenceDiameter));
            const referencePitch = (Math.PI * referenceDiameter) / nominalCount;
            const effectivePitch = (Math.PI * diameter) / count;
            duty = Math.min(0.9, Math.max(0.1, nominalDuty * referencePitch / effectivePitch));
        }
    }

    return {
        type,
        depth,
        relief: params[`${prefix}PatternRelief`] === 'recessed' ? 'recessed' : 'raised',
        count,
        pitch: Math.max(0.5, params[`${prefix}PatternPitch`] || 4),
        // duty cycle 0..1 (fraction of the period occupied by the ridge)
        duty,
        profile: params[`${prefix}PatternProfile`] || 'rounded',
        angleRad: (Math.min(75, Math.max(15, params[`${prefix}PatternAngle`] || 45)) * Math.PI) / 180,
        dirSign: params[`${prefix}PatternDirection`] === 'left' ? -1 : 1
    };
}

/**
 * Normalize a per-segment motif object (flat fields, no wall/footring prefix)
 * into the internal pattern shape. Mirrors getPatternParams() for the Vessel V2
 * per-segment model. Returns null when the segment is smooth.
 * @param {Object} motif - { type, depth, relief, count, pitch, lineWidth, profile, angle, direction }
 */
export function getMotifPattern(motif) {
    if (!motif) return null;
    const type = motif.type;
    if (!type || type === 'none') return null;

    const depth = Number(motif.depth);
    if (!depth || depth < 0.05) return null;

    return {
        type,
        depth,
        relief: motif.relief === 'recessed' ? 'recessed' : 'raised',
        count: Math.max(1, Math.round(motif.count || 48)),
        pitch: Math.max(0.5, motif.pitch || 4),
        duty: Math.min(0.9, Math.max(0.1, (motif.lineWidth || 50) / 100)),
        profile: motif.profile || 'rounded',
        angleRad: (Math.min(75, Math.max(15, motif.angle || 45)) * Math.PI) / 180,
        dirSign: motif.direction === 'left' ? -1 : 1
    };
}

function gcd(a, b) {
    while (b) {
        const t = a % b;
        a = b;
        b = t;
    }
    return a;
}

function lcm(a, b) {
    return (a / gcd(a, b)) * b;
}

/**
 * Smallest radial segment count that is a multiple of 8 (cap/ring helper
 * contract) and of every given ridge count — so all ridges are sampled at
 * identical phases (uniform widths, no ridge-to-ridge drift). Meets the
 * density floor when it fits under the cap, otherwise runs as lean as
 * MIN_SEGMENTS_PER_RIDGE. Returns null when no commensurate count fits.
 */
function commensurateSegments(counts, densityFloor) {
    let base = 8;
    for (const count of counts) {
        base = lcm(base, count);
        if (base > MAX_PATTERN_RADIAL_SEGMENTS) return null;
    }
    let segments = base * Math.ceil(densityFloor / base);
    if (segments > MAX_PATTERN_RADIAL_SEGMENTS) {
        segments = base * Math.floor(MAX_PATTERN_RADIAL_SEGMENTS / base);
        const minAcceptable = Math.max(
            MIN_PATTERN_RADIAL_SEGMENTS,
            Math.max(...counts) * MIN_SEGMENTS_PER_RIDGE
        );
        if (segments < minAcceptable) return null;
    }
    return segments;
}

/**
 * Radial segment count for an item. All lathe segments of an item must share
 * one radial resolution so boundary rings coincide exactly (the STL validator
 * welds by position and rejects boundary edges). Dense enough to resolve the
 * finest circumferential pattern in play, and — whenever it fits under the
 * cap — an exact multiple of every ridge count so ridges sample identically.
 * Earlier arguments win when no common multiple fits (the wall pattern is
 * passed first and dominates the visible surface).
 */
export function computePatternRadialSegments(...patterns) {
    let floor = BASE_RADIAL_SEGMENTS;
    const circCounts = [];
    patterns.forEach(pattern => {
        if (!pattern) return;
        floor = Math.max(floor, MIN_PATTERN_RADIAL_SEGMENTS);
        if (CIRCUMFERENTIAL_TYPES.includes(pattern.type)) {
            circCounts.push(pattern.count);
            floor = Math.max(floor, Math.min(
                MAX_PATTERN_RADIAL_SEGMENTS,
                Math.max(MIN_PATTERN_RADIAL_SEGMENTS, pattern.count * SEGMENTS_PER_RIDGE)
            ));
        }
    });

    for (let take = circCounts.length; take >= 1; take--) {
        const segments = commensurateSegments(circCounts.slice(0, take), floor);
        if (segments !== null) return segments;
    }

    // Cap/ring helpers sample circles as (cos, sin) while LatheGeometry uses
    // (sin, cos); the two vertex sets only coincide when the segment count is
    // a multiple of 4. Quantize to 8 to stay safe.
    return Math.ceil(floor / 8) * 8;
}

/**
 * Periodic ridge waveform. phase is in cycles (period 1). Returns 0..1.
 * The ridge occupies the center `duty` fraction of each period.
 */
function ridgeWave(phase, profile, duty) {
    const f = phase - Math.floor(phase);
    // Normalized distance from ridge center: 0 at center, 1 at ridge edge
    const d = Math.abs(f - 0.5) / (duty / 2);
    if (d >= 1) return 0;

    switch (profile) {
        case 'v':
            return 1 - d;
        case 'square':
            // Trapezoid with a 15% shoulder so side walls are not perfectly
            // vertical (cleaner normals, printable ridge flanks)
            return Math.min(1, (1 - d) / 0.15);
        case 'rounded':
        default:
            // Half-cosine bump: zero slope at center and edges
            return 0.5 * (1 + Math.cos(d * Math.PI));
    }
}

/**
 * Height field amplitude (0..1) at a point on the unwrapped surface.
 * Exported for the Cast Form Generator: molds of platform-generated vessels
 * evaluate the same field analytically on the cavity surface (Tier 1),
 * instead of reconstructing it from mesh samples.
 * @param {number} theta - Angle around circumference (radians)
 * @param {number} t - Arc length along the profile (mm)
 * @param {number} meanRadius - Mean surface radius (mm), for helix phase
 * @param {Object} p - Normalized pattern params from getPatternParams
 */
export function patternAmplitude(theta, t, meanRadius, p) {
    const cyc = theta / TWO_PI; // 0..1 around the circumference

    // Helical phase for diagonal-family motifs. Integer `count` starts around
    // the circumference guarantees the field closes seamlessly at theta = 2*PI.
    const diagPhase = (dir) =>
        p.count * (cyc + (dir * t * Math.tan(p.angleRad)) / (TWO_PI * meanRadius));

    switch (p.type) {
        case 'vertical':
            return ridgeWave(cyc * p.count, p.profile, p.duty);
        case 'horizontal':
            return ridgeWave(t / p.pitch, p.profile, p.duty);
        case 'diagonal':
            return ridgeWave(diagPhase(p.dirSign), p.profile, p.duty);
        case 'crosshatch':
            return Math.max(
                ridgeWave(diagPhase(1), p.profile, p.duty),
                ridgeWave(diagPhase(-1), p.profile, p.duty)
            );
        case 'knurl':
            // Full-coverage triangle waves intersected -> diamond pyramids
            return Math.min(
                ridgeWave(diagPhase(1), 'v', 1),
                ridgeWave(diagPhase(-1), 'v', 1)
            );
        default:
            return 0;
    }
}

/**
 * Smoothstep fade envelope: 0 at both profile ends, 1 in the interior.
 * Zero displacement at the ends keeps boundary rings coincident with
 * adjacent smooth segments (watertight merge). Exported alongside
 * patternAmplitude so mold generation reproduces the same edge fades.
 */
export function fadeEnvelope(t, length, fadeStart, fadeEnd) {
    const smooth = (x) => {
        const c = Math.min(1, Math.max(0, x));
        return c * c * (3 - 2 * c);
    };
    // Fades always at least a hair wide so the envelope reaches exactly 0
    const fIn = Math.max(0.4, Math.min(fadeStart, length * 0.45));
    const fOut = Math.max(0.4, Math.min(fadeEnd, length * 0.45));
    return smooth(t / fIn) * smooth((length - t) / fOut);
}

/**
 * Optional vertical-region envelope used when a wall inset divides one
 * patternable band into upper and lower portions. Undefined bounds leave that
 * side unrestricted; defined bounds fade cleanly to zero at the boundary.
 */
export function rangeFadeEnvelope(y, minY, maxY, fade = 1.5) {
    const smooth = (x) => {
        const c = Math.min(1, Math.max(0, x));
        return c * c * (3 - 2 * c);
    };
    const width = Math.max(0.4, fade);
    const lower = Number.isFinite(minY) ? smooth((y - minY) / width) : 1;
    const upper = Number.isFinite(maxY) ? smooth((maxY - y) / width) : 1;
    return lower * upper;
}

/**
 * Densify a profile polyline so the grid can carry the pattern.
 * Original points are preserved exactly (boundary continuity).
 * Returns { points, arcLengths, totalLength }.
 */
export function resampleProfile(points, maxStep) {
    const out = [points[0].clone()];
    for (let i = 1; i < points.length; i++) {
        const a = points[i - 1];
        const b = points[i];
        const segLen = a.distanceTo(b);
        const divisions = Math.max(1, Math.ceil(segLen / maxStep));
        for (let d = 1; d < divisions; d++) {
            const s = d / divisions;
            out.push(new THREE.Vector2(
                a.x + (b.x - a.x) * s,
                a.y + (b.y - a.y) * s
            ));
        }
        out.push(b.clone());
    }

    const arcLengths = [0];
    let total = 0;
    for (let i = 1; i < out.length; i++) {
        total += out[i - 1].distanceTo(out[i]);
        arcLengths.push(total);
    }

    return { points: out, arcLengths, totalLength: total };
}

/**
 * Cumulative arc lengths along a polyline.
 */
function polylineArcs(points) {
    const cumulative = [0];
    let total = 0;
    for (let i = 1; i < points.length; i++) {
        total += points[i - 1].distanceTo(points[i]);
        cumulative.push(total);
    }
    return { cumulative, totalLength: total };
}

/**
 * Arc-length stations of interior polyline vertices with a real direction
 * change. Uniform row sampling drops interior vertices (their chordal error
 * is negligible on the smooth curves that feed patterned bands); genuine
 * corners are kept as explicit rows so the silhouette survives.
 */
function kinkStations(points, cumulative) {
    const stations = [];
    const cosThreshold = Math.cos(KINK_THRESHOLD_RAD);
    for (let i = 1; i < points.length - 1; i++) {
        const ax = points[i].x - points[i - 1].x;
        const ay = points[i].y - points[i - 1].y;
        const bx = points[i + 1].x - points[i].x;
        const by = points[i + 1].y - points[i].y;
        const la = Math.hypot(ax, ay);
        const lb = Math.hypot(bx, by);
        if (la < 1e-9 || lb < 1e-9) continue;
        if ((ax * bx + ay * by) / (la * lb) < cosThreshold) {
            stations.push(cumulative[i]);
        }
    }
    return stations;
}

/**
 * Waveform breakpoint offsets (fractions of one period) where the ridge
 * profile changes slope. Rows landing exactly on these render horizontal
 * ridge flanks crisply. Rounded is C1-continuous — nothing to pin.
 */
function ridgeBreakpointFractions(profile, duty) {
    const w = duty / 2;
    switch (profile) {
        case 'square':
            // Flank feet and shoulder tops of the trapezoid
            return [0.5 - w, 0.5 - w * 0.85, 0.5 + w * 0.85, 0.5 + w];
        case 'v':
            return [0.5 - w, 0.5, 0.5 + w];
        default:
            return [];
    }
}

/**
 * Sample a profile polyline at arc-length stations: uniform steps (or an
 * exact division count) plus optional must-include stations. First and last
 * points are preserved exactly (boundary continuity). Returns
 * { points, arcLengths, totalLength }.
 */
function sampleProfileAtStations(points, cumulative, totalLength, { step, divisions, extraStations = [] }) {
    const div = divisions ?? Math.max(1, Math.ceil(totalLength / step));
    const raw = [];
    for (let d = 1; d < div; d++) raw.push((d / div) * totalLength);
    extraStations.forEach(t => {
        if (t > MIN_ROW_SPACING && t < totalLength - MIN_ROW_SPACING) raw.push(t);
    });
    raw.sort((a, b) => a - b);

    const arcLengths = [0];
    for (const t of raw) {
        if (t - arcLengths[arcLengths.length - 1] >= MIN_ROW_SPACING
            && t <= totalLength - MIN_ROW_SPACING) {
            arcLengths.push(t);
        }
    }
    arcLengths.push(totalLength);

    const out = [];
    let seg = 0;
    for (const t of arcLengths) {
        while (seg < points.length - 2 && cumulative[seg + 1] < t) seg++;
        const span = cumulative[seg + 1] - cumulative[seg];
        const s = span > 0 ? Math.min(1, Math.max(0, (t - cumulative[seg]) / span)) : 0;
        out.push(new THREE.Vector2(
            points[seg].x + (points[seg + 1].x - points[seg].x) * s,
            points[seg].y + (points[seg + 1].y - points[seg].y) * s
        ));
    }
    out[0] = points[0].clone();
    out[out.length - 1] = points[points.length - 1].clone();

    return { points: out, arcLengths, totalLength };
}

/**
 * Grid plan for one patterned band: the effective pattern (angle snapped so
 * grid and field are exactly commensurate), the row sampling spec, and the
 * total shear twist for diagonal ridges.
 *
 * The snaps change the effective helix angle by well under a degree — far
 * below visibility — and are pure functions of (pattern, meanRadius,
 * totalLength, radialSegments), so external consumers (Tier-1 analytic mold
 * relief) reproduce the exact same field via computeEffectivePattern().
 */
function planPatternGrid(pattern, meanRadius, totalLength, radialSegments) {
    const plan = {
        pattern,
        twistTotal: 0,
        rows: {
            step: AXIAL_STEP_VERTICAL_ONLY,
            divisions: null,
            useKinks: true,
            breakFractions: null
        }
    };
    if (!(totalLength > 0) || !(meanRadius > 0) || !(radialSegments > 0)) return plan;

    switch (pattern.type) {
        case 'vertical':
            // Amplitude constant along the profile; rows only follow shape
            return plan;

        case 'horizontal':
            plan.rows.step = Math.min(AXIAL_STEP_MAX, Math.max(AXIAL_STEP_MIN, pattern.pitch / 8));
            plan.rows.breakFractions = ridgeBreakpointFractions(pattern.profile, pattern.duty);
            return plan;

        case 'diagonal': {
            // Ridge-aligned shear: grid columns follow constant-phase helices,
            // so every ridge is a clean extruded strip with its flanks on
            // mesh edges. Snap the total twist to a whole number of ring
            // steps so the far boundary ring's vertex set coincides with the
            // neighbouring smooth segment's ring (watertight weld).
            const ringStep = TWO_PI / radialSegments;
            const twistExact = (Math.tan(pattern.angleRad) * totalLength) / meanRadius;
            const steps = Math.round(twistExact / ringStep);
            const twist = steps * ringStep;
            // steps === 0 only on sub-visible slivers of band; the pattern
            // degenerates to straight vertical ridges there, which is clean.
            plan.pattern = {
                ...pattern,
                angleRad: steps === 0 ? 0 : Math.atan((twist * meanRadius) / totalLength)
            };
            plan.twistTotal = -pattern.dirSign * twist;
            const twistRate = twist / totalLength; // rad of theta per mm
            plan.rows.step = twistRate * AXIAL_STEP_MAX > MAX_TWIST_PER_ROW
                ? Math.max(0.2, MAX_TWIST_PER_ROW / twistRate)
                : AXIAL_STEP_MAX;
            return plan;
        }

        case 'crosshatch':
        case 'knurl': {
            // Two crossing helix families cannot both be shear-aligned. Keep
            // the grid axis-aligned but commensurate in both directions:
            // columns are a multiple of the ridge count, and uniform rows
            // advance the field by an exact rational multiple k/(m*q) of the
            // column phase quantum. Every lattice cell then samples the field
            // identically — a regular texture instead of moiré.
            plan.rows.useKinks = false;
            const circumferentialPitch = (TWO_PI * meanRadius) / pattern.count;
            const axialPeriod = circumferentialPitch / Math.tan(pattern.angleRad);
            const m = radialSegments / pattern.count;
            if (!Number.isInteger(m)) {
                // Non-commensurate columns (extreme counts over the segment
                // cap): fall back to plain dense rows
                plan.rows.step = Math.min(AXIAL_STEP_MAX, Math.max(AXIAL_STEP_MIN, axialPeriod / 8));
                return plan;
            }
            const q = Math.max(1, Math.ceil(axialPeriod / (m * AXIAL_STEP_MAX)));
            const hBase = axialPeriod / (m * q);
            const kLo = Math.max(1, Math.ceil(AXIAL_STEP_MIN / hBase));
            const kHi = Math.max(kLo, Math.floor(AXIAL_STEP_MAX / hBase));
            const k = Math.min(kHi, Math.max(kLo, Math.round(0.75 / hBase)));
            const divisions = Math.max(2, Math.round(totalLength / (k * hBase)));
            // Rows must span the band exactly; snap the effective angle so
            // per-row phase advance stays exactly k/(m*q) after rounding.
            const hExact = totalLength / divisions;
            const tanEff = (k / (m * q)) * (circumferentialPitch / hExact);
            plan.pattern = { ...pattern, angleRad: Math.atan(tanEff) };
            plan.rows.step = null;
            plan.rows.divisions = divisions;
            return plan;
        }

        default:
            return plan;
    }
}

/**
 * Effective pattern params actually rendered on a band: the grid snaps the
 * helix angle of diagonal-family motifs by a sub-degree amount to keep grid
 * and field commensurate. Pure function of its inputs — the Cast Form
 * Generator's Tier-1 analytic relief calls this with the band metadata so
 * mold cavities stay exactly phase-locked to the vessel.
 * @param {Object} pattern - Normalized pattern params
 * @param {number} meanRadius - Mean radius of the band's profile points (mm)
 * @param {number} bandArcLength - Arc length of the band's profile (mm)
 * @param {number} radialSegments - The item's shared radial resolution
 */
export function computeEffectivePattern(pattern, meanRadius, bandArcLength, radialSegments) {
    if (!pattern) return pattern;
    return planPatternGrid(pattern, meanRadius, bandArcLength, radialSegments).pattern;
}

/**
 * Build a patterned lathe segment. Drop-in replacement for
 * `new THREE.LatheGeometry(points, radialSegments)` with the height field
 * displaced along the profile normal.
 *
 * @param {THREE.Vector2[]} points - Profile polyline (r, y), either direction
 * @param {number} radialSegments - Must match the item's other segments
 * @param {Object} pattern - From getPatternParams
 * @param {Object} opts
 * @param {number} opts.fadeStart - Fade-in length (mm) at the t=0 profile end
 * @param {number} opts.fadeEnd - Fade-out length (mm) at the far profile end
 * @param {number} [opts.maxRecessDepth] - Clamp for recessed depth (mm)
 * @param {number} [opts.activeYMin] - Optional lower bound for displacement
 * @param {number} [opts.activeYMax] - Optional upper bound for displacement
 * @param {number} [opts.activeYFade] - Fade distance at an active-region bound
 * @returns {THREE.BufferGeometry}
 */
export function createPatternedLatheGeometry(points, radialSegments, pattern, opts = {}) {
    const fadeStart = opts.fadeStart ?? 1.5;
    const fadeEnd = opts.fadeEnd ?? 1.5;

    // Effective signed depth. Recessed patterns must not gut the wall.
    let depth = pattern.depth;
    if (pattern.relief === 'recessed' && Number.isFinite(opts.maxRecessDepth)) {
        depth = Math.min(depth, Math.max(0, opts.maxRecessDepth));
    }
    const reliefSign = pattern.relief === 'recessed' ? -1 : 1;

    // Mean radius drives helix phase and grid planning
    let meanRadius = 0;
    points.forEach(p => { meanRadius += p.x; });
    meanRadius = Math.max(1, meanRadius / points.length);

    if (depth <= 0) {
        return new THREE.LatheGeometry(points, radialSegments);
    }

    const { cumulative, totalLength } = polylineArcs(points);
    if (totalLength < 1 || points.length < 2) {
        return new THREE.LatheGeometry(points, radialSegments);
    }

    const plan = planPatternGrid(pattern, meanRadius, totalLength, radialSegments);
    const eff = plan.pattern;

    const extraStations = plan.rows.useKinks ? kinkStations(points, cumulative) : [];
    if (plan.rows.breakFractions && plan.rows.breakFractions.length > 0) {
        const periods = Math.floor(totalLength / eff.pitch) + 1;
        for (let p = 0; p <= periods; p++) {
            plan.rows.breakFractions.forEach(f => {
                extraStations.push((p + f) * eff.pitch);
            });
        }
    }

    const { points: profile, arcLengths } = sampleProfileAtStations(
        points, cumulative, totalLength,
        { step: plan.rows.step, divisions: plan.rows.divisions, extraStations }
    );
    const n = profile.length;
    if (n < 2) {
        return new THREE.LatheGeometry(points, radialSegments);
    }

    const profileNormals = computeProfileNormals(profile);

    // Profiles authored top-to-bottom (e.g. footring-from-fillet) yield
    // inward-pointing (dy, -dx) normals; flip displacement so "raised"
    // still moves away from the axis. Rendering normals/winding stay
    // LatheGeometry-compatible either way.
    let meanNr = 0;
    for (let i = 0; i < n; i++) meanNr += profileNormals[i * 2];
    const dispSign = meanNr < 0 ? -1 : 1;

    const envelopes = new Float32Array(n);
    for (let j = 0; j < n; j++) {
        envelopes[j] = fadeEnvelope(arcLengths[j], totalLength, fadeStart, fadeEnd)
            * rangeFadeEnvelope(
                profile[j].y,
                opts.activeYMin,
                opts.activeYMax,
                opts.activeYFade
            );
    }
    // Force exact zero displacement on boundary rows
    envelopes[0] = 0;
    envelopes[n - 1] = 0;

    // Amplitude layout: constant per column for vertical (no axial variation)
    // and diagonal (sheared columns follow the ridges), constant per row for
    // horizontal, full 2D field for the crossing lattices.
    let ampCol = null;
    let ampRow = null;
    if (eff.type === 'vertical' || eff.type === 'diagonal') {
        ampCol = new Float32Array(radialSegments + 1);
        for (let i = 0; i <= radialSegments; i++) {
            ampCol[i] = ridgeWave((eff.count * i) / radialSegments, eff.profile, eff.duty);
        }
    } else if (eff.type === 'horizontal') {
        ampRow = new Float32Array(n);
        for (let j = 0; j < n; j++) {
            ampRow[j] = ridgeWave(arcLengths[j] / eff.pitch, eff.profile, eff.duty);
        }
    }

    // Shear twist per row (diagonal only). The final row's twist is a whole
    // number of ring steps; compute it by index shift so those vertices land
    // bitwise on the neighbouring segment's ring positions.
    const twistTotal = plan.twistTotal;
    const twistSteps = twistTotal === 0
        ? 0
        : Math.round(twistTotal / (TWO_PI / radialSegments));

    // Generate vertices in LatheGeometry order: outer loop phi, inner loop profile
    const vertexCount = (radialSegments + 1) * n;
    const positions = new Float32Array(vertexCount * 3);

    let offset = 0;
    for (let i = 0; i <= radialSegments; i++) {
        const phi = (i / radialSegments) * TWO_PI;

        for (let j = 0; j < n; j++) {
            let theta;
            if (twistSteps === 0 || j === 0) {
                theta = phi;
            } else if (j === n - 1) {
                const shifted = (((i + twistSteps) % radialSegments) + radialSegments) % radialSegments;
                theta = (shifted / radialSegments) * TWO_PI;
            } else {
                theta = phi + twistTotal * (arcLengths[j] / totalLength);
            }
            const sin = Math.sin(theta);
            const cos = Math.cos(theta);

            let r = profile[j].x;
            let y = profile[j].y;

            const env = envelopes[j];
            if (env > 0) {
                let amp;
                if (ampCol) {
                    amp = ampCol[i];
                } else if (ampRow) {
                    amp = ampRow[j];
                } else {
                    amp = patternAmplitude(theta, arcLengths[j], meanRadius, eff);
                }
                if (amp > 0) {
                    const disp = dispSign * reliefSign * depth * env * amp;
                    r += profileNormals[j * 2] * disp;
                    y += profileNormals[j * 2 + 1] * disp;
                    if (r < 0.05) r = 0.05;
                }
            }

            positions[offset++] = r * sin;
            positions[offset++] = y;
            positions[offset++] = r * cos;
        }
    }

    // Indices with LatheGeometry's winding
    const IndexArray = vertexCount > 65535 ? Uint32Array : Uint16Array;
    const indices = new IndexArray(radialSegments * (n - 1) * 6);
    let k = 0;
    for (let i = 0; i < radialSegments; i++) {
        for (let j = 0; j < n - 1; j++) {
            const base = j + i * n;
            const a = base;
            const b = base + n;
            const c = base + n + 1;
            const d = base + 1;
            indices[k++] = a; indices[k++] = b; indices[k++] = d;
            indices[k++] = c; indices[k++] = d; indices[k++] = b;
        }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.computeVertexNormals();

    // The seam columns (phi = 0 and phi = 2*PI) are duplicate vertices, so
    // computeVertexNormals gives each a one-sided normal. Average the pairs
    // to remove the visible shading seam.
    const normals = geometry.getAttribute('normal');
    const lastCol = radialSegments * n;
    for (let j = 0; j < n; j++) {
        const a = j;
        const b = lastCol + j;
        let nx = normals.getX(a) + normals.getX(b);
        let ny = normals.getY(a) + normals.getY(b);
        let nz = normals.getZ(a) + normals.getZ(b);
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        nx /= len; ny /= len; nz /= len;
        normals.setXYZ(a, nx, ny, nz);
        normals.setXYZ(b, nx, ny, nz);
    }
    normals.needsUpdate = true;

    return geometry;
}

/**
 * Convenience: patterned geometry when a pattern is active, plain lathe
 * geometry otherwise.
 */
export function latheWithOptionalPattern(points, radialSegments, pattern, opts) {
    if (pattern) {
        return createPatternedLatheGeometry(points, radialSegments, pattern, opts);
    }
    return new THREE.LatheGeometry(points, radialSegments);
}

/**
 * Normalize raw pattern metadata (plain JSON, e.g. shipped to the Cast Form
 * Generator over postMessage) into the internal params shape consumed by
 * patternAmplitude. Mirrors getPatternParams but takes explicit fields
 * instead of prefixed resolver output. Returns null when inactive.
 */
export function normalizeRawPatternParams(raw) {
    if (!raw || !raw.type || raw.type === 'none') return null;
    const depth = raw.depth;
    if (!depth || depth < 0.05) return null;

    return {
        type: raw.type,
        depth,
        relief: raw.relief === 'recessed' ? 'recessed' : 'raised',
        count: Math.max(1, Math.round(raw.count || 48)),
        pitch: Math.max(0.5, raw.pitch || 4),
        duty: Math.min(0.9, Math.max(0.1, (raw.lineWidthPct || 50) / 100)),
        profile: raw.profile || 'rounded',
        angleRad: (Math.min(75, Math.max(15, raw.angleDeg || 45)) * Math.PI) / 180,
        dirSign: raw.direction === 'left' ? -1 : 1
    };
}

/**
 * Per-point 2D profile normals using LatheGeometry's exact convention:
 * segment normal = normalize(dy, -dx), interior points average the two
 * adjacent segment normals, endpoints take their single segment's normal.
 * Returns flat array [nx0, ny0, nx1, ny1, ...] in the (r, y) plane.
 */
function computeProfileNormals(points) {
    const n = points.length;
    const segNormals = [];
    for (let i = 0; i < n - 1; i++) {
        const dx = points[i + 1].x - points[i].x;
        const dy = points[i + 1].y - points[i].y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        segNormals.push(dy / len, -dx / len);
    }

    const normals = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
        let nx, ny;
        if (i === 0) {
            nx = segNormals[0];
            ny = segNormals[1];
        } else if (i === n - 1) {
            nx = segNormals[(n - 2) * 2];
            ny = segNormals[(n - 2) * 2 + 1];
        } else {
            nx = segNormals[(i - 1) * 2] + segNormals[i * 2];
            ny = segNormals[(i - 1) * 2 + 1] + segNormals[i * 2 + 1];
        }
        const len = Math.sqrt(nx * nx + ny * ny) || 1;
        normals[i * 2] = nx / len;
        normals[i * 2 + 1] = ny / len;
    }
    return normals;
}
