import jpeg from 'jpeg-js';
import { test, expect } from './fixtures';
import { ui, openTool, addFiles, runAndDownload, downloadResult, pick } from './ui';
import { TOOLS } from './routes';
import { fixturePath } from '../helpers/fixtures';
import { unzip } from '../helpers/pdf';
import { imageDims, isJpeg, isPng } from '../helpers/images';

test.describe('WS2 PDF to JPG / PNG', () => {
  test('T-P2I1 text-3p at 150 dpi as JPG gives a zip of 3 JPEGs of 1275x1650 px', async ({ page, net }) => {
    await openTool(page, TOOLS.pdfToJpg);
    const mark = net.mark();
    await addFiles(page, [fixturePath('text-3p.pdf')]);
    await pick(page, 'Format', 'JPG');
    await pick(page, 'Resolution', /150/);
    const out = await runAndDownload(page);
    expect(out.name).toMatch(/\.zip$/i);
    const entries = Object.entries(unzip(out.bytes)).filter(([n]) => /\.jpe?g$/i.test(n));
    expect(entries).toHaveLength(3);
    for (const [name, bytes] of entries) {
      expect(isJpeg(bytes), name).toBe(true);
      const img = jpeg.decode(bytes, { useTArray: true });
      expect(Math.abs(img.width - 1275), `${name} width ${img.width}`).toBeLessThanOrEqual(2);
      expect(Math.abs(img.height - 1650), `${name} height ${img.height}`).toBeLessThanOrEqual(2);
    }
    expect(net.requestsSince(mark), 'no request after the file was added').toEqual([]);
  });

  test('T-P2I2 PNG of a single-page PDF downloads a PNG directly, not a zip', async ({ page }) => {
    await openTool(page, TOOLS.pdfToJpg);
    await addFiles(page, [fixturePath('with-image.pdf')]);
    await pick(page, 'Format', 'PNG');
    const out = await runAndDownload(page);
    expect(out.name).toMatch(/\.png$/i);
    expect(isPng(out.bytes)).toBe(true);
    expect(imageDims(out.bytes).width).toBeGreaterThan(0);
  });

  test('T-P2I3 the 200-page fixture converts with the progress counter reaching 200', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'chromium only');
    test.setTimeout(180_000);
    await openTool(page, TOOLS.pdfToJpg);
    await addFiles(page, [fixturePath('.gen/large-200p.pdf')]);
    await pick(page, 'Format', 'JPG');
    // record every value the counter shows (it may disappear once done)
    await page.evaluate(() => {
      const seen: string[] = [];
      (window as unknown as { __counter: string[] }).__counter = seen;
      new MutationObserver(() => {
        const el = document.querySelector('[data-testid="progress-counter"]');
        if (el?.textContent) seen.push(el.textContent);
      }).observe(document.body, { subtree: true, childList: true, characterData: true });
    });
    await ui.primary(page).click();
    await expect(ui.result(page)).toBeVisible({ timeout: 170_000 });
    const seen = await page.evaluate(() => (window as unknown as { __counter: string[] }).__counter);
    expect(seen.some((t) => /\b200\s*\/\s*200\b/.test(t)), `counter values: ${seen.slice(-5).join(' | ')}`).toBe(true);
    const out = await downloadResult(page);
    expect(Object.keys(unzip(out.bytes)).filter((n) => /\.jpe?g$/i.test(n))).toHaveLength(200);
  });
});
