import { test, expect } from './fixtures';
import { openTool, addFiles, runAndDownload, pick, fillOption, check } from './ui';
import { TOOLS } from './routes';
import { fixturePath, readFixture } from '../helpers/fixtures';
import { pageTexts } from '../helpers/pdf';

/** Tokens in `after` that are not in `before` (multiset difference). */
function addedTokens(before: string, after: string): string[] {
  const pool = before.split(/\s+/).filter(Boolean);
  const added: string[] = [];
  for (const t of after.split(/\s+/).filter(Boolean)) {
    const i = pool.indexOf(t);
    if (i >= 0) pool.splice(i, 1);
    else added.push(t);
  }
  return added;
}

test.describe('WS2 Page numbers', () => {
  test('T-PGN1 "Page 1 of N" at bottom centre: page 2 reads "Page 2 of 3"', async ({ page, net }) => {
    await openTool(page, TOOLS.pageNumbers);
    const mark = net.mark();
    await addFiles(page, [fixturePath('text-3p.pdf')]);
    await pick(page, 'Format', 'Page 1 of N');
    await pick(page, 'Position', /bottom cent(re|er)/i);
    const out = await runAndDownload(page);
    const texts = await pageTexts(out.bytes);
    expect(texts[0]).toContain('Page 1 of 3');
    expect(texts[1]).toContain('Page 2 of 3');
    expect(texts[2]).toContain('Page 3 of 3');
    expect(net.requestsSince(mark), 'no request after the file was added').toEqual([]);
  });

  test('T-PGN2 start number 5 with skip-first: page 1 has no number and page 2 has "6"', async ({ page }) => {
    await openTool(page, TOOLS.pageNumbers);
    await addFiles(page, [fixturePath('text-3p.pdf')]);
    await pick(page, 'Format', '1');
    await fillOption(page, 'Start number', '5');
    await check(page, /skip (the )?first page/i);
    const out = await runAndDownload(page);
    const before = await pageTexts(readFixture('text-3p.pdf'));
    const after = await pageTexts(out.bytes);
    expect(addedTokens(before[0], after[0])).toEqual([]);
    expect(addedTokens(before[1], after[1])).toEqual(['6']);
    expect(addedTokens(before[2], after[2])).toEqual(['7']);
  });

  test('T-PGN3 page range 2-3 numbers only pages 2 and 3', async ({ page }) => {
    await openTool(page, TOOLS.pageNumbers);
    await addFiles(page, [fixturePath('text-3p.pdf')]);
    await pick(page, 'Format', '1');
    await fillOption(page, 'Page range', '2-3');
    const out = await runAndDownload(page);
    const before = await pageTexts(readFixture('text-3p.pdf'));
    const after = await pageTexts(out.bytes);
    expect(addedTokens(before[0], after[0])).toEqual([]);
    expect(addedTokens(before[1], after[1])).toEqual(['2']);
    expect(addedTokens(before[2], after[2])).toEqual(['3']);
  });
});
