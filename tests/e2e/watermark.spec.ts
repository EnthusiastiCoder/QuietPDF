import { test, expect } from './fixtures';
import { openTool, addFiles, runAndDownload, pick, fillOption } from './ui';
import { TOOLS } from './routes';
import { fixturePath } from '../helpers/fixtures';
import { imagePlacements, pageAlphas, pageTexts } from '../helpers/pdf';

test.describe('WS2 Watermark', () => {
  test('T-WMK1 "CONFIDENTIAL" at 30% opacity, 45 degrees, is on every page with an ExtGState alpha of 0.3', async ({ page, net }) => {
    await openTool(page, TOOLS.watermark);
    const mark = net.mark();
    await addFiles(page, [fixturePath('text-3p.pdf')]);
    await pick(page, 'Watermark type', 'Text');
    await fillOption(page, 'Watermark text', 'CONFIDENTIAL');
    await fillOption(page, /^opacity/i, '30');
    await fillOption(page, /^rotation/i, '45');
    const out = await runAndDownload(page);
    const texts = await pageTexts(out.bytes);
    expect(texts).toHaveLength(3);
    for (let i = 0; i < 3; i++) {
      expect(texts[i], `page ${i + 1}`).toContain('CONFIDENTIAL');
      const alphas = await pageAlphas(out.bytes, i);
      expect(alphas.some((a) => Math.abs(a - 0.3) < 0.005), `page ${i + 1} alphas ${alphas.join(',')}`).toBe(true);
    }
    expect(net.requestsSince(mark), 'no request after the file was added').toEqual([]);
  });

  test('T-WMK2 an image watermark tiled 3x3 gives 9 image placements per page', async ({ page }) => {
    await openTool(page, TOOLS.watermark);
    await addFiles(page, [fixturePath('text-3p.pdf')]);
    await pick(page, 'Watermark type', 'Image');
    await page.getByLabel('Watermark image').setInputFiles(fixturePath('photo-1.jpg'));
    await pick(page, 'Position', /tiled/i);
    const out = await runAndDownload(page);
    for (let i = 0; i < 3; i++) {
      const images = (await imagePlacements(out.bytes, i)).filter((p) => p.kind === 'image');
      expect(images, `page ${i + 1}`).toHaveLength(9);
    }
  });

  test('T-WMK3 page range 1 applies the watermark to page 1 only', async ({ page }) => {
    await openTool(page, TOOLS.watermark);
    await addFiles(page, [fixturePath('text-3p.pdf')]);
    await pick(page, 'Watermark type', 'Text');
    await fillOption(page, 'Watermark text', 'CONFIDENTIAL');
    await fillOption(page, 'Page range', '1');
    const out = await runAndDownload(page);
    const texts = await pageTexts(out.bytes);
    expect(texts[0]).toContain('CONFIDENTIAL');
    expect(texts[1]).not.toContain('CONFIDENTIAL');
    expect(texts[2]).not.toContain('CONFIDENTIAL');
  });
});
