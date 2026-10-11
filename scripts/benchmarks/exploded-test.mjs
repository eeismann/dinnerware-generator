import { chromium } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCE_STL = path.join(ROOT, '.playwright-cli/Untitled-mug.stl');
const OUT = path.join(ROOT, '.playwright-cli/exploded-test');
import fs from 'fs';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: false, slowMo: 400 });
const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
page.on('console', msg => { if (msg.type() === 'error') console.log(`[error] ${msg.text()}`); });

await page.goto('http://localhost:3001/cast-form-generator/', { waitUntil: 'networkidle' });
await page.locator('input[type="file"]').setInputFiles(SOURCE_STL);

console.log('Polling for mold geometry...');
const start = Date.now();
for (let i = 0; i < 60; i++) {
  await page.waitForTimeout(1000);
  const count = await page.evaluate(() => window.castFormApp?.viewport?.moldGroup?.children.length ?? -1);
  console.log(`  ${i+1}s: moldGroup children = ${count}`);
  if (count > 0) { console.log('  ✓ Geometry ready!'); break; }
}

// Take top view, switch to assembly to trigger subscription, then exploded
await page.locator('.preset-btn[data-camera="top"]').click();
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(OUT, '01-top-assembly.png') });

// Switch assembly → exploded to trigger subscription (default is already exploded)
await page.locator('#viewMenuBtn').click();
await page.waitForTimeout(300);
await page.locator('.dropdown-item[data-view="assembly"]').click();
await page.waitForTimeout(600);
await page.screenshot({ path: path.join(OUT, '02-top-assembly-explicit.png') });

await page.locator('#viewMenuBtn').click();
await page.waitForTimeout(300);
await page.locator('.dropdown-item[data-view="exploded"]').click();
await page.waitForTimeout(300);
// Set explosion distance
await page.locator('#explosionDistance').evaluate(el => { el.value = 80; el.dispatchEvent(new Event('input')); });
await page.waitForTimeout(800);
await page.screenshot({ path: path.join(OUT, '03-top-exploded-80mm.png') });

await page.locator('.preset-btn[data-camera="threeQuarter"]').click();
await page.waitForTimeout(600);
await page.screenshot({ path: path.join(OUT, '04-3q-exploded-80mm.png') });

const sceneInfo = await page.evaluate(() => {
  const mg = window.castFormApp?.viewport?.moldGroup;
  return mg?.children.map(c => ({ name: c.name, pos: {x: +c.position.x.toFixed(1), y: +c.position.y.toFixed(1), z: +c.position.z.toFixed(1)} }));
});
console.log('Mesh positions:', JSON.stringify(sceneInfo, null, 2));

await browser.close();
