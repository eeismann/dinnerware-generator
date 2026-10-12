// Real-browser regression for Vessel Designer V2 on DialKit: dials drive
// vesselV2State and regenerate the mesh, the Surface Motif panel follows the
// selected segment, the profile canvas still edits and the dials follow it,
// the File menu dialogs, the parameters toggle and light mode. Starts its own
// Vite server and a software-WebGL Chromium.
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
    page.on('dialog', dialog => {
        errors.push(`unexpected dialog: ${dialog.message()}`);
        dialog.dismiss();
    });
    const appReady = () => page.waitForFunction(() => window.vesselV2App?.viewport?.vesselGroup?.children.length > 0
        && Boolean(document.querySelector('.vessel-v2-dials .dialkit-select-trigger')));
    await page.goto(`${base}/vessel-v2-generator/index.html`);
    await appReady();

    const nextFrames = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    // Viewport updates are debounced (40ms)
    const settle = () => page.waitForTimeout(400);
    const state = (path) => page.evaluate(async (statePath) =>
        (await import('/scripts/vesselV2/state/vesselV2State.js')).default.getState(statePath), path);
    const meshId = () => page.evaluate(() => window.vesselV2App.viewport.vesselGroup.children[0].geometry.uuid);

    const dials = page.locator('.vessel-v2-dials');
    // A lone DialKit panel renders as the card's root rather than a section
    const section = (name) => dials.locator('.dialkit-folder-section, .dialkit-folder-root')
        .filter({ has: page.locator(':scope > .dialkit-folder-header', { hasText: name }) });
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
    const selectTrigger = (scope, label) => scope.locator('.dialkit-select-trigger').filter({ hasText: new RegExp(`^${label}`) }).first();
    const choose = async (scope, label, option) => {
        await selectTrigger(scope, label).click();
        await page.locator('.dialkit-select-option').filter({ hasText: new RegExp(`^${option}`) }).first().click();
        await nextFrames();
    };

    // --- Page chrome
    assert.equal(await page.locator('footer.footer').count(), 0, 'footer removed');
    assert.equal(await page.locator('.ln-root, .st-root').count(), 0, 'no Studio/Line shell');
    assert.deepEqual(await dials.locator('.dialkit-folder-header .dialkit-folder-title')
        .evaluateAll(nodes => nodes.map(node => node.textContent).filter(Boolean)).then(titles => titles.slice(0, 1)),
    ['Surface Motif']);
    assert.equal(await dials.getByText('Vessel', { exact: true }).count(), 0, 'no Vessel panel left in the dials');
    pass('Page loads with the DialKit header and the Surface Motif panel');

    // --- View dock: cube snaps the camera; expanded panel drives the viewport
    const dock = viewDock(page);
    await dock.face('Top');
    await page.waitForFunction(() => {
        const { camera, controls } = window.vesselV2App.viewport;
        return camera.position.clone().sub(controls.target).normalize().y > 0.99;
    });
    await dock.dock.locator('.dk-view-reset').click();
    await dock.open();
    await dock.setToggle('Cross Section', true);
    assert.equal(await page.evaluate(() => window.vesselV2App.viewport.showCrossSection), true);
    await dock.setToggle('Cross Section', false);
    await dock.close();
    pass('View dock: cube snaps to Top, reset, Cross Section toggle');

    // --- Profile settings live at the top of the editor panel as compact rows
    const settings = page.locator('#profileSettings');
    // Labels are shortened to fit a line; every control carries its full name
    const settingRow = (name) => settings.locator('.dk-view-row')
        .filter({ has: page.locator(`[aria-label="${name}"]`) });
    const lineOf = (name) => settingRow(name).evaluate(row => [...row.parentElement.parentElement.children].indexOf(row.parentElement));
    const setSetting = (label, value) => settingRow(label).locator('input[type="range"]').evaluate((input, next) => {
        input.value = String(next);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }, value);
    for (const label of ['Profile Mode', 'Wall Thickness', 'Radial Segments', 'Snap To Grid', 'Grid Size', 'Footer Overlap']) {
        assert.equal(await settingRow(label).count(), 1, `${label} in the editor panel`);
        assert.equal(await dials.getByText(label, { exact: true }).count(), 0, `${label} left the dials`);
    }
    const firstLine = await lineOf('Profile Mode');
    for (const label of ['Snap To Grid', 'Grid Size', 'Footer Overlap']) {
        assert.equal(await lineOf(label), firstLine, `${label} shares the Profile Mode line`);
    }
    assert.equal(await lineOf('Radial Segments'), await lineOf('Wall Thickness'), 'wall and segments share a line');
    const top = async (name) => (await settingRow(name).boundingBox()).y;
    assert.equal(await top('Footer Overlap'), await top('Profile Mode'), 'one row at the default width');
    assert.equal(await top('Radial Segments'), await top('Wall Thickness'), 'side by side at the default width');
    const rowHeight = await settingRow('Wall Thickness').evaluate(row => row.getBoundingClientRect().height);
    assert.ok(Math.abs(rowHeight - 27) <= 1, `compact rows are ¾ height (${rowHeight}px)`);
    const firstChild = await page.locator('#profileEditor > *').first().getAttribute('id');
    assert.equal(firstChild, 'profileSettings', 'settings at the top of the panel');
    const before = await meshId();
    await settingRow('Wall Thickness').locator('input[type="range"]').focus();
    await page.keyboard.press('ArrowRight');
    await nextFrames();
    assert.equal(await state('global.wallThickness'), 3.5);
    await settle();
    const afterArrow = await meshId();
    assert.notEqual(afterArrow, before, 'wall thickness regenerates the mesh');
    await setSetting('Radial Segments', 64);
    assert.equal(await state('global.radialSegments'), 64);
    await settle();
    assert.notEqual(await meshId(), afterArrow, 'segments regenerate the mesh');
    await setSetting('Grid Size', 10);
    assert.equal(await state('global.snapSize'), 10);
    await settingRow('Snap To Grid').locator('.dk-seg[data-value="false"]').click();
    assert.equal(await state('global.snapEnabled'), false);
    await settingRow('Footer Overlap').locator('.dk-seg[data-value="true"]').click();
    assert.equal(await state('profile.allowFooterOverlap'), true);
    await settingRow('Footer Overlap').locator('.dk-seg[data-value="false"]').click();
    assert.equal(await state('profile.allowFooterOverlap'), false);
    pass('Profile settings sit at the top of the editor as ¾-height rows; edits update state and the mesh');

    // --- The grid fills the canvas; no idle status line; the panel resizes
    // and the 3D view re-centres in the uncovered area
    const fill = await page.locator('#profileSvg').evaluate(svg => {
        const [, , w, h] = svg.getAttribute('viewBox').split(' ').map(Number);
        const rect = svg.getBoundingClientRect();
        return { viewBox: w / h, screen: rect.width / rect.height };
    });
    assert.ok(Math.abs(fill.viewBox - fill.screen) < 0.01, `grid area matches the canvas (${fill.viewBox} vs ${fill.screen})`);
    assert.equal(await page.locator('#profileWarnings').isVisible(), false, 'no "Profile ready" line');
    assert.doesNotMatch(await page.locator('#profileEditor').textContent(), /Profile ready/);
    const card = page.locator('#profileEditor');
    const widthBefore = (await card.boundingBox()).width;
    const grip = await page.locator('#profileResize').boundingBox();
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await page.mouse.down();
    await page.mouse.move(grip.x + grip.width / 2 - 120, grip.y + grip.height / 2, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    const widthAfter = (await card.boundingBox()).width;
    assert.ok(widthAfter < widthBefore - 100, `drag narrows the panel (${widthBefore} → ${widthAfter})`);
    await page.mouse.move(grip.x - 120, grip.y + grip.height / 2);
    await page.mouse.down();
    await page.mouse.move(grip.x - 2000, grip.y + grip.height / 2, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    assert.ok((await card.boundingBox()).width >= 299, 'panel keeps its minimum width');
    const view = await page.evaluate(() => {
        const vp = window.vesselV2App.viewport;
        const shell = document.querySelector('.viewport-shell').getBoundingClientRect();
        const main = document.querySelector('.main-content').getBoundingClientRect();
        return { inset: vp.viewInsetLeft, offset: vp.camera.view?.offsetX, shellLeft: shell.left - main.left };
    });
    const cardRight = (await card.boundingBox()).x + (await card.boundingBox()).width;
    assert.equal(view.shellLeft, 0, '3D view extends under the panel');
    assert.ok(Math.abs(view.inset - cardRight) <= 2, `view inset follows the panel (${view.inset} vs ${cardRight})`);
    assert.ok(Math.abs(view.offset + view.inset / 2) < 1, 'projection centres the vessel in the uncovered area');
    pass('Grid fills the canvas; no idle status line; panel resizes to a minimum; 3D view runs under it and re-centres');

    // --- Segment selection switches the motif controls
    const motif = await openSection('Surface Motif');
    assert.equal(await slider(motif, 'Depth').count(), 0, 'no motif controls without a segment');
    await choose(motif, 'Segment', 'Segment 2');
    const segmentTwo = await state('ui.selectedSegmentId');
    assert.ok(segmentTwo, 'segment selected from the dials');
    await page.locator('#motifInspector:not(.hidden)').waitFor();
    await choose(motif, 'Motif', 'Knurling');
    const pointMotif = async (id) => (await state('profile.points')).find(point => point.id === id).motif;
    assert.equal((await pointMotif(segmentTwo)).type, 'knurl');
    assert.equal(await slider(motif, 'Depth').count(), 1);
    assert.equal(await slider(motif, 'Pitch').count(), 0, 'knurl hides pitch');
    await typeValue(motif, 'Line Count', 48);
    assert.equal((await pointMotif(segmentTwo)).count, 48);
    assert.match(await selectTrigger(motif, 'Segment').textContent(), /Segment 2 · Knurling/);
    await choose(motif, 'Segment', 'Segment 1');
    const segmentOne = await state('ui.selectedSegmentId');
    assert.notEqual(segmentOne, segmentTwo);
    assert.match(await selectTrigger(motif, 'Motif').textContent(), /Smooth/);
    assert.equal(await slider(motif, 'Depth').count(), 0, 'smooth segment shows no variation controls');
    await choose(motif, 'Segment', 'Segment 2');
    await motif.getByText('Copy → Adjacent', { exact: true }).click();
    await nextFrames();
    assert.equal((await pointMotif(segmentOne)).type, 'knurl', 'copy to adjacent');
    pass('Segment picker switches the motif controls; motif edits and actions write to the segment');

    // --- Profile canvas still edits and the dials follow it
    await page.locator('[data-tool="edit"]').click();
    assert.equal(await state('ui.tool'), 'edit');
    await page.locator('.profile-segment-hit[data-segment-index="2"]').dispatchEvent('pointerdown', { button: 0, pointerId: 1 });
    await nextFrames();
    assert.equal(await state('ui.selectedSegmentId'), segmentOne, 'canvas selects segment 1');
    assert.match(await selectTrigger(motif, 'Segment').textContent(), /Segment 1/);
    await settingRow('Profile Mode').locator('.dk-seg[data-value="true"]').click();
    assert.equal(await state('profile.mode'), 'straight-rounded');
    assert.equal(await settingRow('Corner Radius').isVisible(), false, 'corner radius needs a selected point');
    const anchor = page.locator('.profile-anchor-hit[data-anchor-id="p2"]');
    const box = await anchor.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2, { steps: 4 });
    await page.mouse.up();
    await nextFrames();
    assert.equal(await state('ui.selectedPointId'), 'p2');
    const dragged = (await state('profile.points')).find(point => point.id === 'p2');
    assert.ok(dragged.r > 62, `anchor drag moves the point (r ${dragged.r})`);
    assert.equal(await settingRow('Corner Radius').isVisible(), true, 'corner radius for the selected point');
    await setSetting('Corner Radius', 12);
    assert.equal((await state('profile.points')).find(point => point.id === 'p2').cornerRadius, 12);
    await page.locator('#btnUndo').click();
    await nextFrames();
    assert.equal((await state('profile.points')).find(point => point.id === 'p2').cornerRadius, 0, 'undo');
    assert.equal(await settingRow('Corner Radius').locator('input[type="range"]').inputValue(), '0', 'controls follow undo');
    assert.equal(await page.locator('#btnRedo').isDisabled(), false);
    pass('Canvas selection, anchor drags and undo keep the dials in sync');

    // --- File menu dialogs
    const fileItem = async (label) => {
        await page.locator('#btnFileMenu').click();
        await page.locator('#fileMenuList [role="menuitem"]', { hasText: label }).click();
    };
    await fileItem('Save');
    await page.locator('#saveModal').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#saveProjectName').inputValue(), 'Untitled Vessel V2');
    await page.keyboard.press('Escape');
    await page.locator('#saveModal').waitFor({ state: 'hidden' });
    await fileItem('Export STL');
    await page.locator('#exportModal').waitFor({ state: 'visible' });
    assert.match(await page.locator('#exportSummary').textContent(), /mm wall/);
    await page.locator('#exportFileName').fill('dial-vessel');
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#btnConfirmExport').click();
    const download = await downloadPromise;
    assert.equal(download.suggestedFilename(), 'dial-vessel.stl');
    await page.locator('#exportModal').waitFor({ state: 'hidden' });
    pass('File menu opens the Save and Export dialogs; Export downloads an STL');

    // --- Parameters toggle hides/shows the card and persists
    const panel = page.locator('#parameterPanel');
    assert.ok((await panel.boundingBox()).x > 1440 / 2, 'parameters sit on the right');
    await page.locator('#btnTogglePanel').click();
    assert.equal(await page.locator('#btnTogglePanel').getAttribute('aria-pressed'), 'false');
    await panel.waitFor({ state: 'hidden' });
    await page.reload();
    await appReady();
    assert.equal(await panel.isVisible(), false, 'hidden state is remembered');
    await page.locator('#btnTogglePanel').click();
    await panel.waitFor({ state: 'visible' });
    pass('Header toggle hides/shows the parameters and remembers it');

    // --- Light mode
    await page.evaluate(() => localStorage.setItem('playground-ceramics-mode', 'light'));
    await page.reload();
    await appReady();
    assert.equal(await page.evaluate(() => document.documentElement.dataset.mode), 'light');
    assert.equal(await dials.getAttribute('data-theme'), 'light');
    const cardBackground = await page.locator('#profileEditor').evaluate(el => getComputedStyle(el).backgroundColor);
    assert.equal(cardBackground, 'rgb(250, 250, 250)', 'profile card uses the light glass');
    pass('Light mode themes the dials and cards');

    assert.deepEqual(errors, [], 'No application runtime errors');
    await context.close();
} finally {
    await browser?.close();
    await server.close();
}
