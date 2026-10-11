import fs from 'fs';
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { InputProcessor } from '/Users/ethan.eismann/Documents/dinnerware-generator/scripts/castForm/geometry/inputProcessor.js';

const data = fs.readFileSync('/Users/ethan.eismann/Documents/dinnerware-generator/test-files/Angle_mug.stl');
const raw = new STLLoader().parse(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
const { geometry } = InputProcessor.processGeometry(raw);
geometry.computeBoundingBox();
const b = geometry.boundingBox;
const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
const ray = new THREE.Raycaster();
const maxR = 130;

// Radial profile at several heights: outermost radius vs angle (count hits too)
for (const yFrac of [0.02, 0.15, 0.3, 0.5, 0.7, 0.9, 0.98]) {
  const y = b.min.y + (b.max.y - b.min.y) * yFrac;
  let line = `y=${y.toFixed(1)}: `;
  for (let a = 0; a < 24; a++) {
    const ang = (a / 24) * Math.PI * 2;
    const cos = Math.cos(ang), sin = Math.sin(ang);
    ray.set(new THREE.Vector3(maxR * cos, y, maxR * sin), new THREE.Vector3(-cos, 0, -sin));
    ray.far = 300;
    const hits = ray.intersectObject(mesh);
    line += hits.length ? Math.hypot(hits[0].point.x, hits[0].point.z).toFixed(0).padStart(4) : '   -';
  }
  console.log(line);
}

// Bottom heights along two diameters
console.log('\nbottom first-hit-from-below along x axis (z=0):');
let line = '';
for (let i = -12; i <= 12; i++) {
  const x = i * 5;
  ray.set(new THREE.Vector3(x, b.min.y - 50, 0), new THREE.Vector3(0, 1, 0));
  ray.far = 300;
  const hits = ray.intersectObject(mesh);
  line += hits.length ? hits[0].point.y.toFixed(1).padStart(6) : '     -';
}
console.log(line);
console.log('bottom first-hit-from-below along z axis (x=0):');
line = '';
for (let i = -12; i <= 12; i++) {
  const z = i * 5;
  ray.set(new THREE.Vector3(0, b.min.y - 50, z), new THREE.Vector3(0, 1, 0));
  ray.far = 300;
  const hits = ray.intersectObject(mesh);
  line += hits.length ? hits[0].point.y.toFixed(1).padStart(6) : '     -';
}
console.log(line);

// hit counts from outside at worst point y=106.56 angle 45
for (const [y, angDeg] of [[106.56, 45], [80, 45], [80, 135], [5, 90], [25, 200], [33, 200]]) {
  const ang = angDeg * Math.PI / 180;
  const cos = Math.cos(ang), sin = Math.sin(ang);
  ray.set(new THREE.Vector3(maxR * cos, y, maxR * sin), new THREE.Vector3(-cos, 0, -sin));
  ray.far = 300;
  const hits = ray.intersectObject(mesh);
  console.log(`y=${y} ang=${angDeg}: ${hits.length} hits, radii: ${hits.slice(0,6).map(h => Math.hypot(h.point.x, h.point.z).toFixed(1)).join(', ')}`);
}
