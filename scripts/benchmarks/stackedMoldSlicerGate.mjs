/**
 * Stacked Cylinder Mold - slicer gate
 *
 * The six concept forms (stacked-cylinder-mold/PLAN.md §3) must produce
 * exactly the prototype's units, release directions, cylinder Ø and ledge,
 * from control points and from dense samples alike; the key/plate
 * bookkeeping must follow the fixed gender rule; every ring band must be
 * monotonic; a pedestal foot puts the seam at the base. Also slices the
 * user-supplied test STLs in test-files/stacked-mold/.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { makeControlProfile, makeSampledProfile, sliceProfile, demoldOrder } from '../stackedMold/geometry/bandSlicer.js';
import { SAMPLE_FORMS } from '../stackedMold/geometry/sampleForms.js';
import { extractMeshProfile } from '../stackedMold/geometry/profileExtractor.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
let failures = 0;
const check = (ok, label) => {
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
};

// kind + release glyph + [a–b] for body units
const signature = (A) => A.units.map(u => {
    const tag = u.kind === 'ring' ? `ring${u.release === 'up' ? '↑' : '↓'}` : u.kind;
    return u.kind === 'split' ? `${tag}(${Math.round(u.a)}–${Math.round(u.b)})` : tag;
}).join(' ');

const PROTOTYPE_CAPS = { maxRingH: 90, maxSplitH: 180, seamAtCrease: false };

const EXPECTED = {
    'tapered-tumbler': { units: 'footer ring↓ ring↓ well', S: 150 },
    'open-bowl': { units: 'footer ring↓ well', S: 230 },
    'belly-jar': { units: 'footer ring↓ ring↑ ring↑ well', S: 190 },
    'bottle-flared-lip': { units: 'footer ring↓ split(60–172) well', S: 180 },
    'hourglass-vase': { units: 'footer ring↓ split(48–150) well', S: 180 },
    'straight-cylinder': { units: 'footer split(6–100) well', S: 150 }
};

function sampled(prof) {
    const s = [];
    for (let z = 0; z <= prof.H + 1e-9; z += 0.5) s.push({ z, r: prof.r(z) });
    return makeSampledProfile(s);
}

for (const form of SAMPLE_FORMS) {
    const exp = EXPECTED[form.id];
    for (const mode of ['control', 'sampled']) {
        const prof = mode === 'control' ? makeControlProfile(form.pts) : sampled(makeControlProfile(form.pts));
        // The prototype's 90 / 180 mm height caps reproduce its table
        const A = sliceProfile(prof, PROTOTYPE_CAPS);
        const sig = signature(A);
        check(sig === exp.units, `${form.name} [${mode}] units: ${sig}`);
        check(A.S === exp.S, `${form.name} [${mode}] cylinder Ø${A.S} (expected ${exp.S})`);
        check((A.rw - A.rLip).toFixed(1) === '7.0', `${form.name} [${mode}] ledge ${(A.rw - A.rLip).toFixed(1)} mm`);

        // Every ring band is monotonic in its direction
        const mono = A.units.filter(u => u.kind === 'ring').every(u => {
            const sign = u.dir === 'inc' ? 1 : -1;
            for (let z = u.a; z < u.b - 0.25; z += 0.25) {
                if (sign * (A.r(z + 0.25) - A.r(z)) < -1e-6) return false;
            }
            return true;
        });
        check(mono, `${form.name} [${mode}] ring bands are monotonic`);

        // Pour orientation: inc → inverted, dec → upright; ware release follows
        const orient = A.units.filter(u => u.kind === 'ring').every(u =>
            (u.dir === 'inc' && u.orient === 'inverted' && u.release === 'down')
            || (u.dir === 'dec' && u.orient === 'upright' && u.release === 'up'));
        check(orient, `${form.name} [${mode}] wide end on the bed for every ring`);

        // Bookkeeping: gender rule and plate formers
        const book = A.units.every(u => {
            const bottomOk = u.kind === 'footer' ? u.plasterBottom === 'flat' : u.plasterBottom === 'male';
            const topOk = u.kind === 'well' ? u.plasterTop === 'open' : u.plasterTop === 'sockets';
            const bedFace = u.orient === 'inverted' ? 'top' : 'bottom';
            const expectFormer = (face) => face === 'bottom' ? (u.kind === 'footer' ? 'plain' : 'pockets') : (u.kind === 'well' ? 'plain' : 'bumps');
            const bedOk = u.bedFormer.face === bedFace && u.bedFormer.former === expectFormer(bedFace);
            const lidOk = (u.kind === 'footer' || u.kind === 'well')
                ? u.lidFormer === null
                : u.lidFormer.face !== bedFace && u.lidFormer.former === expectFormer(u.lidFormer.face);
            return bottomOk && topOk && bedOk && lidOk;
        });
        check(book, `${form.name} [${mode}] key/plate bookkeeping`);

        // Demold order is complete
        const ids = demoldOrder(A).flatMap(s => s.ids).sort();
        check(ids.join() === A.units.map(u => u.id).sort().join(), `${form.name} [${mode}] demold order covers every unit`);
    }
}

// Default limits: units are only cut when their parts would not fit the printer
{
    const DEFAULT_UNITS = {
        'tapered-tumbler': 'footer ring↓ well',
        'open-bowl': 'footer ring↓ well',
        'belly-jar': 'footer ring↓ ring↑ well',
        'bottle-flared-lip': 'footer ring↓ split(60–172) well',
        'hourglass-vase': 'footer ring↓ split(48–150) well',
        'straight-cylinder': 'footer split(4–100) well'
    };
    for (const form of SAMPLE_FORMS) {
        const sig = signature(sliceProfile(makeControlProfile(form.pts)));
        check(sig === DEFAULT_UNITS[form.id], `${form.name} [defaults] fewest units: ${sig}`);
    }
    // A form taller than the printer still gets an even height cut
    const tall = sliceProfile(makeControlProfile([[0, 31], [4, 33], [300, 50]]));
    check(tall.units.filter(u => u.kind === 'ring').length === 2 && tall.units.every(u => u.kind !== 'ring' || u.h <= 246),
        `300 mm tumbler on a 256 mm printer: two rings ≤ 246 mm`);
}

// The foot seam sits on the foot/wall crease, so the next unit has one wall angle
{
    const chamfer = sliceProfile(makeSampledProfile([
        ...Array.from({ length: 21 }, (_, i) => ({ z: i * 0.5, r: 35 + i * 0.5 })),      // 45° foot to z = 10
        ...Array.from({ length: 181 }, (_, i) => ({ z: 10.5 + i * 0.5, r: 45 + (i + 1) * 0.013 }))
    ]));
    check(Math.abs(chamfer.f - 10) <= 0.3, `45° foot chamfer: seam on its crease (${chamfer.f} mm)`);
    check(chamfer.units.length === 3, 'chamfered tumbler: footer + one ring + well');
    const smooth = sliceProfile(makeControlProfile(SAMPLE_FORMS.find(f => f.id === 'belly-jar').pts));
    check(smooth.f === 6, 'smooth base keeps the 6 mm seam');
}

// Belly jar bookkeeping, verbatim from the concept table
{
    const A = sliceProfile(makeControlProfile(SAMPLE_FORMS.find(f => f.id === 'belly-jar').pts), PROTOTYPE_CAPS);
    const table = A.units.map(u => `${u.id}|${u.bedPlate}|${u.lid}`);
    const expected = [
        'U1|bumps → top|none (screed bench face)',
        'U2|bumps → top|pockets → bottom',
        'U3|pockets → bottom|bumps → top',
        'U4|pockets → bottom|bumps → top',
        'U5|pockets → bottom|none (screed pour face)'
    ];
    check(table.join('\n') === expected.join('\n'), 'Belly jar bed plate / lid formers match the concept table');
}

// Pedestal foot: base narrows upward → seam at the base
{
    const A = sliceProfile(makeControlProfile([[0, 40], [10, 30], [100, 45]]));
    check(A.f === 0, `Pedestal foot gives f = 0 (got ${A.f})`);
    check(A.units[0].kind === 'footer' && A.units[0].b === 0, 'Pedestal footer ends at the base');
}

// Braz set: shallow forms fold their short rim band into the footer; every
// item is footer (+ one ring) + well; the seam sits on the foot crease
{
    const EXPECT = {
        tumbler: 'footer ring↓ well', mug: 'footer ring↓ well', saucer: 'footer well', soup_bowl: 'footer ring↓ well',
        pasta_bowl: 'footer ring↓ well', plate: 'footer well', serving_bowl: 'footer ring↓ well'
    };
    for (const [name, units] of Object.entries(EXPECT)) {
        const buf = readFileSync(`${root}test-files/stacked-mold/braz-set/Braz_3_${name}.stl`);
        const n = buf.readUInt32LE(80);
        const pos = new Float32Array(n * 9);
        for (let i = 0; i < n; i++) for (let k = 0; k < 9; k++) pos[i * 9 + k] = buf.readFloatLE(84 + i * 50 + 12 + k * 4);
        const p = extractMeshProfile(pos);
        const A = sliceProfile(makeSampledProfile(p.outer, { underside: p.underside }));
        check(signature(A) === units, `Braz ${name}: ${signature(A)}`);
        check(A.f >= A.footRecess - 0.01, `Braz ${name}: foot recess (${A.footRecess.toFixed(1)}) inside the footer (seam ${A.f})`);
    }
}

// User test forms
const readSTL = (path) => {
    const buf = readFileSync(path);
    const n = buf.readUInt32LE(80);
    const pos = new Float32Array(n * 9);
    for (let i = 0; i < n; i++) for (let k = 0; k < 9; k++) pos[i * 9 + k] = buf.readFloatLE(84 + i * 50 + 12 + k * 4);
    return pos;
};
const STL_EXPECTED = [
    { file: 'test-files/stacked-mold/Braz_3_mug.stl', units: 'footer ring↓ well', S: 170, recess: 10, seam: 10 },
    { file: 'test-files/stacked-mold/Untitled_Vessel_V2.stl', units: 'footer ring↓ split(78–135) well', S: 200, recess: 9.5, seam: 10.5 }
];
for (const t of STL_EXPECTED) {
    const p = extractMeshProfile(readSTL(root + t.file));
    const A = sliceProfile(makeSampledProfile(p.outer, { underside: p.underside }));
    check(signature(A) === t.units, `${t.file}: ${signature(A)}`);
    check(A.S === t.S, `${t.file}: cylinder Ø${A.S}`);
    check(A.rw - A.rLip >= 6.35, `${t.file}: ledge ${(A.rw - A.rLip).toFixed(2)} mm ≥ ¼″`);
    check(Math.abs(A.footRecess - t.recess) < 0.6, `${t.file}: foot recess ${A.footRecess.toFixed(2)} mm`);
    check(Math.abs(A.f - t.seam) <= 0.15, `${t.file}: foot seam at ${A.f} mm (expected ${t.seam})`);
    check(p.asymmetry < 0.1, `${t.file}: axisymmetric (${p.asymmetry.toFixed(3)} mm)`);
}

console.log(`\nStacked mold slicer gate: ${failures ? `${failures} failure(s)` : 'all checks passed'}.`);
process.exitCode = failures ? 1 : 0;
