/**
 * Cast Form Generator visual + structural verification script.
 *
 * Workflow:
 * 1. Start dev server
 * 2. Navigate to cast-form-generator
 * 3. Upload a source STL
 * 4. Wait for 3D preview to render
 * 5. Take viewport screenshots from multiple angles
 * 6. Export each mold part as STL
 * 7. Analyze exported STLs (triangle count, bounds, manifold check)
 * 8. Save report + screenshots to .playwright-cli/verify-<timestamp>/
 */

import { chromium } from '@playwright/test';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const OUT_DIR = path.join(ROOT, '.playwright-cli', `verify-${new Date().toISOString().replace(/[:.]/g, '-')}`);
const SOURCE_STL = path.join(ROOT, '.playwright-cli', 'Untitled-mug.stl');
const PORT = 3001;

fs.mkdirSync(OUT_DIR, { recursive: true });

// ── STL analysis ─────────────────────────────────────────────────────────────

function analyzeSTL(filePath) {
  const buf = fs.readFileSync(filePath);
  const stat = fs.statSync(filePath);

  // Binary STL: first 80 bytes header, then uint32 triangle count
  const isBinary = buf.length > 84 && buf.readUInt32LE(80) === (buf.length - 84) / 50;

  if (!isBinary) {
    // ASCII STL — count facets
    const text = buf.toString('utf8');
    const triangles = (text.match(/facet normal/g) || []).length;
    return { format: 'ascii', triangles, fileSizeKB: Math.round(stat.size / 1024), manifoldHint: 'n/a (ascii)' };
  }

  const triangles = buf.readUInt32LE(80);

  // Collect all vertices, check for degenerate triangles
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  let degenerate = 0;

  for (let i = 0; i < triangles; i++) {
    const base = 84 + i * 50;
    const verts = [];
    for (let v = 0; v < 3; v++) {
      const vBase = base + 12 + v * 12;
      const x = buf.readFloatLE(vBase);
      const y = buf.readFloatLE(vBase + 4);
      const z = buf.readFloatLE(vBase + 8);
      verts.push([x, y, z]);
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    // Degenerate: two or more vertices identical
    const [a, b, c] = verts;
    if ((a[0]===b[0]&&a[1]===b[1]&&a[2]===b[2]) ||
        (b[0]===c[0]&&b[1]===c[1]&&b[2]===c[2]) ||
        (a[0]===c[0]&&a[1]===c[1]&&a[2]===c[2])) {
      degenerate++;
    }
  }

  const dims = {
    x: +((maxX - minX).toFixed(2)),
    y: +((maxY - minY).toFixed(2)),
    z: +((maxZ - minZ).toFixed(2)),
  };

  return {
    format: 'binary',
    triangles,
    degenerate,
    fileSizeKB: Math.round(stat.size / 1024),
    bounds: { min: [+minX.toFixed(2), +minY.toFixed(2), +minZ.toFixed(2)], max: [+maxX.toFixed(2), +maxY.toFixed(2), +maxZ.toFixed(2)] },
    dimensions_mm: dims,
    manifoldHint: degenerate === 0 ? 'pass (no degenerate tris)' : `WARN: ${degenerate} degenerate triangles`,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  console.log('Starting dev server...');
  // lsof exits non-zero when nothing listens on the port — treat as "no server".
  let server = '';
  try {
    server = execSync(`lsof -ti:${PORT}`, { encoding: 'utf8' }).trim();
  } catch {
    server = '';
  }
  let serverProc = null;
  if (!server) {
    const { spawn } = await import('child_process');
    serverProc = spawn('npm', ['run', 'dev'], { cwd: ROOT, stdio: 'pipe', detached: true });
    await new Promise(r => setTimeout(r, 3000));
  } else {
    console.log(`Dev server already running on :${PORT}`);
  }

  const browser = await chromium.launch({ headless: false, slowMo: 600 });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  // Capture console errors
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', err => errors.push(err.message));

  // Capture STL files written via the Vite /api/downloads/ route.
  // The app POSTs each export blob to the dev server (which writes it to
  // ~/Downloads) and only falls back to an <a download> click when that route
  // is unavailable — so page.on('download') alone never fires under `npm run dev`.
  const savedDownloadPaths = [];
  page.on('response', async (resp) => {
    if (!resp.url().includes('/api/downloads/')) return;
    try {
      const payload = await resp.json();
      if (payload?.ok && payload.path) savedDownloadPaths.push(payload.path);
    } catch {}
  });

  try {
    // ── 1. Load the cast form generator ──────────────────────────────────────
    console.log('Navigating to cast-form-generator...');
    await page.goto(`http://localhost:${PORT}/cast-form-generator/`, { waitUntil: 'networkidle' });
    await page.screenshot({ path: path.join(OUT_DIR, '01-loaded.png') });

    // ── 2. Upload source STL ──────────────────────────────────────────────────
    console.log('Uploading source STL...');
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(SOURCE_STL);
    // Wait for geometry to process (spinner gone or canvas updated)
    await page.waitForTimeout(4000);
    await page.screenshot({ path: path.join(OUT_DIR, '02-after-upload.png') });

    // ── 3. Wait for mold generation to complete ───────────────────────────────
    console.log('Waiting for mold generation...');
    try {
      await page.waitForSelector('.loading-overlay:not(.hidden)', { timeout: 3000 }).catch(() => {});
      await page.waitForSelector('.loading-overlay.hidden', { timeout: 30000 }).catch(() => {});
    } catch {}
    await page.waitForTimeout(2000);

    // Count legend items to confirm parts were generated
    const legendItems = await page.locator('.legend-item').count();
    console.log(`  Legend shows ${legendItems} mold parts`);
    const legendLabels = await page.locator('.legend-label').allTextContents();
    console.log(`  Parts: ${legendLabels.join(', ')}`);

    // ── 4. Screenshots: Exploded view + camera angles ─────────────────────────
    // Switch to exploded view first
    await page.locator('#viewMenuBtn').click();
    await page.waitForTimeout(300);
    await page.locator('.dropdown-item[data-view="exploded"]').click();
    await page.waitForTimeout(500);

    const cameras = ['front', 'side', 'threeQuarter', 'top'];
    const cameraLabels = ['Front', 'Side', '3q', 'Top']; // '3q' not '3/4' — avoids creating a subdir
    for (const [idx, cam] of cameras.entries()) {
      await page.locator(`.preset-btn[data-camera="${cam}"]`).click();
      await page.waitForTimeout(700);
      await page.screenshot({ path: path.join(OUT_DIR, `03-exploded-${cameraLabels[idx]}.png`) });
      console.log(`  Screenshot: Exploded ${cameraLabels[idx]}`);
    }

    // Assembly view
    await page.locator('#viewMenuBtn').click();
    await page.waitForTimeout(300);
    await page.locator('.dropdown-item[data-view="assembly"]').click();
    await page.waitForTimeout(500);
    await page.locator(`.preset-btn[data-camera="threeQuarter"]`).click();
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(OUT_DIR, '04-assembly-3q.png') });
    console.log('  Screenshot: Assembly 3/4');

    // Cross section view
    await page.locator('#viewMenuBtn').click();
    await page.waitForTimeout(300);
    await page.locator('.dropdown-item[data-view="crossSection"]').click();
    await page.waitForTimeout(500);
    await page.locator(`.preset-btn[data-camera="front"]`).click();
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(OUT_DIR, '05-crossSection-front.png') });
    console.log('  Screenshot: Cross Section front');

    // ── 5. Export all STL parts ───────────────────────────────────────────────
    console.log('Exporting STL parts...');

    // Fallback capture for the <a download> path (file:// or route unavailable).
    const downloads = [];
    page.on('download', d => downloads.push(d));

    // Open the export modal from the header Export button.
    await page.locator('#exportBtn').click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT_DIR, '06-export-panel.png') });
    console.log('  Screenshot: Export panel');

    // "Download Selected" (#exportIndividual) exports one STL per selected part.
    // All checkboxes are checked by default (shells + case boxes).
    await page.locator('#exportIndividual').click();

    // Export regenerates at export quality first (several seconds), then fires
    // one /api/downloads/ POST per part and closes the modal on success — wait
    // for the modal to close rather than a fixed delay.
    await page.locator('#exportModal').waitFor({ state: 'hidden', timeout: 120000 }).catch(() => {});
    await page.waitForTimeout(1500);

    // Save any browser-download fallbacks directly into the output dir.
    for (const dl of downloads) {
      const savePath = path.join(OUT_DIR, dl.suggestedFilename());
      await dl.saveAs(savePath);
      savedDownloadPaths.push(savePath);
      console.log(`  Downloaded (browser): ${dl.suggestedFilename()}`);
    }

    // Copy route-saved files (written to ~/Downloads) into the output dir so the
    // report is self-contained and we analyze exactly what this run produced.
    for (const src of savedDownloadPaths) {
      if (path.dirname(src) === OUT_DIR) continue; // browser fallback, already here
      if (!fs.existsSync(src)) continue;
      fs.copyFileSync(src, path.join(OUT_DIR, path.basename(src)));
      console.log(`  Exported: ${path.basename(src)}`);
    }

    await page.screenshot({ path: path.join(OUT_DIR, '07-final.png') });

  } finally {
    await browser.close();
    if (serverProc) serverProc.kill();
  }

  // ── 6. Analyze the STLs exported by THIS run ─────────────────────────────
  console.log('\n── STL Analysis ──────────────────────────────────────');
  const stlsToCheck = fs.readdirSync(OUT_DIR)
    .filter(f => f.endsWith('.stl'))
    .map(f => path.join(OUT_DIR, f))
    .filter(f => fs.existsSync(f));

  if (stlsToCheck.length === 0) {
    console.log('  WARNING: no STL files were exported this run — export step may be broken.');
  }

  const analyses = {};
  for (const stl of stlsToCheck) {
    const name = path.basename(stl);
    analyses[name] = analyzeSTL(stl);
    console.log(`\n${name}:`);
    console.log(JSON.stringify(analyses[name], null, 2));
  }

  // ── 7. Report ─────────────────────────────────────────────────────────────
  const report = {
    timestamp: new Date().toISOString(),
    outputDir: OUT_DIR,
    exportedFiles: stlsToCheck.map(f => path.basename(f)),
    consoleErrors: errors,
    stlAnalysis: analyses,
  };
  fs.writeFileSync(path.join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2));

  console.log(`\n✓ Output saved to: ${OUT_DIR}`);
  console.log(`  Console errors: ${errors.length}`);
  if (errors.length) errors.forEach(e => console.log('  ERR:', e));

  return report;
}

run().catch(err => { console.error(err); process.exit(1); });
