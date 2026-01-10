import { test, expect } from './fixtures';
import { openTool, addFiles, runAndDownload } from './ui';
import { TOOLS } from './routes';
import { fixturePath } from '../helpers/fixtures';

const utf8 = (b: Uint8Array) => new TextDecoder().decode(b);

test.describe('WS3 PDF to Text', () => {
  test('T-TXT1 text-3p gives a .txt with PAGE-1/2/3-ALPHA in order', async ({ page, net }) => {
    await openTool(page, TOOLS.pdfToText);
    const mark = net.mark();
    await addFiles(page, [fixturePath('text-3p.pdf')]);
    const out = await runAndDownload(page);
    expect(out.name).toMatch(/\.txt$/i);
    const text = utf8(out.bytes);
    const idx = [1, 2, 3].map((n) => text.indexOf(`PAGE-${n}-ALPHA`));
    expect(idx.every((i) => i >= 0), `positions ${idx}`).toBe(true);
    expect(idx[0]).toBeLessThan(idx[1]);
    expect(idx[1]).toBeLessThan(idx[2]);
    expect(net.requestsSince(mark), 'no request after the file was added').toEqual([]);
  });

  test('T-TXT2 the two-column page reads column-wise', async ({ page }) => {
    await openTool(page, TOOLS.pdfToText);
    await addFiles(page, [fixturePath('headings.pdf')]);
    const text = utf8((await runAndDownload(page)).bytes);
    const left = [1, 2, 3].map((n) => text.indexOf(`LEFT-COL-${n}`));
    const right = [1, 2, 3].map((n) => text.indexOf(`RIGHT-COL-${n}`));
    expect([...left, ...right].every((i) => i >= 0), `positions L${left} R${right}`).toBe(true);
    expect(Math.max(...left)).toBeLessThan(Math.min(...right));
  });
});
