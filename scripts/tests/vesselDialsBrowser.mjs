// Real-browser regression for the Vessel Generator's DialKit interface:
// panels, slider keyboard/typed edits regenerating the vessel, linked
// diameters, conditional rows, File menu, dialogs, the parameters toggle and
// light mode. Starts its own Vite server and a software-WebGL Chromium.
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
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
    const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    const ready = () => page.waitForFunction(() => window.vesselApp?.viewport?.vesselGroup?.children.length > 0
        && document.querySelector('.vessel-dials .dialkit-folder-section'));
    await page.goto(`${base}/vessel-generator/index.html`);
    await ready();

    // DialKit helpers (see dinnerwareBrowser.mjs)
    const dials = page.locator('.vessel-dials');
    const section = (name) => dials.locator('.dialkit-folder-section')
        .filter({ has: page.locator(':scope > .dialkit-folder-header .dialkit-folder-title').getByText(name, { exact: true }) });
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
    const nextFrames = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    const typeValue = async (scope, name, value) => {
        await scope.getByRole('slider', { name, exact: true }).focus();
        await page.keyboard.press('Enter');
        const input = scope.getByRole('textbox', { name: `${name} value`, exact: true });
        await input.fill(String(value));
        await input.press('Enter');
        await nextFrames();
    };
    const toggle = (scope, label) => scope.locator('.dialkit-labeled-control')
        .filter({ has: page.locator('.dialkit-labeled-control-label', { hasText: new RegExp(`^${label}$`) }) });
    const setToggle = async (scope, label, on) => {
        await toggle(scope, label).getByText(on ? 'On' : 'Off', { exact: true }).click();
        await nextFrames();
    };
    const state = (path) => page.evaluate(async (statePath) =>
        (await import('/scripts/vessel/state/vesselState.js')).vesselState.getState(statePath), path);
    // The viewport rebuilds 40ms after a state change; geometry uuids change on rebuild
    const vesselGeometry = () => page.evaluate(() =>
        window.vesselApp.viewport.vesselGroup.children.map(child => child.geometry?.uuid).join());
    const waitForRebuild = (before) => page.waitForFunction(async (previous) =>
        window.vesselApp.viewport.vesselGroup.children.map(child => child.geometry?.uuid).join() !== previous, before);

    // --- Panels render; no classic panel, footer or alternate shells
    const names = await dials.locator('.dialkit-folder-section > .dialkit-folder-header .dialkit-folder-title').allTextContents();
    assert.deepEqual(names, ['Global', 'Lip', 'Neck', 'Shoulder', 'Body', 'Waist', 'Foot']);
    assert.equal(await page.locator('footer.footer, .panel-section, .ln-root, [data-studio-root]').count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.dataset.ui), undefined, 'no data-ui shell switch');
    const unlabelled = await page.evaluate(() => [...document.querySelectorAll('.vessel-dials [role="slider"]')]
        .filter(el => !el.getAttribute('aria-label')).length);
    assert.equal(unlabelled, 0, 'every slider has an accessible name');
    pass(`Page loads with ${names.length} DialKit panels and no classic panel or footer`);

    // --- Arrow keys and typed values write state and regenerate the vessel
    const global = section('Global');
    let geometry = await vesselGeometry();
    await global.getByRole('slider', { name: 'Wall Thickness', exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    await nextFrames();
    assert.equal(await state('global.wallThickness'), 3.5, 'ArrowRight steps 0.5mm');
    await waitForRebuild(geometry);
    geometry = await vesselGeometry();
    const body = await openSection('Body');
    await typeValue(body, 'Height', 150);
    assert.equal(await state('sections.body.height'), 150);
    await waitForRebuild(geometry);
    assert.equal(await body.getByRole('slider', { name: 'Height', exact: true }).getAttribute('aria-valuenow'), '150');
    pass('Arrow keys and Enter-to-type update state and regenerate the vessel');

    // --- Linked diameters follow in both directions
    await typeValue(body, 'Bottom Diameter', 112);
    await page.waitForFunction(async () => (await import('/scripts/vessel/state/vesselState.js'))
        .vesselState.getState('sections.foot.topDiameter') === 112);
    const foot = await openSection('Foot');
    assert.equal(await foot.getByRole('slider', { name: 'Top Diameter', exact: true }).getAttribute('aria-valuenow'), '112',
        'linked dial follows');
    await typeValue(foot, 'Top Diameter', 104);
    await page.waitForFunction(async () => (await import('/scripts/vessel/state/vesselState.js'))
        .vesselState.getState('sections.body.bottomDiameter') === 104);
    await closeSection('Foot');
    pass('Linked diameters stay in step from either side');

    // --- Conditional rows: Flat Wall hides the curve rows; Waist adds rows and retargets the body link
    await setToggle(body, 'Flat Wall', true);
    assert.equal(await state('sections.body.flatWall'), true);
    await body.getByRole('slider', { name: 'Mid Diameter', exact: true }).waitFor({ state: 'detached' });
    assert.equal(await body.getByRole('slider', { name: 'Curvature', exact: true }).count(), 0);
    await setToggle(section('Body'), 'Flat Wall', false);
    await section('Body').getByRole('slider', { name: 'Mid Diameter', exact: true }).waitFor();
    const waist = await openSection('Waist');
    assert.equal(await waist.getByRole('slider').count(), 0, 'disabled waist shows only its toggle');
    await setToggle(waist, 'Enabled', true);
    assert.equal(await state('sections.waist.enabled'), true);
    await section('Waist').getByRole('slider', { name: 'Height', exact: true }).waitFor();
    assert.equal(await toggle(section('Body'), 'Link To Waist').count(), 1, 'body link follows the waist');
    assert.equal(await state('sections.waist.topDiameter'), await state('sections.body.bottomDiameter'),
        'enabling the waist relinks the body');
    await setToggle(section('Waist'), 'Enabled', false);
    assert.equal(await toggle(section('Body'), 'Link To Foot').count(), 1);
    await closeSection('Waist');
    pass('Flat Wall and section Enabled toggles add and remove rows');

    // --- Lip style select
    const lip = await openSection('Lip');
    await lip.locator('.dialkit-select-trigger').filter({ hasText: /^Style/ }).click();
    await page.locator('.dialkit-select-option').filter({ hasText: /^Beaded/ }).click();
    await nextFrames();
    assert.equal(await state('sections.lip.style'), 'beaded');
    // Beaded lips currently fail STL mesh validation; export a straight lip below
    await lip.locator('.dialkit-select-trigger').filter({ hasText: /^Style/ }).click();
    await page.locator('.dialkit-select-option').filter({ hasText: /^Straight/ }).click();
    await nextFrames();
    assert.equal(await state('sections.lip.style'), 'straight');
    await closeSection('Lip');
    pass('Lip style select writes state');

    // --- View dock drives the viewport
    const dock = viewDock(page);
    await dock.open();
    await dock.setToggle('Cross Section', true);
    assert.equal(await page.evaluate(() => window.vesselApp.viewport.showCrossSection), true);
    await dock.setToggle('Show Grid', false);
    assert.equal(await page.evaluate(() => window.vesselApp.viewport.gridHelper.visible), false);
    await dock.close();
    await dock.face('Top');
    await page.waitForFunction(() => {
        const { camera, controls } = window.vesselApp.viewport;
        return camera.position.clone().sub(controls.target).normalize().y > 0.99;
    });
    pass('View dock: cross-section, grid and the cube snaps to Top');

    // --- Line art and axes on a viewport without its own line treatment
    await dock.open();
    await dock.setToggle('Cross Section', false);
    await dock.setToggle('Show Grid', true);
    await dock.setToggle('Line Art', true);
    await page.waitForFunction(() => {
        const mesh = window.vesselApp.viewport.vesselGroup.children.find(child => child.isMesh);
        return mesh?.material.isMeshBasicMaterial && Boolean(mesh.userData.lineArt?.hull);
    });
    await dock.setToggle('Axes', false);
    assert.equal(await page.evaluate(() => window.vesselApp.viewport.scene.getObjectByName('dk-axis-lines').visible), false);
    await dock.setToggle('Axes', true);
    await dock.setToggle('Line Art', false);
    await page.waitForFunction(() => {
        const mesh = window.vesselApp.viewport.vesselGroup.children.find(child => child.isMesh);
        return !mesh.material.isMeshBasicMaterial && !mesh.userData.lineArt;
    });
    await dock.close();
    pass('Line art restyles the vessel with ink outlines and restores it; axes toggle');

    // --- File menu: Save dialog, Export download, confirm dialog
    const fileItem = async (label) => {
        await page.locator('#btnFileMenu').click();
        await page.locator('#fileMenuList [role="menuitem"]', { hasText: label }).click();
    };
    await fileItem('Save');
    await page.locator('#saveModal').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#saveModal .modal-content').getAttribute('role'), 'dialog');
    await page.keyboard.press('Escape');
    await page.locator('#saveModal').waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'btnFileMenu', 'focus returns to the File menu');
    await fileItem('Save');
    await page.locator('#saveProjectName').fill('Dial Vase');
    await page.locator('#btnConfirmSave').click();
    await page.locator('#saveModal').waitFor({ state: 'hidden' });
    await page.locator('#statusToast', { hasText: 'Dial Vase' }).waitFor();
    assert.equal(await page.locator('#projectName').textContent(), 'Dial Vase');
    const projectId = await page.evaluate(() => window.vesselApp.editingProjectId);
    assert.ok(projectId, 'saved to project storage');

    const downloadPromise = page.waitForEvent('download');
    await fileItem('Export STL');
    const download = await downloadPromise;
    assert.match(download.suggestedFilename(), /^Dial Vase\.stl$/);

    await typeValue(section('Global'), 'Wall Thickness', 4);
    await fileItem('New');
    await page.locator('#confirmModal').waitFor({ state: 'visible' });
    await page.locator('#btnConfirmOk').click();
    await page.locator('#confirmModal').waitFor({ state: 'hidden' });
    assert.equal(await state('global.wallThickness'), 3, 'new project resets state');
    assert.equal(await section('Global').getByRole('slider', { name: 'Wall Thickness', exact: true }).getAttribute('aria-valuenow'), '3',
        'dials follow a reset');
    pass('File menu: Save dialog (Escape, save + toast), Export STL download, New with confirm');

    // --- Saved projects load back into the dials
    await page.goto(`${base}/vessel-generator/index.html?project=${projectId}`);
    await ready();
    assert.equal(await state('sections.body.height'), 150);
    assert.equal(await page.locator('#projectName').textContent(), 'Dial Vase');
    const reloadedBody = await openSection('Body');
    assert.equal(await reloadedBody.getByRole('slider', { name: 'Height', exact: true }).getAttribute('aria-valuenow'), '150');
    pass('Saved project reloads into state and dials');

    // --- Parameters toggle hides/shows the card and persists
    const panelToggle = page.locator('#btnTogglePanel');
    const panelBox = await page.locator('#parameterPanel').boundingBox();
    assert.ok(panelBox.x > 1440 / 2, 'parameters sit on the right');
    const viewportBox = await page.locator('#viewport').boundingBox();
    assert.ok(viewportBox.width >= 1400 && viewportBox.height >= 800, `viewport fills the window (${viewportBox.width}x${viewportBox.height})`);
    await panelToggle.click();
    assert.equal(await panelToggle.getAttribute('aria-pressed'), 'false');
    await page.locator('#parameterPanel').waitFor({ state: 'hidden' });
    await page.reload();
    await ready();
    assert.equal(await page.locator('#parameterPanel').isVisible(), false, 'hidden state is remembered');
    await panelToggle.click();
    await page.locator('#parameterPanel').waitFor({ state: 'visible' });
    pass('Parameters toggle hides/shows the card and is remembered');

    // --- Light mode
    await page.evaluate(() => localStorage.setItem('playground-ceramics-mode', 'light'));
    await page.reload();
    await ready();
    assert.equal(await page.evaluate(() => document.documentElement.dataset.mode), 'light');
    assert.equal(await dials.getAttribute('data-theme'), 'light', 'dials follow light mode');
    const headerBg = await page.locator('.dk-header').evaluate(el => getComputedStyle(el).backgroundColor);
    assert.equal(headerBg, 'rgb(250, 250, 250)', 'header uses the light DialKit surface');
    pass('Light mode applies to the header and dials');

    assert.deepEqual(errors, [], 'No application runtime errors');
    await context.close();
} finally {
    await browser?.close();
    await server.close();
}
