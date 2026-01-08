import { test, expect } from './fixtures';
import { ui, openTool, addFiles, runAndDownload, dragOnto } from './ui';
import { ORGANIZE_PRESETS, TOOLS } from './routes';
import { fixturePath } from '../helpers/fixtures';
import { pageRotations, pageTexts } from '../helpers/pdf';

// Organize shows one thumb per page; each thumb has "Rotate" and "Delete" buttons
// (accessible names starting with those words).

test.describe('WS2 Organize', () => {
  test('T-ORG1 rotating page 2 by 90 degrees sets /Rotate 90 on page 2 only', async ({ page, net }) => {
    await openTool(page, TOOLS.organize);
    const mark = net.mark();
    await addFiles(page, [fixturePath('text-3p.pdf')]);
    await expect(ui.thumbs(page)).toHaveCount(3);
    await ui.thumbs(page).nth(1).getByRole('button', { name: /^rotate/i }).first().click();
    const out = await runAndDownload(page);
    expect(await pageRotations(out.bytes)).toEqual([0, 90, 0]);
    expect(net.requestsSince(mark), 'no request after the file was added').toEqual([]);
  });

  test('T-ORG2 deleting pages 1 and 3 of text-3p leaves 1 page with PAGE-2-ALPHA', async ({ page }) => {
    await openTool(page, TOOLS.organize);
    await addFiles(page, [fixturePath('text-3p.pdf')]);
    await expect(ui.thumbs(page)).toHaveCount(3);
    await ui.thumbs(page).nth(2).getByRole('button', { name: /^delete/i }).click();
    await ui.thumbs(page).nth(0).getByRole('button', { name: /^delete/i }).click();
    await expect(ui.thumbs(page)).toHaveCount(1);
    const out = await runAndDownload(page);
    const texts = await pageTexts(out.bytes);
    expect(texts).toHaveLength(1);
    expect(texts[0]).toContain('PAGE-2-ALPHA');
  });

  test('T-ORG3 drag-reordering gives the new page order in the text', async ({ page }) => {
    await openTool(page, TOOLS.organize);
    await addFiles(page, [fixturePath('text-3p.pdf')]);
    await expect(ui.thumbs(page)).toHaveCount(3);
    await dragOnto(page, ui.thumbs(page).nth(2), ui.thumbs(page).nth(0));
    const out = await runAndDownload(page);
    const texts = await pageTexts(out.bytes);
    expect(texts.map((t) => /PAGE-(\d)-ALPHA/.exec(t)?.[1])).toEqual(['3', '1', '2']);
  });

  test('T-ORG4 /rotate-pdf opens Organize in rotate mode', async ({ page }) => {
    await openTool(page, ORGANIZE_PRESETS.rotate);
    await addFiles(page, [fixturePath('text-3p.pdf')]);
    await expect(ui.thumbs(page)).toHaveCount(3);
    await expect(page.getByRole('button', { name: /rotate all/i })).toBeVisible();
  });
});
