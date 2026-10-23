// Real-browser regression for the Stacked Mold Generator: start card, source
// picker (sample form), DialKit panels driving regeneration, STL import of the
// user test forms, unit selection and view modes through the view dock, the
// export file list + ZIP download, save → dashboard card → reopen. Starts its
// own Vite server and a software-WebGL Chromium.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { viewDock } from './viewDockHelpers.mjs';

const server = await createServer({ configFile: false, logLevel: 'error',
    server: { host: '127.0.0.1', port: 0, open: false } });
let browser;
const pass = (message) => console.log(`[PASS] ${message}`);

/** Entry names from a ZIP's central directory. */
function zipNames(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let eocd = bytes.length - 22;
    while (eocd >= 0 && view.getUint32(eocd, true) !== 0x06054b50) eocd--;
    const count = view.getUint16(eocd + 10, true);
    let offset = view.getUint32(eocd + 16, true);
    const names = [];
    for (let i = 0; i < count; i++) {
        const nameLength = view.getUint16(offset + 28, true);
        const extra = view.getUint16(offset + 30, true);
        const comment = view.getUint16(offset + 32, true);
        names.push(new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength)));
        offset += 46 + nameLength + extra + comment;
    }
    return names;
}

try {
    await server.listen();
    const base = `http://127.0.0.1:${server.httpServer.address().port}`;
    browser = await chromium.launch({
        headless: true,
        args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader']
    });
    const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 900 } });
    // The dashboard intro tour opens on a first visit; it has its own suite (dashboardTourBrowser.mjs)
    await context.addInitScript(() => localStorage.setItem('pc_intro_tour_seen_v2', '1'));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));

    const dials = page.locator('.stacked-mold-dials');
    const section = (name) => dials.locator('.dialkit-folder-section')
        .filter({ has: page.locator(':scope > .dialkit-folder-header', { hasText: name }) });
    const state = (path) => page.evaluate(async (statePath) => {
        const { stackedMoldState } = await import('/scripts/stackedMold/state/stackedMoldState.js');
        return stackedMoldState.getState(statePath);
    }, path);
    const summary = () => page.evaluate(() => window.__stackedMold?.mold?.summary || null);
    const unitSignature = () => page.evaluate(() => (window.__stackedMold?.mold?.result.units || [])
        .map(u => u.kind === 'ring' ? `ring${u.release === 'up' ? '↑' : '↓'}` : u.kind).join(' '));

    // --- Empty start: start card, panels, nothing generated
    await page.goto(`${base}/stacked-mold-generator/index.html`);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await dials.locator('.dialkit-folder-section').first().waitFor();
    await page.waitForFunction(() => window.__stackedMold);
    assert.equal(await page.locator('#emptyState').isVisible(), true, 'start card on an empty project');
    assert.match(await page.locator('#sourceName').textContent(), /No source chosen/);
    for (const name of ['Kit', 'Mold', 'Slicing', 'Printed Parts']) assert.equal(await section(name).count(), 1, `${name} panel`);
    for (const label of ['Shrinkage', 'Plaster Margin', 'Footer Thickness', 'Foot Seam', 'Well Height', 'Ledge Width']) {
        assert.equal(await section('Mold').getByRole('slider', { name: label, exact: true }).count(), 1, label);
    }
    assert.equal(await summary(), null, 'nothing generated before a source');
    assert.equal(await page.locator('.dk-view-dock .st-viewcube').count(), 1, 'view dock cube');
    pass('start card, DialKit panels, view dock; no mold before a source');

    // --- Sample source through the picker
    await page.locator('#emptyChooseBtn').click();
    await page.locator('#sourceModal').waitFor({ state: 'visible' });
    await page.locator('[data-sample="belly-jar"]').click();
    await page.waitForFunction(() => window.__stackedMold?.mold?.result.units.length === 4);
    assert.equal(await page.locator('#emptyState').isVisible(), false, 'start card hidden once a source is chosen');
    assert.equal(await unitSignature(), 'footer ring↓ ring↑ well');
    assert.equal((await summary()).diameter, 200, 'standard Ø200 kit (the jar alone needs Ø190)');
    assert.equal(await page.locator('#unitList .sm-unit').count(), 4, 'unit list');
    assert.match(await page.locator('#sourceName').textContent(), /Belly jar/);
    assert.equal(await page.locator('#btnChooseSource').textContent(), 'Change…');
    assert.equal(await page.locator('#profileCard').isVisible(), true, 'profile schematic');
    pass('sample source: belly jar → footer, ring↓, ring↑, well · standard Ø200');

    // --- A dial drives regeneration: wider plaster margin → wider cylinder
    const margin = section('Mold').getByRole('slider', { name: 'Plaster Margin', exact: true });
    await margin.focus();
    for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => window.__stackedMold?.mold?.summary.diameter > 200);
    assert.ok(await state('params.mold.plasterMin') > 25, 'plaster margin raised');
    pass(`Plaster Margin dial regenerates the mold (Ø${(await summary()).diameter})`);
    await page.evaluate(async () => {
        const { stackedMoldState } = await import('/scripts/stackedMold/state/stackedMoldState.js');
        stackedMoldState.setState('params.mold.plasterMin', 25);
    });

    // --- User test forms (STL)
    await page.locator('#btnChooseSource').click();
    await page.locator('#sourceModal').waitFor({ state: 'visible' });
    await page.locator('#fileInput').setInputFiles('test-files/stacked-mold/Untitled_Vessel_V2.stl');
    await page.waitForFunction(() => window.__stackedMold?.mold?.result.units.some(u => u.kind === 'split'), null, { timeout: 60000 });
    assert.equal(await unitSignature(), 'footer ring↓ split well');
    assert.equal((await summary()).diameter, 200);
    assert.equal(await page.evaluate(() => window.__stackedMold.mold.result.f), 10.5, 'seam lifted above the 10 mm foot recess');
    pass('Untitled_Vessel_V2.stl → footer, ring↓, split, well · Ø200');

    await page.locator('#btnChooseSource').click();
    await page.locator('#fileInput').setInputFiles('test-files/stacked-mold/Braz_3_mug.stl');
    await page.waitForFunction(() => window.__stackedMold?.mold?.result.units.length === 3
        && !window.__stackedMold.mold.result.units.some(u => u.kind === 'split'), null, { timeout: 60000 });
    assert.equal(await unitSignature(), 'footer ring↓ well');
    assert.equal((await summary()).diameter, 175, 'standard Ø175 kit');
    assert.match(await page.locator('#projectName').textContent(), /Braz_3_mug/, 'project named after its source');
    pass('Braz_3_mug.stl → footer, one ring↓, well · Ø175 kit');

    // --- Viewing never moves the mold's own geometry (the lid once drifted up on every rebuild)
    const lidY = () => page.evaluate(() => {
        const lid = window.__stackedMold.mold.parts.kit.parts.find(p => p.role === 'lid');
        return [lid.solid.positions[1], lid.solid.positions[4], lid.solid.positions[7]];
    });
    const before = await lidY();
    await page.evaluate(() => {
        const s = window.__stackedMold.state;
        s.setState('view.mode', 'unit');
        s.setState('view.unit', 'U2');
        for (let i = 0; i <= 10; i++) s.setState('view.explode', i / 10);
    });
    await page.waitForTimeout(300);
    assert.deepEqual(await lidY(), before, 'kit geometry unchanged by the exploded view');
    const lidMesh = await page.evaluate(() => {
        const v = window.__stackedMold.viewport;
        v.setView({ explode: 0 });
        const box = { min: Infinity, max: -Infinity };
        v.root.traverse(o => {
            if (!o.isMesh || !o.geometry?.index || o.geometry.index.count !== window.__stackedMold.mold.parts.kit.parts.find(p => p.role === 'lid').solid.indices.length) return;
            o.geometry.computeBoundingBox();
            box.min = Math.min(box.min, o.geometry.boundingBox.min.y + o.parent.position.y);
            box.max = Math.max(box.max, o.geometry.boundingBox.max.y + o.parent.position.y);
        });
        return box;
    });
    const h = await page.evaluate(() => window.__stackedMold.mold.result.units.find(u => u.id === 'U2').h);
    assert.ok(Math.abs(lidMesh.min - h) < 0.01, `drop-in lid rests on the core top at ${h} mm (got ${lidMesh.min})`);
    pass('exploded view leaves the mold geometry untouched; the lid sits on the core top');

    // --- Unit selection and view modes
    await page.locator('#unitList [data-unit="U2"]').click();
    assert.equal(await state('view.unit'), 'U2');
    assert.equal(await state('view.mode'), 'unit', 'picking a unit from the list opens the unit view');
    assert.equal(await page.locator('#unitCaption').isVisible(), true);
    assert.match(await page.locator('#unitCaption').textContent(), /U2 Ring/);
    const dock = viewDock(page);
    await dock.open();
    await dock.choose('Show', 'print');
    assert.equal(await state('view.mode'), 'print');
    await dock.choose('Unit', 'U3');
    assert.equal(await state('view.unit'), 'U3');
    assert.match(await page.locator('#unitCaption').textContent(), /U3 Well collar/);
    await dock.choose('Show', 'kit');
    assert.match(await page.locator('#unitCaption').textContent(), /Universal kit Kit_D175_H160/);
    await dock.choose('Show', 'stack');
    await dock.close();
    pass('unit list + view dock: unit / print / kit / stack views');

    // --- Export: file list, ZIP with every part and a README
    await page.locator('#btnFileMenu').click();
    await page.locator('#exportBtn').click();
    await page.locator('#exportModal').waitFor({ state: 'visible' });
    const listed = await page.locator('#exportFiles input[type="checkbox"]').evaluateAll(inputs => inputs.map(i => i.value));
    const kitParts = ['bedplate', 'lid', 'sleeve', 'plugbump', 'plugpocket', 'puck'];
    for (const part of kitParts) assert.ok(listed.includes(`Kit_D175_H160/Kit_D175_H160_${part}.stl`), `export lists kit ${part}`);
    const wareParts = ['U1_footer_footbase', 'U2_ring_core', 'U3_well_slittube', 'U3_well_locator'];
    for (const part of wareParts) assert.ok(listed.some(name => /^[\w-]+\//.test(name) && name.endsWith(`_${part}.stl`)), `export lists ware ${part}`);
    assert.equal(listed.length, kitParts.length + wareParts.length, 'one file per kit part and ware part');
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#exportZip').click()]);
    assert.match(download.suggestedFilename(), /_StackedMold\.zip$/);
    const names = zipNames(new Uint8Array(await readFile(await download.path())));
    assert.deepEqual(names.filter(n => n.endsWith('.stl')).sort(), [...listed].sort(), 'ZIP holds every listed part');
    assert.ok(names.includes('README.txt'), 'README in the ZIP');
    pass(`export: ${listed.length} STL files (kit + ware folders) + README in ${download.suggestedFilename()}`);
    // The kit is remembered as printed: unticked on the next export
    await page.locator('#btnFileMenu').click();
    await page.locator('#exportBtn').click();
    await page.locator('#exportModal').waitFor({ state: 'visible' });
    const kitTicked = await page.locator('#exportFiles input[value^="Kit_"]').evaluateAll(inputs => inputs.filter(i => i.checked).length);
    assert.equal(kitTicked, 0, 'kit parts unticked once the kit has been exported');
    await page.keyboard.press('Escape');
    pass('second export leaves the already-printed kit unticked');

    // --- Save, find it on the dashboard, reopen
    await page.locator('#btnFileMenu').click();
    await page.locator('#saveBtn').click();
    await page.locator('#saveProjectName').fill('Braz test mold');
    await page.locator('#saveConfirm').click();
    await page.waitForFunction(() => document.getElementById('saveModal').hidden);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('playground_ceramics_stacked_mold_projects')));
    assert.equal(saved.length, 1);
    assert.equal(saved[0].appType, 'stackedmold');
    await page.goto(`${base}/dashboard.html`);
    const card = page.locator('.project-card').filter({ hasText: 'Braz test mold' });
    await card.waitFor();
    await card.click();
    await page.waitForURL(/stacked-mold-generator\/index\.html\?project=/);
    await page.waitForFunction(() => window.__stackedMold?.mold?.result.units.length === 3, null, { timeout: 60000 });
    assert.equal(await page.locator('#projectName').textContent(), 'Braz test mold');
    pass('saved project appears on the dashboard and reopens');

    // --- Light interface
    await page.evaluate(() => document.documentElement.setAttribute('data-mode', 'light'));
    await page.waitForTimeout(200);
    assert.equal(await page.locator('.stacked-mold-dials').getAttribute('data-theme'), 'light', 'dials follow the light mode');
    pass('light mode');

    assert.deepEqual(errors, [], 'no page errors');
    console.log('\nStacked mold browser workflow: all checks passed.');
} catch (error) {
    console.error(error);
    process.exitCode = 1;
} finally {
    await browser?.close();
    await server.close();
}
