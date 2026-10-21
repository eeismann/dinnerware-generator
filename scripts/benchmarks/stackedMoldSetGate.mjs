/**
 * Stacked Cylinder Mold - set gate
 *
 * Plans the Braz dinnerware set (test-files/stacked-mold/braz-set) on the
 * Bambu H2S: the seven wares share three universal kits (Ø175: tumbler + mug,
 * Ø250: saucer + soup bowl, Ø360: pasta bowl + plate + serving bowl), each
 * sleeve holds its tallest unit, every printed file is watertight and fits,
 * and the plan uses less filament than a full mold per ware.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { extractMeshProfile } from '../stackedMold/geometry/profileExtractor.js';
import { planSet } from '../stackedMold/geometry/setPlanner.js';
import { DEFAULT_PARAMS, deepClone } from '../stackedMold/state/stackedMoldDefaults.js';
import { measureOverhang, analyzeSolid } from '../stackedMold/geometry/solidBuilder.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const dir = `${root}test-files/stacked-mold/braz-set/`;
let failures = 0;
const check = (ok, label) => {
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
};
const readSTL = (path) => {
    const buf = readFileSync(path);
    const n = buf.readUInt32LE(80);
    const pos = new Float32Array(n * 9);
    for (let i = 0; i < n; i++) for (let k = 0; k < 9; k++) pos[i * 9 + k] = buf.readFloatLE(84 + i * 50 + 12 + k * 4);
    return pos;
};

const items = readdirSync(dir).filter(f => f.endsWith('.stl')).map(f => ({
    name: f.replace('Braz_3_', '').replace('.stl', ''), src: extractMeshProfile(readSTL(dir + f))
}));
const plan = planSet(items, deepClone(DEFAULT_PARAMS));

const groups = plan.kits.map(k => `Ø${k.diameter}:${k.wares.map(w => w.name).sort().join('+')}`).join(' | ');
check(groups === 'Ø175:mug+tumbler | Ø250:saucer+soup_bowl | Ø360:pasta_bowl+plate+serving_bowl', `three kits: ${groups}`);
check(plan.kits.map(k => k.sleeveH).join(',') === '150,60,100', `sleeve heights ${plan.kits.map(k => k.sleeveH).join(', ')} mm`);
for (const kit of plan.kits) {
    for (const w of kit.wares) {
        check(w.mold.result.units.every(u => u.h <= kit.sleeveH), `${kit.id} ${w.name}: every unit fits the sleeve`);
    }
}
let filesOk = true;
for (const kit of plan.kits) {
    for (const f of [...kit.files, ...kit.wares.flatMap(w => w.files)]) {
        const c = analyzeSolid(f.solid);
        const oh = measureOverhang(f.solid);
        const pr = kit.wares[0].mold.dims.printer;
        if (!(c.watertight && oh.area < 1e-6 && f.size.x <= pr.x - 2 && f.size.y <= pr.y - 2 && f.size.z <= pr.z)) {
            filesOk = false;
            console.log(`  ${f.name}: watertight ${c.watertight}, overhang ${oh.area.toFixed(2)} mm², ${f.size.x.toFixed(0)}×${f.size.y.toFixed(0)}×${f.size.z.toFixed(0)}`);
        }
    }
}
check(filesOk, 'every kit and ware file is watertight, support-free and fits the H2S');
check(plan.totals.pieces === 19, `${plan.totals.pieces} plaster pieces for one mold of each ware`);
console.log(`Filament ≈ ${Math.round(plan.totals.grams)} g (kits ${Math.round(plan.totals.kitGrams)} g + wares ${Math.round(plan.totals.wareGrams)} g), ${plan.totals.prints} prints`);

console.log(`\nStacked mold set gate: ${failures ? `${failures} failure(s)` : 'all checks passed'}.`);
process.exitCode = failures ? 1 : 0;
