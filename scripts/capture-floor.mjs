import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';

// Re-render recorded real detections; this capture does not rerun the detector.
const result = JSON.parse(fs.readFileSync('artifacts/store-ai-real-analysis.json', 'utf8'));
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1150 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const hash = value => createHash('sha256').update(value).digest('hex');
const frameHash = async () => hash(await page.getByTestId('floor-heatmap-canvas').evaluate(c => c.toDataURL()));
try {
  await page.route('**/api/demo', route => route.fulfill({ json: result }));
  await page.goto(process.env.BASE_URL || 'http://127.0.0.1:5173/#/workspace');
  await page.getByTestId('floor-heatmap-canvas').waitFor({ timeout: 30000 });
  await page.waitForTimeout(1000);
  assert.ok((await page.locator('.floor-observation-stats').innerText()).includes('296'));
  const iso = await frameHash();
  const top = page.getByRole('button', { name: 'Top view', exact: true });
  await top.click(); await page.waitForTimeout(400);
  assert.equal(await top.getAttribute('aria-pressed'), 'true');
  assert.notEqual(await frameHash(), iso, 'Top view must change the rendered camera');
  const shelves = page.getByRole('button', { name: 'Show shelves', exact: true });
  const withShelves = await frameHash();
  await shelves.click(); await page.waitForTimeout(300);
  assert.equal(await shelves.getAttribute('aria-pressed'), 'false');
  assert.notEqual(await frameHash(), withShelves, 'Shelf visibility must change the graphic');
  await page.screenshot({ path: 'artifacts/store-ai-floor-top.png', fullPage: true });
  const allStats = await page.locator('.floor-observation-stats').innerText();
  await page.getByRole('combobox', { name: '3D observation interval', exact: true }).selectOption('first');
  await page.waitForTimeout(300);
  assert.notEqual(await page.locator('.floor-observation-stats').innerText(), allStats, 'Time filtering must recompute observations');
  await page.getByRole('combobox', { name: '3D observation interval', exact: true }).selectOption('all');
  await shelves.click();
  await page.getByRole('button', { name: 'Reset view', exact: true }).click();
  await page.waitForTimeout(500);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save 3D heatmap PNG', exact: true }).click();
  const download = await downloadPromise;
  await download.saveAs('artifacts/store-ai-3d-dwell-heatmap.png');
  assert.ok(fs.statSync('artifacts/store-ai-3d-dwell-heatmap.png').size > 50000);
  await page.screenshot({ path: 'artifacts/store-ai-3d-dashboard.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(400);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), 'No mobile document overflow');
  const bounds = await page.getByTestId('floor-heatmap-canvas').boundingBox();
  assert.ok(bounds && bounds.width < 390, '3D canvas must resize to its actual mobile host');
  await page.screenshot({ path: 'artifacts/store-ai-3d-mobile.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ status: 'passed', source: 'recorded real Intel detections', camera: true, shelves: true,
    timeFilter: true, pngExport: true, mobileOverflow: false, pageErrors: errors }));
} finally { await browser.close(); }
