/**
 * Stacked Cylinder Mold - export
 *
 * One binary STL per print part, in print orientation, turned to fit the
 * printer bed and dropped onto it, written Z-up for slicers (tagged so
 * platform importers restore Y-up). Two folders:
 *
 *   Kit_D175_H160/   universal kit, printed once per diameter (tier 1)
 *   <ware>/          this ware's cores, inserts and well parts (tier 2)
 *
 * `buildExportFiles` is pure (Node gates use it); `downloadExport` zips and
 * downloads in the browser.
 */

import { transformSolid, dropToBed } from './solidBuilder.js';
import { demoldOrder } from './bandSlicer.js';
import { fitOnBed } from './castingUnitParts.js';
import { KIT_REVISION } from './kitSpec.js';
import { Z_UP_HEADER_TAG } from '../../geometry/stlCore.js';
import { createZip } from '../../storage/zipWriter.js';

export function sanitizeName(name) {
    return String(name || 'Stacked_Mold').trim().replace(/[^\w\-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'Stacked_Mold';
}

/** Print profile per part role (printing-analysis.html, "print profile by tier"). */
export const PRINT_PROFILES = {
    kit: { tier: 1, text: '0.24–0.28 mm layers · 3–4 walls · 15% infill · PETG preferred, PLA OK' },
    small: { tier: 1, text: '0.16 mm layers · 100% infill (small, takes the load)' },
    ware: { tier: 2, text: '0.12–0.16 mm adaptive layers · 3 walls · 5–10% gyroid · forming surface faces up' },
    jig: { tier: 2, text: '0.2 mm layers · 3 walls · 15% infill' }
};
const PROFILE_BY_ROLE = {
    bedplate: 'kit', lid: 'kit', sleeve: 'kit',
    plugbump: 'small', plugpocket: 'small', puck: 'small',
    core: 'ware', footbase: 'ware', insertA: 'ware', insertB: 'ware', footring: 'jig',
    slittube: 'jig', locator: 'jig'
};

/** Binary STL (Z-up) from { positions, indices } in Y-up. */
export function solidToSTL(solid, header = 'Stacked Mold Generator') {
    const { positions: p, indices: idx } = solid;
    const count = idx.length / 3;
    const buffer = new ArrayBuffer(84 + count * 50);
    const view = new DataView(buffer);
    const text = `${Z_UP_HEADER_TAG} ${header}`.slice(0, 80);
    for (let i = 0; i < 80; i++) view.setUint8(i, i < text.length ? text.charCodeAt(i) & 0xff : 0);
    view.setUint32(80, count, true);
    let o = 84;
    // (x, y, z) Y-up → (x, −z, y) Z-up: a proper rotation, winding preserved
    const v = (i) => [p[i * 3], -p[i * 3 + 2], p[i * 3 + 1]];
    for (let t = 0; t < count; t++) {
        const a = v(idx[t * 3]), b = v(idx[t * 3 + 1]), c = v(idx[t * 3 + 2]);
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
        const wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
        let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
        const len = Math.hypot(nx, ny, nz) || 1;
        nx /= len; ny /= len; nz /= len;
        for (const val of [nx, ny, nz, ...a, ...b, ...c]) { view.setFloat32(o, val, true); o += 4; }
        view.setUint16(o, 0, true); o += 2;
    }
    return buffer;
}

/**
 * Part solid in print orientation: lowest point on the bed, centred, and
 * turned about the vertical so it fits the printer (tiles, long inserts).
 */
export function printSolid(part, printer = null) {
    let solid = dropToBed(transformSolid(part.solid, part.toPrint));
    const p = solid.positions;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < p.length; i += 3) {
        x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]);
        z0 = Math.min(z0, p[i + 2]); z1 = Math.max(z1, p[i + 2]);
    }
    solid = transformSolid(solid, [1, 0, 0, -(x0 + x1) / 2, 0, 1, 0, 0, 0, 0, 1, -(z0 + z1) / 2]);
    if (printer && (x1 - x0 > printer.x - 4 || z1 - z0 > printer.y - 4)) {
        const pts = [];
        for (let i = 0; i < solid.positions.length; i += 3 * 7) pts.push([solid.positions[i], -solid.positions[i + 2]]);
        const fit = fitOnBed(pts, printer);
        if (fit) {
            const a = fit.deg * Math.PI / 180;
            // (u, w) rotated by +a in the bed plane ↔ rotation about Y by −a in (x, y, z)
            const c = Math.cos(a), s = Math.sin(a);
            solid = transformSolid(solid, [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0]);
        }
    }
    return solid;
}

function footprint(solid) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, y1 = -Infinity;
    const p = solid.positions;
    for (let i = 0; i < p.length; i += 3) {
        x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]);
        z0 = Math.min(z0, p[i + 2]); z1 = Math.max(z1, p[i + 2]);
        y1 = Math.max(y1, p[i + 1]);
    }
    return { x: x1 - x0, y: z1 - z0, z: y1 };
}

const profileFor = (role) => PRINT_PROFILES[PROFILE_BY_ROLE[role] || 'jig'];

/** Kit files (folder `<kit id>/`). */
export function buildKitFiles(kit, printer) {
    return kit.parts.map(part => {
        const solid = printSolid(part, printer);
        const tile = part.tile ? `_tile${part.tile.k + 1}of${part.tile.n}` : '';
        return {
            name: `${kit.id}/${kit.id}_${part.role}${tile}.stl`,
            group: 'kit', unit: kit.id, role: part.role, label: part.label, count: part.count,
            profile: profileFor(part.role), solid, size: footprint(solid), volume: part.check.volume
        };
    });
}

/** This ware's files (folder `<name>/`). */
export function buildWareFiles(mold, projectName) {
    const base = sanitizeName(projectName);
    const printer = mold.dims.printer;
    const files = [];
    for (const { unit, parts } of mold.parts.units) {
        for (const part of parts) {
            const solid = printSolid(part, printer);
            files.push({
                name: `${base}/${base}_${unit.id}_${unit.kind}_${part.role}${part.tile ? `_tile${part.tile.k + 1}of${part.tile.n}` : ''}.stl`,
                group: 'ware', unit: unit.id, role: part.role, label: part.label, count: part.count || 1,
                profile: part.fused ? PRINT_PROFILES.kit : profileFor(part.role),
                solid, size: footprint(solid), volume: part.check.volume
            });
        }
    }
    return files;
}

/**
 * Every exported file with its metadata (kit first, then the ware).
 * @returns {Array<{ name, group, unit, role, label, count, profile, solid, size, volume }>}
 */
export function buildExportFiles(mold, projectName, { kit = true, ware = true } = {}) {
    return [
        ...(kit ? buildKitFiles(mold.parts.kit, mold.dims.printer) : []),
        ...(ware ? buildWareFiles(mold, projectName) : [])
    ];
}

/** Plain-text build notes for the ZIP. */
export function buildReadme(mold, projectName) {
    const { result, summary, dims, parts } = mold;
    const kit = parts.kit;
    const lines = [
        `${projectName}: stacked cylinder slip-casting mold`,
        '',
        `Cylinder Ø${result.S} mm${result.fittedS !== result.S ? ` (standard size; fitted Ø${result.fittedS})` : ''} · ${summary.units} units · ${summary.pieces} plaster pieces`,
        `Pooling ledge ${summary.ledge.toFixed(1)} mm · plaster ≈ ${summary.plasterLitres.toFixed(2)} L in total`,
        `Universal kit ${kit.id}: Ø${kit.diameter}, sleeve h ${kit.sleeveH} in ${kit.segments} segments` +
            `${kit.plateTiles > 1 ? `, bed plate in ${kit.plateTiles} tiles` : ''}${kit.lidTiles > 1 ? `, lid in ${kit.lidTiles} tiles` : ''} (${dims.printer.label}).`,
        '',
        'Units (bottom to top):'
    ];
    result.units.forEach(u => {
        const bed = u.kind === 'footer' ? 'locating ring (bumps)'
            : u.bedFormer.former === 'plain' ? 'flat' : `${u.bedFormer.former === 'bumps' ? 'bump' : 'pocket'} plugs`;
        const lid = u.lidFormer ? `lid with ${u.lidFormer.former === 'bumps' ? 'bump' : 'pocket'} plugs` : 'no lid';
        lines.push(`  ${u.id} ${u.kind.padEnd(6)} z ${u.a.toFixed(0)}–${u.b.toFixed(0)} mm, h ${u.h.toFixed(0)} · pour ${u.orient} · bed plate: ${bed} · ${lid} · ${u.vol.toFixed(2)} L`);
    });
    lines.push('',
        `Kit hardware: 6 × M5 heat-set inserts + 6 × M5 × ${mold.dims.T} mm set screws (headless jack screws, 2.5 mm hex key), M3 bolts for the sleeve ears.`,
        `Kit revision r${KIT_REVISION}: reprint kits from earlier revisions (r2 raised the plate rim to 4 mm and dropped the pit cap).`,
        '',
        'Casting each unit:',
        '  1. Bed plate on the bench (tiles: slide the dovetails together and tape the seams). Push the key plugs the unit',
        '     needs into the three holes from below. The set screws sit flush with both faces, so the plate lies flat on the bench and the bench holds the plugs in.',
        '  2. Place the ware part: ring cores and the well locator sit on the locating puck in the centre pit. Footer: lay the',
        '     footer base (stub and locating ring in one piece) in the plate rim, pull tabs at the rim gaps. The rim centres it,',
        '     and its face carries the footer\'s key bumps (no plugs). Wide wares: the base\'s centre is ringed by dovetailed tiles',
        '     that seat on its 45° edge.',
        '  3. Stand the sleeve segments inside the rim (on the locating ring for a footer) and bolt the ears. Well collar: slide',
        '     the slit tube over the locator rim and tape its edges together on the inside. Soap every surface plaster will touch.',
        '  4. Pour. Lidded units: fill a little above the core top, put the plugs in the lid, and lower the lid until it',
        '     rests on the core top; surplus and air leave through the bleeds. Footer and well collar: pour to height and let it level.',
        '  5. Split units: stand insert A on the plate, bolt one sleeve segment to its divider flanges, pour, lid. Then insert B.',
        '  6. Once set: turn the lid\'s set screws down evenly (or lift it by its tabs), unbolt and pry the sleeve open at the ear',
        '     bevels. Lay the plate across two blocks and turn its set screws up from below (2 mm breaks the plaster free), then',
        '     lift the plaster off the core. Footer: lift plaster and base off the plate together, then pull the base out by its',
        '     tabs (the ring peels, the stub follows straight out of the foot cavity). Well collar: peel the tape and ease',
        '     an edge of the slit tube inward to free the bore.',
        '',
        'Every piece has male cones below and sockets on top; stack them footer first.',
        '',
        'Demold order:');
    demoldOrder(result).forEach((s, i) => lines.push(`  ${i + 1}. ${s.text} (${s.ids.join(', ')})`));
    lines.push('', 'Print profiles (parts are saved in their print orientation; no supports):');
    Object.values(PRINT_PROFILES).forEach(p => lines.push(`  tier ${p.tier}: ${p.text}`));
    return lines.join('\n');
}

/** Zip the chosen parts (+ README) and download it. */
export async function downloadExport(mold, projectName, { only = null } = {}) {
    const { downloadBlob } = await import('../../geometry/stlCore.js');
    const files = buildExportFiles(mold, projectName).filter(f => !only || only.includes(f.name));
    const entries = files.map(f => ({ name: f.name, data: new Uint8Array(solidToSTL(f.solid, `${projectName} ${f.label}`)) }));
    entries.push({ name: 'README.txt', data: new TextEncoder().encode(buildReadme(mold, projectName)) });
    const bytes = await createZip(entries);
    const zipName = `${sanitizeName(projectName)}_StackedMold.zip`;
    await downloadBlob(new Blob([bytes], { type: 'application/zip' }), zipName);
    return { zipName, files: files.map(f => f.name) };
}
