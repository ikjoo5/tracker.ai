import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const base = process.env.SITE_URL || 'http://127.0.0.1:4173/cafe.ai/';
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
  await page.locator('img').evaluateAll(images => images.forEach(image => image.loading = 'eager'));
  await page.waitForFunction(() => [...document.images].every(i => i.complete && i.naturalWidth > 0));
  assert.ok(await page.locator('img[src$="bbox-complex.png"]').count());
  assert.ok((await page.locator('body').innerText()).includes('생성 이미지 · 실제 추론 결과 아님'));
  const original = page.getByRole('button', { name: '원본', exact: true });
  await original.click();
  assert.ok((await page.locator('.lp-camera-detection img').getAttribute('src')).endsWith('retail-frame.jpg'));
  await page.getByRole('button', { name: '실제 추론', exact: true }).click();
  assert.ok((await page.locator('.lp-camera-detection img').getAttribute('src')).endsWith('retail-bbox.jpg'));
  await page.getByRole('tab', { name: /체류 시각화/ }).click();
  assert.ok((await page.getByRole('tabpanel').innerText()).includes('가우시안'));
  await page.getByRole('tab', { name: /이번 영상의 실제 관찰 결과/ }).click();
  assert.ok((await page.locator('.lp-spatial-figure img').getAttribute('src')).endsWith('dwell-3d.png'));
  await page.getByRole('tab', { name: /확장 매장 시각화 예시/ }).click();
  const csvDownload = page.waitForEvent('download');
  await page.getByRole('link', { name: 'CSV 다운로드', exact: true }).click();
  assert.ok((await csvDownload).suggestedFilename().endsWith('.csv'));
  const video = page.getByLabel('실제 생활용품 매장 사람 탐지와 익명 동선 데모 영상');
  await video.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector('video')?.readyState >= 1);
  assert.equal(Math.round(await video.evaluate(v => v.duration)), 52);
  await video.evaluate(async v => { v.muted = true; v.currentTime = 8; await v.play(); });
  await page.waitForTimeout(400); await video.evaluate(v => v.pause());
  assert.ok(await video.evaluate(v => v.currentTime > 8));
  await page.screenshot({ path: 'artifacts/project-site-desktop.png', fullPage: true });
  await page.getByRole('link', { name: /분석 워크스페이스 열기/ }).click();
  await page.getByTestId('floor-heatmap-canvas').waitFor({ timeout: 30000 });
  assert.ok((await page.locator('body').innerText()).includes('저장된 실제 관찰 결과'));
  await page.getByRole('button', { name: '수집 데이터', exact: true }).click();
  assert.ok(await page.locator('tbody tr').count() > 0);
  await page.getByRole('link', { name: '프로젝트 소개로 돌아가기', exact: true }).click();
  await page.getByRole('heading', { level: 1 }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '메뉴 열기', exact: true }).click();
  await page.getByRole('navigation', { name: '프로젝트 메뉴' }).getByRole('link', { name: '파이프라인', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: '메뉴 열기', exact: true }).getAttribute('aria-expanded'), 'false');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2));
  await page.screenshot({ path: 'artifacts/project-site-mobile.png', fullPage: true });
  assert.deepEqual(apiRequests, [], 'Public deployment must never require the local API');
  assert.deepEqual(errors, []); assert.deepEqual(failed, []);
  console.log(JSON.stringify({ status: 'passed', subpath: new URL(base).pathname, loadedImages: true, conceptDisclosure: true,
    actualComparison: true, pipeline: true, spatialToggle: true, csv: true, videoSeconds: 52,
    prerecordedWorkspace: true, noApiRequests: true, mobileOverflow: false, pageErrors: errors }));
} finally { await browser.close(); }
