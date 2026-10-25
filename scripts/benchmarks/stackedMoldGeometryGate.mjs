/**
 * Stacked Cylinder Mold - geometry gate
 *
 * For the six concept forms, the user test STLs and the Braz set: every kit
 * part and ware part is a closed, consistently oriented 2-manifold with
 * positive volume; no print overhang exceeds 45° in its saved print
 * orientation; every file fits the printer (tiles and sleeve segments
 * included); keys mate across every joint through the swap-in plugs (a bump
 * on one side, a pocket on the other, at the same key circle and angles, and
 * the male cone's flank lies on the socket's: no play, faces close); plugs
 * seat flush on the bore chamfer;
 * the plates carry the plug and jack bores; split dividers mate; export names
 * and STL bytes are well formed.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SAMPLE_FORMS } from '../stackedMold/geometry/sampleForms.js';
import { extractMeshProfile, controlFormProfile } from '../stackedMold/geometry/profileExtractor.js';
import { computeMold } from '../stackedMold/geometry/stackedMoldPipeline.js';
import { transformSolid, measureOverhang } from '../stackedMold/geometry/solidBuilder.js';
import { composeMatrix, IDENTITY, FOOT_RING, KEY, PLUG } from '../stackedMold/geometry/castingUnitParts.js';
import { buildExportFiles, solidToSTL, buildReadme } from '../stackedMold/geometry/stackedMoldExporter.js';
import { DEFAULT_PARAMS, deepClone } from '../stackedMold/state/stackedMoldDefaults.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
let failures = 0;
const check = (ok, label) => {
    if (!ok) failures++;
    if (!ok || process.argv.includes('--verbose')) console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
    return ok;
};

const readSTL = (path) => {
    const buf = readFileSync(path);
    const n = buf.readUInt32LE(80);
    const pos = new Float32Array(n * 9);
    for (let i = 0; i < n; i++) for (let k = 0; k < 9; k++) pos[i * 9 + k] = buf.readFloatLE(84 + i * 50 + 12 + k * 4);
    return pos;
};

const sources = [
    ...SAMPLE_FORMS.map(f => [f.name, controlFormProfile(f.pts), {}]),
    ['Belly jar (groove, fitted)', controlFormProfile(SAMPLE_FORMS.find(f => f.id === 'belly-jar').pts), { strapGroove: true, diameter: 'fitted' }],
    ['Belly jar (X1 printer)', controlFormProfile(SAMPLE_FORMS.find(f => f.id === 'belly-jar').pts), { printer: 'bambu-x1' }],
    ...['Braz_3_mug.stl', 'Untitled_Vessel_V2.stl'].map(f => [f, extractMeshProfile(readSTL(`${root}test-files/stacked-mold/${f}`)), {}]),
    ...['saucer', 'pasta_bowl', 'plate', 'serving_bowl'].map(f => [`Braz ${f}`, extractMeshProfile(readSTL(`${root}test-files/stacked-mold/braz-set/Braz_3_${f}.stl`)), { diameter: f === 'saucer' ? '250' : '360' }])
];

/** Pour frame → mold frame for a unit. */
const toMold = (u) => u.orient === 'inverted'
    ? [1, 0, 0, 0, 0, -1, 0, u.b, 0, 0, -1, 0]
    : [1, 0, 0, 0, 0, 1, 0, u.a, 0, 0, 1, 0];

/**
 * Key cone vertices about `center` (axis index `axis`), as [r, d]: d is the
 * depth past the face along `sign`, r the distance from the key axis.
 */
function keyVerts(positions, center, axis, sign) {
    const out = [];
    for (let i = 0; i < positions.length; i += 3) {
        const p = [positions[i], positions[i + 1], positions[i + 2]];
        const d = sign * (p[axis] - center[axis]);
        const r = Math.hypot(...p.map((v, k) => (k === axis ? 0 : v - center[k])));
        if (r <= KEY.r + 0.01 && d > -0.01) out.push([r, d]);
    }
    return out;
}

/**
 * Male cone (pocket former) in its socket (bump former): both are the same
 * cone, every vertex on r + d = KEY.r from the face ring to the apex, so the
 * faces close with the flanks touching. No bleed hole: nothing else inside.
 */
function keyFit(bump, pocket, center, axis, sign) {
    const cone = (vs) => vs.filter(([, d]) => d <= KEY.h + 0.01);
    const b = cone(keyVerts(bump, center, axis, sign));
    const p = cone(keyVerts(pocket, center, axis, sign));
    const onCone = (vs) => vs.length >= 32 && vs.every(([r, d]) => Math.abs(r + d - KEY.r) < 0.02);
    const tip = (vs) => vs.some(([r, d]) => r < 0.01 && Math.abs(d - KEY.h) < 0.01);
    return onCone(b) && onCone(p) && tip(b) && tip(p);
}

/** Vertices on a ring of radius `rad` about `center`, in the plane normal to `axis`. */
function ringHits(positions, center, rad, axis) {
    let hits = 0;
    for (let i = 0; i < positions.length; i += 3) {
        const p = [positions[i], positions[i + 1], positions[i + 2]];
        if (Math.abs(p[axis] - center[axis]) > 0.01) continue;
        const d = Math.hypot(...p.map((v, k) => (k === axis ? 0 : v - center[k])));
        if (Math.abs(d - rad) < 0.01) hits++;
    }
    return hits;
}

const NAME_RE = /^(Kit_D\d+_H\d+\/Kit_D\d+_H\d+_[a-z]+(_tile\d+of\d+)?|[\w-]+\/[\w-]+_U\d+_(footer|ring|split|well)_[a-zA-Z]+(_tile\d+of\d+)?)\.stl$/;

let partCount = 0;
for (const [name, src, opts] of sources) {
    const params = deepClone(DEFAULT_PARAMS);
    params.parts.strapGroove = Boolean(opts.strapGroove);
    if (opts.diameter) params.kit.diameter = opts.diameter;
    if (opts.printer) params.kit.printer = opts.printer;
    const mold = computeMold(src, params);
    const { result, parts, dims } = mold;
    const kit = parts.kit;
    const all = [...kit.parts.map(p => ['kit', p]), ...parts.units.flatMap(e => e.parts.map(p => [e.unit.id, p]))];
    partCount += all.length;
    let solidOk = true;
    for (const [where, p] of all) {
        solidOk = check(p.check.watertight && p.check.volume > 0,
            `${name} ${where} ${p.label}: watertight (b${p.check.boundaryEdges} nm${p.check.nonManifoldEdges} mo${p.check.misorientedEdges}), ${(p.check.volume / 1000).toFixed(1)} cm³`) && solidOk;
    }
    const files = buildExportFiles(mold, name.replace(/[^\w-]+/g, '_'));
    let printOk = true;
    const pr = dims.printer;
    for (const f of files) {
        const oh = measureOverhang(f.solid, 45);
        printOk = check(oh.area < 1e-6, `${name} ${f.name}: overhang ≤ 45° (worst ${oh.worstDeg.toFixed(1)}°, ${oh.area.toFixed(2)} mm²)`) && printOk;
        printOk = check(f.size.x <= pr.x - 2 && f.size.y <= pr.y - 2 && f.size.z <= pr.z,
            `${name} ${f.name}: fits the ${pr.label} (${f.size.x.toFixed(0)}×${f.size.y.toFixed(0)}×${f.size.z.toFixed(0)})`) && printOk;
        const stl = solidToSTL(f.solid);
        const view = new DataView(stl);
        check(stl.byteLength === 84 + 50 * view.getUint32(80, true) && view.getUint32(80, true) === f.solid.indices.length / 3,
            `${name} ${f.name}: binary STL size`);
    }
    check(solidOk, `${name}: every part watertight (${all.length} parts)`);
    check(printOk, `${name}: every part prints support-free and fits the printer`);

    const names = files.map(f => f.name);
    check(new Set(names).size === names.length && names.every(n => NAME_RE.test(n)), `${name}: export names unique and well formed`);
    const kitRoles = [...new Set(kit.parts.map(p => p.role))].sort().join(',');
    check(kitRoles === 'bedplate,lid,plugbump,plugpocket,puck,sleeve', `${name}: kit parts ${kitRoles}`);
    check(kit.parts.filter(p => p.role === 'bedplate').length === dims.plateTiles && kit.parts.filter(p => p.role === 'lid').length === dims.lidTiles,
        `${name}: ${dims.plateTiles} bed plate / ${dims.lidTiles} lid tile(s)`);
    for (const e of parts.units) {
        const roles = [...new Set(e.parts.map(p => p.role))].sort().join(',');
        const expected = {
            footer: e.fused ? 'bedplate' : (e.parts.some(p => p.role === 'footring') ? 'footbase,footring' : 'footbase'), ring: 'core', well: 'locator,slittube', split: 'insertA,insertB'
        }[e.unit.kind];
        check(roles === expected, `${name} ${e.unit.id} ${e.unit.kind}: ware parts ${roles}`);
    }
    check(buildReadme(mold, name).includes('Demold order'), `${name}: README`);

    // Plates and lids carry plug bores at the key circle and jack bores between
    const assembled = (role) => kit.parts.filter(p => p.role === role).flatMap(p => [...p.solid.positions]);
    const bed = assembled('bedplate');
    const lid = assembled('lid');
    const T = dims.T;
    const bores = dims.keyAngles.every(a => {
        const c = [dims.K * Math.cos(a), 0, -dims.K * Math.sin(a)];
        return ringHits(bed, c, 7.5, 1) >= 16 && ringHits(lid, c, 7.5, 1) >= 16;
    }) && dims.jackAngles.every(a => ringHits(bed, [dims.K * Math.cos(a), -T, -dims.K * Math.sin(a)], 3.2, 1) >= 10);
    check(bores, `${name}: plug bores at r ${dims.K} (0°/120°/240°) and jack bores between`);

    // Plugs seat on the bore chamfer: the flange chamfer lies on the bore's
    // 45° line r + h = cbR + cbDepth (h from the bench face), so they sit flush
    const seatLine = PLUG.cbR + PLUG.cbDepth;
    const seated = ['plugbump', 'plugpocket'].every(role => {
        const plug = kit.parts.find(p => p.role === role).solid.positions;
        const pts = [];
        for (let i = 0; i < plug.length; i += 3) pts.push([Math.hypot(plug[i], plug[i + 2]), plug[i + 1]]);
        const chamfer = pts.filter(([r, h]) => r > PLUG.shankR - 0.01 && r < PLUG.flangeR + 0.01 && h > PLUG.cbDepth - 0.01 && h < 2 * PLUG.cbDepth + 0.5);
        return chamfer.length >= 32 && chamfer.every(([r, h]) => Math.abs(r + h - seatLine) < 0.01);
    });
    const c0 = [dims.K, 0, 0];
    const boreChamfer = [];
    for (let i = 0; i < bed.length; i += 3) {
        const r = Math.hypot(bed[i] - c0[0], bed[i + 2] - c0[2]);
        const h = bed[i + 1] + T;
        if (r > PLUG.holeR - 0.01 && r < PLUG.cbR + 0.01 && h > PLUG.cbDepth - 0.01 && h < 2 * PLUG.cbDepth + 0.01) boreChamfer.push(r + h);
    }
    check(seated && boreChamfer.length >= 32 && boreChamfer.every(v => Math.abs(v - seatLine) < 0.01), `${name}: key plugs seat flush on the bore chamfer`);

    // Keys mate across every joint, through the plugs each unit uses
    const plugsOf = (e) => e.kitUse.filter(use => /^plug/.test(use.role)).map(use => {
        const plug = kit.parts.find(p => p.role === use.role);
        return transformSolid(plug.solid, composeMatrix(toMold(e.unit), use.matrix)).positions;
    });
    for (let i = 0; i < parts.units.length - 1; i++) {
        const lower = parts.units[i];
        const upper = parts.units[i + 1];
        const zj = lower.unit.b;
        const fusedBumps = lower.parts.filter(p => p.carriesKeys).map(p => transformSolid(p.solid, composeMatrix(toMold(lower.unit), p.toPour || IDENTITY)).positions);
        const lowerPlugs = [...plugsOf(lower), ...fusedBumps];
        const upperPlugs = plugsOf(upper);
        const mated = dims.keyAngles.every(a => {
            const c = [dims.K * Math.cos(a), zj, -dims.K * Math.sin(a)];
            const bumps = lowerPlugs.filter(p => ringHits(p, c, KEY.r, 1) >= 16);
            const pockets = upperPlugs.filter(p => ringHits(p, c, KEY.r, 1) >= 16);
            // Sockets open on the lower piece's top face, male cones point down: depth runs −y
            return bumps.length === 1 && pockets.length === 1 && keyFit(bumps[0], pockets[0], c, 1, -1);
        });
        check(mated, `${name}: ${lower.unit.id}→${upper.unit.id} keys mate snugly at z ${zj.toFixed(1)} (r ${dims.K}, 0°/120°/240°)`);
    }
    // Footer base: the stub surface above the ring face is the ware's own profile;
    // a wide base's ring tiles seat on its flange's 45° edge; the tabs pass the rim gaps
    for (const e of parts.units.filter(e => e.unit.kind === 'footer' && !e.fused)) {
        const { t, clear } = FOOT_RING;
        const verts = (solid, f) => {
            const out = [];
            for (let i = 0; i < solid.positions.length; i += 3) {
                const x = solid.positions[i], y = solid.positions[i + 1], z = solid.positions[i + 2];
                if (f(y)) out.push([Math.hypot(x, z), Math.atan2(-z, x), y]);
            }
            return out;
        };
        const base = e.parts.find(p => p.role === 'footbase');
        const tiles = e.parts.filter(p => p.role === 'footring');
        const rb = base.base;
        // Ware surface: every stub vertex above the face lies on r(z), z = f − y
        const fz = result.f;
        const offWare = verts(base.solid, y => y > 0.05 && y < fz - 0.05)
            .filter(([rho]) => rho > result.r(0) + 1e-3 && rho < dims.K - 7) // the wall; the underside sits inside r(0)
            .map(([rho, , y]) => Math.abs(rho - result.r(fz - y)));
        const surfaceOk = offWare.every(v => v < 0.05) && Math.abs(rb - result.r(fz)) < 0.05;
        const stubAbove = Math.max(...verts(base.solid, y => y > 1e-3).map(v => v[0]).filter(rho => rho < dims.K - 7));
        let seat = true;
        if (tiles.length) {
            const rc = base.flange;
            const at = (solids, y, pick) => pick(...solids.flatMap(sd => verts(sd, v => Math.abs(v - y) < 1e-3)).map(v => v[0]));
            seat = Math.abs(at([base.solid], -t, Math.max) - (rc + t)) < 0.05 && Math.abs(at([base.solid], 0, Math.max) - rc) < 0.05
                && Math.abs(at(tiles.map(p => p.solid), -t, Math.min) - (rc + t + clear)) < 0.05
                && Math.abs(at(tiles.map(p => p.solid), 0, Math.min) - (rc + clear)) < 0.05;
        }
        check(stubAbove <= Math.max(rb, base.flange ?? rb) + 0.05 && seat,
            `${name}: ${e.unit.id} footer base${tiles.length ? ` (centre r ${base.flange.toFixed(0)} + ${tiles.length} ring tiles seated on its 45° edge)` : ' in one piece'}`);
        check(surfaceOk, `${name}: ${e.unit.id} stub surface follows the ware above the ring face`);
        // Only the pull tabs cross the plate rim, through the 8 mm gaps at the sleeve seams
        const ringParts = tiles.length ? tiles : [base];
        const tabVerts = ringParts.flatMap(p => verts(p.solid, () => true)).filter(v => v[0] > dims.rimIn - 0.3 + 0.05).map(([r, a]) => {
            const sm = dims.sleeveSeams.reduce((best, x) => Math.abs(Math.atan2(Math.sin(a - x), Math.cos(a - x))) < Math.abs(Math.atan2(Math.sin(a - best), Math.cos(a - best))) ? x : best);
            const da = Math.atan2(Math.sin(a - sm), Math.cos(a - sm));
            return { along: r * Math.cos(da), across: Math.abs(r * Math.sin(da)) };
        });
        const tabsOk = tabVerts.length > 0 && tabVerts.every(v => v.along > dims.rimOut + 0.5 || v.across < 3.5);
        check(tabsOk, `${name}: ${e.unit.id} pull tabs pass the rim gaps (${dims.sleeveSeams.length} tabs)`);
    }
    // Well: the slit tube, taped shut, has the bore's circumference
    for (const e of parts.units.filter(e => e.unit.kind === 'well')) {
        const tube = e.parts.find(p => p.role === 'slittube').solid.positions;
        let ro = 0;
        for (let i = 0; i < tube.length; i += 3) ro = Math.max(ro, Math.hypot(tube[i], tube[i + 2]));
        const closed = ro - 0.6 / (2 * Math.PI);
        check(Math.abs(closed - result.rw) < 0.02, `${name}: ${e.unit.id} slit tube closes to the bore (r ${closed.toFixed(2)} vs ${result.rw.toFixed(2)})`);
    }
    // Split dividers: insert A bumps, insert B pockets, same places on x = 0
    for (const e of parts.units.filter(e => e.unit.kind === 'split')) {
        const ins = (tag) => e.parts.find(q => q.role === `insert${tag}`).solid.positions;
        const A = ins('A'), B = ins('B');
        const zk = dims.R - 12;
        const ok = [0.25, 0.75].every(f => [1, -1].every(s => {
            const c = [0, e.unit.h * f, s * zk];
            // A's bumps stand on +x; B, turned half a turn in use, has its pockets on −x
            const Bt = B.map((v, i) => (i % 3 === 1 ? v : -v));
            return ringHits(A, c, KEY.r, 0) >= 16 && ringHits(B, c, KEY.r, 0) >= 16 && keyFit(A, Bt, [0, c[1], s * zk], 0, 1);
        }));
        check(ok, `${name}: ${e.unit.id} divider keys mate snugly (A bumps / B pockets)`);
    }
    console.log(`${name}: ${kit.id}, ${result.units.length} units, ${all.length} parts, ${files.length} files`);
}

console.log(`\nStacked mold geometry gate: ${partCount} parts; ${failures ? `${failures} failure(s)` : 'all checks passed'}.`);
process.exitCode = failures ? 1 : 0;
