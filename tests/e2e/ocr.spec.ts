import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { openTool, addFiles, runAndDownload, pick } from './ui';
import { TOOLS } from './routes';
import { fixturePath, type FixtureName } from '../helpers/fixtures';
import { imagePlacements, pageSizes, pageTexts } from '../helpers/pdf';

const utf8 = (b: Uint8Array) => new TextDecoder().decode(b);

async function ocr(page: Page, fixture: FixtureName, output: 'Searchable PDF' | 'Text (.txt)', language = 'English') {
  await openTool(page, TOOLS.ocr);
  await addFiles(page, [fixturePath(fixture)]);
  await pick(page, 'Language', language);
  await pick(page, 'Output', output);
  return runAndDownload(page, { timeout: 150_000 });
}

test.describe('WS3 OCR', () => {
  test.describe.configure({ timeout: 180_000 });

  test('T-OCR1 scanned.pdf to a searchable PDF: text has "quick brown fox", the page stays a raster image', async ({ page }) => {
    const out = await ocr(page, 'scanned.pdf', 'Searchable PDF');
    const [text] = await pageTexts(out.bytes);
    expect(text.toLowerCase()).toContain('quick brown fox');
    const [size] = await pageSizes(out.bytes);
    const images = (await imagePlacements(out.bytes, 0)).filter((p) => p.kind === 'image');
    expect(
      images.some((p) => p.width >= size.width * 0.9 && p.height >= size.height * 0.9),
      `full-page raster kept; placements ${JSON.stringify(images)}`,
    ).toBe(true);
  });

  test('T-OCR2 the txt output contains "lazy dog"', async ({ page }) => {
    const out = await ocr(page, 'scanned.pdf', 'Text (.txt)');
    expect(out.name).toMatch(/\.txt$/i);
    expect(utf8(out.bytes).toLowerCase()).toContain('lazy dog');
  });

  test('T-OCR3 zero requests after the file is added; the lang data was prefetched from this origin only', async ({ page, net, serverOrigin }) => {
    await openTool(page, TOOLS.ocr);
    const beforeFile = net.all();
    expect(
      beforeFile.some((r) => /eng\.traineddata/.test(r.url) && r.origin === serverOrigin),
      'eng.traineddata is fetched on page load, from the same origin',
    ).toBe(true);
    const mark = net.mark();
    await addFiles(page, [fixturePath('scanned.pdf')]);
    await pick(page, 'Output', 'Text (.txt)');
    await runAndDownload(page, { timeout: 150_000 });
    expect(net.requestsSince(mark), 'no request after the file was added').toEqual([]);
    expect(net.all().filter((r) => /jsdelivr|unpkg|cdn/i.test(r.url))).toEqual([]);
  });

  test('T-OCR4 Hindi: scanned-hi.pdf with hin gives text containing "नमस्ते"', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'chromium only');
    const out = await ocr(page, 'scanned-hi.pdf', 'Text (.txt)', 'Hindi');
    expect(utf8(out.bytes)).toContain('नमस्ते');
  });
});
