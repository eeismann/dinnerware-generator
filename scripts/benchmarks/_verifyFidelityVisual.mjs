// One-off visual: vessel vs cavity column overlay + seam key displacement map.
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';
import fs from 'fs';
import path from 'path';

const ROOT = '/Users/ethan.eismann/Documents/dinnerware-generator';
const { MoldGenerator } = await import(path.join(ROOT, 'scripts/castForm/geometry/moldGenerator.js'));
const { DEFAULT_PARAMS } = await import(path.join(ROOT, 'scripts/castForm/state/castFormDefaults.js'));
THREE.Mesh.prototype.raycast = acceleratedRaycast;

const buf = fs.readFileSync(path.join(ROOT, 'test-files/Pattern_mug.stl'));
let geo = new STLLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
geo = mergeVertices(geo);
geo.computeBoundingBox();
const b0 = geo.boundingBox;
const ctr = new THREE.Vector3();
b0.getCenter(ctr);
geo.translate(-ctr.x, -b0.min.y, -ctr.z);
geo.computeBoundingBox();
const bb = geo.boundingBox;

const gen = new MoldGenerator();
const result = gen.generate(geo, JSON.parse(JSON.stringify(DEFAULT_PARAMS)), { quality: 'export' });

function caster(geometry) {
    if (!geometry.boundsTree) geometry.boundsTree = new MeshBVH(geometry);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    const ray = new THREE.Raycaster();
    ray.firstHitOnly = true;
    return (origin, dir, far) => {
        ray.set(origin, dir);
        ray.far = far;
        const hits = ray.intersectObject(mesh);
        return hits.length ? hits[0].point : null;
    };
}

// column at 60 deg (mid wall 0)
const angle = (61 * Math.PI) / 180;
const cos = Math.cos(angle), sin = Math.sin(angle);
const castVessel = caster(geo);
const castWall = caster(result.walls[0]);
const ys = [];
const vr = [];
const cr = [];
for (let i = 0; i <= 400; i++) {
    const y = bb.min.y + 3 + (bb.max.y - bb.min.y - 6) * (i / 400);
    const v = castVessel(new THREE.Vector3(200 * cos, y, 200 * sin), new THREE.Vector3(-cos, 0, -sin), 400);
    const c = castWall(new THREE.Vector3(0, y, 0), new THREE.Vector3(cos, 0, sin), 400);
    if (!v || !c) continue;
    ys.push(y);
    vr.push(Math.hypot(v.x, v.z));
    cr.push(Math.hypot(c.x, c.z));
}

// seam key displacement map (male, wall2 end face @ 2pi)
const castW2 = caster(result.walls[2]);
const keyY = bb.min.y + (bb.max.y - bb.min.y) * 0.3;
const pos2 = result.walls[2].getAttribute('position');
let minR = Infinity, maxR = -Infinity;
for (let i = 0; i < pos2.count; i++) {
    const x = pos2.getX(i), vy = pos2.getY(i), z = pos2.getZ(i);
    if (Math.abs(vy - keyY) > 2 || Math.abs(z) > 0.2 || x <= 0) continue;
    minR = Math.min(minR, x); maxR = Math.max(maxR, x);
}
const cKey = minR + (maxR - minR) * 0.62;
const grid = [];
for (let yi = 0; yi <= 60; yi++) {
    const row = [];
    for (let ri = 0; ri <= 60; ri++) {
        const y = keyY - 7 + (yi / 60) * 14;
        const r = cKey - 7 + (ri / 60) * 14;
        const hit = castW2(new THREE.Vector3(r, y, 6), new THREE.Vector3(0, 0, -1), 12);
        row.push(hit && Math.abs(hit.z) < 5.6 ? Math.max(0, hit.z) : 0);
    }
    grid.push(row);
}

// SVG
const W = 1200, H = 620;
const plotH = 560, plotY0 = 40;
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" style="background:#111;font-family:monospace">`;
svg += `<text x="20" y="24" fill="#eee" font-size="15">Pattern_mug export — vessel surface (white) vs mold cavity (green, offset -0.1mm clearance) at mid-wall angle</text>`;
const yMin = Math.min(...ys), yMax = Math.max(...ys);
const rAll = [...vr, ...cr.map((r) => r - 0.1)];
const rMin = Math.min(...rAll) - 0.5, rMax = Math.max(...rAll) + 0.5;
const px = (r) => 40 + ((r - rMin) / (rMax - rMin)) * 500;
const py = (y) => plotY0 + plotH - ((y - yMin) / (yMax - yMin)) * plotH;
const poly = (rs, dr, color, w) =>
    `<polyline fill="none" stroke="${color}" stroke-width="${w}" points="${ys.map((y, i) => `${px(rs[i] + dr).toFixed(1)},${py(y).toFixed(1)}`).join(' ')}"/>`;
svg += poly(vr, 0, '#ffffff', 2.5);
svg += poly(cr, -0.1, '#4caf50', 1.2);
let maxDev = 0;
for (let i = 0; i < ys.length; i++) maxDev = Math.max(maxDev, Math.abs(cr[i] - 0.1 - vr[i]));
svg += `<text x="40" y="${H - 8}" fill="#aaa" font-size="13">max |cavity - clearance - vessel| = ${maxDev.toFixed(3)}mm over ${ys.length} rays</text>`;
// heatmap
svg += `<text x="620" y="52" fill="#eee" font-size="15">Male registration key displacement (seam face)</text>`;
const cell = 8;
for (let yi = 0; yi <= 60; yi++) {
    for (let ri = 0; ri <= 60; ri++) {
        const v = grid[60 - yi][ri];
        const t = Math.min(1, v / 5);
        const col = `rgb(${Math.round(30 + 225 * t)},${Math.round(30 + 120 * t)},${Math.round(60 + 40 * (1 - t))})`;
        svg += `<rect x="${620 + ri * cell}" y="${70 + yi * cell}" width="${cell}" height="${cell}" fill="${col}"/>`;
    }
}
svg += `<text x="620" y="${70 + 61 * cell + 20}" fill="#aaa" font-size="13">14x14mm patch around key center, brightness = protrusion (0..5mm)</text>`;
svg += `</svg>`;
fs.mkdirSync(path.join(ROOT, 'output/visuals'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'output/visuals/cast_form_pattern_fidelity.svg'), svg);
console.log('maxDev(cavity vs vessel):', maxDev.toFixed(3), 'mm; rays:', ys.length);
console.log('wrote output/visuals/cast_form_pattern_fidelity.svg');
