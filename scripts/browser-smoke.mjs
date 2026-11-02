import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

// Run with API + Vite active: node scripts/browser-smoke.mjs
// Optional: SMOKE_VIDEO=/path/to/video.mp4 also verifies a real file upload.
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await mkdir('artifacts', { recursive: true });
try {
  const defaultJobReply = page.waitForResponse(r => r.url().endsWith('/api/demo') && r.request().method() === 'POST');
  await page.goto(process.env.BASE_URL || 'http://127.0.0.1:5173/#/workspace');
  const defaultJob = await (await defaultJobReply).json();
  await page.getByRole('button', { name: '결과 내보내기' }).waitFor();
  await page.waitForFunction(() => !Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('결과 내보내기'))?.disabled, undefined, { timeout: 120000 });
  const defaultResult = await (await page.request.get(new URL(`/api/analyses/${defaultJob.id}`, page.url()).href)).json();
  assert.equal(defaultResult.source.kind, 'public-retail');
  assert.equal(defaultResult.source.detector, 'opencv-mobilenet-ssd-person');
  assert.equal(defaultResult.source.provenance.license, 'CC BY 4.0');
  await page.getByRole('button', { name: '영상 분석', exact: true }).click();
  assert.equal(await page.locator('video').count(), 1);
  const video = page.locator('video');
  await video.evaluate(el => { el.currentTime = 22; });
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: '3D 히트맵 보기', exact: true }).click();
  await page.getByRole('button', { name: '3D 히트맵 PNG 저장', exact: true }).waitFor();
  await page.screenshot({ path: 'artifacts/store-ai-dashboard.png', fullPage: true });
  await page.getByRole('button', { name: '수집 데이터', exact: true }).click();
  assert.ok(await page.locator('tbody tr').count() > 0, 'Real store clip must contain collected detections');
  await page.getByRole('button', { name: '결과 내보내기' }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('link', { name: '감지 기록 CSV' }).click();
  const download = await downloaded;
  assert.ok(download.suggestedFilename().endsWith('.csv'));
  await page.locator('select[aria-label="구역 필터"]').selectOption('produce');
  assert.ok(await page.locator('tbody tr').count() > 0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'artifacts/store-ai-mobile.png', fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), 'Mobile document overflow');
  await page.setViewportSize({ width: 1440, height: 1050 });
  if (process.env.SMOKE_VIDEO) {
    await page.getByRole('button', { name: '영상 업로드', exact: true }).click();
    await page.locator('input[type=file]').setInputFiles(process.env.SMOKE_VIDEO);
    const uploadReply = page.waitForResponse(r => r.url().endsWith('/api/analyses') && r.request().method() === 'POST');
    await page.getByRole('button', { name: '관찰 시작하기', exact: true }).click();
    const uploadJob = await (await uploadReply).json();
    await page.getByRole('dialog').waitFor({ state: 'hidden', timeout: 120000 });
    const uploaded = await (await page.request.get(new URL(`/api/analyses/${uploadJob.id}`, page.url()).href)).json();
    assert.equal(uploaded.source.detector, 'opencv-mobilenet-ssd-person');
    assert.equal(uploaded.status, 'completed');
    await page.getByRole('button', { name: '수집 데이터', exact: true }).click();
    await page.locator('select[aria-label="구역 필터"]').selectOption('all');
    assert.ok(await page.locator('tbody tr').count() > 0, 'Pretrained model must yield detections');
  }
  assert.deepEqual(errors, [], 'Browser page errors');
  console.log(JSON.stringify({ status: 'passed', publicRetailDemo: true, bboxTo3DHeatmap: true, dataFilter: true, csvDownload: true, mobileOverflow: false, realUpload: Boolean(process.env.SMOKE_VIDEO), browserErrors: errors }));
} finally {
  await browser.close();
}
