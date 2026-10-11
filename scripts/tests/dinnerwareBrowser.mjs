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
    await page.goto(`${base}/index.html?ui=classic`);
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

    // --- Slider drags preview a lighter mesh; release restores full detail
    await page.getByRole('heading', { name: 'Surface Pattern', exact: true }).click();
    await page.locator('#surfacePatternControls [data-param="wallPatternType"] select').selectOption('knurl');
    await nextFrames();
    const full = await meshInfo('plate');
    const depth = page.locator('#surfacePatternControls [data-param="wallPatternDepth"] input[type="range"]');
    await depth.evaluate(input => {
        input.value = '0.8';
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await nextFrames();
    const dragging = await meshInfo('plate');
    assert.ok(dragging.vertices < full.vertices * 0.75,
        `drag preview ${dragging.vertices} vs full ${full.vertices} vertices`);
    await depth.evaluate(input => input.dispatchEvent(new Event('change', { bubbles: true })));
    await nextFrames();
    assert.equal((await meshInfo('plate')).vertices, full.vertices);
    pass(`Slider drag previews ${dragging.vertices} vertices, release rebuilds ${full.vertices}`);

    // --- Returning to earlier parameters reuses cached geometry
    await depth.evaluate(input => {
        input.value = '0.4';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await nextFrames();
    assert.equal((await meshInfo('plate')).uuid, full.uuid, 'cached geometry reused');
    pass('Restoring earlier parameters reuses the cached mesh');

    // --- Hidden items are rebuilt only when shown
    await page.locator('#btnItemsMenu').click();
    await page.locator('.items-menu-item input[data-item="mug"]').uncheck();
    const hiddenBefore = await meshInfo('mug');
    const thickness = page.locator('[data-section="global-style"] [data-param="wallThickness"] .numeric-input input');
    await page.getByRole('heading', { name: 'Global Style', exact: true }).click();
    await thickness.fill('3.5');
    await thickness.blur();
    await nextFrames();
    assert.equal((await meshInfo('mug')).uuid, hiddenBefore.uuid, 'hidden mug not rebuilt');
    assert.notEqual((await meshInfo('plate')).uuid, full.uuid, 'visible plate rebuilt');
    await page.locator('#btnItemsMenu').click();
    await page.locator('.items-menu-item input[data-item="mug"]').check();
    await nextFrames();
    const shown = await meshInfo('mug');
    assert.notEqual(shown.uuid, hiddenBefore.uuid, 'mug rebuilt when shown');
    assert.equal(shown.visible, true);
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

    // --- Typed arithmetic, arrow keys and label scrubbing
    const angleNumber = page.locator('[data-section="global-style"] [data-param="wallAngle"] .numeric-input input');
    await angleNumber.fill('10');
    await angleNumber.pressSequentially('+5*2');
    assert.equal(await angleNumber.inputValue(), '10+5*2');
    await angleNumber.press('Enter');
    await nextFrames();
    const globalAngle = () => page.evaluate(async () => (await import('/scripts/state/projectState.js')).stateManager.getState('globalParameters.wallAngle'));
    assert.equal(await globalAngle(), 20);
    await angleNumber.press('ArrowUp');
    assert.equal(await globalAngle(), 21, 'arrow key applies immediately');
    await angleNumber.press('Shift+ArrowDown');
    assert.equal(await globalAngle(), 11);
    await angleNumber.blur();
    assert.equal(await angleNumber.getAttribute('type'), 'number');
    const angleLabel = page.locator('[data-section="global-style"] [data-param="wallAngle"] > label');
    const box = await angleLabel.boundingBox();
    await page.mouse.move(box.x + 10, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 30, box.y + box.height / 2, { steps: 4 });
    await page.mouse.up();
    assert.equal(await globalAngle(), 16, 'dragging the label 20px scrubs 5 steps');
    pass('Number fields take arithmetic, arrow keys and label scrubbing');

    // --- Undo / redo
    await page.locator('body').click({ position: { x: 700, y: 400 } });
    await page.waitForTimeout(500);
    await page.keyboard.press('ControlOrMeta+z');
    await nextFrames();
    assert.equal(await globalAngle(), 11, 'undo restores the value before the scrub');
    await page.locator('#btnRedo').click();
    assert.equal(await globalAngle(), 16);
    assert.equal(await angleNumber.inputValue(), '16', 'controls follow undo/redo');
    pass('Undo/redo restore values and controls');

    // --- Override visibility, inline warnings and revert
    await page.evaluate(async () => {
        const { stateManager } = await import('/scripts/state/projectState.js');
        document.getElementById('overrideItemSelect').value = 'tumbler';
        document.getElementById('overrideItemSelect').dispatchEvent(new Event('change'));
    });
    await page.getByRole('heading', { name: 'Per-Item Overrides', exact: true }).click();
    const overrideThickness = page.locator('#overrideControls [data-param="wallThickness"] .numeric-input input');
    await overrideThickness.fill('1');
    await overrideThickness.press('Enter');
    await nextFrames();
    const badge = page.locator('[data-section="global-style"] [data-param="wallThickness"] .override-badge');
    assert.equal(await badge.textContent(), 'Tumbler differs');
    assert.equal(await page.locator('.items-menu-item input[data-item="tumbler"] ~ .override-dot').count(), 1);
    assert.match(await page.locator('#overrideControls [data-param="wallThickness"] .inherited-hint').textContent(), /Global: 3.5mm/);
    const overrideNote = page.locator('#overrideControls [data-param="wallThickness"] .param-warning');
    assert.match(await overrideNote.textContent(), /Tumbler:.*Wall thickness \(1mm\) below/);
    assert.equal(await page.locator('[data-section="global-style"] [data-param="wallThickness"] .param-warning').count(), 0,
        'the global row only lists items that follow it');
    await page.locator('#overrideControls [data-param="wallThickness"] .revert-chip').click();
    await nextFrames();
    assert.equal(await badge.count(), 0, 'badge clears once no item differs');
    pass('Overrides show badges, dots, inherited values, inline warnings and revert');

    // --- Presets
    await page.locator('#stylePresetSelect').selectOption('soft-bowl');
    await nextFrames();
    assert.equal(await page.evaluate(async () => (await import('/scripts/state/projectState.js')).stateManager.getState('globalParameters.rimStyle')), 'rounded');
    await page.locator('#btnSavePreset').click();
    await page.locator('.preset-save input').fill('My Bowl');
    await page.locator('.preset-save button[type="submit"]').click();
    assert.equal(await page.locator('#stylePresetSelect option:checked').textContent(), 'Soft Bowl');
    await angleNumber.fill('30');
    await angleNumber.press('Enter');
    await nextFrames();
    assert.equal(await page.locator('#stylePresetSelect').inputValue(), '', 'edited style reads as Custom');
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
    await page.locator('#btnViewMenu').click();
    await page.locator('#btnLayoutStack').click();
    const stack = await page.evaluate(async () => {
        const { getViewport } = await import('/scripts/ui/viewport.js');
        const vp = getViewport();
        return { mug: vp.meshes.get('mug').position.toArray(), saucer: vp.meshes.get('saucer').position.toArray() };
    });
    assert.ok(stack.mug[1] > 1 && stack.mug[0] === stack.saucer[0]);
    await page.locator('#btnCompare').click();
    assert.equal(await page.evaluate(async () => (await import('/scripts/ui/viewport.js')).getViewport().ghosts.size), 7);
    await page.locator('#btnCompare').click();
    assert.equal(await page.evaluate(async () => (await import('/scripts/ui/viewport.js')).getViewport().ghosts.size), 0);
    pass('Stacked layout nests pieces; Compare adds and removes ghosts');

    // --- Keyboard-operable section headers and labelled controls
    const header = page.locator('[data-section="item-proportions"] .section-header');
    assert.equal(await header.getAttribute('role'), 'button');
    assert.equal(await header.getAttribute('aria-expanded'), 'false');
    await header.focus();
    await page.keyboard.press('Enter');
    assert.equal(await header.getAttribute('aria-expanded'), 'true');
    const unlabelled = await page.evaluate(() => [...document.querySelectorAll('#parameterPanel .parameter-row input:not([type="checkbox"]), #parameterPanel .parameter-row select')]
        .filter(el => !el.getAttribute('aria-labelledby') && !el.getAttribute('aria-label')).length);
    assert.equal(unlabelled, 0, 'every parameter control has an accessible name');
    pass('Section headers work from the keyboard; every control is labelled');

    // --- Narrow screens get a parameter drawer
    await page.setViewportSize({ width: 800, height: 900 });
    const toggle = page.locator('#btnTogglePanel');
    assert.equal(await toggle.isVisible(), true);
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
    await page.setViewportSize({ width: 1440, height: 900 });
    pass('Narrow layouts open parameters as a drawer');

    assert.deepEqual(errors, [], 'No application runtime errors');

    // --- Studio Shell still boots on top of the classic controls
    const studio = await context.newPage();
    const studioErrors = [];
    studio.on('pageerror', error => studioErrors.push(error.message));
    await studio.goto(`${base}/index.html?ui=studio`);
    await studio.waitForSelector('.st-isl', { timeout: 30000 });
    await studio.waitForTimeout(1000);
    assert.deepEqual(studioErrors, [], 'Studio mode runtime errors');
    pass('Studio Shell boots without errors');

    // --- Line draft: one-ink shell over the same live controls
    const line = await context.newPage();
    const lineErrors = [];
    line.on('pageerror', error => lineErrors.push(error.message));
    await line.goto(`${base}/index.html?ui=line`);
    await line.waitForSelector('.ln-root.ln-ready', { timeout: 30000 });
    const viewport = (fn) => line.evaluate(async (source) => {
        const vp = (await import('/scripts/ui/viewport.js')).getViewport();
        return new Function('vp', `return (${source})(vp)`)(vp);
    }, fn.toString());
    const openViewMenu = async () => {
        if (!(await line.locator('.view-menu-container.open').count())) await line.locator('#btnViewMenu').click();
    };

    // Bar: the app's mark, project controls, no piece tabs or display toggles
    assert.equal((await line.locator('.ln-mark-text').textContent()).trim(), 'Dinnerware');
    assert.equal(await line.locator('.ln-mark .pc-app-icon').count(), 0, 'no app icon in the mark');
    await line.locator('.ln-app-switcher .ln-mark').click();
    assert.deepEqual(await line.locator('.ln-app-switcher .ln-menu-item').allTextContents(),
        ['Dashboard', 'Dinnerware', 'Vessel', 'Vessel V2', 'Vessel V3', 'Handle', 'Cast Form']);
    assert.equal(await line.locator('.ln-app-switcher [aria-current="page"]').textContent(), 'Dinnerware');
    assert.match(await line.locator('.ln-app-switcher a', { hasText: 'Vessel V2' }).getAttribute('href'), /vessel-v2-generator\/index\.html$/);
    await line.keyboard.press('Escape');
    // Undo, redo and parameters are icons; project controls centred over the stage
    for (const selector of ['#btnUndo', '#btnRedo', '[data-action="panel"]']) {
        const button = line.locator(`.ln-bar ${selector}`);
        assert.equal(await button.locator('svg').isVisible(), true, `${selector} shows an icon`);
        assert.equal((await button.innerText()).trim(), '', `${selector} has no visible text`);
    }
    const projectBox = await line.locator('.ln-bar-project').boundingBox();
    const stageBox = await line.locator('.ln-stage').boundingBox();
    assert.ok(Math.abs((projectBox.x + projectBox.width / 2) - (stageBox.x + stageBox.width / 2)) < 4,
        'project controls centred over the viewer');
    assert.equal(await line.locator('.ln-tab').count(), 0, 'no piece tabs in the bar');
    for (const selector of ['#projectName', '#btnNewProject', '#btnLoadProject', '#btnSaveProject']) {
        assert.equal(await line.locator(`.ln-bar ${selector}`).count(), 1, `${selector} in the header`);
    }
    assert.equal(await line.locator('.ln-bar [data-action="theme"], .ln-bar [data-action="render"]').count(), 0);

    // Caption: no title, hint or checks; one Layout menu button
    assert.equal(await line.locator('.ln-caption-title').isVisible(), false);
    assert.equal(await line.locator('.ln-caption-hint').isVisible(), false);
    assert.equal(await line.locator('.ln-readout dt', { hasText: 'Checks' }).count(), 0);
    assert.equal(await line.locator('.ln-readout dt', { hasText: 'Pieces' }).count(), 0);
    assert.equal(await line.locator('.ln-caption #btnProfileView, .ln-caption #btnCompare').count(), 0);
    await line.locator('.ln-menu-button').click();
    await line.locator('.ln-menu-item', { hasText: 'Stacked' }).click();
    assert.equal(await line.locator('#btnLayoutStack').evaluate(el => el.classList.contains('active')), true);
    assert.match(await line.locator('.ln-menu-button').textContent(), /Layout · Stacked/);

    // Display style lives in the View menu: shaded by default, Line render, Negative
    assert.equal(await viewport(vp => Boolean(vp.meshes.get('plate').userData.outline?.visible)), false);
    await openViewMenu();
    await line.locator('#viewMenu [data-action="render"]').click();
    assert.equal(await viewport(vp => vp.meshes.get('plate').material.type), 'MeshBasicMaterial');
    await openViewMenu();
    await line.locator('#viewMenu [data-action="render"]').click();
    assert.equal(await viewport(vp => vp.meshes.get('plate').material.type), 'MeshStandardMaterial');
    const paperBefore = await viewport(vp => vp.scene.background.getHexString());
    await openViewMenu();
    await line.locator('#viewMenu [data-action="theme"]').click();
    const paperAfter = await viewport(vp => vp.scene.background.getHexString());
    assert.deepEqual([paperBefore, paperAfter], ['f2f1ec', '101010'], 'Negative swaps ink and paper');
    await openViewMenu();
    await line.locator('#viewMenu [data-action="theme"]').click();
    assert.equal(await line.locator('#btnToggleBackground').isVisible(), false, 'Negative replaces the background toggle');

    // Panel: plain section names, no preset row or explainers, anchor toggle,
    // numbers on the same line as their sliders
    await line.locator('body').click({ position: { x: 600, y: 400 } });
    assert.equal((await line.locator('[data-section="global-style"] .section-header h3').textContent()).trim(), 'Style');
    await line.locator('[data-section="global-style"] .section-header').click();
    assert.equal(await line.locator('.preset-row').isVisible(), false);
    assert.equal(await line.locator('#parameterPanel .parameter-help:visible').count(), 0);
    await line.locator('.ln-segmented button', { hasText: 'Rim' }).click();
    assert.equal(await line.evaluate(async () => (await import('/scripts/state/projectState.js')).stateManager.getState('globalParameters.positiveWallAngleAnchor')), 'rim');
    await line.locator('.ln-segmented button', { hasText: 'Base' }).click();
    const row = line.locator('[data-section="global-style"] [data-param="wallAngle"]');
    const sliderBox = await row.locator('input[type="range"]').boundingBox();
    const numberBox = await row.locator('.numeric-input').boundingBox();
    assert.ok(Math.abs((sliderBox.y + sliderBox.height / 2) - (numberBox.y + numberBox.height / 2)) < 2,
        'the number is centred on its slider');
    assert.equal(await row.locator('.numeric-input input').evaluate(el => getComputedStyle(el).borderBottomStyle), 'none',
        'no underline under the number');

    // No "may require supports" alerts, even for a design that overhangs
    await line.evaluate(async () => {
        const { stateManager } = await import('/scripts/state/projectState.js');
        stateManager.setState('globalParameters.wallInsetEnabled', true);
        stateManager.setState('globalParameters.bottomCornerRadius', 14);
    });
    await line.locator('[data-section="global-style"] [data-param="wallThickness"] .numeric-input input').press('ArrowUp');
    await line.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    assert.equal(await line.locator('.param-warning', { hasText: /support/i }).count(), 0);
    await line.evaluate(async () => {
        const { stateManager } = await import('/scripts/state/projectState.js');
        stateManager.setState('globalParameters.wallThickness', 0.9);
    });
    await line.locator('[data-section="global-style"] [data-param="wallAngle"] .numeric-input input').press('ArrowUp');
    await line.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    assert.equal(await line.locator('#parameterPanel .param-warning:visible').count(), 0, 'no alerts in the parameters');
    assert.deepEqual(lineErrors, [], 'Line mode runtime errors');
    await line.goto(`${base}/index.html?ui=classic`);
    pass('Line Dinnerware: app switcher, icon actions, centred project controls, Layout menu, View-menu display style, plain panel, no alerts');

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
