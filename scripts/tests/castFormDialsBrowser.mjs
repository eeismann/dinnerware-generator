// Real-browser regression for the Cast Form Generator's DialKit interface:
// start card, source import, dial edits driving mold regeneration,
// conditional case-box rows, File menu save/export, the parameters toggle
// and light mode. Starts its own Vite server and a software-WebGL Chromium.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { viewDock } from './viewDockHelpers.mjs';

const server = await createServer({ configFile: false, logLevel: 'error',
    server: { host: '127.0.0.1', port: 0, open: false } });
let browser;
const pass = (message) => console.log(`[PASS] ${message}`);
const FIXTURE = 'test-files/Angle_mug.stl';

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

    const dials = page.locator('.cast-form-dials');
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
    const toggle = (scope, label) => scope.locator('.dialkit-labeled-control')
        .filter({ hasText: new RegExp(`^${label}OffOn$`) });
    const state = (path) => page.evaluate(async (statePath) => {
        const { castFormState } = await import('/scripts/castForm/state/castFormState.js');
        return castFormState.getState(statePath);
    }, path);
    const moldReady = () => page.waitForFunction(() =>
        document.getElementById('viewport')?.dataset.validationReady === 'true', null, { timeout: 120000 });
    const generatedAt = () => state('output.lastGenerated');
    // Record the mold parameters behind every committed generation
    const recordCommits = () => page.evaluate(async () => {
        const { castFormState } = await import('/scripts/castForm/state/castFormState.js');
        window.__moldCommits = [];
        castFormState.subscribe('output', (output) => {
            if (output.lastGenerated) window.__moldCommits.push(structuredClone(castFormState.getState('params.mold')));
        });
    });
    const generatedWith = (key, value) => page.waitForFunction(([moldKey, expected]) =>
        window.__moldCommits.some(mold => mold[moldKey] === expected)
            && document.getElementById('viewport').dataset.validationReady === 'true',
    [key, value], { timeout: 120000 });

    // --- Empty start: start card, no legend, panels render
    await page.goto(`${base}/cast-form-generator/index.html`);
    await dials.locator('.dialkit-folder-section').first().waitFor();
    await recordCommits();
    assert.equal(await page.locator('#emptyState').isVisible(), true, 'start card on an empty project');
    assert.equal(await page.locator('#partLegend .legend-item').count(), 0, 'no part legend before a source');
    assert.match(await page.locator('#inputStatus').textContent(), /No model loaded/);
    for (const name of ['Mold', 'Polymer Case Box']) {
        assert.equal(await section(name).count(), 1, `${name} panel`);
    }
    assert.equal(await section('View').count(), 0, 'view controls moved to the view dock');
    assert.equal(await page.locator('.dk-view-dock .st-viewcube').count(), 1, 'view dock cube');
    for (const label of ['Plaster Wall Thickness', 'Spare Height', 'Wall Sections']) {
        assert.equal(await section('Mold').getByRole('slider', { name: label, exact: true }).count(), 1, label);
    }
    assert.equal(await page.locator('footer').count(), 0, 'footer removed');
    assert.equal(await page.locator('#settingsPanel, .ln-root, .st-shell').count(), 0, 'no settings/Line/Studio shells');
    const unlabelled = await page.evaluate(() => [...document.querySelectorAll('.cast-form-dials [role="slider"]')]
        .filter(el => !el.getAttribute('aria-label')).length);
    assert.equal(unlabelled, 0, 'every slider has an accessible name');
    pass('Empty project: start card, Mold / Polymer Case Box panels, view dock, no footer or alternate shells');

    // --- Source import through the start card's file picker
    const [chooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.locator('#emptyImportBtn').click()
    ]);
    await chooser.setFiles(FIXTURE);
    await moldReady();
    assert.equal(await page.locator('#emptyState').isVisible(), false, 'start card leaves once loaded');
    assert.match(await page.locator('#inputStatus .dk-source-name').textContent(), /Angle_mug\.stl/);
    assert.equal(await page.locator('#partLegend .legend-item').count(), 4, 'foot + 3 walls in the legend');
    assert.match(await page.locator('#materialVolumeTotal').textContent(), /mL$/);
    pass('STL import from the start card generates the mold (legend, source card, polymer volume)');

    // --- Keyboard slider edit regenerates the mold
    const mold = await openSection('Mold');
    await mold.getByRole('slider', { name: 'Spare Height', exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await state('params.mold.spareHeight'), 11, 'arrow key steps the dial');
    await generatedWith('spareHeight', 11);
    pass('Keyboard slider step updates state and regenerates the mold');

    // --- Enter-to-type sets an exact value; wall count rebuilds parts
    await mold.getByRole('slider', { name: 'Wall Sections', exact: true }).focus();
    await page.keyboard.press('Enter');
    const input = mold.getByRole('textbox', { name: 'Wall Sections value', exact: true });
    await input.fill('2');
    await input.press('Enter');
    assert.equal(await state('params.mold.wallCount'), 2);
    await generatedWith('wallCount', 2);
    assert.equal(await page.locator('#partLegend .legend-item').count(), 3, 'legend follows the new wall count');
    const dock = viewDock(page);
    await dock.open();
    const parts = await dock.openGroup('Parts');
    const partRow = (label) => parts.locator('.dk-view-row')
        .filter({ has: page.locator('.dk-row-label', { hasText: new RegExp(`^${label}$`) }) });
    assert.equal(await partRow('Wall 3').count(), 0, 'parts list follows the wall count');
    assert.equal(await partRow('Wall 2').count(), 1);
    pass('Enter-to-type sets Wall Sections exactly; mold, legend and Parts rebuild');

    // --- A drag previews nothing and regenerates once on release
    const commitsBeforeDrag = await page.evaluate(() => window.__moldCommits.length);
    const plaster = await mold.getByRole('slider', { name: 'Plaster Wall Thickness', exact: true }).boundingBox();
    const midY = plaster.y + plaster.height / 2;
    await page.mouse.move(plaster.x + 8, midY);
    await page.mouse.down();
    await page.mouse.move(plaster.x + plaster.width * 0.3, midY, { steps: 6 });
    await page.mouse.move(plaster.x + plaster.width * 0.5, midY, { steps: 6 });
    await page.waitForTimeout(600);
    const dragged = await state('params.mold.plasterWallThickness');
    assert.ok(dragged > 20, 'dragging edits the value live');
    assert.equal(await page.evaluate(() => window.__moldCommits.length), commitsBeforeDrag, 'no regeneration mid-drag');
    await page.mouse.up();
    await generatedWith('plasterWallThickness', dragged);
    pass('Slider drag edits live and regenerates the mold once on release');

    // --- Part visibility survives regeneration
    await dock.setToggle('Foot', false);
    assert.equal(await page.evaluate(() => window.castFormApp.viewport.moldGroup.children.find(m => m.name === 'foot').visible), false);
    pass('Parts toggles hide a mold part');

    // --- Conditional rows: case box params appear with the preview
    const caseBox = await openSection('Polymer Case Box');
    assert.equal(await caseBox.getByRole('slider', { name: 'Side Gap', exact: true }).count(), 0, 'params hidden until previewing');
    await toggle(caseBox, 'Preview Case Box').getByRole('radio', { name: 'On' }).click();
    await caseBox.getByRole('slider', { name: 'Side Gap', exact: true }).waitFor();
    assert.equal(await state('view.caseBoxPreview.enabled'), true);
    assert.equal(await page.locator('#caseBoxBanner').isVisible(), true, 'preview banner');
    assert.equal(await page.locator('#caseBoxReadout').isVisible(), true, 'box readout');
    const generatedBeforeBox = await generatedAt();
    await caseBox.getByRole('slider', { name: 'Side Gap', exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await state('params.caseBox.gap'), 11, 'case box dial edits state live');
    await page.waitForTimeout(500);
    assert.equal(await generatedAt(), generatedBeforeBox, 'case box edits never regenerate the mold');
    await toggle(caseBox, 'Preview Case Box').getByRole('radio', { name: 'Off' }).click();
    await caseBox.getByRole('slider', { name: 'Side Gap', exact: true }).waitFor({ state: 'detached' });
    pass('Preview Case Box reveals the box rows; box edits are live without regenerating');

    // --- View mode swaps the explosion slider for the section angle
    assert.equal(await dock.row('Explosion Distance').isVisible(), true);
    await dock.setSlider('Explosion Distance', 80);
    assert.equal(await state('view.explosionDistance'), 80, 'dock slider writes view state');
    await dock.choose('View Mode', 'crossSection');
    assert.equal(await state('view.mode'), 'crossSection');
    await dock.row('Section Angle').waitFor();
    assert.equal(await dock.row('Explosion Distance').isVisible(), false);
    await dock.close();
    await dock.face('Top');
    await page.waitForFunction(() => {
        const { camera, controls } = window.castFormApp.viewport;
        return camera.position.clone().sub(controls.target).normalize().y > 0.99;
    });
    pass('View dock: View Mode swaps Explosion Distance for Section Angle; cube snaps to Top');

    // --- File menu: Save stores the project, Export downloads STLs
    await page.locator('#btnFileMenu').click();
    await page.locator('#saveBtn').click();
    await page.locator('#saveModal').waitFor({ state: 'visible' });
    await page.locator('#saveProjectName').fill('DialKit Mold');
    await page.locator('#saveModalConfirm').click();
    await page.locator('#saveModal').waitFor({ state: 'hidden' });
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('playground_ceramics_castform_projects')));
    assert.equal(saved.at(-1).project.name, 'DialKit Mold');
    assert.equal(saved.at(-1).params.mold.wallCount, 2);
    assert.equal(await page.locator('#projectName').textContent(), 'DialKit Mold');
    pass('File → Save… stores the project with the dial values');

    await page.locator('#btnFileMenu').click();
    await page.locator('#exportBtn').click();
    await page.locator('#exportModal').waitFor({ state: 'visible' });
    assert.ok(await page.locator('#exportModal .export-file-item').count() >= 4, 'shells and case boxes listed');
    await page.locator('#selectNoneExport').click();
    await page.locator('#exportModal .dk-check[data-part="foot"]').check();
    const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 180000 }),
        page.locator('#exportIndividual').click()
    ]);
    assert.match(download.suggestedFilename(), /Shell_Foot\.stl$/);
    const stl = await readFile(await download.path());
    assert.ok(stl.length > 1000, 'exported STL has geometry');
    await page.locator('#exportModal').waitFor({ state: 'hidden', timeout: 60000 });
    pass('File → Export… downloads the selected STL');

    // --- Open Saved restores the project and syncs the dials
    await page.locator('#btnFileMenu').click();
    await page.locator('#newBtn').click();
    await page.locator('#emptyState').waitFor({ state: 'visible' });
    assert.equal(await state('params.mold.wallCount'), 3, 'new project resets');
    await page.locator('#btnFileMenu').click();
    await page.locator('#openSavedBtn').click();
    await page.locator('#loadModal .project-item', { hasText: 'DialKit Mold' }).click();
    await moldReady();
    assert.equal(await state('params.mold.wallCount'), 2);
    await page.waitForFunction(() => document.querySelector('.cast-form-dials [role="slider"][aria-label="Wall Sections"]')
        ?.getAttribute('aria-valuenow') === '2');
    pass('File → New resets, Open Saved… restores and the dials follow');

    // --- Parameters toggle persists across reload
    const panelToggle = page.locator('#btnTogglePanel');
    const panelBox = await page.locator('#parameterPanel').boundingBox();
    assert.ok(panelBox.x > 1440 / 2, 'parameters sit on the right');
    await panelToggle.click();
    assert.equal(await panelToggle.getAttribute('aria-pressed'), 'false');
    await page.locator('#parameterPanel').waitFor({ state: 'hidden' });
    await page.reload();
    await dials.locator('.dialkit-folder-section').first().waitFor({ state: 'attached' });
    assert.equal(await page.locator('#parameterPanel').isVisible(), false, 'hidden state is remembered');
    await panelToggle.click();
    await page.locator('#parameterPanel').waitFor({ state: 'visible' });
    pass('Parameters toggle hides the card and is remembered across reloads');

    assert.deepEqual(errors, [], 'No application runtime errors');

    // --- Light mode + URL source (validation STL), no errors
    const light = await context.newPage();
    const lightErrors = [];
    light.on('pageerror', error => lightErrors.push(error.message));
    await light.addInitScript(() => localStorage.setItem('playground-ceramics-mode', 'light'));
    await light.goto(`${base}/cast-form-generator/index.html?devStl=/${FIXTURE}&wallCount=4`);
    await light.waitForFunction(() => document.getElementById('viewport')?.dataset.validationReady === 'true',
        null, { timeout: 120000 });
    assert.equal(await light.evaluate(() => document.documentElement.dataset.mode), 'light');
    assert.equal(await light.locator('.cast-form-dials').getAttribute('data-theme'), 'light');
    const colors = await light.evaluate(() => ({
        card: getComputedStyle(document.getElementById('parameterPanel')).backgroundColor,
        header: getComputedStyle(document.querySelector('.dk-header')).backgroundColor
    }));
    assert.equal(colors.card, 'rgb(250, 250, 250)', 'light parameter card');
    assert.equal(colors.header, 'rgb(250, 250, 250)', 'light header');
    assert.equal(await light.locator('#partLegend .legend-item').count(), 5, 'URL wall count reaches the dials and mold');
    assert.equal(await light.locator('.cast-form-dials [role="slider"][aria-label="Wall Sections"]').getAttribute('aria-valuenow'), '4');
    assert.deepEqual(lightErrors, [], 'Light mode runtime errors');
    pass('Light mode with a URL source: light DialKit card and header, dials synced, no errors');

    await context.close();
} finally {
    await browser?.close();
    await server.close();
}
