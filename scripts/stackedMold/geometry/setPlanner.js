/**
 * Stacked Cylinder Mold - set planner
 *
 * Plans the universal kits for a set of wares (a dinnerware line): groups
 * wares into as few standard diameters as possible, sizes each kit's tall
 * sleeve to the tallest unit it must hold, and builds every kit once plus
 * each ware's own parts. Grouping is greedy over the fitted diameters: a ware
 * joins the current kit while the kit is at most `maxSpread` wider than the
 * ware needs (extra plaster is cheap; another kit is ~1 kg of PLA).
 */

import { computeMold } from './stackedMoldPipeline.js';
import { standardDiameter, KIT_SERIES, KIT_PLATE_T } from './kitSpec.js';
import { buildKitFiles, buildWareFiles } from './stackedMoldExporter.js';

const deepClone = (v) => JSON.parse(JSON.stringify(v));

/** Grams of filament for a part: walls/skins + infill (PLA 1.24 g/cm³). */
export function estimateGrams(volume, area, { skin = 1.2, infill = 0.15 } = {}) {
    const shell = Math.min(volume, area * skin);
    return (shell + Math.max(0, volume - shell) * infill) * 1.24 / 1000;
}

export function solidArea({ positions: p, indices: ix }) {
    let a = 0;
    for (let t = 0; t < ix.length; t += 3) {
        const A = ix[t] * 3, B = ix[t + 1] * 3, C = ix[t + 2] * 3;
        const ux = p[B] - p[A], uy = p[B + 1] - p[A + 1], uz = p[B + 2] - p[A + 2];
        const vx = p[C] - p[A], vy = p[C + 1] - p[A + 1], vz = p[C + 2] - p[A + 2];
        a += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
    }
    return a;
}

const INFILL_BY_TIER = { 1: 0.15, 2: 0.08 };

function fileGrams(f) {
    const smallSolid = f.profile.text.startsWith('0.16 mm layers · 100%');
    return estimateGrams(f.volume, solidArea(f.solid), { infill: smallSolid ? 1 : INFILL_BY_TIER[f.profile.tier] ?? 0.15 }) * f.count;
}

/**
 * @param {Array<{ name, src }>} items - stored source profiles (profileExtractor shapes)
 * @param {Object} params - grouped app params (kit.printer, mold, slicing, parts)
 * @param {Object} [options] - { maxSpread }
 */
export function planSet(items, params, { maxSpread = 0.2 } = {}) {
    // 1. Fitted diameter of every ware (slicer only)
    const fitted = items.map(item => {
        const p = deepClone(params);
        p.kit.diameter = 'fitted';
        const mold = computeMold(item.src, p, { parts: false });
        return { ...item, fittedS: mold.result.fittedS };
    }).sort((a, b) => a.fittedS - b.fittedS);

    // 2. Greedy grouping into standard diameters
    const groups = [];
    for (const item of fitted) {
        const g = groups[groups.length - 1];
        if (g) {
            const kitD = standardDiameter(Math.max(item.fittedS, ...g.items.map(i => i.fittedS))) ?? item.fittedS;
            if (kitD <= Math.min(...g.items.map(i => i.fittedS)) * (1 + maxSpread)) {
                g.items.push(item);
                g.diameter = kitD;
                continue;
            }
        }
        groups.push({ items: [item], diameter: standardDiameter(item.fittedS) ?? item.fittedS });
    }

    // 3. Each kit's sleeve holds its tallest unit (under the drop-in lid)
    const lidT = Math.max(KIT_PLATE_T, params.parts.plateT);
    for (const g of groups) {
        let need = 0;
        for (const item of g.items) {
            const p = deepClone(params);
            p.kit.diameter = String(g.diameter);
            p.kit.sleeveH = '300';
            const { result } = computeMold(item.src, p, { parts: false });
            result.units.forEach(u => { need = Math.max(need, u.lidFormer ? u.h + lidT + 2 : u.h); });
        }
        g.sleeveH = Math.ceil(need / 10) * 10;
    }

    // 4. Build every kit once and every ware's parts against its kit
    const kits = groups.map(g => {
        const molds = g.items.map(item => {
            const p = deepClone(params);
            p.kit.diameter = String(g.diameter);
            p.kit.sleeveH = String(g.sleeveH);
            return { item, mold: computeMold(item.src, p) };
        });
        const first = molds[0].mold;
        const kitFiles = buildKitFiles(first.parts.kit, first.dims.printer);
        const wares = molds.map(({ item, mold }) => {
            const files = buildWareFiles(mold, item.name);
            return {
                name: item.name,
                fittedS: item.fittedS,
                units: mold.result.units.map(u => ({ id: u.id, kind: u.kind, h: u.h, vol: u.vol, release: u.release })),
                pieces: mold.summary.pieces,
                plasterLitres: mold.summary.plasterLitres,
                warnings: mold.warnings,
                files,
                grams: files.reduce((s, f) => s + fileGrams(f), 0),
                prints: files.reduce((s, f) => s + f.count, 0),
                mold
            };
        });
        return {
            id: first.parts.kit.id,
            diameter: g.diameter,
            sleeveH: g.sleeveH,
            segments: first.dims.segments,
            plateTiles: first.dims.plateTiles,
            lidTiles: first.dims.lidTiles,
            files: kitFiles,
            grams: kitFiles.reduce((s, f) => s + fileGrams(f), 0),
            prints: kitFiles.reduce((s, f) => s + f.count, 0),
            wares
        };
    });

    const wareGrams = kits.reduce((s, k) => s + k.wares.reduce((t, w) => t + w.grams, 0), 0);
    const kitGrams = kits.reduce((s, k) => s + k.grams, 0);
    return {
        kits,
        series: KIT_SERIES,
        totals: {
            kits: kits.length,
            wares: items.length,
            kitGrams,
            wareGrams,
            grams: kitGrams + wareGrams,
            prints: kits.reduce((s, k) => s + k.prints + k.wares.reduce((t, w) => t + w.prints, 0), 0),
            plasterLitres: kits.reduce((s, k) => s + k.wares.reduce((t, w) => t + w.plasterLitres, 0), 0),
            pieces: kits.reduce((s, k) => s + k.wares.reduce((t, w) => t + w.pieces, 0), 0)
        }
    };
}
