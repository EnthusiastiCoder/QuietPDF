import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { ui, openTool, addFiles, runAndDownload } from './ui';
import { TOOLS } from './routes';
import { fixturePath, type FixtureName } from '../helpers/fixtures';
import { docxParagraphs, unzip, unzipText } from '../helpers/pdf';

async function convert(page: Page, fixture: FixtureName) {
  await openTool(page, TOOLS.pdfToWord);
  await addFiles(page, [fixturePath(fixture)]);
  const out = await runAndDownload(page);
  expect(out.name).toMatch(/\.docx$/i);
  return out.bytes;
}

test.describe('WS3 PDF to Word', () => {
  test('T-DOC1 headings.pdf gives a docx where "Quarterly Report" is a Heading1 paragraph', async ({ page, net }) => {
    await openTool(page, TOOLS.pdfToWord);
    await expect(page.getByText('Exact layout, tables and fonts are approximate', { exact: false })).toBeVisible();
    const mark = net.mark();
    await addFiles(page, [fixturePath('headings.pdf')]);
    const out = await runAndDownload(page);
    const xml = unzipText(out.bytes, 'word/document.xml');
    const heading = docxParagraphs(xml).find((p) => p.text.includes('Quarterly Report'));
    expect(heading, 'a paragraph contains "Quarterly Report"').toBeDefined();
    expect(heading!.style).toBe('Heading1');
    expect(net.requestsSince(mark), 'no request after the file was added').toEqual([]);
  });

  test('T-DOC2 the 3 body paragraphs are 3 <w:p>, not one per line; "Important" is bold', async ({ page }) => {
    const xml = unzipText(await convert(page, 'headings.pdf'), 'word/document.xml');
    const paras = docxParagraphs(xml);
    for (const n of [1, 2, 3]) {
      const matching = paras.filter((p) => p.text.includes(`BODY-PARA-${n}-START`));
      expect(matching, `BODY-PARA-${n} is one paragraph`).toHaveLength(1);
      expect(matching[0].text, `BODY-PARA-${n} start and end are in the same <w:p>`).toContain(`BODY-PARA-${n}-END`);
    }
    expect(paras.filter((p) => /BODY-PARA-\d-START/.test(p.text)), 'three separate body paragraphs').toHaveLength(3);

    const important = paras.find((p) => p.text.includes('Important'));
    expect(important).toBeDefined();
    const runs = important!.xml.match(/<w:r[ >][\s\S]*?<\/w:r>/g) ?? [];
    const run = runs.find((r) => r.includes('Important'));
    expect(run, 'a run holds "Important"').toBeDefined();
    expect(run).toMatch(/<w:b\/>|<w:b w:val="(true|1|on)"\/>/);
  });

  test('T-DOC3 the two-column page reads column by column', async ({ page }) => {
    const xml = unzipText(await convert(page, 'headings.pdf'), 'word/document.xml');
    const text = docxParagraphs(xml).map((p) => p.text).join('\n');
    const left = [1, 2, 3].map((n) => text.indexOf(`LEFT-COL-${n}`));
    const right = [1, 2, 3].map((n) => text.indexOf(`RIGHT-COL-${n}`));
    expect([...left, ...right].every((i) => i >= 0), `positions L${left} R${right}`).toBe(true);
    expect(Math.max(...left)).toBeLessThan(Math.min(...right));
    expect(left).toEqual([...left].sort((a, b) => a - b));
  });

  test('T-DOC4 a page break separates page 1 and page 2; with-image.pdf gives a docx with an image', async ({ page }) => {
    const xml = unzipText(await convert(page, 'headings.pdf'), 'word/document.xml');
    const end1 = xml.indexOf('Important');
    const start2 = xml.indexOf('Appendix');
    expect(end1).toBeGreaterThan(0);
    expect(start2).toBeGreaterThan(end1);
    expect(xml.slice(end1, start2)).toMatch(/<w:br w:type="page"\/>|<w:pageBreakBefore\/>/);

    const docx = await convert(page, 'with-image.pdf');
    const media = Object.keys(unzip(docx)).filter((n) => n.startsWith('word/media/'));
    expect(media.length).toBeGreaterThanOrEqual(1);
  });

  test('T-DOC5 scanned.pdf says it looks scanned and chains to OCR', async ({ page }) => {
    await openTool(page, TOOLS.pdfToWord);
    await addFiles(page, [fixturePath('scanned.pdf')]);
    await expect(page.getByText(/looks scanned/i)).toBeVisible();
    await expect(page.getByText(/run OCR first/i)).toBeVisible();
    await page.getByRole('button', { name: /OCR/ }).or(page.getByRole('link', { name: /OCR/ })).first().click();
    await expect(page).toHaveURL(new RegExp(`${TOOLS.ocr}(\\?|#|$)`));
    await expect(ui.thumbs(page), 'the scanned file is carried over in memory').toHaveCount(1);
  });
});
