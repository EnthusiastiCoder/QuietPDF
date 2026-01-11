import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { ui, openTool, addFiles, runAndDownload, pick, fillOption, check, pdfPointToScreen } from './ui';
import { TOOLS } from './routes';
import { fixturePath, readFixture } from '../helpers/fixtures';
import {
  annotationCount,
  everythingSearchable,
  findTextBoxes,
  hasXmpMetadata,
  infoDict,
  pageSizes,
  pageTexts,
  sampleRasterPage,
} from '../helpers/pdf';

// Redact contract:
//   "Redact mode" offers "Search" and "Draw boxes".
//   Search: fill "Search text", press "Find matches"; each match becomes a box.
//   Draw boxes: drag a rectangle on a page canvas.
//   "Keep the rest searchable" is a checkbox (OCR text layer on redacted pages).

const SSN = '123-45-6789';

async function searchRedact(page: Page, query: string, opts: { keepSearchable?: boolean } = {}) {
  await openTool(page, TOOLS.redact);
  await addFiles(page, [fixturePath('secret.pdf')]);
  await pick(page, 'Redact mode', 'Search');
  await fillOption(page, 'Search text', query);
  await page.getByRole('button', { name: 'Find matches' }).click();
  if (opts.keepSearchable) await check(page, /keep the rest searchable/i);
  return runAndDownload(page, { timeout: opts.keepSearchable ? 150_000 : 60_000 });
}

test.describe('WS3 Redact', () => {
  test('T-RED1 search-to-redact the SSN: no trace of it in the text or in any decompressed stream', async ({ page, net }) => {
    await openTool(page, TOOLS.redact);
    const mark = net.mark();
    await addFiles(page, [fixturePath('secret.pdf')]);
    await pick(page, 'Redact mode', 'Search');
    await fillOption(page, 'Search text', SSN);
    await page.getByRole('button', { name: 'Find matches' }).click();
    const out = await runAndDownload(page);

    const [page1] = await pageTexts(out.bytes);
    expect(page1).not.toContain(SSN);
    expect(page1).not.toContain('John');
    expect(page1).not.toContain('SSN');

    // the helper does find it in the input, so its absence in the output is meaningful
    expect(await everythingSearchable(readFixture('secret.pdf'))).toContain(SSN);
    expect(await everythingSearchable(out.bytes)).not.toContain(SSN);
    expect(net.requestsSince(mark), 'no request after the file was added').toEqual([]);
  });

  test('T-RED2 page 2 (no boxes) keeps "Nothing secret" as real text', async ({ page }) => {
    const out = await searchRedact(page, SSN);
    const texts = await pageTexts(out.bytes);
    expect(texts).toHaveLength(2);
    expect(texts[1]).toContain('Nothing secret');
  });

  test('T-RED3 the output has no Info Author, no XMP metadata and no annotations on page 1', async ({ page }) => {
    const out = await searchRedact(page, SSN);
    const input = readFixture('secret.pdf');
    // preconditions on the fixture, so the assertions below prove removal
    expect((await infoDict(input)).Author).toBe('Jane');
    expect(await hasXmpMetadata(input)).toBe(true);
    expect(await annotationCount(input, 0)).toBeGreaterThan(0);

    expect((await infoDict(out.bytes)).Author).toBeUndefined();
    expect(await hasXmpMetadata(out.bytes)).toBe(false);
    expect(await annotationCount(out.bytes, 0)).toBe(0);
  });

  test('T-RED4 a manual box over "Public line" removes it; the area renders black', async ({ page }) => {
    await openTool(page, TOOLS.redact);
    const input = readFixture('secret.pdf');
    const [box] = await findTextBoxes(input, 1, 'Public line');
    expect(box, '"Public line" is on page 1 of the fixture').toBeDefined();
    const [size] = await pageSizes(input);
    await addFiles(page, [fixturePath('secret.pdf')]);
    await pick(page, 'Redact mode', 'Draw boxes');
    const canvas = ui.pageCanvas(page, 1);
    await expect(canvas).toBeVisible();
    const from = await pdfPointToScreen(canvas, size, box.x - 4, box.y + box.height + 4);
    const to = await pdfPointToScreen(canvas, size, box.x + box.width + 4, box.y - 4);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 10 });
    await page.mouse.up();
    const out = await runAndDownload(page);

    const [page1] = await pageTexts(out.bytes);
    expect(page1).not.toContain('Public line');
    const rgb = await sampleRasterPage(out.bytes, 0, box.x + box.width / 2, box.y + box.height / 2);
    expect(rgb.every((c) => c < 20), `sampled RGB ${rgb}`).toBe(true);
  });

  test('T-RED5 "keep the rest searchable" keeps "Public line" as text but not the SSN', async ({ page }) => {
    test.setTimeout(180_000);
    const out = await searchRedact(page, SSN, { keepSearchable: true });
    const [page1] = await pageTexts(out.bytes);
    expect(page1).toContain('Public line');
    expect(page1).not.toContain(SSN);
  });
});
