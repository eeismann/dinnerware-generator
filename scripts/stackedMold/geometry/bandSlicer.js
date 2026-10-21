/**
 * Stacked Cylinder Mold - Band Slicer
 *
 * Pure port of `analyze()` from stacked-cylinder-mold/concept.html (the
 * reference prototype). Slices a ware's outer profile r(z), at mold size, into
 * casting units: a footer, monotonic ring bands (or split bands where a ring
 * cannot release the ware) and a well collar. No Three.js; Node-testable.
 *
 * One rule settles all three overhang questions. Each ring unit is printed and
 * poured with its band's wide end on the bed: the core then narrows upward
 * (prints without supports) and the set plaster can only slide toward the
 * narrow end, straight up. So `dec` bands (r shrinks upward) pour upright and
 * `inc` bands pour inverted. Ware release then decides ring vs split.
 *
 * Profiles:
 *   - makeControlProfile(pts): monotone cubic through [z, r] control points,
 *     extrema only at control points (the prototype's FORMS).
 *   - makeSampledProfile(samples): piecewise-linear through dense { z, r }
 *     samples (meshes, vessel projects), turning points found with a
 *     prominence threshold so facet noise never cuts a band.
 */

import { resolveSleeveHeight } from './kitSpec.js';

export const SLICER_DEFAULTS = Object.freeze({
    plasterMin: 25,     // mm of plaster outside the widest point
    footerT: 30,        // footer thickness below the ware's base
    footSeam: 6,        // foot seam height when the base has no crease (the prototype's fixed seam)
    seamAtCrease: true, // put the foot seam on the foot/wall crease, so the next wall has one angle
    footSeamMax: 25,    // highest crease (mm above the base) the seam may move to
    creaseDeg: 20,      // slope change that counts as a crease
    // Units are only cut for height when their printed parts would not fit the
    // printer (fewest mold sections). The concept prototype capped rings at
    // 90 mm and splits at 180 mm; pass those to reproduce its table.
    maxRingH: 250,      // optional cap; a ring core prints standing
    maxSplitH: 250,     // optional cap; a split insert prints lying along the bed
    bed: 256,           // printer build height (mm): ring cores stand
    bedXY: 256,         // printer bed's longer side (mm): split inserts lie
    sleeveH: null,      // kit sleeve height: units must fit inside it under the lid
    lidT: 8,            // drop-in lid thickness
    footAbsorbMax: 25,  // a first ring this short folds into the footer when the footer can release it
    raiseSeamForRecess: true, // lift the foot seam above a deeper foot recess (the base flaring to it)
    kitDiameter: 'fitted', // 'fitted' (prototype) | 'auto' (smallest standard size) | a standard diameter
    kitSeries: null,    // standard diameters for 'auto'
    wellH: 30,          // well collar height
    ledgeMin: 6.35,     // ≥ ¼″ pooling ledge between lip and bore
    minDraftDeg: 1,     // slopes below this count as no draft
    maxFlatRun: 12,     // a no-draft run longer than this forces a split
    keyInset: 13,       // key circle radius = R − keyInset
    minRingH: 15,       // a shorter ring merges into a neighbouring split (keys need the height)
    turnProminence: 0.5 // sampled profiles: min radius swing (mm) for a turning point
});

const STEP = 0.5;

/* ---------- profiles ---------- */

/** Monotone cubic through control points [[z, r], ...] (prototype makeProfile). */
export function makeControlProfile(pts) {
    const n = pts.length;
    const xs = pts.map(p => p[0]);
    const ys = pts.map(p => p[1]);
    const d = [];
    const m = new Array(n);
    for (let i = 0; i < n - 1; i++) d[i] = (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]);
    m[0] = d[0];
    m[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
        if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
        const a = m[i] / d[i];
        const b = m[i + 1] / d[i];
        const h = a * a + b * b;
        if (h > 9) {
            const t = 3 / Math.sqrt(h);
            m[i] = t * a * d[i];
            m[i + 1] = t * b * d[i];
        }
    }
    const r = (z) => {
        z = Math.max(xs[0], Math.min(xs[n - 1], z));
        let i = 0;
        while (i < n - 2 && z > xs[i + 1]) i++;
        const hh = xs[i + 1] - xs[i];
        const t = (z - xs[i]) / hh;
        const t2 = t * t;
        const t3 = t2 * t;
        return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * hh * m[i]
            + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * hh * m[i + 1];
    };
    // Turning points sit exactly on control points (belly = max, waist = min)
    const turns = [];
    for (let i = 1; i < n - 1; i++) {
        const a = ys[i] - ys[i - 1];
        const b = ys[i + 1] - ys[i];
        if (a * b < 0) turns.push({ z: xs[i], r: ys[i], kind: a > 0 ? 'belly' : 'waist' });
    }
    return { r, H: xs[n - 1], turns, underside: null, kind: 'control' };
}

/**
 * Piecewise-linear profile through dense samples.
 * @param {Array<{z:number, r:number}>} samples - outer profile, z ascending from 0 (base) to H (lip)
 * @param {Object} [options]
 * @param {Array<{rho:number, z:number}>} [options.underside] - base underside from the axis out
 * @param {number} [options.prominence] - min radius swing for a turning point
 */
export function makeSampledProfile(samples, { underside = null, prominence = SLICER_DEFAULTS.turnProminence } = {}) {
    const pts = samples
        .filter(s => Number.isFinite(s.z) && Number.isFinite(s.r))
        .sort((a, b) => a.z - b.z);
    if (pts.length < 2) throw new Error('The profile needs at least two samples.');
    const z0 = pts[0].z;
    const zs = pts.map(p => p.z - z0);
    const rs = pts.map(p => Math.max(0, p.r));
    const n = zs.length;
    const r = (z) => {
        if (z <= zs[0]) return rs[0];
        if (z >= zs[n - 1]) return rs[n - 1];
        let lo = 0;
        let hi = n - 1;
        while (hi - lo > 1) {
            const mid = (lo + hi) >> 1;
            if (zs[mid] <= z) lo = mid; else hi = mid;
        }
        const span = zs[hi] - zs[lo];
        const t = span > 0 ? (z - zs[lo]) / span : 0;
        return rs[lo] + (rs[hi] - rs[lo]) * t;
    };
    return {
        r,
        H: zs[n - 1],
        turns: findTurns(zs, rs, prominence),
        underside: underside ? underside.map(p => ({ rho: p.rho, z: p.z - z0 })) : null,
        samples: zs.map((z, i) => ({ z, r: rs[i] })),
        kind: 'sampled'
    };
}

/**
 * Hysteresis extremum finder: a belly (max) or waist (min) is confirmed once
 * the profile swings back by `prominence`. A plateau's turning point is its
 * midpoint, so a flat top is cut through the middle.
 */
export function findTurns(zs, rs, prominence) {
    const turns = [];
    const n = zs.length;
    if (n < 3) return turns;
    const flatTol = 0.002;
    let dir = 0; // +1 rising, -1 falling, 0 unknown
    let extIdx = 0;
    let extEnd = 0; // last index of a plateau at the running extremum
    for (let i = 1; i < n; i++) {
        if (dir === 0) {
            if (rs[i] - rs[extIdx] >= prominence) dir = 1;
            else if (rs[extIdx] - rs[i] >= prominence) dir = -1;
            if (dir !== 0) { extIdx = i; extEnd = i; }
            continue;
        }
        if (dir > 0) {
            if (rs[i] > rs[extIdx] + flatTol) { extIdx = i; extEnd = i; }
            else if (rs[i] >= rs[extIdx] - flatTol) extEnd = i;
            else if (rs[extIdx] - rs[i] >= prominence) {
                const zt = (zs[extIdx] + zs[extEnd]) / 2;
                turns.push({ z: zt, r: rs[extIdx], kind: 'belly' });
                dir = -1; extIdx = i; extEnd = i;
            }
        } else {
            if (rs[i] < rs[extIdx] - flatTol) { extIdx = i; extEnd = i; }
            else if (rs[i] <= rs[extIdx] + flatTol) extEnd = i;
            else if (rs[i] - rs[extIdx] >= prominence) {
                const zt = (zs[extIdx] + zs[extEnd]) / 2;
                turns.push({ z: zt, r: rs[extIdx], kind: 'waist' });
                dir = 1; extIdx = i; extEnd = i;
            }
        }
    }
    return turns;
}

/** Scale a sampled outer profile (and underside) to mold size: 1 / (1 − shrinkage). */
export function scaleToMoldSize(samples, shrinkagePct = 0) {
    const s = 1 / (1 - Math.max(0, Math.min(40, shrinkagePct)) / 100);
    return samples.map(p => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, typeof v === 'number' ? v * s : v])));
}

/* ---------- helpers ---------- */

export const maxOn = (r, a, b) => {
    let m = -Infinity;
    for (let z = a; z <= b + 1e-9; z += STEP) m = Math.max(m, r(z));
    return m;
};
const slope = (r, z) => (r(z + 0.25) - r(z - 0.25)) / 0.5;

/** Max ware depth into the base: how far the underside rises above z = 0. */
function undersideRise(underside) {
    if (!underside?.length) return 0;
    return Math.max(0, ...underside.map(p => p.z));
}

/**
 * Highest crease (slope change ≥ `minDeg`) in (2, zMax] that the base still
 * flares up to, or null. Peaks are found on a 0.5 mm scan, then refined to 0.1 mm.
 */
export function findFootCrease(r, zMax, minDeg, flaresTo) {
    const bend = (z, w) => {
        const s1 = (r(z) - r(z - w)) / w;
        const s2 = (r(z + w) - r(z)) / w;
        return Math.abs(Math.atan(s2) - Math.atan(s1)) * 180 / Math.PI;
    };
    let best = null;
    for (let z = 2; z <= zMax + 1e-9; z += STEP) {
        const d = bend(z, 1.5);
        if (d < minDeg || d < bend(z - STEP, 1.5) || d < bend(z + STEP, 1.5)) continue;
        let peak = z;
        let peakBend = -1;
        for (let t = z - 1; t <= z + 1 + 1e-9; t += 0.1) {
            const b = bend(t, 0.75);
            if (b > peakBend) { peakBend = b; peak = t; }
        }
        peak = Math.round(peak * 10) / 10;
        if (peak <= zMax && flaresTo(peak)) best = peak;
    }
    return best;
}

/* ---------- the slicing algorithm ---------- */

/**
 * @param {Object} profile - from makeControlProfile / makeSampledProfile
 * @param {Object} [params] - SLICER_DEFAULTS overrides
 */
export function sliceProfile(profile, params = {}) {
    const P = { ...SLICER_DEFAULTS, ...params };
    const { r, H, turns } = profile;
    if (!(H > 0)) throw new Error('The profile has no height.');

    // Foot seam only if the base flares outward up to it (the footer must
    // release the ware upward); otherwise a pedestal foot puts it at the base.
    // A crease where the foot meets the wall is the better seam: the footer
    // takes the whole foot and the unit above starts on a single wall angle.
    const flaresTo = (zTop) => {
        for (let z = 0; z < zTop - 1e-9; z += STEP) {
            if (r(Math.min(zTop, z + STEP)) < r(z) - 1e-6) return false;
        }
        return true;
    };
    const crease = P.seamAtCrease ? findFootCrease(r, Math.min(P.footSeamMax, H / 2), P.creaseDeg, flaresTo) : null;
    let f = crease ?? Math.min(P.footSeam, H / 4);
    if (!flaresTo(f)) f = 0;
    let footerWhy = !f ? 'pedestal foot: seam at the base'
        : crease !== null && f === crease ? 'seam on the foot/wall crease' : 'base flares to the seam';
    // A foot recess deeper than the seam would need a boss below the parting
    // face; lift the seam above it when the base still flares that high
    const rise = undersideRise(profile.underside);
    if (P.raiseSeamForRecess && rise > f + 0.25) {
        const lifted = Math.ceil(rise * 2) / 2 + 0.5;
        if (lifted <= H / 2 && flaresTo(lifted)) {
            f = lifted;
            footerWhy = 'seam lifted above the foot recess';
        }
    }

    // Well collar: vertical bore ≥ ¼″ wider than the lip all round, so the top
    // face of the piece below leaves a flat annular ledge for the slip to pool on
    const rLip = r(H);
    const rw = Math.ceil(rLip + P.ledgeMin);
    const rs = () => rw;
    const rMax = Math.max(maxOn(r, 0, H), rw);
    const fittedS = Math.ceil((2 * rMax + 2 * P.plasterMin) / 10) * 10;
    let S = fittedS;
    let kitTooSmall = false;
    if (P.kitDiameter === 'auto') {
        S = (P.kitSeries || []).find(d => d >= fittedS) ?? fittedS;
    } else if (Number.isFinite(Number(P.kitDiameter)) && Number(P.kitDiameter) > 0) {
        if (Number(P.kitDiameter) >= fittedS) S = Number(P.kitDiameter);
        else kitTooSmall = true;
    }
    const R = S / 2;
    // Units stand inside the kit's tall sleeve under a drop-in lid
    const sleeveH = P.sleeveH ? resolveSleeveHeight(S, P.sleeveH, { z: P.bed }) : null;
    const sleeveCap = sleeveH ? sleeveH - P.lidT - 2 : Infinity;

    const cuts = [f, ...turns.map(t => t.z).filter(z => z > f + 5 && z < H - 5), H];

    // Classify each monotonic band
    const tanMin = Math.tan(P.minDraftDeg * Math.PI / 180);
    const bands = [];
    for (let i = 0; i < cuts.length - 1; i++) {
        const a = cuts[i];
        const b = cuts[i + 1];
        const dr = r(b) - r(a);
        let run = 0;
        let longest = 0;
        for (let z = a; z <= b; z += STEP) {
            run = Math.abs(slope(r, z)) < tanMin ? run + STEP : 0;
            longest = Math.max(longest, run);
        }
        const dir = dr > 0.3 ? 'inc' : dr < -0.3 ? 'dec' : 'flat';
        let release;
        let why;
        let noDraftRun = 0;
        if (dir === 'flat' || longest > P.maxFlatRun) {
            release = 'split';
            why = `no draft over ${longest.toFixed(0)} mm`;
            noDraftRun = longest;
        } else if (dir === 'inc') {
            const below = maxOn(r, 0, a);
            if (r(a) >= below - 0.05) { release = 'down'; why = 'nothing below is wider'; }
            else { release = 'split'; why = `opening r${r(a).toFixed(0)} < r${below.toFixed(0)} below`; }
        } else {
            const above = maxOn(r, b, H);
            if (r(b) >= above - 0.05) { release = 'up'; why = 'nothing above is wider'; }
            else { release = 'split'; why = `opening r${r(b).toFixed(0)} < r${above.toFixed(0)} above`; }
        }
        bands.push({ a, b, dir, release, why, noDraftRun });
    }

    // A ring sliver too short to carry keys joins a neighbouring split (a
    // split releases any surface of revolution). Not in the prototype; none of
    // its forms have one.
    bands.forEach((bd, i) => {
        if (bd.release === 'split' || bd.b - bd.a >= P.minRingH) return;
        if (bands[i - 1]?.release === 'split' || bands[i + 1]?.release === 'split') {
            bd.release = 'split';
            bd.why = `${(bd.b - bd.a).toFixed(0)} mm ring is too short for keys`;
        }
    });

    // Merge neighbouring splits: halves print on the divider, so monotonicity
    // no longer matters
    const merged = [];
    for (const bd of bands) {
        const last = merged[merged.length - 1];
        if (last && last.release === 'split' && bd.release === 'split') {
            last.b = bd.b;
            last.dir = 'mixed';
            last.reasons.push(bd.why);
            last.noDraftRun = Math.max(last.noDraftRun, bd.noDraftRun);
        } else merged.push({ ...bd, reasons: [bd.why] });
    }
    merged.forEach(bd => {
        const r = bd.reasons;
        bd.why = r.length > 2 ? `${r.slice(0, 2).join('; ')} (+${r.length - 2} more)` : r.join('; ');
    });

    // A short first ring that only flares (a plate's or saucer's rim) folds into
    // the footer: the footer cup releases it upward, and a 10–25 mm piece of
    // plaster is not worth a separate unit (fewest sections)
    const first = merged[0];
    if (first && first.release === 'down' && first.b - first.a <= P.footAbsorbMax && flaresTo(first.b)) {
        f = first.b;
        merged.shift();
        footerWhy = f >= H - 1e-6 ? 'footer holds the whole shallow form' : 'footer holds the foot and the short rim band';
    }

    // Height limits → even subdivision
    const bodyUnits = [];
    for (const bd of merged) {
        // Ring: plate + core stand on the bed (≤ bed − 10). Split: the insert
        // lies with its length along the bed (≤ bed − 4).
        const lim = bd.release === 'split'
            ? Math.min(P.maxSplitH, P.bedXY - 4, sleeveCap)
            : Math.min(P.maxRingH, P.bed - 10, sleeveCap);
        const n = Math.ceil((bd.b - bd.a) / lim - 1e-9);
        for (let k = 0; k < n; k++) {
            const a = bd.a + (bd.b - bd.a) * k / n;
            const b = bd.a + (bd.b - bd.a) * (k + 1) / n;
            bodyUnits.push({ ...bd, a, b, why: n > 1 ? `${bd.why}; height cut ${k + 1}/${n}` : bd.why });
        }
    }

    const cavVol = (fn, a, b) => {
        let v = 0;
        for (let z = a; z < b; z += STEP) v += Math.PI * fn(z + 0.25) ** 2 * STEP;
        return v;
    };

    const units = [];
    units.push({
        kind: 'footer', a: -P.footerT, b: f, ca: 0, cb: f, fn: r, release: 'footer', orient: 'inverted',
        why: footerWhy,
        dir: 'inc'
    });
    bodyUnits.forEach(u => units.push({
        kind: u.release === 'split' ? 'split' : 'ring', a: u.a, b: u.b, ca: u.a, cb: u.b, fn: r,
        release: u.release, why: u.why, dir: u.dir, noDraftRun: u.noDraftRun,
        orient: u.release === 'split' ? 'standing' : (u.dir === 'inc' ? 'inverted' : 'upright')
    }));
    units.push({
        kind: 'well', a: H, b: H + P.wellH, ca: H, cb: H + P.wellH, fn: rs, release: 'up', orient: 'upright',
        why: `vertical bore Ø${2 * rw} · ${(rw - rLip).toFixed(1)} mm ledge on the piece below`, dir: 'flat'
    });

    units.forEach((u, i) => {
        u.id = 'U' + (i + 1);
        u.index = i;
        u.h = u.b - u.a;
        u.vol = (Math.PI * R ** 2 * u.h - cavVol(u.fn, u.ca, u.cb)) / 1e6;
        // Rule A: bottom face male (except the footer's bench face), top face
        // sockets (except the well's open pour face)
        u.plasterBottom = u.kind === 'footer' ? 'flat' : 'male';
        u.plasterTop = u.kind === 'well' ? 'open' : 'sockets';
        u.faceBottom = u.kind === 'footer' ? 'flat (bench)' : '▼ male';
        u.faceTop = u.kind === 'well' ? 'open (pour)' : '▽ sockets';
        // Rule B: the plate forming a face carries the opposite former; the
        // bed plate forms the top face when the unit pours inverted
        const former = face => face === 'bottom'
            ? (u.kind === 'footer' ? 'plain' : 'pockets')
            : (u.kind === 'well' ? 'plain' : 'bumps');
        const bedFace = u.orient === 'inverted' ? 'top' : 'bottom';
        const lidFace = bedFace === 'top' ? 'bottom' : 'top';
        u.bedFormer = { face: bedFace, former: former(bedFace) };
        u.lidFormer = (u.kind === 'footer' || u.kind === 'well') ? null : { face: lidFace, former: former(lidFace) };
        u.bedPlate = `${former(bedFace)} → ${bedFace}`;
        u.lid = u.kind === 'footer' ? 'none (screed bench face)'
            : u.kind === 'well' ? 'none (screed pour face)'
                : `${former(lidFace)} → ${lidFace}`;
        if (u.kind === 'split') u.lid += ' · divider: A bumps / B pockets';
    });

    // The top body piece's sockets must sit outside the bore, or they'd open into the well
    const keyClear = (R - P.keyInset - 6) - rw;
    return {
        params: P, profile, r, H, f, turns, cuts, units, S, R, rMax, rs, rLip, rw, keyClear,
        fittedS, kitTooSmall, sleeveH, footRecess: rise
    };
}

/** Pieces of plaster (a split unit casts two halves). */
export function countPieces(result) {
    return result.units.reduce((n, u) => n + (u.kind === 'split' ? 2 : 1), 0);
}

/** Demold order (always valid): collar, ↑ rings top-down, splits, footer, ↓ rings. */
export function demoldOrder(result) {
    const { units } = result;
    const ups = units.filter(u => u.kind === 'ring' && u.release === 'up').reverse();
    const splits = units.filter(u => u.kind === 'split');
    const downs = units.filter(u => u.kind === 'ring' && u.release === 'down');
    const well = units.find(u => u.kind === 'well');
    const footer = units.find(u => u.kind === 'footer');
    const steps = [{ text: 'Cut the clay flange at the lip line and lift the well collar.', ids: [well.id] }];
    if (ups.length) steps.push({ text: 'Lift the ↑ rings off, top down.', ids: ups.map(u => u.id) });
    if (splits.length) steps.push({ text: 'Open the split halves sideways.', ids: splits.map(u => u.id) });
    steps.push({ text: 'Invert the mold and lift the footer off.', ids: [footer.id] });
    if (downs.length) steps.push({ text: 'Slide the ↓ rings off the ware.', ids: downs.map(u => u.id) });
    return steps;
}
