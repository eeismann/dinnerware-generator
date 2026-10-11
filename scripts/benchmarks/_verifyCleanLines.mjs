import { chromium } from '@playwright/test';

const state = {
    globalParameters: {
        wallPatternType: 'diagonal',
        wallPatternDepth: 1.5,
        wallPatternRelief: 'raised',
        wallPatternCount: 43,
        wallPatternLineWidth: 60,
        wallPatternProfile: 'square',
        wallPatternAngle: 40,
        wallPatternDirection: 'right'
    }
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 2000, height: 1400 } });
await page.addInitScript((data) => {
    localStorage.setItem('dinnerware_current_project', JSON.stringify({
        state: data,
        timestamp: new Date().toISOString()
    }));
}, state);

await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' });
await page.waitForTimeout(6000); // meshes generate + first render

await page.screenshot({ path: '/tmp/dinnerware-after-default.png' });

// Zoom toward the scene center to inspect ridge quality up close
const canvas = page.locator('canvas').first();
const box = await canvas.boundingBox();
const cx = box.x + box.width * 0.605;
const cy = box.y + box.height * 0.5;
await page.mouse.move(cx, cy);
for (let i = 0; i < 9; i++) {
    await page.mouse.wheel(0, -200);
    await page.waitForTimeout(150);
}
await page.waitForTimeout(1200);
await page.screenshot({ path: '/tmp/dinnerware-after-zoom.png' });

await browser.close();
console.log('screenshots written');
