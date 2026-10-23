// Isolated real-browser workflow regression. Starts its own ephemeral Vite port
// and browser context; never reads or modifies the user's browser projects.
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { getDefaultVesselV2State } from '../vesselV2/state/vesselV2Defaults.js';
import { getDefaultVesselV3State } from '../vesselV3/state/vesselV3Defaults.js';
import { ProjectFileFormat } from '../storage/fileFormat.js';

const server = await createServer({ configFile: false, logLevel: 'error',
    server: { host: '127.0.0.1', port: 0, open: false } });
let browser;
try {
    await server.listen();
    const base = `http://127.0.0.1:${server.httpServer.address().port}`;
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ deviceScaleFactor: 2 });
    // The dashboard intro tour opens on a first visit; it has its own suite (dashboardTourBrowser.mjs)
    await context.addInitScript(() => localStorage.setItem('pc_intro_tour_seen_v2', '1'));
    const page = await context.newPage();
    const errors = [];
    const dialogs = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.accept(); });
    await page.goto(`${base}/index.html`);
    // Wall Thickness dial in the DialKit "Set Style" panel; Enter opens number entry
    const thickness = page.locator('.dinnerware-dials').getByRole('slider', { name: 'Wall Thickness', exact: true }).first();
    const setThickness = async (value) => {
        await thickness.focus();
        await page.keyboard.press('Enter');
        const input = page.locator('.dinnerware-dials').getByRole('textbox', { name: 'Wall Thickness value', exact: true }).first();
        await input.fill(String(value));
        await input.press('Enter');
    };
    await setThickness(2.5);
    const bufferSize = () => page.locator('#viewport canvas').evaluate(canvas => [canvas.width, canvas.height]);
    const originalSize = await bufferSize();
    const save = async (file = false) => {
        await page.locator('#btnFileMenu').click();
        await page.locator('#btnSaveProject').click();
        await page.locator('#saveProjectName').fill('Browser recovery');
        await page.locator('#saveAsFile').setChecked(file);
        await page.locator('#btnConfirmSave').click();
    };
    await save();
    await page.locator('#saveModal').waitFor({ state: 'hidden' });
    assert.deepEqual(await bufferSize(), originalSize, 'Save preserves DPR-scaled viewport dimensions');
    const projectId = await page.evaluate(() => localStorage.getItem('dinnerware_editing_project_id'));
    assert.ok(projectId);
    await setThickness(7);
    await page.waitForFunction(id => JSON.parse(localStorage.getItem(`dinnerware_draft:${id}`) || 'null')?.state.globalParameters.wallThickness === 7, projectId);
    // Simulate another tab selecting a different project in the shared storage.
    await page.evaluate(() => localStorage.setItem('dinnerware_editing_project_id', 'another-tab'));
    await page.reload();
    assert.equal(await thickness.getAttribute('aria-valuenow'), '7', 'Real reload restores draft over explicit save');
    assert.equal(new URL(page.url()).searchParams.get('project'), projectId, 'Reload stays with this tab\'s project identity');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('playground_ceramics_projects'))[0].state.globalParameters.wallThickness), 2.5);
    console.log('[PASS] Real save/reload keeps newer draft and preserves DPR=2 canvas size');

    await page.evaluate(() => {
        window.originalStorageWrite = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, value) {
            if (key === 'playground_ceramics_projects') throw new DOMException('Injected write failure', 'QuotaExceededError');
            return window.originalStorageWrite.call(this, key, value);
        };
    });
    await save();
    assert.ok(dialogs.some(message => message.includes('Could not save')));
    assert.equal(await page.evaluate(async () => (await import('/scripts/state/projectState.js')).stateManager.getState('project.isDirty')), true);
    assert.equal(await page.locator('#saveModal').isVisible(), true, 'Failed save stays open');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('playground_ceramics_projects'))[0].state.globalParameters.wallThickness), 2.5);
    await page.evaluate(() => { Storage.prototype.setItem = window.originalStorageWrite; });
    await page.locator('#saveAsFile').check();
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#btnConfirmSave').click();
    const download = await downloadPromise;
    const chunks = [];
    for await (const chunk of await download.createReadStream()) chunks.push(chunk);
    const ownFile = Buffer.concat(chunks);
    console.log('[PASS] Failed save reports failure, keeps dirty state, preserves saved data, and can retry');

    await page.goto(`${base}/dashboard.html?ui=classic`);
    const importFile = async (name, buffer) => {
        const chooser = page.waitForEvent('filechooser');
        await page.locator('#btnImportProject').click();
        await (await chooser).setFiles({ name, mimeType: 'application/json', buffer });
    };
    await importFile('own-export.json', ownFile);
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('playground_ceramics_projects')).length === 2);
    // Vessel V3 is retired: its files are refused and nothing is stored
    const v3File = ProjectFileFormat.serialize({ projectName: 'V3 browser import', state: getDefaultVesselV3State() }, 'vessel-v3');
    await importFile('v3.json', Buffer.from(JSON.stringify(v3File)));
    for (let i = 0; i < 50 && !dialogs.some(d => d.includes('no longer supported')); i++) await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => localStorage.getItem('playground_ceramics_vessel_v3_projects')), null, 'V3 import refused');
    const v2File = ProjectFileFormat.serialize({ projectName: 'Bezier browser import', state: getDefaultVesselV2State() }, 'vessel-v2');
    await importFile('v2.json', Buffer.from(JSON.stringify(v2File)));
    const v2Card = page.locator('.project-card').filter({ has: page.getByRole('heading', { name: 'Bezier browser import', exact: true }) });
    await v2Card.hover();
    await v2Card.getByTitle('Duplicate project').click();
    await page.getByRole('heading', { name: 'Bezier browser import (Copy)', exact: true }).waitFor();
    assert.deepEqual(await page.evaluate(() => ({
        dinnerware: JSON.parse(localStorage.getItem('playground_ceramics_projects')).length,
        v2: JSON.parse(localStorage.getItem('playground_ceramics_vessel_v2_projects')).length
    })), { dinnerware: 2, v2: 2 });
    assert.ok(dialogs.some(d => d.includes('Vessel V3 projects are no longer supported')), 'V3 import explains the refusal');
    await v2Card.getByTitle('Open project').click();
    await page.waitForURL('**/vessel-v2-generator/index.html?*');
    await page.waitForFunction(() => document.getElementById('projectName')?.textContent === 'Bezier browser import');
    console.log('[PASS] Import picker accepts own export and Bezier Vessel, refuses Vessel V3; duplication preserves type and opens in matching editor');
    assert.deepEqual(errors, [], 'No application runtime errors');
    await context.close();
} finally {
    await browser?.close();
    await server.close();
}
