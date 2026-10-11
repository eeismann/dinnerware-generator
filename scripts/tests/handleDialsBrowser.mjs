// Real-browser regression for the Handle Designer's DialKit interface:
// first-open source dialog, dial edits driving state and geometry,
// conditional rows, the cross-section preview, File menu save/export/mold
// kit, the source picker, the parameters toggle and light mode. Starts its
// own Vite server and a software-WebGL Chromium.
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { viewDock } from './viewDockHelpers.mjs';

const server = await createServer({ configFile: false, logLevel: 'error',
    server: { host: '127.0.0.1', port: 0, open: false } });
let browser;
const pass = (message) => console.log(`[PASS] ${message}`);
const HANDLE_STORAGE_KEY = 'playground_ceramics_handle_projects';

try {
    await server.listen();
    const base = `http://127.0.0.1:${server.httpServer.address().port}`;
    browser = await chromium.launch({
        headless: true,
        args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader']
    });
    const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());

    const nextFrames = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    const state = () => page.evaluate(async () =>
        (await import('/scripts/handle/state/handleState.js')).handleStateManager.getState());
    const handleGeometry = () => page.evaluate(async () => {
        const viewport = (await import('/scripts/handle/ui/handleViewport.js')).getHandleViewport();
        return viewport.handleMesh?.geometry.uuid ?? null;
    });
    const previewPixels = () => page.locator('#crossSectionCanvas').evaluate(canvas => canvas.toDataURL());

    // DialKit helpers (see dinnerwareBrowser.mjs)
    const dials = page.locator('.handle-dials');
    const section = (name) => dials.locator('.dialkit-folder-section')
        .filter({ has: page.locator(':scope > .dialkit-folder-header', { hasText: name }) });
    const settle = () => page.waitForTimeout(400);
    const openSection = async (name) => {
        const scope = section(name);
        if (await scope.getAttribute('data-open') !== 'true') {
            await scope.locator(':scope > .dialkit-folder-header').click();
            await settle();
        }
        return scope;
    };
    const slider = (scope, name) => scope.getByRole('slider', { name, exact: true });
    const typeValue = async (scope, name, value) => {
        await slider(scope, name).focus();
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
    const toggleRow = (scope, label) => scope.locator('.dialkit-labeled-control')
        .filter({ has: page.locator('.dialkit-labeled-control-label', { hasText: new RegExp(`^${label}$`) }) });
    const setToggle = async (scope, label, on) => {
        await toggleRow(scope, label).getByText(on ? 'On' : 'Off', { exact: true }).click();
        await nextFrames();
    };
    const fileMenu = async (item) => {
        await page.locator('#btnFileMenu').click();
        await page.locator('#fileMenuList [role="menuitem"]', { hasText: item }).click();
    };
    const readDownload = async (download) => {
        const chunks = [];
        for await (const chunk of await download.createReadStream()) chunks.push(chunk);
        return Buffer.concat(chunks);
    };

    // --- First open: a start card (as in Cast Form) asks for a source before
    // anything is generated; the source card sits at the top of the parameters
    await page.goto(`${base}/handle-generator/index.html`);
    const startCard = page.locator('#emptyState');
    await startCard.waitFor({ timeout: 30000 });
    assert.equal(await page.locator('#parameterPanel #sourceCard').count(), 1, 'source card in the parameters panel');
    assert.match(await page.locator('#sourceCard .dk-source-name').textContent(), /No source chosen/);
    assert.equal(await page.locator('.hd-readouts').isVisible(), false, 'readouts wait for a source');
    assert.equal(await page.evaluate(async () =>
        Boolean((await import('/scripts/handle/ui/handleViewport.js')).getHandleViewport()?.handleMesh)), false,
    'nothing generated before a source is chosen');
    await startCard.getByRole('button', { name: 'Choose Source…' }).click();
    await page.locator('#mugImportModal').waitFor();
    await page.keyboard.press('Escape');
    await page.locator('#mugImportModal').waitFor({ state: 'hidden' });
    assert.equal(await startCard.isVisible(), true, 'cancelling the picker keeps the start card');
    await startCard.getByRole('button', { name: 'Use Default Mug' }).click();
    await startCard.waitFor({ state: 'hidden' });
    assert.equal((await state()).mugData.projectName, 'Default mug (no project)');
    await page.waitForFunction(async () =>
        Boolean((await import('/scripts/handle/ui/handleViewport.js')).getHandleViewport()?.handleMesh));
    assert.match(await page.locator('#sourceCard .dk-source-name').textContent(), /Default mug/);
    assert.equal(await page.locator('#btnChangeSource').textContent(), 'Change…');
    pass('First open: start card, source card in the parameters, Choose Source… picker, Use Default Mug generates');

    // --- Chrome: DialKit header and panels, no footer, no Studio/Line shells
    assert.equal(await page.locator('footer').count(), 0, 'footer removed');
    assert.equal(await page.locator('.ln-root, .studio-shell, #settingsMenu').count(), 0, 'no alternate shells or classic settings');
    for (const name of ['Handle', 'Mold Kit']) {
        assert.equal(await section(name).count(), 1, `${name} panel`);
    }
    assert.equal(await section('View').count(), 0, 'view controls moved to the view dock');
    for (const id of ['btnNewProject', 'btnLoadProject', 'btnSaveProject', 'btnChangeMug', 'btnExportSTL', 'btnExportMoldKit']) {
        assert.equal(await page.locator(`#fileMenuList #${id}[role="menuitem"]`).count(), 1, `${id} in the File menu`);
    }
    const unlabelled = await page.evaluate(() => [...document.querySelectorAll('.handle-dials [role="slider"]')]
        .filter(el => !el.getAttribute('aria-label')).length);
    assert.equal(unlabelled, 0, 'every slider has an accessible name');
    const panelBox = await page.locator('#parameterPanel').boundingBox();
    assert.ok(panelBox.x > 1440 / 2, 'parameters sit on the right');
    pass('DialKit header, File menu and Handle / Mold Kit panels; footer and shells removed');

    // --- Keyboard and typed slider edits update state, geometry and readouts
    const handle = await openSection('Handle');
    const protrusion = (await state()).handleParams.handleProtrusion;
    let geometry = await handleGeometry();
    await slider(handle, 'Protrusion').focus();
    await page.keyboard.press('ArrowRight');
    await nextFrames();
    assert.equal((await state()).handleParams.handleProtrusion, protrusion + 1, 'arrow key steps the value');
    assert.notEqual(await handleGeometry(), geometry, 'handle mesh rebuilt');
    geometry = await handleGeometry();
    await typeValue(handle, 'Top Height', 80);
    const params = (await state()).handleParams;
    assert.equal(params.topAttachmentHeight, 80);
    assert.notEqual(await handleGeometry(), geometry, 'typed value rebuilds the mesh');
    assert.equal(await page.locator('#handleDimensionsSummary').textContent(),
        `${80 - params.bottomAttachmentHeight} × ${params.handleProtrusion} × ${params.handleWidth}mm`);
    assert.equal(await page.locator('#unsavedIndicator').isVisible(), true, 'edit marks the project unsaved');
    pass('Arrow keys and Enter-to-type edit state, rebuild the handle and update readouts');

    // --- Profile switch changes the visible rows; the preview redraws
    assert.equal(await slider(handle, 'Corner Radius').count(), 0, 'oval has no corner radius');
    let pixels = await previewPixels();
    await choose(handle, 'Profile', 'Rectangular');
    assert.equal((await state()).handleParams.crossSectionType, 'rectangular');
    await slider(handle, 'Corner Radius').waitFor();
    assert.notEqual(await previewPixels(), pixels, 'preview shows the rectangular profile');
    pixels = await previewPixels();
    await typeValue(handle, 'Width', 14);
    assert.equal((await state()).handleParams.crossSectionHeight, 14, 'Width dial drives crossSectionHeight');
    assert.notEqual(await previewPixels(), pixels, 'preview follows the width');
    await choose(handle, 'Profile', 'Oval');
    await slider(handle, 'Corner Radius').waitFor({ state: 'detached' });
    pass('Profile select swaps the corner-radius row and the cross-section preview redraws');

    // --- Matching the mug wall angle replaces the manual arm angle
    await setToggle(handle, 'Match Mug Wall Angle', true);
    assert.equal((await state()).handleParams.matchMugWallAngle, true);
    await slider(handle, 'Vertical Arm Angle').waitFor({ state: 'detached' });
    await setToggle(handle, 'Match Mug Wall Angle', false);
    await slider(handle, 'Vertical Arm Angle').waitFor();
    pass('Match Mug Wall Angle hides and restores the manual arm angle');

    // --- Mold kit visualization reveals its controls and readout card
    const mold = await openSection('Mold Kit');
    assert.equal(await slider(mold, 'Explode').count(), 0);
    await setToggle(mold, 'Visualization', true);
    await slider(mold, 'Explode').waitFor();
    await page.locator('#moldKitSummary').waitFor();
    assert.match(await page.locator('#moldProofSize').textContent(), /mm$/);
    await typeValue(mold, 'Explode', 40);
    assert.equal((await state()).viewSettings.moldExplode, 0.4);
    await setToggle(mold, 'Visualization', false);
    await page.locator('#moldKitSummary').waitFor({ state: 'hidden' });
    pass('Mold kit visualization shows explode/opacity/parts dials and the summary card');

    // --- View dock drives the viewport
    const dock = viewDock(page);
    // Handle's default view looks end-on at the Front face; snap squarely onto it
    await dock.face('Front');
    await page.waitForFunction(async () => {
        const { camera, controls } = (await import('/scripts/handle/ui/handleViewport.js')).getHandleViewport();
        return camera.position.clone().sub(controls.target).normalize().z > 0.9;
    });
    await dock.dock.locator('.dk-view-reset').click();
    await dock.open();
    await dock.setToggle('Show Grid', false);
    assert.equal(await page.evaluate(async () =>
        (await import('/scripts/handle/ui/handleViewport.js')).getHandleViewport().showGrid), false);
    await dock.setToggle('Show Grid', true);
    await dock.choose('Mug Display', 'wireframe');
    assert.equal((await state()).viewSettings.mugDisplayMode, 'wireframe');
    await dock.close();
    pass('View dock: cube snaps to Front; grid and mug display apply');

    // --- Change Source opens the DialKit source picker; dials follow the import
    await page.evaluate(() => localStorage.setItem('playground_ceramics_projects', JSON.stringify([{
        id: 'dw-test', projectName: 'Studio Mugs', lastModified: new Date().toISOString(),
        state: { globalParameters: { wallAngle: 6 }, baseDimensions: { mug: { diameter: 90, height: 100 } } }
    }])));
    await fileMenu('Change Source');
    await page.getByRole('button', { name: 'OK' }).click(); // unsaved-changes confirmation
    await page.locator('#mugImportModal').waitFor();
    assert.equal(await page.locator('#importSourceSelector [aria-pressed="true"]').textContent(), 'Dinnerware Mug');
    await page.getByRole('button', { name: /Studio Mugs/ }).click();
    await page.locator('#mugImportModal').waitFor({ state: 'hidden' });
    const imported = await state();
    assert.equal(imported.mugData.projectName, 'Studio Mugs');
    assert.match(await page.locator('#sourceCard .dk-source-name').textContent(), /Studio Mugs/);
    await nextFrames();
    assert.equal(await slider(handle, 'Protrusion').getAttribute('aria-valuenow'),
        String(imported.handleParams.handleProtrusion), 'dials follow the imported source defaults');
    await page.locator('#btnChangeSource').click();
    await page.getByRole('button', { name: 'OK' }).click();
    await page.locator('#mugImportModal').waitFor();
    await page.keyboard.press('Escape');
    await page.locator('#mugImportModal').waitFor({ state: 'hidden' });
    assert.equal((await state()).mugData.projectName, 'Studio Mugs', 'Escape keeps the current source');
    pass('Source picker imports a Dinnerware mug, dials sync, Escape cancels');

    // --- File menu: Save
    await fileMenu('Save');
    await page.locator('#saveModal').waitFor();
    await page.locator('#saveProjectName').fill('Dial Handle');
    await page.locator('#btnConfirmSave').click();
    await page.locator('#saveModal').waitFor({ state: 'hidden' });
    const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), HANDLE_STORAGE_KEY);
    assert.equal(saved.length, 1);
    assert.equal(saved[0].project.name, 'Dial Handle');
    assert.equal(saved[0].handleParams.topAttachmentHeight, (await state()).handleParams.topAttachmentHeight);
    assert.equal(await page.locator('#projectName').textContent(), 'Dial Handle');
    assert.equal(await page.locator('#unsavedIndicator').isVisible(), false);
    pass('File > Save stores the project and clears the unsaved mark');

    // --- File menu: Export STL
    await fileMenu('Export STL');
    await page.locator('#exportModal').waitFor();
    assert.equal(await page.locator('#exportTitle').textContent(), 'Export STL');
    assert.equal(await page.locator('#exportOrientation').inputValue(), 'mug-relative');
    const stlPromise = page.waitForEvent('download');
    await page.locator('#btnConfirmExport').click();
    const stl = await stlPromise;
    assert.match(stl.suggestedFilename(), /\.stl$/);
    const stlBytes = await readDownload(stl);
    const stlGeometry = new STLLoader().parse(stlBytes.buffer.slice(stlBytes.byteOffset, stlBytes.byteOffset + stlBytes.byteLength));
    assert.ok(stlGeometry.getAttribute('position').count > 300, 'STL has triangles');
    await page.locator('#exportModal').waitFor({ state: 'hidden' });
    await fileMenu('Export STL');
    await page.locator('#exportModal').waitFor();
    await page.keyboard.press('Escape');
    await page.locator('#exportModal').waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'btnFileMenu', 'focus returns to the File menu');
    pass(`File > Export STL downloads ${stl.suggestedFilename()} (${stlGeometry.getAttribute('position').count / 3} tris)`);

    // --- File menu: Export Mold Kit
    await fileMenu('Export Mold Kit');
    await page.locator('#exportModal').waitFor();
    assert.equal(await page.locator('#exportTitle').textContent(), 'Export Mold Kit');
    assert.equal(await page.locator('#handleExportOptions').isVisible(), false, 'no orientation for the mold kit');
    assert.match(await page.locator('#exportNote').textContent(), /Plaster estimate \d/);
    const zipPromise = page.waitForEvent('download', { timeout: 120000 });
    await page.locator('#btnConfirmExport').click();
    const zip = await zipPromise;
    assert.match(zip.suggestedFilename(), /\.zip$/);
    assert.equal((await readDownload(zip)).readUInt32LE(0), 0x04034b50, 'ZIP local header');
    await page.locator('#exportModal').waitFor({ state: 'hidden', timeout: 30000 });
    pass(`File > Export Mold Kit downloads ${zip.suggestedFilename()}`);

    // --- Parameters toggle is remembered across reloads
    const panelToggle = page.locator('#btnTogglePanel');
    await panelToggle.click();
    assert.equal(await panelToggle.getAttribute('aria-pressed'), 'false');
    await page.locator('#parameterPanel').waitFor({ state: 'hidden' });
    await page.goto(`${base}/handle-generator/index.html?project=${saved[0].project.id}`);
    await page.waitForFunction(async () =>
        Boolean((await import('/scripts/handle/ui/handleViewport.js')).getHandleViewport()?.handleMesh));
    assert.equal(await page.locator('#parameterPanel').isVisible(), false, 'hidden state is remembered');
    // A default handle mesh exists before the saved project finishes loading
    await page.waitForFunction(async () =>
        (await import('/scripts/handle/state/handleState.js')).handleStateManager.getState().project.name === 'Dial Handle',
    null, { timeout: 15000 }).catch(() => {});
    assert.equal((await state()).project.name, 'Dial Handle', 'saved project reopens');
    await panelToggle.click();
    await page.locator('#parameterPanel').waitFor({ state: 'visible' });
    assert.equal(await slider(await openSection('Handle'), 'Top Height').getAttribute('aria-valuenow'),
        String(saved[0].handleParams.topAttachmentHeight), 'dials show the loaded project');
    pass('Parameters toggle persists across reloads; a saved project reopens into the dials');

    // --- Light mode
    await page.evaluate(() => localStorage.setItem('playground-ceramics-mode', 'light'));
    await page.reload();
    await page.waitForFunction(async () =>
        Boolean((await import('/scripts/handle/ui/handleViewport.js')).getHandleViewport()?.handleMesh));
    assert.equal(await page.evaluate(() => document.documentElement.dataset.mode), 'light');
    assert.equal(await dials.getAttribute('data-theme'), 'light');
    assert.equal(await page.locator('#parameterPanel').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(250, 250, 250)');
    assert.equal(await page.locator('.dk-header').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(250, 250, 250)');
    assert.equal(await page.evaluate(async () =>
        (await import('/scripts/handle/ui/handleViewport.js')).getHandleViewport().scene.background.getHex()), 0xf5f5f5);
    pass('Light mode themes the header, dials card and viewport');

    assert.deepEqual(errors, [], 'No application runtime errors');
    await context.close();
} finally {
    await browser?.close();
    await server.close();
}
