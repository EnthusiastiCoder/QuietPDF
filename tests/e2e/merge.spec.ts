import { test, expect } from './fixtures';
import { ui, openTool, addFiles, runAndDownload, dragOnto } from './ui';
import { TOOLS } from './routes';
import { fixturePath } from '../helpers/fixtures';
import { pageCount, pageTexts } from '../helpers/pdf';

test.describe('WS2 Merge', () => {
  test('T-MRG1 text-3p + text-10p give 13 pages; page 1 has PAGE-1-ALPHA, page 4 has P1 @smoke', async ({ page, net }) => {
    await openTool(page, TOOLS.merge);
    const mark = net.mark();
    await addFiles(page, [fixturePath('text-3p.pdf'), fixturePath('text-10p.pdf')]);
    await expect(ui.thumbs(page)).toHaveCount(2);
    const out = await runAndDownload(page);
    expect(await pageCount(out.bytes)).toBe(13);
    const texts = await pageTexts(out.bytes);
    expect(texts[0]).toContain('PAGE-1-ALPHA');
    expect(texts[3]).toMatch(/\bP1\b/);
    expect(net.requestsSince(mark), 'no request after the files were added').toEqual([]);
  });

  test('T-MRG2 reordering the files puts text-10p first', async ({ page }) => {
    await openTool(page, TOOLS.merge);
    await addFiles(page, [fixturePath('text-3p.pdf'), fixturePath('text-10p.pdf')]);
    await expect(ui.thumbs(page)).toHaveCount(2);
    await dragOnto(page, ui.thumbs(page).nth(1), ui.thumbs(page).nth(0));
    const out = await runAndDownload(page);
    const texts = await pageTexts(out.bytes);
    expect(texts).toHaveLength(13);
    expect(texts[0]).toMatch(/\bP1\b/);
    expect(texts[9]).toMatch(/\bP10\b/);
    expect(texts[10]).toContain('PAGE-1-ALPHA');
  });
});
