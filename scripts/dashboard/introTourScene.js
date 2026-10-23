/**
 * Playground Ceramics - Intro tour scene
 *
 * The animated drawing above the tour's copy, in the View settings' Line Art style
 * (scripts/ui/viewerStyle.js): paper-filled forms, a 1.4 px ink outline and 1 px crease
 * lines at rims and feet. Every form is a real profile revolved in a gentle perspective.
 *
 * One drawing carries the whole tour: a floor of dinnerware (welcome) whose middle vase lifts
 * out and becomes each form tool (forms); a mug gains a handle, a Cast Form mold assembles and
 * opens, a Stacked Mold lifts apart (handles & molds); the mug drops into a generator whose
 * Belly dial reshapes it (generator); the generator shrinks into a project card (projects).
 * One animation loop drives every value, so each step eases out of the last in either direction.
 */

export const TOOL_INFO = {
    dinnerware: { name: 'Dinnerware Set', color: '#1ABCFE' },
    vessel: { name: 'Vessel', color: '#A259FF' },
    'vessel-v2': { name: 'Bezier Vessel', color: '#00A6A6' },
    handle: { name: 'Mug Handle', color: '#FF2AD4' },
    castform: { name: 'Cast Form', color: '#C45C26' },
    stackedmold: { name: 'Stacked Mold', color: '#D9A21B' }
};

const CX = 400, B = 262; // axis x and base y in the 800 × 330 drawing
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const f = (n) => n.toFixed(1);
const io = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const out = (t) => 1 - Math.pow(1 - t, 4);
const linear = (t) => t;
const mix = (a, b, t) => (Array.isArray(a) ? a.map((v, i) => mix(v, b[i], t)) : a + (b - a) * t);

// ---------- Profiles: six points, foot to lip, as [radius, height] ----------
const SHAPES = {
    vessel: [[44, 0], [70, 22], [94, 80], [72, 152], [34, 194], [44, 214]],
    bowl: [[48, 0], [56, 7], [96, 34], [128, 72], [146, 104], [150, 112]],
    bezier: [[52, 0], [60, 8], [64, 58], [60, 116], [78, 170], [108, 202]],
    mug: [[52, 0], [58, 5], [61, 34], [63, 92], [64, 132], [64, 142]],
    mugB: [[52, 0], [60, 5], [76, 36], [80, 82], [68, 124], [64, 142]],
    plate: [[62, 0], [68, 4], [118, 9], [158, 14], [182, 21], [190, 24]],
    tumbler: [[46, 0], [50, 3], [52, 40], [56, 90], [60, 128], [62, 136]],
    cup: [[34, 0], [40, 5], [58, 26], [70, 50], [76, 68], [78, 72]]
};

// Catmull-Rom through the profile points, sampled
function sample(pts, per = 16) {
    const e = [pts[0], ...pts, pts[pts.length - 1]];
    const samples = [];
    for (let i = 1; i < e.length - 2; i++) {
        const [p0, p1, p2, p3] = [e[i - 1], e[i], e[i + 1], e[i + 2]];
        for (let s = 0; s < per; s++) {
            const t = s / per, t2 = t * t, t3 = t2 * t;
            samples.push([0, 1].map((j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t
                + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3)));
        }
    }
    samples.push(pts[pts.length - 1]);
    return samples;
}

function rAt(S, y) {
    if (y <= S[0][1]) return S[0][0];
    for (let i = 1; i < S.length; i++) {
        if (S[i][1] >= y) {
            const [r0, y0] = S[i - 1], [r1, y1] = S[i];
            return r0 + (r1 - r0) * ((y - y0) / Math.max(1e-6, y1 - y0));
        }
    }
    return S[S.length - 1][0];
}

// Gentle perspective from above: ellipses open up lower down and sit a little narrower, so
// verticals converge slightly toward the floor. TILT > 1 looks down more steeply (the welcome floor).
let TILT = 1;
const kAt = (y) => (0.27 - y * 0.00052) * TILT;
const sc = (y) => 1 + (y - 120) * 0.0003;
const P = (r, t, y) => [CX + r * sc(y) * Math.cos(t), B - y + r * sc(y) * Math.sin(t) * kAt(y)];
const poly = (pts) => (pts.length < 2 ? '' : `M${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join('L')}`);
const arc = (r, y, a, b, n = 64) => {
    const pts = [];
    for (let i = 0; i <= n; i++) pts.push(P(r, a + (b - a) * (i / n), y));
    return pts;
};
const shift = (pts, ox, oy) => pts.map(([x, y]) => [x + ox, y + oy]);

// ---------- Forms: outline (sil), crease lines, paper fill ----------
function formPaths(pts, rev = 1) {
    const S = sample(pts);
    const top = S[S.length - 1], foot = S[0], h = top[1];
    const A = rev * Math.PI;
    const res = { S, h };
    if (rev <= 0.001) return { ...res, sil: '', crease: '', fill: '', rimFill: '', rim: '', construct: '', sweep: '' };

    const inner = Math.max(top[0] - 4.5, 3);
    res.sil = poly(S.map(([r, y]) => P(r, 0, y))) + (rev >= 0.999 ? poly(S.map(([r, y]) => P(r, Math.PI, y))) : '');
    res.crease = poly(arc(foot[0], 0, 0, A));
    // The opening is drawn last, filled with paper: seen from above you look into the
    // piece, so the rim hides the foot and the far wall (a plate becomes its rim and well)
    res.rimFill = rev >= 0.999 ? `${poly(arc(top[0], h, 0, Math.PI * 2))}Z` : '';
    res.rim = poly(arc(top[0], h, 0, A)) + poly(arc(top[0], h, 0, -A))
        + poly(arc(inner, h, 0, A)) + poly(arc(inner, h, 0, -A));
    if (h < 40 && rev >= 0.999) res.rim += poly(arc(pts[2][0], pts[2][1], 0, Math.PI * 2)); // plate well

    res.fill = rev < 0.5 ? '' : `${poly([
        ...S.map(([r, y]) => P(r, 0, y)),
        ...arc(top[0], h, 0, -Math.PI),
        ...S.slice().reverse().map(([r, y]) => P(r, Math.PI, y)),
        ...arc(foot[0], 0, Math.PI, 0)
    ])}Z`;

    // construction lines while the profile sweeps round: rings and trailing meridians
    let construct = [0.22, 0.44, 0.66, 0.86].map((k) => poly(arc(rAt(S, h * k), h * k, 0, A))).join('');
    for (let j = 1; j < 8; j++) {
        const t = (j * Math.PI) / 8;
        if (t < A) construct += poly(S.map(([r, y]) => P(r, t, y)));
    }
    res.construct = construct;
    res.sweep = rev < 0.999 ? poly(S.map(([r, y]) => P(r, A, y))) : '';
    return res;
}

const formSvg = (F) => `<path class="ts-paper" d="${F.fill}"/><path class="ts-crease" d="${F.crease}"/><path class="ts-sil" d="${F.sil}"/>`
    + `<path class="ts-paper" d="${F.rimFill}"/><path class="ts-crease" d="${F.rim}"/>`;

// Squared handle (Hasami-style): an outer and an inner edge, each arm meeting the wall
function handlePaths(S, h) {
    const yT = h * 0.76, yB = h * 0.3, t = 9;
    let rMax = 0;
    S.forEach(([r, y]) => { if (y >= yB && y <= yT) rMax = Math.max(rMax, r * sc(y)); });
    const wall = (y) => P(rAt(S, y), 0, y)[0] - 0.3;
    const Y1 = B - yT, Y2 = B - yB;
    const xo = CX + rMax + 46, xi = xo - t;
    const outer = `M${f(wall(yT + t / 2))} ${f(Y1 - t / 2)}H${f(xo - 16)}Q${f(xo)} ${f(Y1 - t / 2)} ${f(xo)} ${f(Y1 - t / 2 + 16)}V${f(Y2 + t / 2 - 16)}Q${f(xo)} ${f(Y2 + t / 2)} ${f(xo - 16)} ${f(Y2 + t / 2)}H${f(wall(yB - t / 2))}`;
    const inner = `M${f(wall(yT - t / 2))} ${f(Y1 + t / 2)}H${f(xi - 7)}Q${f(xi)} ${f(Y1 + t / 2)} ${f(xi)} ${f(Y1 + t / 2 + 7)}V${f(Y2 - t / 2 - 7)}Q${f(xi)} ${f(Y2 - t / 2)} ${f(xi - 7)} ${f(Y2 - t / 2)}H${f(wall(yB + t / 2))}`;
    return { outer, inner, xo, mid: (Y1 + Y2) / 2 };
}

// One mold piece: an annular sector between heights y0 and y1, moved by (ox, oy).
// Returns its outline (silhouette verticals), crease lines and a paper fill.
function sector(ta, tb, rOut, rIn, y0, y1, ox = 0, oy = 0) {
    const d = Math.PI / 180, a = ta * d, b = tb * d, full = tb - ta >= 359;
    const mv = (pts) => shift(pts, ox, oy);
    let crease = poly(mv(arc(rOut, y1, a, b)));
    if (rIn > 0) crease += poly(mv(arc(rIn, y1, a, b)));
    if (!full) for (const t of [a, b]) crease += poly(mv([P(rIn, t, y1), P(rOut, t, y1)]));
    let sil = '';
    [a, b, 0, Math.PI].filter((t) => t >= a - 1e-6 && t <= b + 1e-6 && Math.sin(t) >= -1e-6).forEach((t) => {
        const edge = poly(mv([P(rOut, t, y0), P(rOut, t, y1)]));
        if (Math.abs(Math.sin(t)) < 1e-6) sil += edge; else crease += edge;
    });
    const fa = Math.max(a, 0), fb = Math.min(b, Math.PI);
    if (fb > fa) sil += poly(mv(arc(rOut, y0, fa, fb)));
    const face = `${poly(mv([...arc(rOut, y1, a, b), ...arc(rOut, y0, b, a)]))}Z`;
    const lid = full
        ? `${poly(mv(arc(rOut, y1, 0, Math.PI * 2)))}Z`
        : `${poly(mv([...arc(rOut, y1, a, b), ...arc(rIn, y1, b, a)]))}Z`;
    return { sil, crease, fill: face + lid };
}
const pieces = (list) => list.map((pc) =>
    `<path class="ts-paper" d="${pc.fill}"/><path class="ts-crease" d="${pc.crease}"/><path class="ts-sil" d="${pc.sil}"/>`).join('');

function moldSize(S, h) {
    let rMax = 0;
    S.forEach(([r]) => { rMax = Math.max(rMax, r); });
    return { Rm: rMax + 28, yTop: h + 20, well: S[S.length - 1][0] * 0.85 };
}

// Cast Form: three wall pieces at 120° and a foot, pushed out radially by e (back to front)
function castPaths(S, h, e) {
    const { Rm, yTop, well } = moldSize(S, h);
    const piece = (ta, tb, c) => {
        const t = (c * Math.PI) / 180;
        const lift = c === 270 ? e * 0.35 : 0;
        return sector(ta, tb, Rm, well, 0, yTop, e * Math.cos(t), e * Math.sin(t) * kAt(yTop / 2) - lift);
    };
    return [piece(210, 330, 270), sector(0, 360, Rm, 0, -14, 0, 0, e * 0.7), piece(90, 210, 150), piece(-30, 90, 30)];
}

// Stacked Mold: footer, two rings and a collar, lifted apart by e (bottom band first)
function stackPaths(S, h, e) {
    const { Rm, yTop, well } = moldSize(S, h);
    const cuts = [-14, h * 0.28, h * 0.56, h * 0.84, yTop];
    const list = [];
    for (let i = 0; i < 4; i++) {
        const y1 = cuts[i + 1];
        list.push(sector(0, 360, Rm, i === 3 ? well : rAt(S, Math.min(y1, h)), cuts[i], y1, 0, -i * e * 16));
    }
    return list;
}

// ---------- Static layout: welcome floor, generator frame, project cards ----------
const GRID_TILT = 1.75;
const GRID = [
    ['plate', 'vessel', 'bowl', 'tumbler', 'bezier', 'plate', 'cup'],
    ['bowl', 'mug', 'cup', 'vessel', 'plate', 'mug', 'tumbler'],
    ['tumbler', 'plate', 'bezier', 'bowl', 'mug', 'cup', 'bowl']
]; // back row first; the middle-row vase is the live form
const HERO = { r: 1, c: 3 };
const depthScale = (z) => 0.34 * (1 - z * 0.00058);
const rowZ = (r) => (GRID.length - 1 - r) * 330;
const floorY = (z) => 284 - z * 0.3;
const slot = (r, c) => {
    const z = rowZ(r), s = depthScale(z);
    return { x: CX + (c - 3) * 340 * s, y: floorY(z), s };
};
const HERO_SLOT = slot(HERO.r, HERO.c);

const CARD = { w: 196, h: 140, gap: 14, x0: 92, y0: 22 };
const cardXY = (i) => [CARD.x0 + (i % 3) * (CARD.w + CARD.gap), CARD.y0 + Math.floor(i / 3) * (CARD.h + 12)];
const CARDS = [
    [null, 'Everyday mug', 'Dinnerware Set'],
    ['bowl', 'Soup bowl', 'Dinnerware Set'],
    ['vessel', 'Bud vase', 'Vessel'],
    ['bezier', 'Tulip vase', 'Bezier Vessel'],
    ['vessel', 'Bud vase mold', 'Cast Form', 'cast'],
    ['bezier', 'Tulip vase mold', 'Stacked Mold', 'stack']
];
const DIALS = ['Height', 'Belly', 'Rim'];

// Generator floor: x narrows toward the back (negative z), so it recedes like the viewport's grid
const floorPt = (x, z) => [CX + x * sc(0) * (1 + z * 0.0016), B + z * kAt(0) * 1.3];

function buildMarkup() {
    // Welcome floor of dinnerware, drawn at the steeper tilt
    TILT = GRID_TILT;
    let floor = '';
    for (let k = 0; k <= 8; k++) {
        const gx = (k - 4) * 340;
        floor += poly([[CX + gx * depthScale(-165), floorY(-165)], [CX + gx * depthScale(825), floorY(825)]]);
    }
    for (const z of [-165, 165, 495, 825]) {
        floor += poly([[CX - 1500 * depthScale(z), floorY(z)], [CX + 1500 * depthScale(z), floorY(z)]]);
    }
    const gridItems = [];
    let gridHtml = `<path data-ts="gridFloor" class="ts-grid" d="${floor}"/>`;
    GRID.forEach((row, r) => row.forEach((name, c) => {
        if (r === HERO.r && c === HERO.c) return;
        const F = formPaths(SHAPES[name], 1);
        let extra = '';
        if (name === 'mug') {
            const Hd = handlePaths(F.S, F.h);
            extra = `<path class="ts-paper" d="${Hd.outer}"/><path class="ts-sil" d="${Hd.outer}"/><path class="ts-sil" d="${Hd.inner}"/>`;
        }
        const sl = slot(r, c);
        const dist = Math.hypot((sl.x - HERO_SLOT.x) / 400, (sl.y - HERO_SLOT.y) / 140);
        gridHtml += `<g data-g="${gridItems.length}" style="opacity:0">${formSvg(F)}${extra}</g>`;
        gridItems.push({ ...sl, dist: Math.min(1, dist) });
    }));
    TILT = 1;

    const cardsHtml = CARDS.map(([shape, name, tool, mold], i) => {
        const [x, y] = cardXY(i);
        let art = '';
        if (shape) {
            const F = formPaths(SHAPES[shape], 1);
            const { Rm, yTop } = moldSize(F.S, F.h);
            const w = mold ? Rm * 2.1 : 2.1 * Math.max(...F.S.map(([r]) => r));
            const s = Math.min(150 / w, 74 / ((mold ? yTop + 14 : F.h) + 14));
            const tx = x + CARD.w / 2 - CX * s, ty = y + (mold ? 84 : 90) - B * s;
            const body = mold
                ? `${pieces(mold === 'cast' ? castPaths(F.S, F.h, 0) : stackPaths(F.S, F.h, 0.35))}<path class="ts-crease" style="opacity:.35" d="${F.sil + F.crease + F.rim}"/>`
                : formSvg(F);
            art = `<g transform="translate(${f(tx)} ${f(ty)}) scale(${s.toFixed(4)})">${body}</g>`;
        }
        return `<g data-card="${i}" style="opacity:0">
            <rect class="ts-panel" x="${x}" y="${y}" width="${CARD.w}" height="${CARD.h}" rx="10"/>
            ${art}
            <text class="ts-strong" x="${x + 12}" y="${y + CARD.h - 24}">${name}</text>
            <text class="ts-dim" x="${x + 12}" y="${y + CARD.h - 10}">${tool}</text></g>`;
    }).join('');

    const dialsHtml = DIALS.map((name, i) => {
        const y = 82 + i * 42;
        return `<text x="552" y="${y}">${name}</text>
            <text data-ts="dv${i}" class="ts-strong" x="678" y="${y}" text-anchor="end"></text>
            <line class="ts-grid" style="opacity:.3" x1="552" y1="${y + 12}" x2="678" y2="${y + 12}"/>
            <line data-ts="df${i}" class="ts-sil" x1="552" y1="${y + 12}" x2="600" y2="${y + 12}"/>
            <circle data-ts="dk${i}" class="ts-knob" cx="600" cy="${y + 12}" r="3.5"/>`;
    }).join('');

    let genGrid = '';
    for (let v = -240; v <= 240; v += 60) genGrid += poly([floorPt(v, -180), floorPt(v, 180)]);
    for (let v = -180; v <= 180; v += 60) genGrid += poly([floorPt(-240, v), floorPt(240, v)]);

    const markup = `
        <g data-ts="cards">${cardsHtml}</g>
        <g data-ts="gridArt">${gridHtml}</g>
        <g data-ts="world">
            <g data-ts="app">
                <rect class="ts-paper" x="96" y="10" width="608" height="304" rx="10"/>
                <rect class="ts-crease" x="96" y="10" width="608" height="304" rx="10" style="opacity:.35"/>
                <line class="ts-grid" x1="96" y1="40" x2="704" y2="40" style="opacity:.3"/>
                <text class="ts-strong" x="114" y="29">Everyday mug</text>
                <text x="672" y="29" text-anchor="end">File</text>
                <path class="ts-crease" style="opacity:.6" d="M679 24l3.5 3.5l3.5-3.5"/>
                <rect class="ts-panel" x="540" y="54" width="150" height="150" rx="8"/>
                ${dialsHtml}
                <g transform="translate(128 278)">
                    <path class="ts-crease" style="opacity:.7" d="M0 -12l11 6v13l-11 6l-11-6v-13z M0 1l11-7 M0 1v12 M0 1l-11-7"/>
                </g>
            </g>
            <g data-ts="formG">
                <g data-ts="floor">
                    <path class="ts-grid" d="${genGrid}"/>
                    <path class="ts-axis" style="stroke:#E5484D" d="${poly([floorPt(0, 0), floorPt(240, 0)])}"/>
                    <path class="ts-axis" style="stroke:#30A46C" d="${poly([floorPt(0, 0), floorPt(0, -180)])}"/>
                    <path class="ts-axis" style="stroke:#3E63DD" d="${poly([[CX, B], [CX, B - 46]])}"/>
                </g>
                <path data-ts="fill" class="ts-paper"/>
                <path data-ts="construct" class="ts-construct"/>
                <path data-ts="sweep" class="ts-construct"/>
                <path data-ts="crease" class="ts-crease"/>
                <path data-ts="sil" class="ts-sil"/>
                <path data-ts="rimFill" class="ts-paper"/>
                <path data-ts="rim" class="ts-crease"/>
                <g data-ts="pens"></g>
                <path data-ts="handleO" class="ts-sil"/>
                <path data-ts="handleI" class="ts-sil"/>
                <g data-ts="cast"></g>
                <g data-ts="stack"></g>
                <path data-ts="ghost" class="ts-crease"/>
            </g>
        </g>
        <g data-ts="labels"></g>`;
    return { markup, gridItems };
}

const INITIAL = () => ({
    shape: SHAPES.vessel.map((p) => [...p]), pens: 0, rev: 1,
    handle: 0, castA: 0, cExp: 1, stackA: 0, sExp: 1, app: 0, place: 0, card: 0, cards: 0,
    dial: 0.45, live: 0, grid: 1, hero: 0, intro: 0
});

/**
 * Mount the scene into an <svg viewBox="0 0 800 330">.
 * @returns {{ reset: Function, show: (step: number, first?: boolean) => void, start: Function, stop: Function }}
 */
export function createTourScene(svg) {
    const { markup, gridItems } = buildMarkup();
    svg.innerHTML = markup;
    const q = (key) => svg.querySelector(`[data-ts="${key}"]`);
    const el = {};
    ['fill', 'construct', 'sweep', 'crease', 'sil', 'rimFill', 'rim', 'pens', 'handleO', 'handleI', 'cast', 'stack',
     'ghost', 'app', 'formG', 'world', 'floor', 'gridFloor', 'labels'].forEach((k) => { el[k] = q(k); });
    const dials = [0, 1, 2].map((i) => ({ v: q(`dv${i}`), fill: q(`df${i}`), knob: q(`dk${i}`) }));
    const gridEls = [...svg.querySelectorAll('[data-g]')];
    const cardEls = [...svg.querySelectorAll('[data-card]')];

    let V = INITIAL();
    let anims = [];
    let timers = [];
    let clock = performance.now();
    let raf = 0;
    let penSel = 2; // the one selected pen point; only its handles are shown
    let reduced = false;
    const labelEls = new Map();

    function to(key, target, dur = 900, delay = 0, ease = io) {
        if (reduced) { dur = 1; delay = Math.min(delay, 1); }
        anims.push({ key, target, dur, start: clock + delay, ease, from: null });
    }
    function setNow(key, value) {
        anims = anims.filter((a) => a.key !== key);
        V[key] = value;
    }
    const later = (ms, fn) => timers.push(setTimeout(fn, reduced ? 0 : ms));

    // Draw a stroke on by its real length (pathLength is unreliable with non-scaling strokes)
    function drawOn(path, t) {
        if (t >= 0.999) { path.style.strokeDasharray = ''; return; }
        const len = path.getTotalLength();
        path.style.strokeDasharray = `${f(len * t)} ${f(len + 2)}`;
    }

    // Callouts with a hairline leader, or a caption under the form
    function setLabels(list) {
        const keep = new Set(list.map((l) => l.id));
        for (const [id, g] of labelEls) {
            if (!keep.has(id)) { to(`L${id}`, 0, 300); g.dataset.dying = '1'; }
        }
        list.forEach((l) => {
            let g = labelEls.get(l.id);
            if (!g) {
                g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                el.labels.append(g);
                labelEls.set(l.id, g);
                V[`L${l.id}`] = 0;
            }
            delete g.dataset.dying;
            const end = l.anchor === 'end';
            const dot = l.color ? `style="fill:${l.color}"` : 'class="ts-dot"';
            const tx = f(l.lx + (end ? -6 : 6));
            const anchor = end ? 'end' : 'start';
            g.innerHTML = l.caption
                ? `<circle cx="${f(l.x - l.w / 2 - 9)}" cy="${f(l.y - 3.5)}" r="2.5" ${dot}/><text class="ts-strong" x="${f(l.x - l.w / 2)}" y="${l.y}">${l.text}</text>`
                : `<circle cx="${f(l.x)}" cy="${f(l.y)}" r="2" ${dot}/>
                   <line class="ts-crease" style="opacity:.4" x1="${f(l.x)}" y1="${f(l.y)}" x2="${f(l.lx)}" y2="${f(l.ly)}"/>
                   <text class="ts-strong" x="${tx}" y="${f(l.ly + 3.5)}" text-anchor="${anchor}">${l.text}</text>
                   ${l.sub ? `<text class="ts-dim" x="${tx}" y="${f(l.ly + 17)}" text-anchor="${anchor}">${l.sub}</text>` : ''}`;
            to(`L${l.id}`, 1, 600, l.delay || 0, out);
        });
    }

    function render(now) {
        clock = now;
        const done = [];
        anims.sort((a, b) => a.start - b.start);
        for (const a of anims) {
            if (now < a.start) continue;
            if (a.from === null) {
                a.from = structuredClone(V[a.key]);
                anims.forEach((o) => { if (o !== a && o.key === a.key && o.from !== null && o.start <= a.start) done.push(o); });
            }
            const t = clamp((now - a.start) / a.dur);
            V[a.key] = mix(a.from, a.target, a.ease(t));
            if (t >= 1) done.push(a);
        }
        if (done.length) anims = anims.filter((a) => !done.includes(a));

        // the live dial in the generator reshapes the mug
        const dial = mix(V.dial, 0.5 + 0.42 * Math.sin(now / 900), V.live);
        const shape = mix(V.shape, mix(SHAPES.mug, SHAPES.mugB, clamp(dial)), V.live);

        TILT = mix(GRID_TILT, 1, V.hero);
        const F = formPaths(shape, V.rev);
        const ghost = Math.max(V.castA, V.stackA);

        el.sil.setAttribute('d', F.sil);
        el.crease.setAttribute('d', F.crease);
        el.rim.setAttribute('d', F.rim);
        el.rimFill.setAttribute('d', F.rimFill);
        el.sil.style.opacity = el.crease.style.opacity = el.rim.style.opacity = el.rimFill.style.opacity = 1 - ghost;
        el.fill.setAttribute('d', F.fill);
        el.fill.style.opacity = smooth(0.7, 1, V.rev) * (1 - ghost);
        const building = smooth(0, 0.04, V.rev) * (1 - smooth(0.82, 1, V.rev));
        el.construct.setAttribute('d', F.construct);
        el.construct.style.opacity = 0.22 * building;
        el.sweep.setAttribute('d', F.sweep);
        el.sweep.style.opacity = 0.5 * building;

        // pen points along the right-hand profile; only the selected one shows its handles
        if (V.pens > 0.01) {
            const pts = shape;
            const sel = pts[penSel];
            const prev = pts[Math.max(0, penSel - 1)], next = pts[Math.min(pts.length - 1, penSel + 1)];
            const reach = smooth(0.6, 1, V.pens);
            const tr = ((next[0] - prev[0]) / 3.2) * reach, ty = ((next[1] - prev[1]) / 3.2) * reach;
            const [h1x, h1y] = P(sel[0] - tr, 0, sel[1] - ty), [h2x, h2y] = P(sel[0] + tr, 0, sel[1] + ty);
            const anchors = pts.map((p, i) => {
                const [x, y] = P(p[0], 0, p[1]);
                const o = clamp(V.pens * (pts.length + 2) - i);
                return i === penSel
                    ? `<rect class="ts-dot" style="opacity:${o}" x="${f(x - 3.5)}" y="${f(y - 3.5)}" width="7" height="7"/>`
                    : `<rect class="ts-knob" style="opacity:${o}" x="${f(x - 2.5)}" y="${f(y - 2.5)}" width="5" height="5"/>`;
            }).join('');
            el.pens.innerHTML = `<g style="opacity:${reach}">
                    <line class="ts-crease" style="opacity:.55" x1="${f(h1x)}" y1="${f(h1y)}" x2="${f(h2x)}" y2="${f(h2y)}"/>
                    <circle class="ts-knob" cx="${f(h1x)}" cy="${f(h1y)}" r="3"/><circle class="ts-knob" cx="${f(h2x)}" cy="${f(h2y)}" r="3"/></g>
                ${anchors}`;
            el.pens.style.opacity = 1;
        } else {
            el.pens.style.opacity = 0;
        }

        // handle
        const Hd = handlePaths(F.S, F.h);
        el.handleO.setAttribute('d', Hd.outer);
        el.handleI.setAttribute('d', Hd.inner);
        drawOn(el.handleO, V.handle);
        drawOn(el.handleI, V.handle);
        el.handleO.style.opacity = el.handleI.style.opacity = V.handle > 0.001 ? 1 - ghost : 0;

        // molds, with the form inside as faint ghost edges (the viewer's ghost style)
        el.cast.innerHTML = V.castA > 0.01 ? pieces(castPaths(F.S, F.h, V.cExp * 36)) : '';
        el.cast.style.opacity = V.castA;
        el.stack.innerHTML = V.stackA > 0.01 ? pieces(stackPaths(F.S, F.h, V.sExp)) : '';
        el.stack.style.opacity = V.stackA;
        el.ghost.setAttribute('d', ghost > 0.01 ? F.sil + F.crease + F.rim : '');
        el.ghost.style.opacity = ghost * 0.4;

        // generator frame, floor grid, axes and dials
        el.app.style.opacity = V.app;
        el.floor.style.opacity = V.app;
        if (V.app > 0.01) {
            const vals = [[102, 0.62], [Math.round(56 + dial * 26), clamp(dial * 0.8 + 0.1)], [64, 0.48]];
            vals.forEach(([v, frac], i) => {
                const x = f(552 + 126 * frac);
                dials[i].v.textContent = `${v} mm`;
                dials[i].fill.setAttribute('x2', x);
                dials[i].knob.setAttribute('cx', x);
            });
        }

        // welcome floor: slow parallax drift; pieces fade outward from the vase as it lifts out
        const g = V.grid, pan = Math.sin(now / 5200) * 22 * g;
        const parallax = (s) => pan * (s / 0.34);
        el.gridFloor.style.opacity = 0.14 * g * V.intro;
        el.gridFloor.setAttribute('transform', `translate(${f(pan * 0.8)} 0)`);
        gridItems.forEach((it, i) => {
            const item = gridEls[i];
            const shown = clamp((V.intro - it.dist * 0.45) / 0.55);
            const o = clamp((g - it.dist * 0.3) / 0.7) * shown;
            item.style.opacity = o;
            if (o <= 0.001) return;
            const push = 1 - g;
            const s = it.s * (1 + push * 0.18);
            const x = it.x + parallax(it.s) + (it.x - HERO_SLOT.x) * push * 0.35;
            const y = it.y + (it.y - HERO_SLOT.y) * push * 0.35 + (1 - out(shown)) * 10;
            item.setAttribute('transform', `translate(${f(x - CX * s)} ${f(y - B * s)}) scale(${s.toFixed(4)})`);
        });

        // the live form: from its floor slot, to centre stage, into the generator viewport
        const s1 = mix(1, 0.6, V.place);
        const tx1 = mix(0, 306 - CX * 0.6, V.place), ty1 = mix(0, 250 - B * 0.6, V.place);
        const hs = HERO_SLOT.s;
        const htx = HERO_SLOT.x + parallax(hs) - CX * hs;
        const hty = HERO_SLOT.y - B * hs + (1 - out(clamp(V.intro / 0.55))) * 10;
        const sF = mix(hs, s1, V.hero);
        el.formG.setAttribute('transform', `translate(${f(mix(htx, tx1, V.hero))} ${f(mix(hty, ty1, V.hero))}) scale(${sF.toFixed(4)})`);
        el.formG.style.opacity = clamp(V.intro / 0.55);

        // the generator shrinks into the first project card
        const k2 = CARD.w / 608;
        const s2 = mix(1, k2, V.card);
        el.world.setAttribute('transform', `translate(${f(mix(0, CARD.x0 - 96 * k2, V.card))} ${f(mix(0, CARD.y0 + 6 - 10 * k2, V.card))}) scale(${s2.toFixed(4)})`);
        cardEls[0].style.opacity = smooth(0.6, 1, V.card);
        cardEls.slice(1).forEach((c, i) => {
            const o = clamp((V.cards - i * 0.09) / 0.55);
            c.style.opacity = o;
            c.style.transform = `translateY(${f((1 - out(o)) * 8)}px)`;
        });

        for (const [id, label] of labelEls) {
            const o = V[`L${id}`] ?? 0;
            label.style.opacity = o;
            if (label.dataset.dying && o <= 0.001) { label.remove(); labelEls.delete(id); delete V[`L${id}`]; }
        }

        raf = requestAnimationFrame(render);
    }

    // ---------- Steps ----------
    const mugS = sample(SHAPES.mug);
    const mugHandle = handlePaths(mugS, 142);
    const mugMold = moldSize(mugS, 142);

    const base = (o = {}) => {
        const d = { pens: 0, handle: 0, castA: 0, stackA: 0, app: 0, place: 0, card: 0, cards: 0, live: 0, grid: 0, hero: 1, intro: 1, ...o };
        for (const k in d) to(k, d[k], k === 'place' || k === 'card' ? 1300 : 800);
    };

    const STEPS = [
        // Welcome: a floor of dinnerware in line art, drifting slowly
        (first) => {
            base({ grid: 1, hero: 0 });
            to('grid', 1, 1300, 0, io);
            to('hero', 0, 1500, 0, io);
            to('shape', SHAPES.vessel, 1000);
            if (first) { setNow('grid', 1); setNow('hero', 0); setNow('intro', 0); to('intro', 1, 2200, 150, linear); }
            setLabels([]);
        },
        // Forms: the vase lifts out of the floor and becomes each form tool in turn
        () => {
            base();
            to('grid', 0, 1300, 0, linear);
            to('hero', 1, 1700, 0, io);
            to('shape', SHAPES.vessel, 900);
            const order = [['vessel', 'vessel', 0, 2], ['bowl', 'dinnerware', 0, 2], ['bezier', 'vessel-v2', 1, 3]];
            const caption = (app, delay = 0) => setLabels([{
                id: `cap-${app}`, caption: true, x: CX + 5, y: 318, w: TOOL_INFO[app].name.length * 6.1,
                text: TOOL_INFO[app].name, color: TOOL_INFO[app].color, delay
            }]);
            caption('vessel', 1800);
            let i = 0;
            const next = () => {
                i = (i + 1) % order.length;
                const [shape, app, pens, sel] = order[i];
                if (pens) penSel = sel;
                to('shape', SHAPES[shape], 1500);
                to('pens', pens, 900, pens ? 1100 : 0, out);
                caption(app, 500);
                later(3600, next);
            };
            later(4200, next);
        },
        // Handles & molds: a mug gains a handle; a cast mold assembles and opens; a stacked mold lifts apart
        () => {
            base();
            to('shape', SHAPES.mug, 1300);
            if (V.castA < 0.05) setNow('cExp', 1);
            if (V.stackA < 0.05) setNow('sExp', 1);
            to('handle', 1, 1400, 900, io);
            const right = CX + mugMold.Rm;
            setLabels([{ id: 'handle', x: mugHandle.xo, y: mugHandle.mid, lx: mugHandle.xo + 62, ly: mugHandle.mid, text: 'Mug Handle', color: TOOL_INFO.handle.color, delay: 1700 }]);
            later(3600, () => {
                to('handle', 0, 500);
                to('castA', 1, 500);
                to('cExp', 0, 1500, 100);
                setLabels([{ id: 'cast', x: right + 12, y: B - 120, lx: right + 60, ly: B - 150, text: 'Cast Form', sub: 'three walls and a foot', color: TOOL_INFO.castform.color, delay: 700 }]);
            });
            later(5800, () => to('cExp', 0.65, 1300));
            later(7600, () => {
                to('cExp', 0, 900);
                to('castA', 0, 600, 700);
                to('stackA', 1, 600, 900);
                setNow('sExp', 1);
                to('sExp', 0.45, 1600, 900);
                setLabels([{ id: 'stack', x: right + 6, y: B - 74, lx: right + 60, ly: B - 104, text: 'Stacked Mold', sub: 'rings that stack', color: TOOL_INFO.stackedmold.color, delay: 1300 }]);
            });
        },
        // Generator: the mug drops into the viewport; the Belly dial reshapes it
        () => {
            base({ handle: 1, app: 1, place: 1 });
            to('shape', SHAPES.mug, 900);
            to('app', 1, 900, 150, out);
            to('place', 1, 1400, 0, io);
            to('live', 1, 1400, 1400);
            setLabels([
                { id: 'dials', x: 690, y: 128, lx: 724, ly: 128, text: 'Dials', delay: 1300 },
                { id: 'file', x: 692, y: 26, lx: 724, ly: 58, text: 'File menu', delay: 1450 },
                { id: 'dock', x: 116, y: 278, lx: 84, ly: 278, anchor: 'end', text: 'View dock', delay: 1600 }
            ]);
        },
        // Projects: the generator shrinks into the first card; the others arrive
        () => {
            base({ handle: 1, app: 1, place: 1, card: 1, cards: 1 });
            to('shape', SHAPES.mug, 900);
            to('live', 0, 700);
            to('dial', 0.45, 700);
            to('card', 1, 1400, 50, io);
            setNow('cards', 0);
            to('cards', 1, 1500, 900, linear);
            setLabels([]);
        }
    ];

    return {
        /** Back to the opening state, with nothing scheduled. */
        reset() {
            timers.forEach(clearTimeout);
            timers = [];
            anims = [];
            V = INITIAL();
            penSel = 2;
            labelEls.forEach((g) => g.remove());
            labelEls.clear();
        },
        /** Move to a step; running moves finish their ease, scheduled ones are dropped. */
        show(step, first = false) {
            reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
            timers.forEach(clearTimeout);
            timers = [];
            anims = anims.filter((a) => a.from !== null);
            STEPS[step](first);
        },
        start() {
            if (raf) return;
            clock = performance.now();
            raf = requestAnimationFrame(render);
        },
        stop() {
            cancelAnimationFrame(raf);
            raf = 0;
            timers.forEach(clearTimeout);
            timers = [];
        }
    };
}
