// Real-browser regression for Vessel Designer V3's DialKit interface: panels,
// typed/keyboard dial edits, segment motifs, spout, lid, profile-editor sync,
// File menu save/export, the parameters toggle and light mode. Starts its own
// Vite server and a software-WebGL Chromium.
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

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
        errors.push(`Unexpected dialog: ${dialog.message()}`);
        dialog.dismiss();
    });
    const ready = () => page.waitForFunction(() => window.vesselV3App?.viewport?.vesselGroup.children.length > 0
        && document.querySelector('.vessel-v3-dials .dialkit-folder-section'));
    await page.goto(`${base}/vessel-v3-generator/index.html`);
    await ready();

    // --- Helpers (same DialKit DOM conventions as dinnerwareBrowser.mjs)
    const dials = page.locator('.vessel-v3-dials');
    const section = (name) => dials.locator('.dialkit-folder-section')
        .filter({ has: page.locator(':scope > .dialkit-folder-header', { hasText: name }) });
    const settle = () => page.waitForTimeout(400);
    const nextFrames = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    // Viewport updates are debounced by 40ms
    const afterUpdate = async () => {
        await page.waitForTimeout(120);
        await nextFrames();
    };
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
        const slider = scope.getByRole('slider', { name, exact: true });
        await slider.scrollIntoViewIfNeeded();
        await slider.focus();
        await page.keyboard.press('Enter');
        const input = scope.getByRole('textbox', { name: `${name} value`, exact: true });
        await input.fill(String(value));
        await input.press('Enter');
        await afterUpdate();
    };
    const choose = async (scope, label, option) => {
        await scope.locator('.dialkit-select-trigger').filter({ hasText: new RegExp(`^${label}`) }).first().click();
        await page.locator('.dialkit-select-option').filter({ hasText: new RegExp(`^${option}`) }).first().click();
        await afterUpdate();
    };
    const selectText = (scope, label) => scope.locator('.dialkit-select-trigger')
        .filter({ hasText: new RegExp(`^${label}`) }).first().textContent();
    const toggle = async (scope, label, value) => {
        await scope.locator('.dialkit-labeled-control')
            .filter({ has: page.locator('.dialkit-labeled-control-label', { hasText: new RegExp(`^${label}$`) }) })
            .getByText(value, { exact: true }).click();
        await afterUpdate();
    };
    const state = (path) => page.evaluate(async (statePath) =>
        (await import('/scripts/vesselV3/state/vesselV3State.js')).default.getState(statePath), path);
    // Checksum of the vessel body's vertex positions
    const bodySignature = () => page.evaluate(() => {
        let sum = 0;
        let count = 0;
        window.vesselV3App.viewport.vesselGroup.traverse((child) => {
            const position = child.geometry?.getAttribute('position');
            if (!position) return;
            count += position.count;
            for (let i = 0; i < position.array.length; i += 1) sum += Math.abs(position.array[i]);
        });
        return `${count}:${sum.toFixed(3)}`;
    });

    // --- Load: panels render, no footer or legacy inspectors
    const sectionTitles = await dials.locator('.dialkit-folder-section > .dialkit-folder-header .dialkit-folder-title').allTextContents();
    assert.deepEqual(sectionTitles.filter(title => ['Profile', 'Surface Motif', 'Spout', 'Lid', 'View'].includes(title)),
        ['Profile', 'Surface Motif', 'Spout', 'Lid', 'View']);
    assert.equal(await page.locator('footer, #motifInspector, #spoutInspector, #lidInspector, .ln-root, .studio-shell').count(), 0);
    const unlabelled = await page.evaluate(() => [...document.querySelectorAll('.vessel-v3-dials [role="slider"]')]
        .filter(el => !el.getAttribute('aria-label')).length);
    assert.equal(unlabelled, 0, 'every slider has an accessible name');
    pass('Loads with Profile, Surface Motif, Spout, Lid and View panels, no footer or legacy inspectors');

    // --- Slider: Enter-to-type and arrow keys update state and geometry
    const profile = section('Profile');
    const before = await bodySignature();
    await typeValue(profile, 'Wall Thickness', 5);
    assert.equal(await state('global.wallThickness'), 5);
    assert.notEqual(await bodySignature(), before, 'typed wall thickness regenerates the body');
    const segmentsSlider = profile.getByRole('slider', { name: 'Radial Segments', exact: true });
    await segmentsSlider.focus();
    await page.keyboard.press('ArrowRight');
    await afterUpdate();
    assert.equal(await state('global.radialSegments'), 104, 'arrow key steps by 8');
    assert.equal(await segmentsSlider.getAttribute('aria-valuenow'), '104');
    pass('Typed and arrow-key dial edits update state and the 3D body');

    // --- Segment motif: pick a segment, set a motif, geometry and preview follow
    const motif = await openSection('Surface Motif');
    await choose(motif, 'Segment', 'Segment 2');
    assert.equal(await state('ui.selectedSegmentId'), 'p3', 'picking a segment selects it on the canvas');
    assert.equal(await page.locator('#profileSvg .profile-segment-selected').count(), 1);
    const smooth = await bodySignature();
    await choose(motif, 'Motif', 'Vertical Lines');
    const points = await state('profile.points');
    assert.equal(points[3].motif.type, 'vertical');
    assert.equal(points[2].motif.type, 'none', 'other segments untouched');
    assert.notEqual(await bodySignature(), smooth, 'motif changes the body');
    assert.equal(await motif.getByRole('slider', { name: 'Line Count', exact: true }).count(), 1, 'type reveals its rows');
    assert.equal(await motif.getByRole('slider', { name: 'Pitch', exact: true }).count(), 0);
    await typeValue(motif, 'Line Count', 48);
    assert.equal((await state('profile.points'))[3].motif.count, 48);
    assert.equal(await page.locator('#motifStrip').isVisible(), true, 'unwrapped preview shows');
    assert.match(await page.locator('#motifStrip [data-motif-caption]').textContent(), /Segment 2 · Vertical Lines/);
    await choose(motif, 'Segment', 'Segment 1');
    assert.equal(await motif.getByRole('slider', { name: 'Line Count', exact: true }).count(), 0, 'segment 1 is smooth');
    assert.equal(await page.locator('#motifStrip').isVisible(), false);
    await page.locator('#btnUndo').click();
    await afterUpdate();
    assert.equal((await state('profile.points'))[3].motif.count, 32, 'undo restores the motif');
    await page.locator('#btnRedo').click();
    await afterUpdate();
    assert.equal((await state('profile.points'))[3].motif.count, 48);
    await closeSection('Surface Motif');
    pass('Segment switch scopes motif dials; motif edits regenerate, preview and undo');

    // --- Spout: enabling reveals its rows and pulls the rim
    const spout = await openSection('Spout');
    assert.equal(await spout.getByRole('slider', { name: 'Length', exact: true }).count(), 0, 'rows hidden while off');
    const noSpout = await bodySignature();
    await toggle(spout, 'Enabled', 'On');
    assert.equal(await state('spout.enabled'), true);
    assert.equal(await state('spout.segmentId'), 'p3', 'spout attaches to the selected segment');
    assert.equal(await spout.getByRole('slider', { name: 'Length', exact: true }).count(), 1, 'rows shown when on');
    await choose(spout, 'Segment', 'Segment 1');
    assert.equal(await state('spout.segmentId'), 'p2');
    const withSpout = await bodySignature();
    assert.notEqual(withSpout, noSpout, 'spout changes the body');
    await typeValue(spout, 'Length', 30);
    assert.equal(await state('spout.length'), 30);
    assert.notEqual(await bodySignature(), withSpout, 'spout length reshapes the body');
    await typeValue(spout, 'Tip Wall Thickness', 1.5);
    assert.equal(await state('spout.wallThickness'), 1.5);
    // Spout + motif on one wall fails export mesh validation (geometry, not UI): switch it off
    await toggle(spout, 'Enabled', 'Off');
    assert.equal(await state('spout.enabled'), false);
    assert.equal(await spout.getByRole('slider', { name: 'Length', exact: true }).count(), 0, 'rows hide again');
    assert.equal(await state('spout.segmentId'), 'p2', 'segment remembered');
    await closeSection('Spout');
    pass('Spout toggle reveals its rows; segment and length reshape the body');

    // --- Lid: enabling builds a lid; fit change swaps rows and geometry
    const lidSignature = () => page.evaluate(() => {
        const lid = window.vesselV3App.viewport.getSecondaryMesh('lid');
        if (!lid) return null;
        let sum = 0;
        lid.traverse((child) => {
            const position = child.geometry?.getAttribute('position');
            if (position) for (let i = 0; i < position.array.length; i += 1) sum += Math.abs(position.array[i]);
        });
        return sum.toFixed(3);
    });
    const lid = await openSection('Lid');
    assert.equal(await page.locator('#btnExportLidSTL').isHidden(), true, 'lid export hidden while off');
    await toggle(lid, 'Enabled', 'On');
    assert.equal(await state('lid.enabled'), true);
    const inset = await lidSignature();
    assert.ok(inset, 'lid mesh built');
    assert.equal(await lid.getByRole('slider', { name: 'Flange Depth', exact: true }).count(), 1);
    await choose(lid, 'Fit', 'Overcap');
    assert.equal(await state('lid.fit'), 'overcap');
    assert.equal(await lid.getByRole('slider', { name: 'Flange Depth', exact: true }).count(), 0, 'overcap hides flange depth');
    assert.notEqual(await lidSignature(), inset, 'fit change rebuilds the lid');
    await typeValue(lid, 'Knob Height', 16);
    assert.equal((await state('lid')).knob.height, 16);
    await choose(lid, 'Preview', 'Standalone');
    assert.equal(await state('ui.lidPreviewMode'), 'standalone');
    await closeSection('Lid');
    pass('Lid toggle builds a lid; fit, knob and preview dials apply');

    // --- Profile editor edits keep the dials in sync
    await page.locator('[data-tool="edit"]').click();
    assert.equal(await state('ui.tool'), 'edit');
    await choose(await openSection('Surface Motif'), 'Segment', 'Segment 1');
    await page.locator('#profileSvg circle.profile-motif-badge[data-segment-index="3"]').click();
    await afterUpdate();
    assert.equal(await state('ui.selectedSegmentId'), 'p3');
    assert.match(await selectText(section('Surface Motif'), 'Segment'), /Segment 2/, 'canvas segment pick drives the motif panel');
    await closeSection('Surface Motif');
    await choose(profile, 'Mode', 'Straight');
    assert.equal(await profile.getByRole('slider', { name: 'Corner Radius', exact: true }).count(), 0, 'no point selected');
    const anchor = page.locator('#profileSvg circle.profile-anchor[data-anchor-id="p2"]');
    const anchorBox = await anchor.boundingBox();
    await page.mouse.click(anchorBox.x + anchorBox.width / 2, anchorBox.y + anchorBox.height / 2);
    await afterUpdate();
    assert.equal(await state('ui.selectedPointId'), 'p2');
    await typeValue(profile, 'Corner Radius', 12);
    assert.equal((await state('profile.points'))[2].cornerRadius, 12, 'corner dial edits the canvas selection');
    const heightBefore = (await state('profile.points'))[3].h;
    const top = await page.locator('#profileSvg circle.profile-anchor[data-anchor-id="p3"]').boundingBox();
    await page.mouse.move(top.x + top.width / 2, top.y + top.height / 2);
    await page.mouse.down();
    await page.mouse.move(top.x + top.width / 2, top.y + top.height / 2 - 40, { steps: 5 });
    await page.mouse.up();
    await afterUpdate();
    const heightAfter = (await state('profile.points'))[3].h;
    assert.ok(heightAfter > heightBefore, `dragging the rim raises it (${heightBefore} → ${heightAfter})`);
    assert.equal(await page.locator('#profileHeight').textContent(), `${Math.round(heightAfter)} mm`);
    await page.keyboard.press('ControlOrMeta+z');
    await afterUpdate();
    assert.equal((await state('profile.points'))[3].h, heightBefore, 'undo reverts the canvas drag');
    assert.equal(await profile.getByRole('slider', { name: 'Wall Thickness', exact: true }).getAttribute('aria-valuenow'), '5');
    pass('Canvas segment/point picks and drags keep the dials, stats and undo in sync');

    // --- File menu: Save and both exports
    const fileItem = async (label) => {
        await page.locator('#btnFileMenu').click();
        await page.locator('#fileMenuList [role="menuitem"]', { hasText: label }).click();
    };
    await fileItem('Save');
    await page.locator('#saveModal').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#saveModal.dk-modal .dk-toggle-row #saveAsFile').count(), 1);
    await page.locator('#saveProjectName').fill('Dial Vessel');
    await page.locator('#btnConfirmSave').click();
    await page.locator('#saveModal').waitFor({ state: 'hidden' });
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('playground_ceramics_vessel_v3_projects')));
    assert.ok(saved.some(entry => entry.project?.name === 'Dial Vessel'), 'saved to the V3 project store');
    assert.equal(await page.locator('#projectName').textContent(), 'Dial Vessel');
    assert.equal(await page.locator('#unsavedIndicator').isHidden(), true);

    const [vesselDownload] = await Promise.all([page.waitForEvent('download'), fileItem('Export Vessel STL')]);
    assert.equal(vesselDownload.suggestedFilename(), 'Dial Vessel.stl');
    const [lidDownload] = await Promise.all([page.waitForEvent('download'), fileItem('Export Lid STL')]);
    assert.equal(lidDownload.suggestedFilename(), 'Dial Vessel - Lid.stl');
    await page.locator('#btnFileMenu').click();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#fileMenuList').isHidden(), true);

    await fileItem('New');
    await page.locator('#confirmModal').waitFor({ state: 'hidden' }).catch(() => {});
    assert.equal(await state('lid.enabled'), false, 'new project resets the lid');
    assert.equal(await profile.getByRole('slider', { name: 'Wall Thickness', exact: true }).getAttribute('aria-valuenow'), '3', 'dials follow a new project');
    assert.equal(await page.locator('#btnExportLidSTL').isHidden(), true);
    pass('File menu saves to the V3 store and exports vessel and lid STLs; New resets the dials');

    // --- Project name renames in place; Delete in the name never deletes points
    const pointCount = (await state('profile.points')).length;
    await page.locator('#projectName').click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('Renamed');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Enter');
    assert.equal((await state('profile.points')).length, pointCount, 'typing in the name leaves the profile alone');
    assert.equal(await state('project.name'), 'Rename');
    pass('Header name renames the project without triggering canvas shortcuts');

    // --- Parameters toggle persists across reload
    const panelToggle = page.locator('#btnTogglePanel');
    const panelBox = await page.locator('#parameterPanel').boundingBox();
    assert.ok(panelBox.x > 1440 / 2, 'parameters sit on the right');
    await panelToggle.click();
    assert.equal(await panelToggle.getAttribute('aria-pressed'), 'false');
    await page.locator('#parameterPanel').waitFor({ state: 'hidden' });
    await page.reload();
    await ready();
    assert.equal(await page.locator('#parameterPanel').isVisible(), false, 'hidden state is remembered');
    assert.equal(await page.evaluate(() => localStorage.getItem('vessel_v3_dials_visible')), '0');
    await panelToggle.click();
    await page.locator('#parameterPanel').waitFor({ state: 'visible' });
    pass('Parameters toggle hides the card and persists across reload');

    // --- Light mode follows <html data-mode>
    await page.evaluate(() => document.documentElement.setAttribute('data-mode', 'light'));
    await nextFrames();
    const light = await page.evaluate(() => ({
        dials: document.querySelector('.vessel-v3-dials').dataset.theme,
        header: getComputedStyle(document.querySelector('.dk-header')).backgroundColor,
        workspace: getComputedStyle(document.querySelector('.profile-workspace')).backgroundColor,
        ink: getComputedStyle(document.querySelector('.dk-header .app-title')).color
    }));
    assert.equal(light.dials, 'light');
    assert.equal(light.header, 'rgb(250, 250, 250)');
    assert.equal(light.workspace, 'rgb(250, 250, 250)');
    assert.equal(light.ink, 'rgb(0, 0, 0)');
    pass('Light mode switches the dials, header and profile workspace');

    assert.deepEqual(errors, [], 'No application runtime errors');
    await context.close();
} finally {
    await browser?.close();
    await server.close();
}
