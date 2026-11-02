import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const base = process.env.SITE_URL || 'http://127.0.0.1:4173/tracker.ai/';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
const apiRequests = [], errors = [], failed = [];
page.on('request', r => { if (new URL(r.url()).pathname.startsWith('/api/')) apiRequests.push(r.url()); });
page.on('pageerror', e => errors.push(e.message));
page.on('response', r => { if (r.url().startsWith(base) && r.status() >= 400) failed.push([r.status(), r.url()]); });
fs.mkdirSync('artifacts', { recursive: true });
try {
  await page.goto(base);
  await page.getByRole('heading', { level: 1 }).waitFor();
  assert.ok((await page.title()).includes('tracker.ai'));
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  assert.ok(!/[\uac00-\ud7a3]/.test(await page.locator('body').innerText()), 'Public copy must be English');
  await page.locator('img').evaluateAll(images => images.forEach(image => image.loading = 'eager'));
  await page.waitForFunction(() => [...document.images].every(i => i.complete && i.naturalWidth > 0));
  assert.ok(await page.locator('img[src$="bbox-complex.png"]').count());
  assert.ok((await page.locator('body').innerText()).includes('Not model inference'));
  const original = page.getByRole('button', { name: 'Raw', exact: true });
  await original.click();
  assert.ok((await page.locator('.lp-camera-detection img').getAttribute('src')).endsWith('retail-frame.jpg'));
  await page.getByRole('button', { name: 'Model output', exact: true }).click();
  assert.ok((await page.locator('.lp-camera-detection img').getAttribute('src')).endsWith('retail-bbox.jpg'));
  await page.getByRole('tab', { name: /Dwell visualization/ }).click();
  assert.ok((await page.getByRole('tabpanel').innerText()).includes('Gaussian'));
  await page.getByRole('tab', { name: /Actual observations/ }).click();
  assert.ok((await page.locator('.lp-spatial-figure img').getAttribute('src')).endsWith('dwell-3d.png'));
  await page.getByRole('tab', { name: /Concept store view/ }).click();
  const csvDownload = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download CSV', exact: true }).click();
  assert.ok((await csvDownload).suggestedFilename().endsWith('.csv'));
  const video = page.getByLabel('Real-store person detection and anonymous trajectory demo');
  await video.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector('video')?.readyState >= 1);
  assert.equal(Math.round(await video.evaluate(v => v.duration)), 52);
  await video.evaluate(async v => { v.muted = true; v.currentTime = 8; await v.play(); });
  await page.waitForTimeout(400); await video.evaluate(v => v.pause());
  assert.ok(await video.evaluate(v => v.currentTime > 8));
  await page.screenshot({ path: 'artifacts/project-site-desktop.png', fullPage: true });
  await page.getByRole('link', { name: /Open analysis workspace/ }).click();
  await page.getByTestId('floor-heatmap-canvas').waitFor({ timeout: 30000 });
  assert.ok((await page.locator('body').innerText()).includes('recorded observations from real footage'));
  await page.getByRole('button', { name: 'Collected data', exact: true }).click();
  assert.ok(await page.locator('tbody tr').count() > 0);
  await page.getByRole('link', { name: 'Back to the project', exact: true }).click();
  await page.getByRole('heading', { level: 1 }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open menu', exact: true }).click();
  await page.getByRole('navigation', { name: 'Project navigation' }).getByRole('link', { name: 'Pipeline', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Open menu', exact: true }).getAttribute('aria-expanded'), 'false');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2));
  await page.screenshot({ path: 'artifacts/project-site-mobile.png', fullPage: true });
  assert.deepEqual(apiRequests, [], 'Public deployment must never require the local API');
  assert.deepEqual(errors, []); assert.deepEqual(failed, []);
  console.log(JSON.stringify({ status: 'passed', subpath: new URL(base).pathname, loadedImages: true, conceptDisclosure: true,
    actualComparison: true, pipeline: true, spatialToggle: true, csv: true, videoSeconds: 52,
    prerecordedWorkspace: true, noApiRequests: true, mobileOverflow: false, pageErrors: errors }));
} finally { await browser.close(); }
