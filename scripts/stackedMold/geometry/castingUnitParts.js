/**
 * Stacked Cylinder Mold - printable parts (universal kit + ware parts)
 *
 * Tooling is split into tiers (stacked-cylinder-mold/printing-analysis.html):
 *
 *   Universal kit, printed once per standard diameter and reused by every ware:
 *     bed plate      locating rim, centre pit, 3 key-plug bores, 3 jack-screw bores
 *     drop-in lid    slides inside the sleeve and rests on the core top, so one
 *                    tall sleeve serves every unit height; plug and jack bores,
 *                    bleed holes, lift tabs
 *     sleeve         one tall sleeve, in as many segments as the printer needs,
 *                    seam ears with teardrop bolt holes and pry bevels
 *     key plugs      bump (→ plaster socket) and pocket (→ plaster male cone);
 *                    3 of each serve every unit
 *     locating puck  centres ring cores and the well locator on the bed plate
 *   Plates and lids too wide for the printer are cut into dovetailed tiles.
 *
 *   Ware parts, printed per ware (tier 2: hollow, fine layers):
 *     ring cores (cone pit in the base, over the puck), footer bases (stub and
 *     locating ring in one piece; wide ones ringed by tiles), split inserts, the well's slit tube + locator.
 *
 * Frames. Pour frame: the unit as poured, plaster in y ∈ [0, h], bed plate top
 * at y = 0. Kit parts are built in their print frame (`toPrint` lifts the bed
 * plate onto the bed); where they sit for a unit is `kitUse` (print → pour
 * matrices). Ware parts are built in the pour frame with a `toPrint`.
 *
 * Key rule (fixed): every plaster piece has male cones on its bottom face and
 * sockets on its top face. A bump plug makes a socket, a pocket plug a male cone.
 */

import { SolidBuilder, at, circle2, circleSegments, signedArea2, analyzeSolid } from './solidBuilder.js';
import { KIT_PLATE_T, getPrinter, kitId } from './kitSpec.js';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

export const PART_DEFAULTS = Object.freeze({
    sleeveWall: 3,
    plateT: KIT_PLATE_T,
    strapGroove: false, // optional V-groove for a hose clamp; a plain cylinder clamps fine
    grooveDepth: 2,
    printer: 'bambu-h2s'
});

// Keys and plugs (mm). Male cone and socket are one 45° cone, so the flanks
// close as the faces meet.
const KEY = { r: 6, h: 6 };
// Plugs seat on a 45° chamfer that lies on the bore's own chamfer, so a plug
// sits flush (and centred) with the plaster face; flange and shank are clear.
const PLUG = { holeR: 7.5, shankR: 7.35, cbR: 9.7, flangeR: 9.5, cbDepth: 2.2 };
// Jack screws: M5 heat-set insert from the outside face, screw tip flush with the plaster face
const JACK = { insertR: 3.2, insertDepth: 6, clearR: 2.75 };
// Locating puck: 45° frustum in the plate pit, cone into the core's pit
const PUCK = { baseR: 8, midR: 12, midY: 4, tipY: 16, pitR: 12.2, pitFloorR: 8.2, pitDepth: 4, corePit: 12.2 };
const BLEED_R = 1.5;
const BOLT_R = 1.7;          // M3 clearance
const BOLT_PITCH = 40;       // sleeve ear holes every 40 mm from y = 15
const EAR_T = 3;
const EAR_W = 10;
const EAR_BEVEL = 2;         // pry bevel on each ear's outer edge: two ears make a 4 mm V
const DIVIDER_T = 7;
const RIM_H = 4;              // the sleeve stands 2 mm into the rim even on a footer ring
const SEAM_CLEAR = 4;
const LID_CLEAR = 0.5;       // drop-in lid radius = R − 0.5
const TUBE_T = 2;            // slit tube wall (5 perimeters)
const TUBE_KERF = 0.6;       // print gap at the slit; taped shut inside, the edges meet
const SLIT_ANGLE = 40 * DEG;
// Footer locating ring: drops into the bed plate rim over the stub. The stub's
// base is a 45° cone through the ring's thickness and the bore is the same cone,
// so the seat closes with no gap at the plaster face (print error only moves the
// ring up or down a little). Pull tabs reach out through the rim gaps at the
// sleeve seams, under the ears.
const FOOT_RING = { t: 2, clear: 0, tabHalf: 3, paddleHalf: 8, tabReach: 6 };
const KEY_SEG = 32;
const BLEED_SEG = 12;
const HUB_R = 26;            // tiled plates: the first tile keeps the centre
const TILE_SEAM0 = 15 * DEG; // tile seams start here (clear of keys, jacks, bleeds, tabs)
const DOVETAIL = { neck: 6, head: 9, depth: 9, clear: 0.2 };

export const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
const translate = (x, y, z) => [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z];
const rotY = (c) => [Math.cos(c), 0, Math.sin(c), 0, 0, 1, 0, 0, -Math.sin(c), 0, Math.cos(c), 0];
/** 180° about X, then lift by `y0`: (x, y, z) → (x, y0 − y, −z). */
const flipX = (y0) => [1, 0, 0, 0, 0, -1, 0, y0, 0, 0, -1, 0];

export function composeMatrix(a, b) {
    // a ∘ b (apply b first)
    const out = new Array(12);
    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
            out[r * 4 + c] = a[r * 4] * b[c] + a[r * 4 + 1] * b[4 + c] + a[r * 4 + 2] * b[8 + c];
        }
        out[r * 4 + 3] = a[r * 4] * b[3] + a[r * 4 + 1] * b[7] + a[r * 4 + 2] * b[11] + a[r * 4 + 3];
    }
    return out;
}

/* ---------- dimensions ---------- */

export function moldDimensions(result, partParams = {}) {
    const P = { ...PART_DEFAULTS, ...partParams };
    const R = result.R;
    const wall = P.sleeveWall;
    const rimIn = R + wall + 0.4;
    const printer = typeof P.printer === 'object' ? P.printer : getPrinter(P.printer);
    const T = Math.max(P.plateT, KIT_PLATE_T);
    const sleeveH = result.sleeveH || Math.ceil((Math.max(...result.units.map(u => u.h)) + T + 4) / 10) * 10;
    const d = {
        R, wall,
        diameter: result.S,
        pr: R + wall + 7,
        lidR: R - LID_CLEAR,
        rimIn, rimOut: R + wall + 2.6,
        K: R - result.params.keyInset,
        keyAngles: [0, 120, 240].map(a => a * DEG),
        jackAngles: [60, 180, 300].map(a => a * DEG),
        earOut: R + wall + EAR_W,
        boltS: R + wall + 5.5,
        T,
        groove: P.strapGroove ? P.grooveDepth : 0,
        printer,
        sleeveH,
        kitId: kitId(result.S, sleeveH),
        nBig: circleSegments(R + wall + 7, 2.2, 96, 256)
    };
    d.segments = sleeveSegmentsFor(d);
    d.sleeveSeams = Array.from({ length: d.segments }, (_, k) => 90 * DEG + k * TAU / d.segments);
    d.plateTiles = tilesFor(d.pr, d);
    d.lidTiles = tilesFor(d.lidR, d);
    d.bed = Math.min(printer.x, printer.y);
    return d;
}

/** Rotation (deg) that fits a 2D footprint (x, −z points) on the printer bed, or null. */
export function fitOnBed(points, printer, margin = 4) {
    const W = printer.x - margin, D = printer.y - margin;
    for (let deg = 0; deg < 180; deg += 3) {
        const c = Math.cos(deg * DEG), s = Math.sin(deg * DEG);
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        for (const [u, w] of points) {
            const x = u * c - w * s, y = u * s + w * c;
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
        }
        if (x1 - x0 <= W && y1 - y0 <= D) return { deg, w: x1 - x0, d: y1 - y0 };
    }
    return null;
}

function tilesFor(radius, d) {
    for (const n of [1, 3, 4, 5, 6, 8]) {
        if (tileOutlines(radius, n).every(o => fitOnBed(o, d.printer))) return n;
    }
    return 8;
}

function sleeveSegmentsFor(d) {
    for (const n of [2, 3, 4, 6]) {
        if (fitOnBed(sleeveSection(d, n), d.printer)) return n;
    }
    return 6;
}

/* ---------- profile helpers ---------- */

/** Douglas–Peucker on [[ρ, y], ...]. */
function simplify(points, tol) {
    if (points.length < 3) return points;
    const keep = new Uint8Array(points.length);
    keep[0] = keep[points.length - 1] = 1;
    const stack = [[0, points.length - 1]];
    while (stack.length) {
        const [i, j] = stack.pop();
        const [x0, y0] = points[i];
        const [x1, y1] = points[j];
        const dx = x1 - x0, dy = y1 - y0;
        const len = Math.hypot(dx, dy) || 1;
        let best = -1, bestD = tol;
        for (let k = i + 1; k < j; k++) {
            const dd = Math.abs((points[k][0] - x0) * dy - (points[k][1] - y0) * dx) / len;
            if (dd > bestD) { bestD = dd; best = k; }
        }
        if (best >= 0) {
            keep[best] = 1;
            stack.push([i, best], [best, j]);
        }
    }
    return points.filter((_, i) => keep[i]);
}

/** Sample ρ(y) on [0, h] (pour frame) for a unit's band. */
function bandProfile(u, r, step = 0.5) {
    const map = u.orient === 'inverted' ? (y => u.b - y) : (y => u.a + y);
    const pts = [];
    const n = Math.max(2, Math.ceil(u.h / step));
    for (let i = 0; i <= n; i++) {
        const y = u.h * i / n;
        pts.push([r(map(y)), y]);
    }
    return simplify(pts, 0.02);
}

/**
 * Footer core profile (pour frame, inverted: y = f − z): up the base wall
 * from the seam to the base edge, then across the underside to the axis.
 * A foot recess deeper than the seam dips below y = 0 (only possible on a
 * ware-specific fused footer plate).
 */
function footerProfile(result) {
    const { r, f, profile } = result;
    const pts = [];
    const n = Math.max(1, Math.ceil(f / 0.5));
    for (let i = 0; i <= n; i++) {
        const z = f - f * i / n;
        pts.push([r(z), f - z]);
    }
    const r0 = r(0);
    const under = (profile.underside?.length ? profile.underside : [{ rho: 0, z: 0 }, { rho: r0, z: 0 }])
        .filter(p => p.rho < r0 - 1e-6)
        .sort((a, b) => b.rho - a.rho);
    for (const p of under) pts.push([p.rho, f - p.z]);
    if (pts[pts.length - 1][0] > 1e-9) pts.push([0, pts[pts.length - 1][1]]);
    return simplify(pts, 0.02);
}

/* ---------- 2D shapes in (x, −z) ---------- */

const pt = (r, a) => [r * Math.cos(a), r * Math.sin(a)];
const arcPts = (r, a0, a1, n) => Array.from({ length: n + 1 }, (_, k) => pt(r, a0 + (a1 - a0) * k / n));
const sector = (r0, r1, t0, t1, n) => [...arcPts(r1, t0, t1, n), ...arcPts(r0, t0, t1, n).reverse()];
const disc = (r, n) => circle2(0, 0, r, n);
const ccw = poly => (signedArea2(poly) < 0 ? [...poly].reverse() : poly);
const segFor = (r, a0, a1, chord = 2.2) => Math.max(4, Math.ceil(Math.abs(a1 - a0) * r / chord));

/**
 * Tile outlines of a disc of radius ρ cut into n dovetailed sectors (n = 1:
 * the disc). Tile 0 keeps a hub of radius HUB_R; every tile carries a dovetail
 * tab on its end edge and the matching notch on its start edge.
 */
export function tileOutlines(rho, n) {
    if (n === 1) return [disc(rho, Math.max(96, segFor(rho, 0, TAU)))];
    const step = TAU / n;
    const rm = (HUB_R + rho) / 2;
    const { neck, head, depth, clear } = DOVETAIL;
    const local = (a, r, p) => [r * Math.cos(a) - p * Math.sin(a), r * Math.sin(a) + p * Math.cos(a)];
    return Array.from({ length: n }, (_, k) => {
        const a0 = TILE_SEAM0 + k * step;
        const a1 = a0 + step;
        const out = [];
        // start edge, outward, with the notch cut into this tile (+θ side)
        out.push(local(a0, HUB_R, 0), local(a0, rm - neck - clear, 0), local(a0, rm - head - clear, depth + clear),
            local(a0, rm + head + clear, depth + clear), local(a0, rm + neck + clear, 0));
        out.push(...arcPts(rho, a0, a1, segFor(rho, a0, a1)));
        // end edge, inward, with the tab sticking out into the next tile
        out.push(local(a1, rm + neck, 0), local(a1, rm + head, depth), local(a1, rm - head, depth), local(a1, rm - neck, 0));
        if (k === 0) out.push(...arcPts(HUB_R, a1, a0 + TAU, segFor(HUB_R, a1, a0 + TAU, 1.6)).slice(0, -1));
        else out.push(...arcPts(HUB_R, a1, a0, segFor(HUB_R, a0, a1, 1.6)).slice(0, -1));
        return out;
    });
}

/**
 * Annular tile k of n between rIn and rOut, dovetailed like tileOutlines but
 * with no hub. `rm` fixes the dovetail radius and `nIn` the inner arc's point
 * count, so outlines at different rIn (a countersunk bore) match point for point.
 */
function annularTileOutline(rIn, rOut, n, k, rm, nIn, outerArc = arcPts) {
    const step = TAU / n;
    const { neck, head, depth, clear } = DOVETAIL;
    const local = (a, r, p) => [r * Math.cos(a) - p * Math.sin(a), r * Math.sin(a) + p * Math.cos(a)];
    const a0 = TILE_SEAM0 + k * step;
    const a1 = a0 + step;
    return [
        local(a0, rIn, 0), local(a0, rm - neck - clear, 0), local(a0, rm - head - clear, depth + clear),
        local(a0, rm + head + clear, depth + clear), local(a0, rm + neck + clear, 0),
        ...outerArc(rOut, a0, a1, segFor(rOut, a0, a1)),
        local(a1, rm + neck, 0), local(a1, rm + head, depth), local(a1, rm - head, depth), local(a1, rm - neck, 0),
        ...arcPts(rIn, a1, a0, nIn).slice(0, -1)
    ];
}

function tileRange(n, k) {
    const step = TAU / n;
    return [TILE_SEAM0 + k * step, TILE_SEAM0 + (k + 1) * step];
}

const normAngle = (a, from) => {
    let x = a;
    while (x < from) x += TAU;
    while (x >= from + TAU) x -= TAU;
    return x;
};

function inTile(angle, n, k, radius = 0) {
    if (n === 1) return true;
    if (radius < HUB_R + 1) return k === 0;
    const [a0, a1] = tileRange(n, k);
    const a = normAngle(angle, a0);
    return a > a0 && a < a1;
}

/** Rim arcs between the sleeve seams, clipped to a tile. */
function rimArcs(d, n, k, r0, r1, h) {
    const gap = Math.asin(Math.min(1, SEAM_CLEAR / r0));
    const seams = d.sleeveSeams;
    const arcs = [];
    for (let i = 0; i < seams.length; i++) {
        const s0 = seams[i] + gap;
        const s1 = seams[(i + 1) % seams.length] + (i + 1 === seams.length ? TAU : 0) - gap;
        if (n > 1) {
            const [t0, t1] = tileRange(n, k);
            const m = 2 / r0;
            for (const off of [-TAU, 0, TAU]) {
                const a = Math.max(s0 + off, t0 + m);
                const b = Math.min(s1 + off, t1 - m);
                if (b - a > 4 / r0) arcs.push([a, b]);
            }
        } else arcs.push([s0, s1]);
    }
    return arcs.map(([a, b]) => ({ kind: 'boss', poly: sector(r0, r1, a, b, segFor(r1, a, b)), h }));
}

/* ---------- plate (horizontal slab with features on its top face) ---------- */

/**
 * Slab between y0 and y1 with features:
 *   bump {cx, cw} · pocket {cx, cw} (key formers) · hole {cx, cw, r}
 *   bore {cx, cw, profile: [[r, y], ...] from y1 down to y0} (stepped through hole)
 *   pit {cx, cw, profile: [[r, y], ...] from y1 down to a flat floor}
 *   boss {poly, h} · core {profile, n} (lathe from (ρ0, y1) to the axis)
 * (cx, cw) are (x, −z) positions.
 */
function plate(b, { outline, y0, y1, features }) {
    const top = [];
    const bottom = [];
    const P3 = (y) => ([u, w]) => [u, y, -w];
    for (const f of features) {
        const axis = [f.cx ?? 0, y1, -(f.cw ?? 0)];
        if (f.kind === 'bump' || f.kind === 'pocket') {
            top.push(circle2(f.cx, f.cw, KEY.r, KEY_SEG));
            keyFormer(b, f.kind, (r, h) => b.loop(circle2(f.cx, f.cw, r, KEY_SEG).map(P3(y1 + h))),
                (h) => b.vertex([f.cx, y1 + h, -f.cw]), axis, [0, 1, 0]);
        } else if (f.kind === 'hole') {
            const ring2 = circle2(f.cx, f.cw, f.r, f.n || BLEED_SEG);
            top.push(ring2);
            bottom.push(ring2);
            b.axialStrip(b.loop(ring2.map(P3(y1))), b.loop(ring2.map(P3(y0))), axis, [0, 1, 0], false);
        } else if (f.kind === 'bore' || f.kind === 'pit') {
            const n = f.n || KEY_SEG;
            const rings2 = f.profile.map(([r]) => circle2(f.cx, f.cw, r, n));
            const rings = f.profile.map(([, y], i) => b.loop(rings2[i].map(P3(y))));
            for (let i = 0; i < rings.length - 1; i++) b.axialStrip(rings[i], rings[i + 1], axis, [0, 1, 0], false);
            top.push(rings2[0]);
            if (f.kind === 'bore') bottom.push(rings2[rings2.length - 1]);
            else b.hface(f.profile[f.profile.length - 1][1], rings2[rings2.length - 1], [], true);
        } else if (f.kind === 'cutout') {
            // Polygon through-hole; walls face into the hole
            const poly = ccw(f.poly);
            top.push(poly);
            bottom.push(poly);
            b.strip(b.loop(poly.map(P3(y1))), b.loop(poly.map(P3(y0))), true);
        } else if (f.kind === 'boss') {
            const poly = ccw(f.poly);
            top.push(poly);
            b.strip(b.loop(poly.map(P3(y1))), b.loop(poly.map(P3(y1 + f.h))), true);
            b.hface(y1 + f.h, poly, [], true);
        } else if (f.kind === 'core') {
            top.push(disc(f.profile[0][0], f.n));
            b.lathe(f.profile, { n: f.n });
        }
    }
    const out = ccw(outline);
    b.strip(b.loop(out.map(P3(y0))), b.loop(out.map(P3(y1))), true);
    b.hface(y1, out, top, true);
    b.hface(y0, out, bottom, false);
}

function finish(b, meta) {
    const solid = b.build();
    return { ...meta, solid, check: analyzeSolid(solid) };
}

const polar = (r, a) => ({ cx: r * Math.cos(a), cw: r * Math.sin(a) });

/**
 * Key former (the key cone) on a face: `ringAt(r, h)` gives its base loop of
 * vertex ids, `apexAt(h)` the tip at height h along the axis (h < 0 goes into
 * the face). Bumps (→ sockets) stand out of the face, pockets (→ male cones) sink into it.
 */
function keyFormer(b, former, ringAt, apexAt, axisP, axisDir) {
    const ring = ringAt(KEY.r, 0);
    const apex = apexAt(former === 'pocket' ? -KEY.h : KEY.h);
    b.axialStrip(ring, ring.map(() => apex), axisP, axisDir, former === 'bump');
}

/* ---------- universal kit ---------- */

/**
 * Bed plate tile k of n (pour frame: top face at y = 0, bench face at y = −T).
 * Plugs and jack screws go in from the bench side.
 */
function kitBedPlateTile(d, n, k) {
    const b = new SolidBuilder();
    const T = d.T;
    const outline = tileOutlines(d.pr, n)[k];
    const features = [...rimArcs(d, n, k, d.rimIn, d.rimOut, RIM_H)];
    if (inTile(0, n, k, 0)) {
        features.push({ kind: 'pit', cx: 0, cw: 0, n: 48, profile: [[PUCK.pitR, 0], [PUCK.pitFloorR, -PUCK.pitDepth]] });
    }
    d.keyAngles.forEach(a => {
        if (!inTile(a, n, k, d.K)) return;
        features.push({
            kind: 'bore', ...polar(d.K, a), profile: [
                [PLUG.holeR, 0], [PLUG.holeR, -T + 2 * PLUG.cbDepth], [PLUG.cbR, -T + PLUG.cbDepth], [PLUG.cbR, -T]
            ]
        });
    });
    d.jackAngles.forEach(a => {
        if (!inTile(a, n, k, d.K)) return;
        const step = JACK.insertR - JACK.clearR;
        features.push({
            kind: 'bore', ...polar(d.K, a), n: 20, profile: [
                [JACK.clearR, 0], [JACK.clearR, -T + JACK.insertDepth + step], [JACK.insertR, -T + JACK.insertDepth], [JACK.insertR, -T]
            ]
        });
    });
    plate(b, { outline, y0: -T, y1: 0, features });
    // Built in the pour frame; prints bench face down (lifted onto y = 0)
    return finish(b, { toPrint: translate(0, T, 0), toKit: IDENTITY, tile: n > 1 ? { n, k } : null });
}

/**
 * Drop-in lid tile k of n: plaster face at y = 0 (prints on the bed, the
 * smoothest face), outside face at y = T. In use it sits on the core top at y = h.
 */
function kitLidTile(d, n, k) {
    const b = new SolidBuilder();
    const T = d.T;
    const outline = tileOutlines(d.lidR, n)[k];
    const features = [];
    d.keyAngles.forEach(a => {
        if (!inTile(a, n, k, d.K)) return;
        features.push({
            kind: 'bore', ...polar(d.K, a), profile: [
                [PLUG.cbR, T], [PLUG.cbR, T - PLUG.cbDepth], [PLUG.holeR, T - 2 * PLUG.cbDepth], [PLUG.holeR, 0]
            ]
        });
    });
    d.jackAngles.forEach(a => {
        if (!inTile(a, n, k, d.K)) return;
        const step = JACK.insertR - JACK.clearR;
        features.push({
            kind: 'bore', ...polar(d.K, a), n: 20, profile: [
                [JACK.insertR, T], [JACK.insertR, T - JACK.insertDepth], [JACK.clearR, T - JACK.insertDepth - step], [JACK.clearR, 0]
            ]
        });
    });
    // Bleeds: outer ring between keys and jacks, inner ring nearer the core
    [30, 150, 270].forEach(deg => {
        if (inTile(deg * DEG, n, k, d.K)) features.push({ kind: 'hole', ...polar(d.K, deg * DEG), r: BLEED_R });
    });
    [90, 210, 330].forEach(deg => {
        const r = 0.6 * d.K;
        if (inTile(deg * DEG, n, k, r)) features.push({ kind: 'hole', ...polar(r, deg * DEG), r: BLEED_R });
    });
    // Lift tabs (pry points) on the outside face
    [45, 225].forEach(deg => {
        const a = deg * DEG;
        const r = 0.78 * d.K;
        if (!inTile(a, n, k, r)) return;
        const c = Math.cos(a), s = Math.sin(a);
        const rect = [[-4, -10], [4, -10], [4, 10], [-4, 10]].map(([p, q]) => [r * c + p * c - q * s, r * s + p * s + q * c]);
        features.push({ kind: 'boss', poly: rect, h: 12 });
    });
    plate(b, { outline, y0: 0, y1: T, features });
    return finish(b, { toPrint: IDENTITY, tile: n > 1 ? { n, k } : null });
}

/** Key plug (print frame: flange on the bed). Bump → plaster socket; pocket → plaster male cone. */
function keyPlug(d, type) {
    const b = new SolidBuilder();
    const T = d.T;
    const cb = PLUG.cbDepth;
    // The flange chamfer lies on the bore's chamfer (cbR at cb, 45° inward)
    const flank = [[PLUG.flangeR, 0], [PLUG.flangeR, cb + PLUG.cbR - PLUG.flangeR], [PLUG.shankR, cb + PLUG.cbR - PLUG.shankR], [PLUG.shankR, T]];
    if (type === 'bump') {
        b.lathe([[0, 0], ...flank, [KEY.r, T], [0, T + KEY.h]], { n: KEY_SEG });
    } else {
        b.lathe([[0, 0], ...flank, [KEY.r, T], [0, T - KEY.h]], { n: KEY_SEG });
    }
    return finish(b, { toPrint: IDENTITY });
}

/** Locating puck: frustum into the plate pit, cone into a core's base pit. */
function locatingPuck() {
    const b = new SolidBuilder();
    b.lathe([[0, 0], [PUCK.baseR, 0], [PUCK.midR, PUCK.midY], [0, PUCK.tipY]], { n: 48 });
    return finish(b, { toPrint: IDENTITY });
}

/** Sleeve cross-section (x, −z) for one of n segments, centred on +x. */
function sleeveSection(d, n) {
    const alpha = Math.PI / n;
    const Ro = d.R + d.wall;
    const delta = Math.asin(EAR_T / Ro);
    const frame = (sigma) => {
        const er = [Math.cos(alpha), -sigma * Math.sin(alpha)];
        const et = [Math.sin(alpha), sigma * Math.cos(alpha)];
        return (s, nn) => [s * er[0] + nn * et[0], -(s * er[1] + nn * et[1])];
    };
    const lo = frame(-1), hi = frame(1);
    const nO = Math.max(16, Math.round(d.nBig * (2 * (alpha - delta)) / TAU));
    const nI = Math.max(16, Math.round(d.nBig * (2 * alpha) / TAU));
    return [
        lo(d.R, 0), lo(d.earOut - EAR_BEVEL, 0), lo(d.earOut, EAR_T), lo(Ro * Math.cos(delta), EAR_T),
        ...arcPts(Ro, -(alpha - delta), alpha - delta, nO).slice(1, -1),
        hi(Ro * Math.cos(delta), EAR_T), hi(d.earOut, EAR_T), hi(d.earOut - EAR_BEVEL, 0), hi(d.R, 0),
        ...arcPts(d.R, alpha, -alpha, nI).slice(1, -1)
    ];
}

/** Bolt-hole heights on a sleeve (and the matching split divider flanges). */
export function boltHeights(h) {
    const ys = [];
    for (let y = 15; y <= h - 12; y += BOLT_PITCH) ys.push(y);
    if (!ys.length) ys.push(h / 2);
    return ys;
}

/**
 * One tall-sleeve segment of height hs (pour frame, centred on +x, spanning
 * ±π/n): inner wall at R (optional strap rib), outer wall at R + wall, seam
 * ears with teardrop M3 holes every 40 mm and a pry bevel. Prints upright.
 */
export function sleeveSegment(d, hs, n = d.segments) {
    const b = new SolidBuilder();
    const { R } = d;
    const Ro = R + d.wall;
    const alpha = Math.PI / n;
    const delta = Math.asin(EAR_T / Ro);
    const nI = Math.max(16, Math.round(d.nBig * (2 * alpha) / TAU));
    const nO = Math.max(16, Math.round(d.nBig * (2 * (alpha - delta)) / TAU));

    const g = d.groove;
    const inner = [[R, hs]];
    if (g > 0 && hs > 4 * g + 12) {
        const ym = hs / 2;
        inner.push([R, ym + g], [R - g, ym], [R, ym - g]);
    }
    inner.push([R, 0]);
    b.lathe(inner, { n: nI, theta0: -alpha, theta1: alpha });
    b.lathe([[Ro, 0], [Ro, hs]], { n: nO, theta0: -(alpha - delta), theta1: alpha - delta });

    const section = sleeveSection(d, n);
    b.hface(0, section, [], false);
    b.hface(hs, section, [], true);

    const tear = (sc, tc) => {
        const m = 14;
        const pts = [];
        for (let k = 0; k <= m; k++) {
            const a = (135 + 270 * k / m) * DEG;
            pts.push([sc + BOLT_R * Math.cos(a), tc + BOLT_R * Math.sin(a)]);
        }
        pts.push([sc, tc + BOLT_R * Math.SQRT2]);
        return pts;
    };
    const ys = boltHeights(hs);
    const zo = Ro * Math.cos(delta);
    for (const sigma of [1, -1]) {
        const er = [Math.cos(alpha), 0, -sigma * Math.sin(alpha)];
        const et = [Math.sin(alpha), 0, sigma * Math.cos(alpha)];
        const P = (s, t, nn) => [s * er[0] + nn * et[0], t, s * er[2] + nn * et[2]];
        const nOut = [-et[0], 0, -et[2]];
        const tears = ys.map(y => tear(d.boltS, y));
        const seam = [[R, 0], [d.earOut - EAR_BEVEL, 0], [d.earOut - EAR_BEVEL, hs], [R, hs], ...inner.slice(1, -1)];
        b.face(seam, tears, (sc, tc) => P(sc, tc, 0), nOut);
        b.face([[zo, 0], [d.earOut, 0], [d.earOut, hs], [zo, hs]], tears, (sc, tc) => P(sc, tc, EAR_T), et);
        // Bevelled ear end: two mating ears make a V for a pry tool
        const endN = [er[0] * EAR_T - et[0] * EAR_BEVEL, 0, er[2] * EAR_T - et[2] * EAR_BEVEL];
        b.face([[0, 0], [1, 0], [1, hs], [0, hs]], [],
            (a, t) => P(d.earOut - EAR_BEVEL + a * EAR_BEVEL, t, a * EAR_T), endN);
        tears.forEach((t, i) => {
            const a = b.loop(t.map(([sc, tc]) => P(sc, tc, 0)));
            const c = b.loop(t.map(([sc, tc]) => P(sc, tc, EAR_T)));
            b.axialStrip(a, c, P(d.boltS, ys[i], 0), et, false);
        });
    }
    return finish(b, { toPrint: IDENTITY, height: hs, segments: n });
}

/** Pour-frame placement of sleeve segment k (centred between seams k and k+1). */
export function sleeveSegmentMatrix(d, k) {
    return rotY(d.sleeveSeams[k] + Math.PI / d.segments);
}

/** The whole universal kit for these dimensions. */
export function buildKit(d) {
    const parts = [];
    for (let k = 0; k < d.plateTiles; k++) {
        parts.push({ role: 'bedplate', index: k, label: d.plateTiles > 1 ? `Bed plate tile ${k + 1}/${d.plateTiles}` : 'Bed plate', count: 1, ...kitBedPlateTile(d, d.plateTiles, k) });
    }
    for (let k = 0; k < d.lidTiles; k++) {
        parts.push({ role: 'lid', index: k, label: d.lidTiles > 1 ? `Drop-in lid tile ${k + 1}/${d.lidTiles}` : 'Drop-in lid', count: 1, ...kitLidTile(d, d.lidTiles, k) });
    }
    parts.push({ role: 'sleeve', label: `Sleeve segment (h ${d.sleeveH})`, count: d.segments, ...sleeveSegment(d, d.sleeveH) });
    parts.push({ role: 'plugbump', label: 'Key plug, bump', count: 3, ...keyPlug(d, 'bump') });
    parts.push({ role: 'plugpocket', label: 'Key plug, pocket', count: 3, ...keyPlug(d, 'pocket') });
    parts.push({ role: 'puck', label: 'Locating puck', count: 1, ...locatingPuck() });
    return { id: d.kitId, diameter: d.diameter, sleeveH: d.sleeveH, segments: d.segments, plateTiles: d.plateTiles, lidTiles: d.lidTiles, parts };
}

/* ---------- ware parts (tier 2) ---------- */

/** Ring core: band profile with a cone pit in its base for the locating puck. */
function ringCore(u, r) {
    const b = new SolidBuilder();
    const band = bandProfile(u, r);
    const top = band[band.length - 1];
    const profile = [[0, PUCK.corePit], [PUCK.pitR, 0], ...band, [0, top[1]]];
    b.lathe(profile, { n: circleSegments(Math.max(...band.map(p => p[0])), 1.2, 64, 256) });
    return finish(b, { toPour: IDENTITY, toPrint: IDENTITY, base: band[0][0], top: top[0] });
}

/**
 * Footer base, centre piece (pour frame, inverted): the ware's base below the
 * seam (exact above y = 0) on a flange out to rc at the plaster face, whose
 * edge is a 45° cone down to the bed plate (y = −t). The outer locating-ring
 * tiles seat on that cone. rc = rb: the stub alone. Where the foot recess
 * comes down to the seam the stub closes over the axis there.
 */
function footerCentre(result, rc) {
    const prof = footerProfile(result);
    const { t } = FOOT_RING;
    const b = new SolidBuilder();
    const rb = prof[0][0];
    const base = rc > rb + 1e-6 ? [[0, -t], [rc + t, -t], [rc, 0]] : [[0, -t], [rb + t, -t]];
    const back = prof.findIndex((p, i) => i > 0 && p[1] <= 0.05);
    const loop = back > 0
        ? [...base, ...prof.slice(0, back), [prof[back][0], 0], [0, 0]]
        : [...base, ...prof];
    b.lathe(loop, { n: circleSegments(rc + t, 1.2, 64, 256) });
    return finish(b, { toPour: IDENTITY, toPrint: translate(0, t, 0), base: rb, flange: rc });
}

/**
 * Whole footer base in one piece: the stub standing on the locating ring
 * (stub surface exact above y = 0; ring face y = 0 with the key bumps; bench
 * face y = −t; pull tabs at the sleeve seams). The rim centres it, the sleeve
 * stands on it, and the tabs pull the stub straight out of the foot cavity.
 */
function footerBase(d, result) {
    const prof = footerProfile(result);
    const { t } = FOOT_RING;
    const b = new SolidBuilder();
    const rb = prof[0][0];
    const nS = circleSegments(rb + t, 1.2, 64, 256);
    const P3 = (y) => ([u, w]) => [u, y, -w];
    const bumps = keyBumps(b, d, 1, 0, rb);
    const out = footRingOutline(d, rb, 1, 0).outer;
    b.strip(b.loop(out.map(P3(-t))), b.loop(out.map(P3(0))), true);
    b.hface(0, out, [ccw(disc(rb, nS)), ...bumps], true);
    b.hface(-t, out, [], false);
    // The stub's surface: lathe from the ring face at rb (shares the hole's vertices)
    const back = prof.findIndex((p, i) => i > 0 && p[1] <= 0.05);
    const surface = back > 0 ? [...prof.slice(0, back), [prof[back][0], 0], [0, 0]] : prof;
    b.lathe(surface, { n: nS });
    return finish(b, { toPour: IDENTITY, toPrint: translate(0, t, 0), base: rb, flange: null, carriesKeys: true });
}

/** Key bumps on a ring face at y = 0 (tile k of n); returns their 2D outlines. */
function keyBumps(b, d, n, k, rIn) {
    const P3 = (y) => ([u, w]) => [u, y, -w];
    const out = [];
    d.keyAngles.forEach(a => {
        if (!inTile(a, n, k, d.K) || d.K - KEY.r < rIn + 2) return;
        const { cx, cw } = polar(d.K, a);
        out.push(circle2(cx, cw, KEY.r, KEY_SEG));
        keyFormer(b, 'bump', (r, h) => b.loop(circle2(cx, cw, r, KEY_SEG).map(P3(h))),
            (h) => b.vertex([cx, h, -cw]), [cx, 0, -cw], [0, 1, 0]);
    });
    return out;
}

/**
 * Flange radius for a footer whose base is too wide to print whole: as wide
 * as the bed allows, inside the key circle, leaving room for dovetailed tiles.
 */
function centreFlange(d, rb) {
    const { t } = FOOT_RING;
    const rOut = d.rimIn - 0.3;
    const bedR = (Math.min(d.printer.x, d.printer.y) - 6) / 2 - t;
    return Math.max(rb, Math.min(bedR, rOut - t - 26, d.K - KEY.r - 3 - t));
}

/**
 * Outer edge of a locating ring from a0 to a1 with a pull tab at every sleeve
 * seam: a neck through the rim gap, then a paddle on the plate under the ear.
 */
function ringEdge(d) {
    const { tabHalf, paddleHalf, tabReach } = FOOT_RING;
    const neckOut = d.rimOut + 1;
    const reach = d.pr + tabReach;
    return (rOut, a0, a1, nSeg) => {
        const tabs = d.sleeveSeams.map(s => normAngle(s, a0)).filter(s => s - tabHalf / rOut > a0 && s + tabHalf / rOut < a1).sort((x, y) => x - y);
        const pts = [];
        let from = a0;
        const step = (a1 - a0) / nSeg;
        for (const s of tabs) {
            const h = Math.asin(tabHalf / rOut);
            const m = Math.max(1, Math.ceil((s - h - from) / step));
            pts.push(...arcPts(rOut, from, s - h, m));
            const local = (r, q) => [r * Math.cos(s) - q * Math.sin(s), r * Math.sin(s) + q * Math.cos(s)];
            pts.push(local(neckOut, -tabHalf), local(neckOut, -paddleHalf), local(reach, -paddleHalf),
                local(reach, paddleHalf), local(neckOut, paddleHalf), local(neckOut, tabHalf));
            from = s + h;
        }
        pts.push(...arcPts(rOut, from, a1, Math.max(1, Math.ceil((a1 - from) / step))));
        return pts;
    };
}

/** Locating ring outline (tile k of n) at bore radius rIn. */
function footRingOutline(d, rb, n, k, rIn) {
    const rOut = d.rimIn - 0.3;
    const edge = ringEdge(d);
    if (n === 1) {
        const a0 = d.sleeveSeams[0] + Math.PI / d.segments;
        return { outer: ccw(edge(rOut, a0, a0 + TAU, d.nBig).slice(0, -1)), hole: true };
    }
    const rm = (rb + FOOT_RING.clear + FOOT_RING.t + rOut) / 2;
    const nIn = Math.ceil(circleSegments(rb + FOOT_RING.t, 1.2, 64, 256) / n);
    return { outer: ccw(annularTileOutline(rIn, rOut, n, k, rm, nIn, edge)), hole: false };
}

/** Tile count for a footer locating ring (bore radius rb). */
function footRingTiles(d, rb) {
    const rIn = rb + FOOT_RING.clear + FOOT_RING.t;
    for (const n of [1, 3, 4, 5, 6, 8]) {
        const outlines = Array.from({ length: n }, (_, k) => footRingOutline(d, rb, n, k, rIn).outer);
        if (outlines.every(o => fitOnBed(o, d.printer))) return n;
    }
    return 8;
}

/**
 * Footer locating ring, tile k of n (pour frame: plaster face at y = 0, on
 * the bed plate at y = −t). It fills the bed plate's rim under the sleeve, so
 * the rim centres it, and drops over the stub: its 45° conical bore seats on
 * the stub's conical base, centring the stub and holding it down (the sleeve
 * stands on the ring). It carries the footer's three key bumps (→ sockets),
 * so footers need no plugs. Pull tabs at the sleeve seams peel it off the plaster.
 */
function footerRing(d, rb, n, k) {
    const b = new SolidBuilder();
    const { t, clear } = FOOT_RING;
    const levels = [[-t, rb + clear + t], [0, rb + clear]];
    const nIn = circleSegments(rb + t, 1.2, 64, 256);
    const P3 = (y) => ([u, w]) => [u, y, -w];
    const bumps = keyBumps(b, d, n, k, rb);
    if (n === 1) {
        const out = footRingOutline(d, rb, 1, 0).outer;
        b.strip(b.loop(out.map(P3(-t))), b.loop(out.map(P3(0))), true);
        const holes = levels.map(([, r]) => ccw(disc(r, nIn)));
        b.strip(b.loop(holes[1].map(P3(0))), b.loop(holes[0].map(P3(-t))), true);
        b.hface(0, out, [holes[1], ...bumps], true);
        b.hface(-t, out, [holes[0]], false);
    } else {
        const outlines = levels.map(([, r]) => footRingOutline(d, rb, n, k, r).outer);
        b.strip(b.loop(outlines[0].map(P3(-t))), b.loop(outlines[1].map(P3(0))), true);
        b.hface(0, outlines[1], bumps, true);
        b.hface(-t, outlines[0], [], false);
    }
    return finish(b, { toPour: IDENTITY, toPrint: translate(0, t, 0), tile: n > 1 ? { n, k } : null, carriesKeys: true });
}

/**
 * Split insert (pour frame): divider x ∈ [−T, 0], z ∈ [−fl, fl] with the
 * half-core on +x, four divider keys and flange bolt holes at the sleeve's
 * bolt heights. Half A carries bumps (→ sockets), half B pockets (→ male cones).
 * Prints lying on the divider's back face.
 */
function splitInsert(d, u, prof, former) {
    const b = new SolidBuilder();
    const h = u.h;
    const fl = d.earOut;
    const T = DIVIDER_T;
    const nC = circleSegments(Math.max(...prof.map(p => p[0])), 1.2, 64, 256) / 2;
    b.lathe(prof, { n: nC, theta0: -Math.PI / 2, theta1: Math.PI / 2 });

    const keyZ = d.R - 12;
    const ys = [0.25 * h, 0.75 * h];
    const boltYs = boltHeights(d.sleeveH).filter(y => y > 6 && y < h - 6);
    const P0 = (s) => (sc, tc) => [0, tc, s * sc];
    for (const s of [1, -1]) {
        const keys = ys.map(y => circle2(keyZ, y, KEY.r, KEY_SEG));
        const bolts = boltYs.map(y => circle2(d.boltS, y, BOLT_R, BLEED_SEG));
        const outline = [[fl, 0], [fl, h], ...[...prof].reverse().map(([rho, y]) => [rho, y])];
        b.face(outline, [...keys, ...bolts], P0(s), [1, 0, 0]);
        ys.forEach(y => keyFormer(b, former === 'bumps' ? 'bump' : 'pocket',
            (r, hx) => b.loop(circle2(keyZ, y, r, KEY_SEG).map(([sc, tc]) => [hx, tc, s * sc])),
            (hx) => b.vertex([hx, y, s * keyZ]), [0, y, s * keyZ], [1, 0, 0]));
        bolts.forEach((ring2, i) => {
            const a = b.loop(ring2.map(([sc, tc]) => [0, tc, s * sc]));
            const c = b.loop(ring2.map(([sc, tc]) => [-T, tc, s * sc]));
            b.axialStrip(a, c, [0, boltYs[i], s * d.boltS], [1, 0, 0], false);
        });
        b.face([[-T, 0], [0, 0], [0, h], [-T, h]], [], (x, y) => [x, y, s * fl], [0, 0, s]);
    }
    const backHoles = [1, -1].flatMap(s => boltYs.map(y => circle2(s * d.boltS, y, BOLT_R, BLEED_SEG)));
    b.face([[-fl, 0], [fl, 0], [fl, h], [-fl, h]], backHoles, (sc, tc) => [-T, tc, sc], [-1, 0, 0]);
    const end = (rho, n) => [
        [-T, -fl], [0, -fl], [0, -rho],
        ...Array.from({ length: n - 1 }, (_, k) => {
            const t = -Math.PI / 2 + Math.PI * (k + 1) / n;
            return [rho * Math.cos(t), rho * Math.sin(t)];
        }),
        [0, rho], [0, fl], [-T, fl]
    ];
    b.hface(0, end(prof[0][0], nC), [], false);
    b.hface(h, end(prof[prof.length - 1][0], nC), [], true);
    // Print: lie on the back face, (x, y, z) → (y, x + T, −z)
    return finish(b, { toPour: IDENTITY, toPrint: [0, 1, 0, 0, 1, 0, 0, T, 0, 0, -1, 0] });
}

/** Extruded closed polygon (x, −z) between y0 and y1. */
function prism(b, poly, y0, y1) {
    const p = ccw(poly);
    b.strip(b.loop(p.map(([u, w]) => [u, y0, -w])), b.loop(p.map(([u, w]) => [u, y1, -w])), true);
    b.hface(y0, p, [], false);
    b.hface(y1, p, [], true);
}

/**
 * Slit tube: forms the well bore. Printed as a C with a hairline kerf and
 * sized so that with the edges taped together (inside) its outer face is the
 * bore radius rw. After the set, peel the tape and ease an edge inward.
 */
function slitTube(rw, hTube) {
    const b = new SolidBuilder();
    const ro = rw + TUBE_KERF / TAU;
    const half = (TUBE_KERF / 2) / ro;
    const t0 = SLIT_ANGLE + half;
    const t1 = SLIT_ANGLE + TAU - half;
    const n = circleSegments(ro, 1.6, 48, 256);
    prism(b, [...arcPts(ro, t0, t1, n), ...arcPts(ro - TUBE_T, t1, t0, n)], 0, hTube);
    return finish(b, { toPour: IDENTITY, toPrint: IDENTITY });
}

/**
 * Well locator: a spoked ring, 8 mm deep. Its hub drops over the locating
 * puck and the slit tube slides over its rim, so the bore is centred on the axis.
 */
function wellLocator(rw) {
    const b = new SolidBuilder();
    const rl = rw - TUBE_T - 0.3;
    const t = 8; // the tube's bottom 8 mm slides over the rim
    const hubR = PUCK.midR + 0.2;
    const rIn = hubR + 6;
    const rOut = rl - 7;
    const features = [{ kind: 'hole', cx: 0, cw: 0, r: hubR, n: 48 }];
    if (rOut - rIn > 10) {
        [60, 180, 300].forEach(deg => {
            const c = deg * DEG;
            const wIn = Math.PI / 3 - Math.asin(6 / rIn);
            const wOut = Math.PI / 3 - Math.asin(6 / rOut);
            features.push({
                kind: 'cutout', poly: [...arcPts(rOut, c - wOut, c + wOut, segFor(rOut, -wOut, wOut)),
                    ...arcPts(rIn, c + wIn, c - wIn, segFor(rIn, -wIn, wIn, 1.6))]
            });
        });
    }
    plate(b, { outline: disc(rl, circleSegments(rl, 1.6, 48, 256)), y0: 0, y1: t, features });
    return finish(b, { toPour: IDENTITY, toPrint: IDENTITY });
}

/** Fallback when a foot recess dips below the seam: a fused, ware-specific footer plate. */
function fusedFooterPlate(d, core) {
    const b = new SolidBuilder();
    const dip = Math.max(0, -Math.min(...core.map(p => p[1])));
    const T = Math.max(d.T, dip + 2);
    const features = [
        ...rimArcs(d, 1, 0, d.rimIn, d.rimOut, RIM_H),
        ...d.keyAngles.map(a => ({ kind: 'bump', ...polar(d.K, a) })),
        { kind: 'core', profile: core, n: circleSegments(core[0][0], 1.2, 64, 256) }
    ];
    plate(b, { outline: disc(d.pr, d.nBig), y0: -T, y1: 0, features });
    return finish(b, { toPour: IDENTITY, toPrint: translate(0, T, 0), dip });
}

/* ---------- per-unit assembly ---------- */

/**
 * Where the kit parts sit for a unit (print frame → pour frame). `role`
 * matches a kit part's role; bed plate / lid tiles carry their index.
 */
function kitUse(d, u, fused) {
    const uses = [];
    const T = d.T;
    if (!fused) {
        // A footer stands its locating ring on the plate: the plate sits t lower
        const drop = u.kind === 'footer' ? translate(0, -FOOT_RING.t, 0) : IDENTITY;
        for (let k = 0; k < d.plateTiles; k++) uses.push({ role: 'bedplate', index: k, matrix: drop });
        const bedType = u.kind === 'footer' ? null
            : u.bedFormer.former === 'bumps' ? 'plugbump' : u.bedFormer.former === 'pockets' ? 'plugpocket' : null;
        if (bedType) {
            d.keyAngles.forEach(a => {
                const { cx, cw } = polar(d.K, a);
                uses.push({ role: bedType, matrix: translate(cx, -T, -cw), key: a, at: 'bed' });
            });
        }
    }
    if (u.lidFormer) {
        for (let k = 0; k < d.lidTiles; k++) uses.push({ role: 'lid', index: k, matrix: translate(0, u.h, 0) });
        const lidType = u.lidFormer.former === 'bumps' ? 'plugbump' : 'plugpocket';
        d.keyAngles.forEach(a => {
            const { cx, cw } = polar(d.K, a);
            uses.push({ role: lidType, matrix: composeMatrix(translate(cx, 0, -cw), flipX(u.h + T)), key: a, at: 'lid' });
        });
    }
    if (u.kind === 'split') {
        uses.push({ role: 'sleeve', matrix: IDENTITY, half: 'A' });
        uses.push({ role: 'sleeve', matrix: rotY(Math.PI), half: 'B' });
    } else {
        for (let k = 0; k < d.segments; k++) uses.push({ role: 'sleeve', matrix: sleeveSegmentMatrix(d, k) });
    }
    if (u.kind === 'ring' || u.kind === 'well') uses.push({ role: 'puck', matrix: translate(0, -PUCK.pitDepth, 0) });
    return uses;
}

function unitWareParts(result, d, u) {
    const parts = [];
    const add = (role, label, part, extra = {}) => parts.push({ role, label, count: 1, ...part, ...extra });
    if (u.kind === 'ring') {
        add('core', 'Core', ringCore(u, result.r));
    } else if (u.kind === 'footer') {
        const prof = footerProfile(result);
        const dip = -Math.min(...prof.map(p => p[1]));
        if (dip > 1e-6) {
            add('bedplate', 'Footer plate + stub (fused: the foot recess dips below the seam)', fusedFooterPlate(d, prof), { fused: true, carriesKeys: true });
        } else {
            const rb = prof[0][0];
            if (footRingTiles(d, rb) === 1) {
                add('footbase', 'Footer base (stub + locating ring)', footerBase(d, result));
            } else {
                // Too wide for the bed: the stub on a flange, ringed by dovetailed tiles
                const rc = centreFlange(d, rb);
                add('footbase', 'Footer base, centre (stub on a flange)', footerCentre(result, rc));
                const n = footRingTiles(d, rc);
                for (let k = 0; k < n; k++) {
                    add('footring', `Locating ring tile ${k + 1}/${n}`, footerRing(d, rc, n, k), { index: k });
                }
            }
        }
    } else if (u.kind === 'well') {
        const hTube = u.h + 5;
        add('slittube', 'Slit tube', slitTube(result.rw, hTube));
        add('locator', 'Tube locator', wellLocator(result.rw));
    } else if (u.kind === 'split') {
        const core = bandProfile(u, result.r);
        // Both halves use the full kit plate and lid; plugs on the empty side sit idle
        add('insertA', 'Insert A (divider bumps)', splitInsert(d, u, core, 'bumps'), { half: 'A' });
        add('insertB', 'Insert B (divider pockets)', splitInsert(d, u, core, 'pockets'), { half: 'B', toPour: rotY(Math.PI) });
    }
    return parts;
}

/**
 * Build every printable part.
 * @returns {{ dims, kit, units: Array<{ unit, parts, kitUse }> }}
 */
export function buildCastingParts(result, partParams = {}) {
    const d = moldDimensions(result, partParams);
    const kit = buildKit(d);
    const units = result.units.map(u => {
        const parts = unitWareParts(result, d, u);
        const fused = parts.some(p => p.fused);
        return { unit: u, parts, kitUse: kitUse(d, u, fused), fused };
    });
    return { dims: d, kit, units };
}

/* ---------- display meshes (mold frame) ---------- */

/** Plaster piece cross-section loop [[ρ, z], ...] (CCW) for a unit. */
export function plasterLoop(result, u, d) {
    const { r } = result;
    const R = d.R;
    const outerSide = (z0, z1) => {
        const g = d.groove;
        const h = z1 - z0;
        if (!(g > 0 && h > 4 * g + 12)) return [[R, z0], [R, z1]];
        const zm = (z0 + z1) / 2;
        return [[R, z0], [R, zm - g], [R - g, zm], [R, zm + g], [R, z1]];
    };
    if (u.kind === 'footer') {
        const stub = footerProfile(result).map(([rho, y]) => [rho, result.f - y]);
        return [[0, u.a], [R, u.a], ...outerSide(u.a, u.b).slice(1), ...stub];
    }
    if (u.kind === 'well') {
        return [[result.rw, u.a], [R, u.a], ...outerSide(u.a, u.b).slice(1), [result.rw, u.b]];
    }
    const cavity = [];
    const n = Math.max(2, Math.ceil(u.h / 0.75));
    for (let i = n; i >= 0; i--) {
        const z = u.a + u.h * i / n;
        cavity.push([r(z), z]);
    }
    return [[r(u.a), u.a], [R, u.a], ...outerSide(u.a, u.b).slice(1), ...cavity.slice(0, -1)];
}

/**
 * The part of the ware inside one unit's height band, as a closed (ρ, z)
 * loop for a display lathe; null when the unit holds none (well collar).
 */
export function wareSliceLoop(result, u) {
    const { r, H, profile } = result;
    const a = Math.max(u.a, 0);
    const b = Math.min(u.b, H);
    if (b <= a + 1e-6) return null;
    const pts = [];
    if (a <= 1e-6) {
        const under = (profile.underside?.length ? profile.underside : [{ rho: 0, z: 0 }, { rho: r(0), z: 0 }])
            .slice().sort((p, q) => p.rho - q.rho);
        under.forEach(p => pts.push([p.rho, Math.min(p.z, b)]));
    } else {
        pts.push([0, a]);
    }
    const n = Math.max(2, Math.ceil((b - a) / 0.75));
    for (let i = 0; i <= n; i++) {
        const z = a + (b - a) * i / n;
        pts.push([r(z), z]);
    }
    pts.push([0, b]);
    return pts;
}

export { at, KEY, PLUG, PUCK, JACK, FOOT_RING, TUBE_T, SLIT_ANGLE };
