// Stacked cylinder mold concept: 3D anatomy of each PLA casting unit.
// Four views per unit (exploded axonometric, quarter-cut axonometric, top, side section),
// built from the same part list so every view shows the same parts in the same place.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const C = {
  paper: 0xf5f3ee, ink: 0x141414,
  pla: 0xcdc8bc, pla2: 0xb4aea0, plaster: 0xfaf8f2,
  key: 0xc8402a, socket: 0x6e1f12, hole: 0x2a2826,
  cutPla: 0x7f796d, cutPlaster: 0xeedfbd,
};

// mold-size mm
const R = 78;            // plaster outer radius = sleeve inner radius
const WALL = 3;          // sleeve wall
const KEY_R = R - 13;    // key circle
const KEY_ANGLES = [0, 120, 240].map(d => d * Math.PI / 180); // none at 90°/270°, so none on a split divider (x = 0)
const keyXZ = a => [KEY_R * Math.cos(a), KEY_R * Math.sin(a)];
const TAU = Math.PI * 2;

/* ---------- geometry helpers ---------- */
const V2 = (x, y) => new THREE.Vector2(x, y);

// closed (r, y) loop, counter-clockwise (outer side going up) → outward-facing lathe
function lathe(loop, phiStart = 0, phiLength = TAU, seg = 120) {
  // r = 0 makes degenerate fan triangles that EdgesGeometry draws as stray lines; stay just off the axis
  const pts = loop.map(([r, y]) => V2(Math.max(r, 0.05), y));
  pts.push(pts[0].clone());
  return new THREE.LatheGeometry(pts, seg, phiStart, phiLength);
}
// flat cap closing a partial lathe at angle phi (lathe maps r → (sin φ, 0, cos φ))
function cap(loop, phi) {
  const g = new THREE.ShapeGeometry(new THREE.Shape(loop.map(([r, y]) => V2(r, y))));
  g.rotateY(phi - Math.PI / 2);
  return g;
}
// extruded plate lying flat between y0 and y0 + depth; holes are [x, z, r]
function plate(shape, y0, depth, holes = []) {
  holes.forEach(([x, z, r]) => { const p = new THREE.Path(); p.absarc(x, -z, r, 0, TAU, true); shape.holes.push(p); });
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 96 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0, 0);
  return g;
}
const disc = r => new THREE.Shape().absarc(0, 0, r, 0, TAU, false);
const halfDisc = r => {                     // x ≥ 0 half, reaching 3 mm under the divider
  const s = new THREE.Shape();
  s.moveTo(-3, -r); s.lineTo(0, -r); s.absarc(0, 0, r, -Math.PI / 2, Math.PI / 2, false); s.lineTo(-3, r); s.closePath();
  return s;
};
const ringLoop = (r0, r1, y0, y1) => [[r0, y0], [r1, y0], [r1, y1], [r0, y1]];

/* ---------- part factory ---------- */
// quarter cut = remove only where BOTH planes clip
const clipOpts = planes => ({ clippingPlanes: planes, clipIntersection: true });

function makeMesh(geom, color, cutColor, planes, opts = {}) {
  const g = new THREE.Group();
  const double = !!opts.double;
  g.add(new THREE.Mesh(geom, new THREE.MeshLambertMaterial({
    color, flatShading: opts.flat !== false, ...clipOpts(planes), side: double ? THREE.DoubleSide : THREE.FrontSide,
  })));
  // back faces only show through a clipping cut: paint them as the cut face
  if (!double) g.add(new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ color: cutColor, side: THREE.BackSide, ...clipOpts(planes) })));
  if (opts.edges !== false) {
    g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geom, 28),
      new THREE.LineBasicMaterial({ color: C.ink, ...clipOpts(planes), transparent: true, opacity: .8 })));
  }
  return g;
}
const PLA = (g, planes, o) => makeMesh(g, o?.alt ? C.pla2 : C.pla, C.cutPla, planes, o);
const PLASTER = (g, planes, o) => makeMesh(g, C.plaster, C.cutPlaster, planes, o);
const KEYM = (g, planes) => makeMesh(g, C.key, C.key, planes, { edges: false, flat: false });

function cone(planes, x, y, z, dir) {     // 90°-ish cone key, dir: 'up' | 'down' | '+x'
  const g = new THREE.ConeGeometry(6, 5, 40);
  if (dir === 'down') g.rotateX(Math.PI);
  if (dir === '+x') g.rotateZ(-Math.PI / 2);
  const m = KEYM(g, planes);
  const o = dir === 'up' ? [0, 2.5, 0] : dir === 'down' ? [0, -2.5, 0] : [2.5, 0, 0];
  m.position.set(x + o[0], y + o[1], z + o[2]);
  return m;
}
function socketMark(planes, x, y, z, facing) { // socket shown as a dark disc with a red rim
  const g = new THREE.Group();
  const d = new THREE.CircleGeometry(6, 40), r = new THREE.RingGeometry(4.6, 6, 40);
  const rot = facing === 'up' ? [-Math.PI / 2, 0] : facing === 'down' ? [Math.PI / 2, 0] : [0, -Math.PI / 2];
  [d, r].forEach(gg => { gg.rotateX(rot[0]); if (rot[1]) gg.rotateY(rot[1]); });
  g.add(new THREE.Mesh(d, new THREE.MeshBasicMaterial({ color: C.socket, ...clipOpts(planes), side: THREE.DoubleSide })));
  g.add(new THREE.Mesh(r, new THREE.MeshBasicMaterial({ color: C.key, ...clipOpts(planes), side: THREE.DoubleSide })));
  const off = { up: [0, .15, 0], down: [0, -.15, 0], '-x': [-.15, 0, 0] }[facing];
  g.position.set(x + off[0], y + off[1], z + off[2]);
  return g;
}
const keysIn = half => KEY_ANGLES.filter(a => !half || Math.cos(a) > 0.01);

/* ---------- shared PLA parts ---------- */
function bedPlate(planes, formers, half) {
  const g = new THREE.Group();
  const pr = R + WALL + 7;
  const shape = () => half ? halfDisc(pr) : disc(pr);
  const keys = keysIn(half);
  if (formers === 'pockets') {
    g.add(PLA(plate(shape(), -5, 2), planes));
    g.add(PLA(plate(shape(), -3, 3, keys.map(a => [...keyXZ(a), 6])), planes));
    keys.forEach(a => { const [x, z] = keyXZ(a); g.add(socketMark(planes, x, -3, z, 'up')); });
  } else {
    g.add(PLA(plate(shape(), -5, 5), planes));
    if (formers === 'bumps') keys.forEach(a => { const [x, z] = keyXZ(a); g.add(cone(planes, x, 0, z, 'up')); });
  }
  // locating rim: the sleeve drops inside it
  const rim = ringLoop(R + WALL + 0.4, R + WALL + 2.6, 0, 3);
  if (half) {
    g.add(PLA(lathe(rim, 0, Math.PI), planes));
  } else g.add(PLA(lathe(rim), planes));
  return g;
}

function sleeveHalf(planes, side, h) {
  const g = new THREE.Group();
  const loop = ringLoop(R, R + WALL, 0.15, h - 0.15);
  const phi0 = side > 0 ? 0 : Math.PI;
  const alt = side < 0;
  g.add(PLA(lathe(loop, phi0, Math.PI), planes, { alt }));
  [phi0, phi0 + Math.PI].forEach(p => g.add(PLA(cap(loop, p), planes, { alt, double: true })));
  // seam ears with bolt holes
  [-1, 1].forEach(zs => {
    const ear = new THREE.BoxGeometry(3, h, 10);
    ear.translate(side * 1.5, h / 2, zs * (R + WALL + 5));
    g.add(PLA(ear, planes, { alt }));
    [0.25, 0.75].forEach(f => {
      const b = new THREE.CylinderGeometry(1.7, 1.7, 3.3, 20);
      b.rotateZ(Math.PI / 2);
      b.translate(side * 1.5, h * f, zs * (R + WALL + 5.5));
      g.add(makeMesh(b, C.hole, C.hole, planes, { edges: false }));
    });
  });
  return g;
}

function keyLid(planes, h, formers, bleedR, half) {
  const g = new THREE.Group();
  const lr = R + WALL + 2.6;
  const shape = () => half ? halfDisc(lr) : disc(lr);
  const keys = keysIn(half);
  const bleeds = [60, 180, 300].map(d => d * Math.PI / 180)
    .filter(a => !half || Math.cos(a) > 0.01)
    .map(a => [bleedR * Math.cos(a), bleedR * Math.sin(a), 1.5]);
  if (formers === 'pockets') {
    // lower layer: pocket mouths · upper layer: Ø3 bleed at every pocket tip + the between-key bleeds
    g.add(PLA(plate(shape(), h, 2.5, keys.map(a => [...keyXZ(a), 6])), planes));
    g.add(PLA(plate(shape(), h + 2.5, 1.5, [...keys.map(a => [...keyXZ(a), 1.5]), ...bleeds]), planes));
    keys.forEach(a => {
      const [x, z] = keyXZ(a);
      const r = new THREE.RingGeometry(1.5, 6, 40); r.rotateX(Math.PI / 2); r.translate(x, h + 2.35, z);
      g.add(new THREE.Mesh(r, new THREE.MeshBasicMaterial({ color: C.socket, ...clipOpts(planes), side: THREE.DoubleSide })));
    });
  } else {
    g.add(PLA(plate(shape(), h, 4, bleeds), planes));
    if (formers === 'bumps') keys.forEach(a => { const [x, z] = keyXZ(a); g.add(cone(planes, x, h, z, 'down')); });
  }
  // skirt hangs outside the sleeve and centres the lid
  const skirt = ringLoop(R + WALL + 0.4, R + WALL + 2.6, h - 5, h);
  g.add(PLA(half ? lathe(skirt, 0, Math.PI) : lathe(skirt), planes));
  return g;
}

function plasterPiece(planes, loop, h, bottom, top, half) {
  const g = new THREE.Group();
  const E = 0.4;
  loop = loop.map(([r, y]) => [r >= R - 1e-6 ? r - E : r <= 1e-6 ? r : r + E, Math.min(Math.max(y, E), h - E)]);
  if (half) {
    g.add(PLASTER(lathe(loop, 0, Math.PI), planes));
    [0, Math.PI].forEach(p => g.add(PLASTER(cap(loop, p).translate(0.4, 0, 0), planes, { double: true })));
  } else g.add(PLASTER(lathe(loop), planes));
  keysIn(half).forEach(a => {
    const [x, z] = keyXZ(a);
    if (bottom === 'male') g.add(cone(planes, x, 0, z, 'down'));
    if (bottom === 'socket') g.add(socketMark(planes, x, 0, z, 'down'));
    if (top === 'male') g.add(cone(planes, x, h, z, 'up'));
    if (top === 'socket') g.add(socketMark(planes, x, h, z, 'up'));
  });
  return g;
}

const sample = (fn, y0, y1, n = 32) => Array.from({ length: n + 1 }, (_, i) => { const y = y0 + (y1 - y0) * i / n; return [fn(y), y]; });
const at = (r, phiDeg, y) => { const p = phiDeg * Math.PI / 180; return [r * Math.sin(p), y, r * Math.cos(p)]; };

/* ---------- unit builders ---------- */
function ringUnit(planes, inverted) {
  const h = 56, rb = 56, rt = 40;
  const rc = y => rb - (rb - rt) * Math.pow(y / h, 1.4);
  const coreLoop = [[0, -1], [rc(0), -1], ...sample(rc, 0, h - 0.3), [0, h - 0.3]];
  const plasterLoop = [[R, 0], [R, h], ...sample(rc, h, 0)];
  return {
    h,
    parts: [
      { name: 'Bed plate', desc: inverted ? 'forms the piece\'s TOP face: 3 cone bumps → sockets. Locating rim holds the sleeve.' : 'forms the piece\'s BOTTOM face: 3 cone pockets → male cones. Locating rim holds the sleeve.',
        obj: bedPlate(planes, inverted ? 'bumps' : 'pockets'), ex: [0, 0, 0], anchor: at(R + WALL + 7, 30, -2.5) },
      { name: 'Core', desc: 'printed onto the bed plate as one part, wide end down (support-free).',
        obj: PLA(lathe(coreLoop), planes), ex: [0, 0, 0], anchor: at(rc(h * .45), 15, h * .45) },
      { name: 'Sleeve half A', desc: 'reusable; drops inside the rim, seam ears bolt or clip to half B.',
        obj: sleeveHalf(planes, 1, h), ex: [80, 0, 0], anchor: at(R + WALL, 70, h * .7) },
      { name: 'Sleeve half B', desc: 'the mirror half. Every unit in the mold uses the same sleeve diameter.',
        obj: sleeveHalf(planes, -1, h), ex: [-80, 0, 0], anchor: at(R + WALL, 235, h) },
      { name: 'Key lid', desc: inverted ? 'forms the BOTTOM face: 3 pockets (→ male cones), each with a Ø3 bleed at its tip, plus 2 more bleeds.' : 'forms the TOP face: 3 cone bumps (→ sockets) and 3 Ø3 bleed holes. Skirt centres it on the sleeve.',
        obj: keyLid(planes, h, inverted ? 'pockets' : 'bumps', 52), ex: [0, 2 * h + 70, 0], anchor: at(R + WALL + 2.6, 25, h + 4), lid: true },
      { name: 'Plaster piece (result)', desc: inverted ? 'as cast: sockets below, male cones on top. Flip it to go in the stack.' : 'male cones below, sockets on top, ready to stack. Lifts straight off the core.',
        obj: plasterPiece(planes, plasterLoop, h, inverted ? 'socket' : 'male', inverted ? 'male' : 'socket'), ex: [0, h + 32, 0], anchor: at(R, 40, h * .5), plaster: true },
    ],
    steps: [
      'Print the bed plate and core as one part, wide end down.',
      'Close the two sleeve halves around the core, inside the bed plate\'s rim, and bolt the seam ears.',
      'Pour plaster beside the core until it domes ~2 mm above the sleeve rim.',
      'Press the key lid on. The skirt centres it, and surplus plaster and air leave through the bleed holes.',
      'Once set: lift the lid, unbolt the sleeve halves, lift the plaster off the core.',
    ],
  };
}

function splitUnit(planes) {
  const h = 84;
  const rc = y => 44 + 16 * Math.sin(Math.PI * y / h) - 10 * (y / h);
  const coreLoop = [[0, -1], [rc(0), -1], ...sample(rc, 0, h - 0.3), [0, h - 0.3]];
  const plasterLoop = [[R, 0], [R, h], ...sample(rc, h, 0)];
  const fl = R + WALL + 10;
  const insert = new THREE.Group();
  const div = new THREE.BoxGeometry(3, h, 2 * fl); div.translate(-1.5, h / 2, 0);
  insert.add(PLA(div, planes));
  insert.add(PLA(lathe(coreLoop, 0, Math.PI), planes));
  [0, Math.PI].forEach(p => insert.add(PLA(cap(coreLoop, p).translate(0.3, 0, 0), planes, { double: true, edges: false })));
  [[h * .25, R - 12], [h * .75, R - 12], [h * .25, -(R - 12)], [h * .75, -(R - 12)]].forEach(([y, z]) => insert.add(cone(planes, 0, y, z, '+x')));
  [-1, 1].forEach(zs => [0.25, 0.75].forEach(f => {
    const b = new THREE.CylinderGeometry(1.7, 1.7, 3.3, 20); b.rotateZ(Math.PI / 2); b.translate(-1.5, h * f, zs * (R + WALL + 5.5));
    insert.add(makeMesh(b, C.hole, C.hole, planes, { edges: false }));
  }));
  const piece = plasterPiece(planes, plasterLoop, h, 'male', 'socket', true);
  [[h * .25, R - 12], [h * .75, R - 12], [h * .25, -(R - 12)], [h * .75, -(R - 12)]].forEach(([y, z]) => piece.add(socketMark(planes, 0, y, z, '-x')));
  return {
    h,
    parts: [
      { name: 'Bed plate (half)', desc: 'separate from the insert, so the plaster can slide off sideways later. 1 pocket → male cone.',
        obj: bedPlate(planes, 'pockets', true), ex: [0, -45, 0], anchor: at(R + WALL + 7, 20, -2.5) },
      { name: 'Insert: divider + half-core', desc: 'printed lying on the divider face. Half A has 4 divider bumps (→ sockets); insert B has pockets. The divider flanges take the sleeve bolts.',
        obj: insert, ex: [0, 0, 0], anchor: [-1.5, h * .9, fl] },
      { name: 'Half-sleeve', desc: 'reusable; its ears bolt to the divider flanges.',
        obj: sleeveHalf(planes, 1, h), ex: [175, 0, 0], anchor: at(R + WALL, 60, h * .75) },
      { name: 'Key lid (half)', desc: '1 cone bump (→ socket), bleed holes, skirt.',
        obj: keyLid(planes, h, 'bumps', 58, true), ex: [0, h + 60, 0], anchor: at(R + WALL + 2.6, 40, h + 4), lid: true },
      { name: 'Plaster half A (result)', desc: 'pulls sideways (+x) off the insert once the plates and sleeve are off. Half B is cast the same way from insert B.',
        obj: piece, ex: [88, 0, 0], anchor: at(R - 8, 80, h * .5), plaster: true },
    ],
    steps: [
      'Print insert A (divider bumps) and insert B (divider pockets) lying flat on their divider faces.',
      'Stand insert A on the half bed plate, then bolt the half-sleeve to its divider flanges.',
      'Pour to just above the rim and press on the half lid.',
      'Once set: lift the lid, pull off the bed plate, unbolt the sleeve, then pull the plaster half sideways off the insert.',
      'Repeat with insert B. The halves key together across the divider.',
    ],
  };
}

function wellUnit(planes) {
  const h = 30, rw = 40, t = 2.5, gapMM = 8, gap = gapMM / rw, slitDeg = 40;
  const slit = slitDeg * Math.PI / 180;
  const tubeLoop = ringLoop(rw - t, rw, -1, h);
  const tube = new THREE.Group();
  tube.add(PLA(lathe(tubeLoop, slit + gap / 2, TAU - gap), planes));
  [slit + gap / 2, slit - gap / 2 + TAU].forEach(p => tube.add(PLA(cap(tubeLoop, p), planes, { double: true })));
  const wedge = new THREE.BoxGeometry(gapMM - 0.6, h + 14, t);
  wedge.translate(0, (h + 14) / 2, rw - t / 2);
  wedge.rotateY(slit);
  const plasterLoop = [[R, 0], [R, h], [rw, h], [rw, 0]];
  return {
    h,
    parts: [
      { name: 'Bed plate', desc: 'forms the collar\'s BOTTOM face: 3 pockets → male cones.',
        obj: bedPlate(planes, 'pockets'), ex: [0, 0, 0], anchor: at(R + WALL + 7, 30, -2.5) },
      { name: 'Slit-tube core', desc: 'thin tube for the vertical bore (lip Ø + 2 × ¼″). The slit lets it spring inward.',
        obj: tube, ex: [0, 0, 0], anchor: at(rw, 75, h * .6) },
      { name: 'Wedge strip', desc: 'holds the slit open while you pour. Pull it out and the tube lets go of the zero-draft bore.',
        obj: makeMesh(wedge, C.key, C.key, planes, { flat: true }), ex: [0, 2 * h + 80, 0], anchor: [...at(rw, slitDeg, h + 14)], noSection: true },
      { name: 'Sleeve half A', desc: 'the same reusable sleeve, at collar height.',
        obj: sleeveHalf(planes, 1, h), ex: [80, 0, 0], anchor: at(R + WALL, 70, h * .7) },
      { name: 'Sleeve half B', desc: '',
        obj: sleeveHalf(planes, -1, h), ex: [-80, 0, 0], anchor: at(R + WALL, 235, h) },
      { name: 'Plaster collar (result)', desc: 'no lid: the open top is screeded flat (it\'s the pour face). Male cones below.',
        obj: plasterPiece(planes, plasterLoop, h, 'male', 'none'), ex: [0, h + 26, 0], anchor: at(R, 40, h * .5), plaster: true },
    ],
    steps: [
      'Print the bed plate. Print the slit tube separately with the wedge strip in its slit.',
      'Stand the tube in the centre of the bed plate and close the sleeve halves around it.',
      'Pour to the sleeve rim and screed the top flat. That face is the pour face, so it needs no lid.',
      'Once set: pull the wedge strip so the tube springs inward, then lift the collar off.',
    ],
  };
}

function footerUnit(planes) {
  const h = 36, rb = 46, rt = 40, sh = 6;
  const coreLoop = [[0, -1], [rb, -1], [rb, 0], [rt, sh], [0, sh]];
  const plasterLoop = [[R, 0], [R, h], [0, h], [0, sh + 0.4], [rt, sh + 0.4], [rb, 0]];
  return {
    h,
    parts: [
      { name: 'Bed plate', desc: 'poured inverted, so this forms the footer\'s TOP face: 3 cone bumps → sockets.',
        obj: bedPlate(planes, 'bumps'), ex: [0, 0, 0], anchor: at(R + WALL + 7, 30, -2.5) },
      { name: 'Base stub', desc: 'positive of the vessel\'s base below the foot seam, printed on the plate.',
        obj: PLA(lathe(coreLoop), planes), ex: [0, 0, 0], anchor: at(rb - 2, 15, 3) },
      { name: 'Sleeve half A', desc: 'the same reusable sleeve.',
        obj: sleeveHalf(planes, 1, h), ex: [80, 0, 0], anchor: at(R + WALL, 70, h * .7) },
      { name: 'Sleeve half B', desc: '',
        obj: sleeveHalf(planes, -1, h), ex: [-80, 0, 0], anchor: at(R + WALL, 235, h) },
      { name: 'Plaster footer (result)', desc: 'no lid: the open side is screeded flat and becomes the bench face. Flip it so the sockets face up.',
        obj: plasterPiece(planes, plasterLoop, h, 'socket', 'none'), ex: [0, h + 30, 0], anchor: at(R, 40, h * .5), plaster: true },
    ],
    steps: [
      'Print the bed plate with the base stub on it.',
      'Close the sleeve halves around it.',
      'Pour to the rim and screed flat. That becomes the bench face.',
      'Once set: open the sleeve, lift the footer off and flip it. Sockets face up and the foot cavity is on top.',
    ],
  };
}

const UNITS = {
  ring: { label: 'Ring unit (upright)', build: p => ringUnit(p, false) },
  ringInv: { label: 'Ring unit (inverted)', build: p => ringUnit(p, true) },
  split: { label: 'Split unit (half A)', build: splitUnit },
  well: { label: 'Well collar', build: wellUnit },
  footer: { label: 'Footer', build: footerUnit },
};

/* ---------- views ---------- */
const VIEWS = [
  { key: 'exploded', title: 'Axonometric · exploded (drag to orbit)', dir: [1, .82, 1], explode: true, orbit: true, labels: true },
  { key: 'cut', title: 'Axonometric · assembled, quarter cut away', dir: [1, .82, 1], clip: 'quarter', orbit: true, labels: true },
  { key: 'top', title: 'Top view · lid lifted off', dir: [0, 1, 0], up: [0, 0, -1], hideLid: true, labels: true },
  { key: 'side', title: 'Side view · section through the axis', dir: [0, 0, 1], clip: 'half', labels: true },
];

// cut planes sit 0.7 mm off the axis planes: the split divider face lies exactly on x = 0 and would speckle
function clipPlanes(kind) {
  if (kind === 'quarter') return [new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0.7), new THREE.Plane(new THREE.Vector3(0, 0, -1), 0.7)];
  if (kind === 'half') return [new THREE.Plane(new THREE.Vector3(0, 0, -1), 0.7)];
  return [];
}

function setupView(host, cfg, state) {
  const wrap = document.createElement('div'); wrap.className = 'anat-view';
  wrap.innerHTML = `<div class="vt">${cfg.title}</div>`;
  host.appendChild(wrap);
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.localClippingEnabled = true;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  wrap.appendChild(renderer.domElement);
  const labelLayer = document.createElement('div'); labelLayer.className = 'anat-labels'; wrap.appendChild(labelLayer);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(C.paper);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xcfc9bb, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5); sun.position.set(120, 260, 160); scene.add(sun);
  const fill = new THREE.DirectionalLight(0xffffff, .5); fill.position.set(-200, 80, -60); scene.add(fill);

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 3000);
  const controls = cfg.orbit ? new OrbitControls(camera, renderer.domElement) : null;
  if (controls) { controls.enableZoom = true; controls.enablePan = false; controls.addEventListener('change', () => draw()); }

  const planes = clipPlanes(cfg.clip);
  let unit = null, root = null;

  function build() {
    if (root) scene.remove(root);
    root = new THREE.Group();
    unit = UNITS[state.unit].build(planes);
    unit.parts.forEach(p => {
      if (cfg.hideLid && p.lid) return;
      if (cfg.explode && p.plaster && !state.showPlaster) return;
      root.add(p.obj);
    });
    scene.add(root);
    applyExplode();
    frame();
  }
  function applyExplode() {
    unit.parts.forEach(p => { const e = cfg.explode ? state.explode : 0; p.obj.position.set(p.ex[0] * e, p.ex[1] * e, p.ex[2] * e); });
  }
  function frame() {
    const w = wrap.clientWidth, hgt = wrap.clientHeight;
    renderer.setSize(w, hgt);
    const box = new THREE.Box3().setFromObject(root);
    const center = box.getCenter(new THREE.Vector3());
    const d = new THREE.Vector3(...cfg.dir).normalize();
    camera.up.set(...(cfg.up || [0, 1, 0]));
    camera.position.copy(center).addScaledVector(d, 1000);
    camera.lookAt(center);
    camera.updateMatrixWorld();
    // fit the projected box
    let mx = 0, my = 0;
    const inv = camera.matrixWorldInverse;
    for (let i = 0; i < 8; i++) {
      const v = new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).applyMatrix4(inv);
      const c = center.clone().applyMatrix4(inv);
      mx = Math.max(mx, Math.abs(v.x - c.x)); my = Math.max(my, Math.abs(v.y - c.y));
    }
    const aspect = w / hgt, pad = 1.14;
    let hh = Math.max(my, mx / aspect) * pad;
    camera.left = -hh * aspect; camera.right = hh * aspect; camera.top = hh; camera.bottom = -hh;
    camera.zoom = 1;
    camera.updateProjectionMatrix();
    if (controls) { controls.target.copy(center); controls.update(); }
    draw();
  }
  function draw() {
    renderer.render(scene, camera);
    labelLayer.innerHTML = '';
    if (!cfg.labels || !state.labels) return;
    const w = wrap.clientWidth, hgt = wrap.clientHeight;
    unit.parts.forEach((p, i) => {
      if (!p.obj.parent || (p.noSection && cfg.clip === 'half')) return;
      // anchors inside a clipped-away region are pulled back onto the visible cut
      let a = new THREE.Vector3(...p.anchor);
      if (cfg.clip === 'half' && a.z > 0) a.z = -0.01 * a.z;
      if (cfg.clip === 'quarter' && a.x > 0 && a.z > 0) a.set(a.x, a.y, -a.z * 0.2);
      a.add(p.obj.position).project(camera);
      if (a.x < -1.05 || a.x > 1.05 || a.y < -1.05 || a.y > 1.05) return;
      const b = document.createElement('span'); b.className = 'anat-badge' + (p.plaster ? ' plaster' : '');
      b.textContent = i + 1;
      b.style.left = ((a.x + 1) / 2 * w) + 'px'; b.style.top = ((1 - a.y) / 2 * hgt) + 'px';
      labelLayer.appendChild(b);
    });
  }
  return { build, applyExplode: () => { applyExplode(); draw(); }, frame, draw, get unit() { return unit; } };
}

export function mountAnatomy(root) {
  const state = { unit: 'ring', explode: 1, showPlaster: true, labels: true };
  root.innerHTML = `
    <div class="anat-controls">
      <div class="seg">${Object.entries(UNITS).map(([k, u]) => `<button data-unit="${k}"${k === state.unit ? ' class="on"' : ''}>${u.label}</button>`).join('')}</div>
      <label>Explode <input type="range" min="0" max="1" step="0.01" value="1" data-explode></label>
      <label><input type="checkbox" checked data-plaster> plaster piece</label>
      <label><input type="checkbox" checked data-labels> part numbers</label>
    </div>
    <div class="anat-body">
      <div class="anat-grid"></div>
      <aside class="anat-side">
        <h4>Parts</h4><ol class="anat-parts"></ol>
        <h4>How it goes together</h4><ol class="anat-steps"></ol>
        <p class="anat-legend"><i style="background:#cdc8bc"></i>PLA <i style="background:#b4aea0"></i>PLA (second sleeve half)
          <i style="background:#faf8f2"></i>plaster <i style="background:#c8402a"></i>cone key / bump
          <i style="background:#6e1f12"></i>socket / pocket</p>
      </aside>
    </div>`;
  const grid = root.querySelector('.anat-grid');
  const views = VIEWS.map(v => setupView(grid, v, state));
  const partsEl = root.querySelector('.anat-parts'), stepsEl = root.querySelector('.anat-steps');

  function rebuild() {
    views.forEach(v => v.build());
    const u = views[0].unit;
    partsEl.innerHTML = u.parts.map(p => `<li${p.plaster ? ' class="plaster"' : ''}><b>${p.name}</b>${p.desc ? `: ${p.desc}` : ''}</li>`).join('');
    stepsEl.innerHTML = u.steps.map(s => `<li>${s}</li>`).join('');
  }
  root.querySelectorAll('[data-unit]').forEach(b => b.addEventListener('click', () => {
    state.unit = b.dataset.unit;
    root.querySelectorAll('[data-unit]').forEach(x => x.classList.toggle('on', x === b));
    rebuild();
  }));
  root.querySelector('[data-explode]').addEventListener('input', e => { state.explode = +e.target.value; views[0].applyExplode(); });
  root.querySelector('[data-explode]').addEventListener('change', () => views[0].frame());
  root.querySelector('[data-plaster]').addEventListener('change', e => { state.showPlaster = e.target.checked; views[0].build(); });
  root.querySelector('[data-labels]').addEventListener('change', e => { state.labels = e.target.checked; views.forEach(v => v.frame()); });
  window.addEventListener('resize', () => views.forEach(v => v.frame()));
  rebuild();
  return { state, rebuild, views };
}

const host = document.getElementById('anatomy3d');
if (host) window.__anatomy = mountAnatomy(host);
