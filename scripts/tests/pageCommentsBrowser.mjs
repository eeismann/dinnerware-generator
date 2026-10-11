// Dev-only page comments: the layer mounts on every app page, pins attach to
// the clicked element, and notes round-trip through /api/page-comments.
// Uses the project's vite.config.js (which adds the API) with a temporary
// comments file, so the real feedback/page-comments.json is never touched.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const dir = await mkdtemp(join(tmpdir(), 'page-comments-'));
const file = join(dir, 'page-comments.json');
process.env.PAGE_COMMENTS_FILE = file;
const { createServer } = await import('vite');
const server = await createServer({ logLevel: 'error', server: { host: '127.0.0.1', port: 0, open: false } });
let browser;
const pass = (message) => console.log(`[PASS] ${message}`);
const readComments = async () => {
    try { return JSON.parse(await readFile(file, 'utf8')); } catch { return []; }
};
// The layer updates instantly and saves in the background: wait for the file
async function until(check, message) {
    for (let i = 0; i < 100; i++) {
        if (check(await readComments())) return;
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.fail(message);
}

const PAGES = [
    ['/index.html?ui=classic', '/'],
    ['/dashboard.html?ui=line', '/dashboard.html'],
    ['/vessel-generator/index.html?ui=line', '/vessel-generator/'],
    ['/vessel-v2-generator/index.html?ui=line', '/vessel-v2-generator/'],
    ['/vessel-v3-generator/index.html?ui=line', '/vessel-v3-generator/'],
    ['/handle-generator/index.html?ui=line', '/handle-generator/'],
    ['/cast-form-generator/index.html?ui=line', '/cast-form-generator/']
];

try {
    await server.listen();
    const base = `http://127.0.0.1:${server.httpServer.address().port}`;
    browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

    for (const [url, key] of PAGES) {
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(`${base}${url}`);
        await page.waitForSelector('[data-comment-layer] .pc-pill', { timeout: 30000 });
        await page.waitForTimeout(800);
        // Handle asks for a mug on first open
        const defaultMug = page.getByRole('button', { name: 'Use Default Mug' });
        if (await defaultMug.isVisible().catch(() => false)) await defaultMug.click();

        // Pin the mark/title in the top-left and write a note
        await page.keyboard.press('c');
        await page.locator('.pc-catcher').waitFor();
        await page.mouse.click(60, 24);
        const textarea = page.locator('.pc-card textarea');
        await textarea.fill(`Note on ${key}`);
        await textarea.press('ControlOrMeta+Enter');
        await page.locator('.pc-pin[data-pin]').first().waitFor();
        assert.equal(await page.locator('.pc-pill [data-list]').textContent(), '1');

        await until(all => all.some(comment => comment.page === key), `${key}: saved`);
        const saved = (await readComments()).filter(comment => comment.page === key);
        assert.equal(saved.length, 1, `${key}: saved once`);
        assert.equal(saved[0].text, `Note on ${key}`);
        assert.ok(saved[0].anchor.selector && saved[0].anchor.snippet, `${key}: anchored to an element`);
        assert.match(saved[0].at.viewport, /^1440x900$/);

        // Resolve from the pin, then reopen and delete
        await page.locator('.pc-pin[data-pin]').first().click();
        await page.locator('.pc-card [data-toggle]').click();
        assert.equal(await page.locator('.pc-pill [data-list]').textContent(), '0');
        await until(all => all.find(comment => comment.id === saved[0].id)?.status === 'resolved', `${key}: resolved`);
        await page.locator('.pc-pill [data-list]').click();
        await page.locator('.pc-list input[type="checkbox"]').check();
        await page.locator(`.pc-list [data-item="${saved[0].id}"]`).click();
        await page.locator('.pc-card [data-delete]').click();
        await until(all => !all.some(comment => comment.id === saved[0].id), `${key}: deleted`);

        assert.deepEqual(errors, [], `${key}: runtime errors`);
        pass(`${key}: pin, save, resolve and delete`);
        await page.close();
    }
    await context.close();
} finally {
    await browser?.close();
    await server.close();
    await rm(dir, { recursive: true, force: true });
}
