#!/usr/bin/env node
/**
 * Plan and export the stacked-mold system for a set of wares.
 *
 *   node scripts/stackedMold/tools/planSet.mjs <file.stl | folder> … [--out dir] [--printer bambu-h2s] [--spread 0.2]
 *
 * Writes <out>/kits/<kit id>/*.stl (print once), <out>/wares/<ware>/*.stl,
 * REPORT.md and plan.json. Compares against printing a full mold per ware.
 */

import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { extractMeshProfile } from '../geometry/profileExtractor.js';
import { planSet, estimateGrams, solidArea } from '../geometry/setPlanner.js';
import { computeMold } from '../geometry/stackedMoldPipeline.js';
import { buildExportFiles, solidToSTL, PRINT_PROFILES } from '../geometry/stackedMoldExporter.js';
import { DEFAULT_PARAMS, deepClone } from '../state/stackedMoldDefaults.js';
import { getPrinter } from '../geometry/kitSpec.js';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
    const i = args.indexOf(`--${name}`);
    if (i < 0) return fallback;
    const v = args[i + 1];
    args.splice(i, 2);
    return v;
};
const out = resolve(opt('out', 'output/stacked-mold/set'));
const printer = opt('printer', 'bambu-h2s');
const spread = Number(opt('spread', '0.2'));
const writeFiles = !args.includes('--no-files');
const inputs = args.filter(a => !a.startsWith('--')).flatMap(a => {
    const p = resolve(a);
    return statSync(p).isDirectory() ? readdirSync(p).filter(f => /\.stl$/i.test(f)).map(f => join(p, f)) : [p];
});
if (!inputs.length) {
    console.error('Usage: planSet.mjs <file.stl | folder> … [--out dir] [--printer id] [--spread 0.2]');
    process.exit(1);
}

const readSTL = (path) => {
    const buf = readFileSync(path);
    const n = buf.readUInt32LE(80);
    const pos = new Float32Array(n * 9);
    for (let i = 0; i < n; i++) for (let k = 0; k < 9; k++) pos[i * 9 + k] = buf.readFloatLE(84 + i * 50 + 12 + k * 4);
    return pos;
};

const params = deepClone(DEFAULT_PARAMS);
params.kit.printer = printer;
const items = inputs.map(path => ({ name: basename(path).replace(/\.stl$/i, ''), src: extractMeshProfile(readSTL(path)) }));
const plan = planSet(items, params, { maxSpread: spread });

// Baseline: every ware printed as a full mold at its own (auto) diameter
let baseline = 0;
for (const item of items) {
    const mold = computeMold(item.src, deepClone(params));
    baseline += buildExportFiles(mold, item.name).reduce((s, f) => {
        const infill = f.profile.text.includes('100%') ? 1 : f.profile.tier === 2 ? 0.08 : 0.15;
        return s + estimateGrams(f.volume, solidArea(f.solid), { infill }) * f.count;
    }, 0);
}

if (writeFiles) {
    for (const kit of plan.kits) {
        for (const f of kit.files) {
            const path = join(out, 'kits', f.name);
            mkdirSync(join(path, '..'), { recursive: true });
            writeFileSync(path, Buffer.from(solidToSTL(f.solid, f.label)));
        }
        for (const w of kit.wares) {
            for (const f of w.files) {
                const path = join(out, 'wares', f.name);
                mkdirSync(join(path, '..'), { recursive: true });
                writeFileSync(path, Buffer.from(solidToSTL(f.solid, f.label)));
            }
        }
    }
}

const g = (x) => `${Math.round(x)} g`;
const pr = getPrinter(printer);
const lines = [
    `# Stacked mold system: ${items.length} wares`,
    '',
    `Printer: ${pr.label} (${pr.x} × ${pr.y} × ${pr.z} mm). Kits group wares within ${Math.round(spread * 100)}% of a standard diameter.`,
    '',
    `**${plan.totals.kits} universal kits** serve all ${items.length} wares. Filament ≈ **${g(plan.totals.grams)}** in total` +
        ` (kits ${g(plan.totals.kitGrams)} once + ware parts ${g(plan.totals.wareGrams)}), against ≈ ${g(baseline)} printing a full mold per ware` +
        ` (${Math.round((1 - plan.totals.grams / baseline) * 100)}% less). ${plan.totals.prints} prints; ${plan.totals.pieces} plaster pieces; ≈ ${plan.totals.plasterLitres.toFixed(1)} L of plaster for one mold of each.`,
    ''
];
for (const kit of plan.kits) {
    lines.push(`## ${kit.id}: Ø${kit.diameter}, sleeve ${kit.sleeveH} mm`, '',
        `Wares: ${kit.wares.map(w => `${w.name} (fitted Ø${w.fittedS})`).join(', ')}. ` +
        `Sleeve in ${kit.segments} segments${kit.plateTiles > 1 ? `, bed plate in ${kit.plateTiles} tiles` : ''}${kit.lidTiles > 1 ? `, lid in ${kit.lidTiles} tiles` : ''}. Kit ≈ ${g(kit.grams)}, ${kit.prints} prints.`, '',
        '| Kit part | Print | Size (mm) | Profile |', '|---|---|---|---|',
        ...kit.files.map(f => `| ${f.label} | ×${f.count} | ${f.size.x.toFixed(0)} × ${f.size.y.toFixed(0)} × ${f.size.z.toFixed(0)} | tier ${f.profile.tier} |`), '');
    for (const w of kit.wares) {
        lines.push(`### ${w.name}`, '',
            `${w.units.map(u => `${u.id} ${u.kind} ${u.h.toFixed(0)} mm`).join(' · ')} → ${w.pieces} plaster pieces, ${w.plasterLitres.toFixed(2)} L. Ware parts ≈ ${g(w.grams)}, ${w.prints} prints.`, '',
            '| Ware part | Print | Size (mm) |', '|---|---|---|',
            ...w.files.map(f => `| ${f.unit} ${f.label} | ×${f.count} | ${f.size.x.toFixed(0)} × ${f.size.y.toFixed(0)} × ${f.size.z.toFixed(0)} |`), '');
        const notes = w.warnings.filter(x => x.level === 'warn');
        if (notes.length) lines.push(...notes.map(x => `- ⚠ ${x.text}`), '');
    }
}
lines.push('## Print profiles', '', ...Object.values(PRINT_PROFILES).map(p => `- tier ${p.tier}: ${p.text}`), '',
    'Kit hardware per kit: 6 × M5 heat-set inserts + 6 × M5 × 8 mm set screws (headless jack screws, flush with both plate faces), M3 bolts for the sleeve ears.');
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'REPORT.md'), lines.join('\n'));
writeFileSync(join(out, 'plan.json'), JSON.stringify({
    printer, spread, totals: { ...plan.totals, baselineGrams: baseline },
    kits: plan.kits.map(k => ({
        id: k.id, diameter: k.diameter, sleeveH: k.sleeveH, segments: k.segments, plateTiles: k.plateTiles, lidTiles: k.lidTiles,
        grams: k.grams, prints: k.prints, files: k.files.map(f => ({ name: f.name, count: f.count, size: f.size })),
        wares: k.wares.map(w => ({ name: w.name, fittedS: w.fittedS, units: w.units, pieces: w.pieces, plasterLitres: w.plasterLitres, grams: w.grams, prints: w.prints, files: w.files.map(f => ({ name: f.name, count: f.count, size: f.size })) }))
    }))
}, null, 2));
console.log(lines.slice(0, 5).join('\n'));
console.log(`\nWrote ${out}`);
