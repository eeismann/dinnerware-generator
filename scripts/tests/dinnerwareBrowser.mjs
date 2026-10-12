// Real-browser regression for the Dinnerware Designer: interactive previews,
// hidden-item deferral, shadow reuse, worker STL export and interface
// behaviours. Starts its own Vite server and a software-WebGL Chromium.
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { viewDock } from './viewDockHelpers.mjs';

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
    // Sections animate open/closed; let the layout settle before measuring
    const settle = () => page.waitForTimeout(400);
    const openSection = async (name) => {
        const scope = section(name);
        if (await scope.getAttribute('data-open') !== 'true') {
            await scope.locator(':scope > .dialkit-folder-header').click();
            await settle();
        }
        return scope;
    };
    const closeSection = async (name) => {
        const scope = section(name);
        if (await scope.getAttribute('data-open') === 'true') {
            await scope.locator(':scope > .dialkit-folder-header').click();
            await settle();
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
    await depth.scrollIntoViewIfNeeded();
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

    // --- View dock: the cube snaps the camera; the expanded panel holds view
    // and item controls plus the global light/dark toggle
    const dock = viewDock(page);
    assert.equal(await page.locator('.dk-dials .dialkit-folder-section', { hasText: /^View/ }).count(), 0, 'no View panel in the dials');
    await dock.face('Top');
    await page.waitForFunction(async () => {
        const vp = (await import('/scripts/ui/viewport.js')).getViewport();
        const offset = vp.camera.position.clone().sub(vp.controls.target).normalize();
        return offset.y > 0.99;
    });
    // From the top the Front face is edge-on; the reset button restores the default view first
    await dock.dock.locator('.dk-view-reset').click();
    await dock.face('Front');
    await page.waitForFunction(async () => {
        const vp = (await import('/scripts/ui/viewport.js')).getViewport();
        const offset = vp.camera.position.clone().sub(vp.controls.target).normalize();
        return offset.z > 0.9;
    });
    await dock.open();
    const viewer = () => page.evaluate(async () => {
        const vp = (await import('/scripts/ui/viewport.js')).getViewport();
        return {
            background: '#' + vp.scene.background.getHexString(),
            axes: vp.scene.getObjectByName('dk-axis-lines')?.visible,
            lineArt: Boolean(vp.lineStyle)
        };
    });
    await dock.setToggle('Interface', true);
    assert.equal(await page.evaluate(() => document.documentElement.dataset.mode), 'light');
    await dock.setToggle('Interface', false);
    await dock.setToggle('Background', true);
    assert.equal(await page.evaluate(() => document.documentElement.dataset.mode), 'dark', 'interface stays dark');
    assert.equal((await viewer()).background, '#f5f5f5', 'light background with a dark interface');
    assert.equal((await viewer()).axes, true, 'axis lines on by default');
    await dock.setToggle('Axes', false);
    assert.equal((await viewer()).axes, false);
    await dock.setToggle('Axes', true);
    await dock.setToggle('Line Art', true);
    assert.deepEqual(await viewer(), { background: '#ffffff', axes: true, lineArt: true }, 'black ink on white paper');
    await dock.setToggle('Background', false);
    assert.equal((await viewer()).background, '#141414', 'white ink on black paper');
    await dock.setToggle('Line Art', false);
    assert.deepEqual(await viewer(), { background: '#1e1e1e', axes: true, lineArt: false });
    pass('View dock: cube snaps and resets; interface and background modes are independent; axes and line art toggle');

    // --- Hidden items are rebuilt only when shown
    await dock.openGroup('Items');
    await dock.setToggle('Mug', false);
    await nextFrames();
    const hiddenBefore = await meshInfo('mug');
    const style = await openSection('Set Style');
    await typeValue(style, 'Wall Thickness', 3.5);
    assert.equal((await meshInfo('mug')).uuid, hiddenBefore.uuid, 'hidden mug not rebuilt');
    assert.notEqual((await meshInfo('plate')).uuid, full.uuid, 'visible plate rebuilt');
    await dock.setToggle('Mug', true);
    await nextFrames();
    const shown = await meshInfo('mug');
    assert.notEqual(shown.uuid, hiddenBefore.uuid, 'mug rebuilt when shown');
    assert.equal(shown.visible, true);
    pass('Hidden items defer rebuilding until shown');

    // File menu in the header holds New / Load / Save / Export
    const openExport = async () => {
        await page.locator('#btnFileMenu').click();
        await page.locator('#fileMenuList [role="menuitem"]', { hasText: 'Export STL' }).click();
    };

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
    await openExport();
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
    await openExport();
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
    await openExport();
    await page.keyboard.press('Escape');
    await page.locator('#exportModal').waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'btnFileMenu', 'focus returns to the File menu');
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
    await angleSlider.scrollIntoViewIfNeeded();
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
    assert.ok(await page.evaluate(async () => (await import('/scripts/ui/viewport.js')).getViewport().warnedItems.has('tumbler')),
        'thin override tints the tumbler');
    await overrides.getByText(/^↺ Wall Thickness → 3.5mm$/).click();
    await nextFrames();
    assert.deepEqual(await state('itemOverrides.tumbler'), {});
    assert.equal(await overrides.getByRole('slider', { name: 'Wall Thickness', exact: true }).getAttribute('aria-valuenow'), '3.5');
    await closeSection('Per-Item Overrides');
    pass('Overrides mark their control, fall back to the global value on revert');

    // --- Stacked layout rests the mug on the saucer
    await closeSection('Set Style');
    await dock.choose('Layout', 'stack');
    const stack = await page.evaluate(async () => {
        const { getViewport } = await import('/scripts/ui/viewport.js');
        const vp = getViewport();
        return { mug: vp.meshes.get('mug').position.toArray(), saucer: vp.meshes.get('saucer').position.toArray() };
    });
    assert.ok(stack.mug[1] > 1 && stack.mug[0] === stack.saucer[0]);
    assert.equal(await state('ui.layoutMode'), 'stack');
    pass('Stacked layout nests pieces');

    // --- Every dial has an accessible name
    const unlabelled = await page.evaluate(() => [...document.querySelectorAll('.dinnerware-dials [role="slider"]')]
        .filter(el => !el.getAttribute('aria-label')).length);
    assert.equal(unlabelled, 0, 'every slider has an accessible name');
    pass('Every slider is labelled');

    // --- Header: no footer; the parameters icon hides and shows the card
    assert.equal(await page.locator('footer.footer').count(), 0, 'footer removed');
    const panelToggle = page.locator('#btnTogglePanel');
    const panelBox = await page.locator('#parameterPanel').boundingBox();
    assert.ok(panelBox.x > 1440 / 2, 'parameters sit on the right');
    await panelToggle.click();
    assert.equal(await panelToggle.getAttribute('aria-pressed'), 'false');
    await page.locator('#parameterPanel').waitFor({ state: 'hidden' });
    await page.reload();
    await page.waitForFunction(async () => (await import('/scripts/ui/viewport.js')).getViewport()?.meshes.size === 7);
    assert.equal(await page.locator('#parameterPanel').isVisible(), false, 'hidden state is remembered');
    await panelToggle.click();
    await page.locator('#parameterPanel').waitFor({ state: 'visible' });
    pass('Parameters live on the right and the header icon hides/shows them');

    assert.deepEqual(errors, [], 'No application runtime errors');

    // --- Dashboard: DialKit toolbar, settings menu, cards and dialogs
    const dash = await context.newPage();
    const dashErrors = [];
    dash.on('pageerror', error => dashErrors.push(error.message));
    dash.on('dialog', dialog => dialog.dismiss());
    await dash.goto(`${base}/dashboard.html`);
    const plates = dash.locator('.project-card:not(.new-project)');
    await plates.first().waitFor();
    assert.equal(await dash.locator('.dashboard-footer').count(), 0, 'no dashboard footer');
    assert.equal(await dash.locator('.dk-bar #btnNewProject.dk-btn-primary').count(), 1);
    await plates.first().hover();
    assert.deepEqual(await plates.first().locator('.card-action-btn').evaluateAll(buttons => buttons.map(b => b.dataset.action)),
        ['open', 'duplicate', 'castform', 'delete']);
    await dash.locator('#btnSettings').click();
    assert.equal(await dash.locator('#btnSettings').getAttribute('aria-expanded'), 'true');
    await dash.locator('.zoom-option[data-zoom="large"]').click();
    assert.equal(await dash.locator('#projectsGrid').getAttribute('data-zoom'), 'large');
    await dash.locator('#btnModeToggle').click();
    assert.equal(await dash.evaluate(() => document.documentElement.dataset.mode), 'light');
    await dash.locator('#btnModeToggle').click();
    await dash.keyboard.press('Escape');
    assert.equal(await dash.locator('#btnSettings').getAttribute('aria-expanded'), 'false');
    await dash.locator('#btnNewProject').click();
    assert.equal(await dash.locator('#appSelectModal .app-select-card').count(), 6);
    await dash.locator('#btnCloseAppSelect').click();
    await dash.locator('.search-input').fill('zzz-no-match');
    await dash.waitForFunction(() => document.querySelectorAll('.project-card:not(.new-project)').length === 0);
    await dash.locator('.search-input').fill('');
    assert.deepEqual(dashErrors, [], 'Dashboard runtime errors');
    await dash.close();
    pass('Dashboard: DialKit toolbar, settings menu (theme, thumbnails), card actions, new-project dialog, search');

    // --- Every other generator boots into the same DialKit frame, even when
    // an old ?ui=line link is followed (details live in each app's own suite)
    const DIALKIT_APPS = [
        ['vessel-generator', ['#btnExportSTL']],
        ['vessel-v2-generator', ['#btnExportSTL']],
        ['vessel-v3-generator', ['#btnExportSTL', '#btnExportLidSTL']],
        ['handle-generator', ['#btnExportSTL', '#btnExportMoldKit']],
        ['cast-form-generator', ['#exportBtn']]
    ];
    for (const [dir, exports] of DIALKIT_APPS) {
        const app = await context.newPage();
        const appErrors = [];
        app.on('pageerror', error => appErrors.push(error.message));
        await app.goto(`${base}/${dir}/index.html?ui=line`);
        // Handle asks for a mug on first open; take the default one
        const defaultMug = app.getByRole('button', { name: 'Use Default Mug' });
        if (await defaultMug.first().isVisible({ timeout: 3000 }).catch(() => false)) await defaultMug.first().click();
        // Several panels render as sections; a lone panel is the root itself
        await app.locator('.dk-dials .dialkit-folder-root').first().waitFor({ timeout: 30000 });
        assert.equal(await app.locator('.dk-header').count(), 1, `${dir}: DialKit header`);
        assert.equal(await app.locator('.ln-root, footer').count(), 0, `${dir}: no Line frame or footer`);
        for (const selector of exports) {
            assert.equal(await app.locator(`.dk-menu ${selector}`).count(), 1, `${dir}: ${selector} in the File menu`);
        }
        assert.equal(await app.locator('.dk-panel-toggle').count(), 1, `${dir}: parameters toggle`);
        // The cube's own box can be edge-on (zero area) in an end-on view; wait for its card
        await app.locator('.dk-view-dock .dk-view-cube-card').waitFor({ timeout: 30000 });
        assert.equal(await app.locator('.dk-view-dock .st-viewcube').count(), 1, `${dir}: view cube`);
        assert.deepEqual(appErrors, [], `${dir}: runtime errors`);
        await app.close();
    }
    pass('Vessel, Vessel V2, Vessel V3, Handle and Cast Form boot into the DialKit frame with the view dock, without errors');
    await context.close();
} finally {
    await browser?.close();
    await server.close();
}
