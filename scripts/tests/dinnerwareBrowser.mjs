// Real-browser regression for the Dinnerware Designer: interactive previews,
// hidden-item deferral, shadow reuse, worker STL export and interface
// behaviours. Starts its own Vite server and a software-WebGL Chromium.
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';

const server = await createServer({ configFile: false, logLevel: 'error',
    server: { host: '127.0.0.1', port: 0, open: false } });
let browser;
const pass = (message) => console.log(`[PASS] ${message}`);

try {
    await server.listen();
    const base = `http://127.0.0.1:${server.httpServer.address().port}`;
    browser = await chromium.launch({
        headless: true,
        args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader']
    });
    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(async () => {
        const { getViewport } = await import('/scripts/ui/viewport.js');
        return getViewport()?.meshes.size === 7;
    });

    const meshInfo = (item) => page.evaluate(async (itemType) => {
        const { getViewport } = await import('/scripts/ui/viewport.js');
        const mesh = getViewport().meshes.get(itemType);
        return { uuid: mesh.geometry.uuid, vertices: mesh.geometry.getAttribute('position').count, visible: mesh.visible };
    }, item);
    const nextFrames = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

    // --- Shadows are not redrawn on every orbit frame
    assert.equal(await page.evaluate(async () => {
        const { getViewport } = await import('/scripts/ui/viewport.js');
        return getViewport().renderer.shadowMap.autoUpdate;
    }), false);
    pass('Shadow map renders on demand');

    // DialKit helpers: panels render as sections; sliders are role=slider
    // with their label as the accessible name, and Enter opens number entry.
    const dials = page.locator('.dinnerware-dials');
    const section = (name) => dials.locator('.dialkit-folder-section')
        .filter({ has: page.locator(':scope > .dialkit-folder-header', { hasText: name }) });
    const openSection = async (name) => {
        const scope = section(name);
        if (await scope.getAttribute('data-open') !== 'true') {
            await scope.locator(':scope > .dialkit-folder-header').click();
        }
        return scope;
    };
    const closeSection = async (name) => {
        const scope = section(name);
        if (await scope.getAttribute('data-open') === 'true') {
            await scope.locator(':scope > .dialkit-folder-header').click();
        }
    };
    const typeValue = async (scope, name, value) => {
        await scope.getByRole('slider', { name, exact: true }).focus();
        await page.keyboard.press('Enter');
        const input = scope.getByRole('textbox', { name: `${name} value`, exact: true });
        await input.fill(String(value));
        await input.press('Enter');
        await nextFrames();
    };
    const choose = async (scope, label, option) => {
        await scope.locator('.dialkit-select-trigger').filter({ hasText: new RegExp(`^${label}`) }).first().click();
        await page.locator('.dialkit-select-option').filter({ hasText: new RegExp(`^${option}`) }).first().click();
        await nextFrames();
    };
    const state = (path) => page.evaluate(async (statePath) =>
        (await import('/scripts/state/projectState.js')).stateManager.getState(statePath), path);

    // --- Slider drags preview a lighter mesh; release restores full detail
    await closeSection('Set Style');
    const pattern = await openSection('Surface Pattern');
    await choose(pattern, 'Pattern', 'Knurling');
    await nextFrames();
    const full = await meshInfo('plate');
    const depth = pattern.getByRole('slider', { name: 'Depth', exact: true }).first();
    const depthBox = await depth.boundingBox();
    await page.mouse.move(depthBox.x + depthBox.width * 0.2, depthBox.y + depthBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(depthBox.x + depthBox.width * 0.45, depthBox.y + depthBox.height / 2, { steps: 4 });
    await nextFrames();
    const dragging = await meshInfo('plate');
    assert.ok(dragging.vertices < full.vertices * 0.75,
        `drag preview ${dragging.vertices} vs full ${full.vertices} vertices`);
    await page.mouse.up();
    await nextFrames();
    assert.equal((await meshInfo('plate')).vertices, full.vertices);
    pass(`Slider drag previews ${dragging.vertices} vertices, release rebuilds ${full.vertices}`);

    // --- Returning to earlier parameters reuses cached geometry
    await typeValue(pattern, 'Depth', 0.4);
    await nextFrames();
    assert.equal((await meshInfo('plate')).uuid, full.uuid, 'cached geometry reused');
    pass('Restoring earlier parameters reuses the cached mesh');
    await closeSection('Surface Pattern');

    // --- Hidden items are rebuilt only when shown
    const view = await openSection('View');
    const itemToggle = (label) => view.locator('.dialkit-labeled-control')
        .filter({ has: page.locator('.dialkit-labeled-control-label', { hasText: new RegExp(`^${label}$`) }) });
    await itemToggle('Mug').getByText('Off', { exact: true }).click();
    await nextFrames();
    const hiddenBefore = await meshInfo('mug');
    await closeSection('View');
    const style = await openSection('Set Style');
    await typeValue(style, 'Wall Thickness', 3.5);
    assert.equal((await meshInfo('mug')).uuid, hiddenBefore.uuid, 'hidden mug not rebuilt');
    assert.notEqual((await meshInfo('plate')).uuid, full.uuid, 'visible plate rebuilt');
    await openSection('View');
    await itemToggle('Mug').getByText('On', { exact: true }).click();
    await nextFrames();
    const shown = await meshInfo('mug');
    assert.notEqual(shown.uuid, hiddenBefore.uuid, 'mug rebuilt when shown');
    assert.equal(shown.visible, true);
    await closeSection('View');
    pass('Hidden items defer rebuilding until shown');

    // --- Export runs in a worker, stays responsive, and writes Z-up STLs
    await page.evaluate(() => {
        window.__workers = [];
        const NativeWorker = window.Worker;
        window.Worker = class extends NativeWorker {
            constructor(url, options) {
                super(url, options);
                window.__workers.push(String(url));
            }
        };
        window.__longTasks = [];
        new PerformanceObserver(list => window.__longTasks.push(...list.getEntries().map(e => e.duration)))
            .observe({ type: 'longtask', buffered: false });
    });
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.locator('#btnExportSTL').click();
    await page.locator('#btnExportDeselectAll').click();
    for (const item of ['plate', 'mug', 'tumbler']) {
        await page.locator(`#exportItemList input[data-item="${item}"]`).check();
    }
    assert.equal(await page.locator('#exportUpAxis').inputValue(), 'z');
    await page.locator('#exportAsZip').uncheck();
    const downloads = [];
    const onDownload = download => downloads.push(download);
    page.on('download', onDownload);
    await page.locator('#btnConfirmExport').click();
    await page.waitForFunction(() => document.getElementById('exportProgressText').textContent.startsWith('Export complete'),
        null, { timeout: 120000 });
    assert.equal(downloads.length, 3);
    const loader = new STLLoader();
    for (const download of downloads) {
        const chunks = [];
        for await (const chunk of await download.createReadStream()) chunks.push(chunk);
        const buffer = Buffer.concat(chunks);
        assert.ok(buffer.subarray(0, 80).toString('latin1').includes('[Z-up]'), 'Z-up header tag');
        const geometry = loader.parse(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
        geometry.computeBoundingBox();
        const { min, max } = geometry.boundingBox;
        assert.ok(Math.abs(min.z) < 1e-3, `${download.suggestedFilename()} rests on z=0`);
        assert.ok(max.z - min.z < max.x - min.x || download.suggestedFilename().includes('tumbler')
            || download.suggestedFilename().includes('mug'), 'plate is wider than tall in Z-up');
    }
    const workers = await page.evaluate(() => window.__workers);
    assert.ok(workers.some(url => url.includes('stlExportWorker')), `export worker used: ${workers}`);
    const longest = Math.max(0, ...await page.evaluate(() => window.__longTasks));
    assert.ok(longest < 400, `export blocked the main thread for ${longest}ms`);
    pass(`Worker export wrote 3 Z-up STLs; longest main-thread task ${Math.round(longest)}ms`);
    page.off('download', onDownload);
    await page.locator('#exportModal').waitFor({ state: 'hidden' });

    // --- Export dialog: measured sizes, inline errors, one-file ZIP, Escape
    await page.locator('#btnExportSTL').click();
    assert.equal(await page.locator('#exportModal .modal-content').getAttribute('role'), 'dialog');
    await page.waitForFunction(() => [...document.querySelectorAll('.export-item-size')].every(cell => cell.dataset.bytes));
    const sizeText = await page.locator('.export-item-size[data-size="plate"]').textContent();
    assert.match(sizeText, /(KB|MB) · \d+k tris/);
    await page.locator('#btnExportDeselectAll').click();
    await page.locator('#btnConfirmExport').click();
    assert.match(await page.locator('#exportError').textContent(), /Select at least one item/);
    for (const item of ['saucer', 'mug']) await page.locator(`#exportItemList input[data-item="${item}"]`).check();
    await page.locator('#exportAsZip').check();
    const zipPromise = page.waitForEvent('download');
    await page.locator('#btnConfirmExport').click();
    const zipDownload = await zipPromise;
    assert.match(zipDownload.suggestedFilename(), /_stl\.zip$/);
    const zipChunks = [];
    for await (const chunk of await zipDownload.createReadStream()) zipChunks.push(chunk);
    const zipBytes = Buffer.concat(zipChunks);
    assert.equal(zipBytes.readUInt32LE(0), 0x04034b50, 'ZIP local header');
    assert.equal(zipBytes.readUInt16LE(zipBytes.length - 22 + 10), 2, 'two STLs in the ZIP');
    await page.locator('#exportModal').waitFor({ state: 'hidden' });
    await page.locator('#btnExportSTL').click();
    await page.keyboard.press('Escape');
    await page.locator('#exportModal').waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'btnExportSTL', 'focus returns to the opener');
    pass('Export dialog measures sizes, reports errors inline, zips a set and closes on Escape');

    // --- Typed values, arrow keys and slider drags
    const globalAngle = () => state('globalParameters.wallAngle');
    await openSection('Set Style');
    await typeValue(style, 'Wall Angle', 20);
    assert.equal(await globalAngle(), 20);
    const angleSlider = style.getByRole('slider', { name: 'Wall Angle', exact: true });
    await angleSlider.focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await nextFrames();
    assert.equal(await globalAngle(), 22, 'arrow keys apply immediately and keep focus across rebuilds');
    await page.waitForTimeout(500);
    const angleBox = await angleSlider.boundingBox();
    await page.mouse.move(angleBox.x + angleBox.width * 0.5, angleBox.y + angleBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(angleBox.x + angleBox.width * 0.3, angleBox.y + angleBox.height / 2, { steps: 4 });
    await page.mouse.up();
    const draggedAngle = await globalAngle();
    assert.ok(draggedAngle < 22, `dragging left lowers the angle (${draggedAngle})`);
    pass('Dials take typed values, arrow keys and drags');

    // --- Undo / redo
    await page.locator('body').click({ position: { x: 700, y: 400 } });
    await page.waitForTimeout(500);
    await page.keyboard.press('ControlOrMeta+z');
    await nextFrames();
    assert.equal(await globalAngle(), 22, 'undo restores the value before the drag (one step)');
    await page.locator('#btnRedo').click();
    await nextFrames();
    assert.equal(await globalAngle(), draggedAngle);
    assert.equal(await angleSlider.getAttribute('aria-valuenow'), String(draggedAngle), 'dials follow undo/redo');
    pass('Undo/redo restore values and dials');

    // --- Overrides: marked controls, inherited fallback and revert
    await closeSection('Set Style');
    const overrides = await openSection('Per-Item Overrides');
    await choose(overrides, 'Item', 'Tumbler');
    await typeValue(overrides, 'Wall Thickness', 1);
    assert.deepEqual(await state('itemOverrides.tumbler'), { wallThickness: 1 });
    assert.equal(await state('globalParameters.wallThickness'), 3.5, 'override leaves the global value');
    assert.equal(await overrides.getByRole('slider', { name: 'Wall Thickness ●', exact: true }).count(), 1,
        'overridden control is marked');
    assert.match(await overrides.locator('.dialkit-select-trigger').filter({ hasText: /^Item/ }).textContent(), /Tumbler \(1\)/);
    await page.locator('#btnWarningsMenu').click();
    assert.ok(await page.locator('.warning-item[data-item="tumbler"][data-param="wallThickness"]').count() > 0,
        'thin override is flagged');
    await page.locator('#statusInfo').click(); // closes the menu without selecting a piece
    await overrides.getByText(/^↺ Wall Thickness → 3.5mm$/).click();
    await nextFrames();
    assert.deepEqual(await state('itemOverrides.tumbler'), {});
    assert.equal(await overrides.getByRole('slider', { name: 'Wall Thickness', exact: true }).getAttribute('aria-valuenow'), '3.5');
    await closeSection('Per-Item Overrides');
    pass('Overrides mark their control, fall back to the global value on revert');

    // --- Presets
    await openSection('Set Style');
    await choose(style, 'Preset', 'Soft Bowl');
    assert.equal(await state('globalParameters.rimStyle'), 'rounded');
    await style.locator(':scope .dialkit-folder-header', { hasText: 'Presets' }).click();
    await style.getByRole('textbox', { name: 'New Preset Name' }).fill('My Bowl');
    await style.getByText('Save Style as Preset', { exact: true }).click();
    await nextFrames();
    assert.match(await style.locator('.dialkit-select-trigger').filter({ hasText: /^Preset/ }).textContent(), /Soft Bowl/);
    await typeValue(style, 'Wall Angle', 30);
    assert.match(await style.locator('.dialkit-select-trigger').filter({ hasText: /^Preset/ }).textContent(), /Custom/,
        'edited style reads as Custom');
    pass('Presets apply, save and show Custom after edits');

    // --- Profile panel drag edits a parameter
    await page.locator('#btnProfileView').click();
    await page.locator('.profile-item-select').selectOption('tumbler');
    const handle = page.locator('.profile-handle').first();
    const hb = await handle.boundingBox();
    const before = await globalAngle();
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(hb.x + hb.width / 2 - 30, hb.y + hb.height / 2, { steps: 5 });
    await page.mouse.up();
    await nextFrames();
    assert.ok(await globalAngle() < before, 'dragging the rim inward reduces the wall angle');
    await page.locator('.profile-mode-btn[data-mode="lineup"]').click();
    assert.equal(await page.locator('.lineup-item').count(), 7);
    pass('Profile handles edit parameters; lineup shows every visible item');

    // --- Stacked layout rests the mug on the saucer; compare shows ghosts
    await closeSection('Set Style');
    await choose(await openSection('View'), 'Layout', 'Stacked');
    const stack = await page.evaluate(async () => {
        const { getViewport } = await import('/scripts/ui/viewport.js');
        const vp = getViewport();
        return { mug: vp.meshes.get('mug').position.toArray(), saucer: vp.meshes.get('saucer').position.toArray() };
    });
    assert.ok(stack.mug[1] > 1 && stack.mug[0] === stack.saucer[0]);
    assert.equal(await state('ui.layoutMode'), 'stack');
    await page.locator('#btnCompare').click();
    assert.equal(await page.evaluate(async () => (await import('/scripts/ui/viewport.js')).getViewport().ghosts.size), 7);
    await page.locator('#btnCompare').click();
    assert.equal(await page.evaluate(async () => (await import('/scripts/ui/viewport.js')).getViewport().ghosts.size), 0);
    pass('Stacked layout nests pieces; Compare adds and removes ghosts');

    // --- Every dial has an accessible name
    const unlabelled = await page.evaluate(() => [...document.querySelectorAll('.dinnerware-dials [role="slider"]')]
        .filter(el => !el.getAttribute('aria-label')).length);
    assert.equal(unlabelled, 0, 'every slider has an accessible name');
    pass('Every slider is labelled');

    // --- Narrow screens get a parameter drawer
    await page.setViewportSize({ width: 800, height: 900 });
    const toggle = page.locator('#btnTogglePanel');
    assert.equal(await toggle.isVisible(), true);
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
    await page.setViewportSize({ width: 1440, height: 900 });
    pass('Narrow layouts open parameters as a drawer');

    assert.deepEqual(errors, [], 'No application runtime errors');

    // --- Line dashboard: plates, filter index, theme shared with the editor
    const dash = await context.newPage();
    const dashErrors = [];
    dash.on('pageerror', error => dashErrors.push(error.message));
    await dash.goto(`${base}/dashboard.html?ui=line`);
    await dash.waitForSelector('html.ln-dashboard-ready', { timeout: 30000 });
    assert.equal(await dash.locator('.dashboard-header').isVisible(), false);
    const plates = dash.locator('.project-card:not(.new-project)');
    assert.ok(await plates.count() > 0, 'saved projects appear as plates');
    assert.match(await plates.first().locator('.ln-plate-num').textContent(), /^01$/);
    assert.equal(await plates.first().locator('.ln-crop').count(), 4);
    assert.deepEqual(await plates.first().locator('.card-action-btn').allTextContents(), ['Open', 'Copy', 'Cast', 'Delete']);
    await dash.locator('.ln-tab', { hasText: 'Dinnerware' }).click();
    assert.equal(await dash.locator('.ln-tab[aria-current="page"]').textContent().then(t => t.startsWith('Dinnerware')), true);
    await dash.locator('[data-action="theme"]').click();
    assert.equal(await dash.evaluate(() => document.documentElement.dataset.lnTheme), 'negative');
    await dash.locator('[data-action="theme"]').click();
    await dash.locator('.ln-search').fill('zzz-no-match');
    await dash.waitForFunction(() => document.querySelectorAll('.project-card:not(.new-project)').length === 0);
    await dash.locator('.ln-search').fill('');
    assert.deepEqual(dashErrors, [], 'Line dashboard runtime errors');
    await dash.goto(`${base}/dashboard.html?ui=classic`);
    pass('Line dashboard: numbered plates with crop marks, filter index, search, shared Negative theme');

    // --- Every other generator mounts the same Line frame
    const LINE_APPS = [
        ['vessel-generator', 'Vessel', ['#btnExportSTL'], true],
        ['vessel-v2-generator', 'Vessel V2', ['#btnExportSTL'], false],
        ['vessel-v3-generator', 'Vessel V3', ['#btnExportSTL', '#btnExportLidSTL'], true],
        ['handle-generator', 'Handle', ['#btnExportSTL', '#btnExportMoldKit'], true],
        ['cast-form-generator', 'Cast Form', ['#exportBtn'], true]
    ];
    for (const [dir, title, exports, hasPanel] of LINE_APPS) {
        const app = await context.newPage();
        const appErrors = [];
        app.on('pageerror', error => appErrors.push(error.message));
        await app.goto(`${base}/${dir}/index.html?ui=line`);
        await app.waitForSelector('.ln-root.ln-ready', { timeout: 30000 });
        // Handle asks for a mug on first open; take the default one
        const defaultMug = app.getByRole('button', { name: 'Use Default Mug' });
        if (await defaultMug.isVisible().catch(() => false)) await defaultMug.click();
        assert.match(await app.locator('.ln-mark').textContent(), new RegExp(`${title}$`));
        for (const selector of exports) {
            assert.equal(await app.locator(`.ln-actions ${selector}`).count(), 1, `${dir}: ${selector} in the bar`);
        }
        assert.ok(await app.locator('.ln-stage .ln-crop').count() >= 4, `${dir}: framed stage`);
        assert.equal(await app.locator('.ln-root > header:not(.ln-bar)').isVisible().catch(() => false), false, `${dir}: classic header hidden`);
        assert.equal(await app.locator('.ln-panel').count() > 0, hasPanel, `${dir}: parameter column`);
        assert.equal(await app.locator('#btnSaveProject, #saveBtn').count(), 1);
        await app.locator('[data-action="theme"]').click();
        assert.equal(await app.evaluate(() => document.documentElement.dataset.lnTheme), 'negative');
        await app.locator('[data-action="theme"]').click();
        assert.deepEqual(appErrors, [], `${dir}: runtime errors`);
        await app.close();
    }
    pass('Vessel, Vessel V2, Vessel V3, Handle and Cast Form mount the Line frame without errors');
    await context.close();
} finally {
    await browser?.close();
    await server.close();
}
