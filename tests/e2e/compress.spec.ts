import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { ui, openTool, addFiles, runAndDownload, pick } from './ui';
import { TOOLS } from './routes';
import { fixturePath, readFixture, type FixtureName } from '../helpers/fixtures';
import { openWithPdfjs, pageTexts } from '../helpers/pdf';

async function compress(page: Page, fixture: FixtureName, level: 'Light' | 'Recommended' | 'Strong') {
  await openTool(page, TOOLS.compress);
  await addFiles(page, [fixturePath(fixture)]);
  await pick(page, 'Compression level', level);
  return runAndDownload(page, { timeout: 120_000 });
}

test.describe('WS3 Compress', () => {
  test('T-CMP1 photos-hi-res with Recommended is at least 50% smaller and opens with 5 pages @smoke', async ({ page, net }) => {
    test.setTimeout(180_000);
    await openTool(page, TOOLS.compress);
    const mark = net.mark();
    await addFiles(page, [fixturePath('.gen/photos-hi-res.pdf')]);
    await pick(page, 'Compression level', 'Recommended');
    const out = await runAndDownload(page, { timeout: 150_000 });
    const input = readFixture('.gen/photos-hi-res.pdf');
    expect(out.bytes.length, `${input.length} -> ${out.bytes.length} bytes`).toBeLessThanOrEqual(input.length * 0.5);
    const doc = await openWithPdfjs(out.bytes);
    expect(doc.numPages).toBe(5);
    expect(net.requestsSince(mark), 'no request after the file was added').toEqual([]);
  });

  test('T-CMP2 text-3p returns the original bytes and says "already optimised"', async ({ page }) => {
    const out = await compress(page, 'text-3p.pdf', 'Recommended');
    const input = readFixture('text-3p.pdf');
    expect(out.bytes.length).toBeLessThanOrEqual(input.length);
    expect(Buffer.from(out.bytes).equals(Buffer.from(input)), 'the original bytes are returned').toBe(true);
    await expect(ui.resultMessage(page)).toContainText(/already optimi[sz]ed/i);
  });

  test('T-CMP3 Strong <= Recommended <= Light on photos-hi-res', async ({ page }) => {
    test.setTimeout(420_000);
    const sizes: Record<string, number> = {};
    for (const level of ['Light', 'Recommended', 'Strong'] as const) {
      sizes[level] = (await compress(page, '.gen/photos-hi-res.pdf', level)).bytes.length;
    }
    expect(sizes.Strong, JSON.stringify(sizes)).toBeLessThanOrEqual(sizes.Recommended);
    expect(sizes.Recommended, JSON.stringify(sizes)).toBeLessThanOrEqual(sizes.Light);
  });

  test('T-CMP4 compressing with-image.pdf keeps the heading text extractable', async ({ page }) => {
    const out = await compress(page, 'with-image.pdf', 'Strong');
    const [text] = await pageTexts(out.bytes);
    expect(text).toContain('WITH-IMAGE-HEADING');
  });

  test('T-CMP5 the result shows before and after sizes and the percentage saved', async ({ page }) => {
    test.setTimeout(180_000);
    await compress(page, '.gen/photos-hi-res.pdf', 'Recommended');
    const sizes = ui.resultSizes(page);
    await expect(sizes).toBeVisible();
    const text = (await sizes.textContent()) ?? '';
    expect(text.match(/\d+(?:[.,]\d+)?\s?(?:B|KB|MB|GB)\b/gi) ?? [], text).toHaveLength(2);
    expect(text).toMatch(/\d+(?:[.,]\d+)?\s?%/);
  });
});
