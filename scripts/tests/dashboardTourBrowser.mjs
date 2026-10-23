// Dashboard intro tour and app list, in a real browser with its own Vite port
// and a fresh browser context (never touches the user's projects).
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const pass = (msg) => console.log(`[PASS] ${msg}`);
const server = await createServer({ configFile: false, logLevel: 'error',
    server: { host: '127.0.0.1', port: 0, open: false } });
let browser;
try {
    await server.listen();
    const base = `http://127.0.0.1:${server.httpServer.address().port}`;
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));

    // First visit: the tour opens on its own
    await page.goto(`${base}/dashboard.html`);
    const tour = page.locator('#introTourModal');
    await tour.waitFor({ state: 'visible' });
    const title = () => page.locator('#tourTitle').textContent();
    assert.equal(await title(), 'Welcome to Playground Ceramics');
    assert.equal(await page.locator('#tourBack').textContent(), 'Skip');
    pass('first visit opens the intro tour');

    // Next through every step; arrow keys and dots move too
    const titles = [await title()];
    for (let i = 0; i < 4; i++) {
        await page.locator('#tourNext').click();
        titles.push(await title());
    }
    assert.deepEqual(titles, ['Welcome to Playground Ceramics', 'Start with a form', 'Add handles and molds', 'Inside a generator', 'Your projects']);
    assert.equal(await page.locator('#tourNext').textContent(), 'Create a project');
    await page.keyboard.press('ArrowLeft');
    assert.equal(await title(), 'Inside a generator');
    await page.locator('.tour-dot').nth(1).click();
    assert.equal(await title(), 'Start with a form');
    const forms = await page.locator('.tour-cols b').allTextContents();
    assert.deepEqual(forms, ['Dinnerware Set', 'Vessel', 'Bezier Vessel']);
    pass('five steps, Next/Back, arrow keys and dots; the form step lists Bezier Vessel');

    // The last step hands off to the New Project chooser
    await page.locator('.tour-dot').nth(4).click();
    await page.locator('#tourNext').click();
    await tour.waitFor({ state: 'hidden' });
    await page.locator('#appSelectModal').waitFor({ state: 'visible' });
    const apps = await page.locator('#appSelectModal .app-select-title').allTextContents();
    assert.ok(apps.includes('Bezier Vessel'), 'Bezier Vessel offered');
    assert.ok(!apps.some(a => /V2|V3/.test(a)), `no V2/V3 names in the chooser (${apps.join(', ')})`);
    assert.equal(await page.locator('#appSelectModal [data-app="vessel-v3"]').count(), 0);
    await page.locator('#btnCancelAppSelect').click();
    pass(`"Create a project" opens the chooser: ${apps.join(', ')}`);

    // Seen: not shown again; Settings → Intro Tour and the empty state reopen it
    await page.reload();
    await page.locator('#projectsGrid').waitFor({ state: 'attached' });
    await page.waitForTimeout(300);
    assert.equal(await tour.isVisible(), false, 'tour stays closed once seen');
    await page.locator('#btnSettings').click();
    await page.locator('#btnIntroTour').click();
    await tour.waitFor({ state: 'visible' });
    assert.equal(await title(), 'Welcome to Playground Ceramics');
    await page.keyboard.press('Escape');
    await tour.waitFor({ state: 'hidden' });
    await page.locator('#btnEmptyTour').click();
    await tour.waitFor({ state: 'visible' });
    await page.locator('#tourBack').click();
    await tour.waitFor({ state: 'hidden' });
    pass('once seen it stays closed; Settings → Intro Tour, the empty state link, Escape and Skip work');

    // Light mode styling follows the DialKit tokens
    await page.locator('#btnSettings').click();
    await page.locator('#btnModeToggle').click();
    await page.keyboard.press('Escape');
    await page.locator('#btnEmptyTour').click();
    const bg = await page.locator('.tour-content').evaluate(el => getComputedStyle(el).backgroundColor);
    assert.notEqual(bg, 'rgb(33, 33, 33)', 'light mode dialog background');
    await page.keyboard.press('Escape');
    pass(`tour follows light mode (${bg})`);

    // Vessel V3 is retired: its page sends you back to the dashboard
    await page.goto(`${base}/vessel-v3-generator/index.html`);
    await page.waitForURL('**/dashboard.html');
    pass('the Vessel V3 page redirects to the dashboard');

    assert.deepEqual(errors, [], 'no page errors');
    pass('no page errors');
    console.log('\nDashboard tour browser workflow: all checks passed.');
} finally {
    await browser?.close();
    await server.close();
}
