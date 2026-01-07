import { test, expect } from './fixtures';
import { ui, openTool, addFiles, runAndDownload, pick, fillOption } from './ui';
import { TOOLS } from './routes';
import { fixturePath } from '../helpers/fixtures';
import { pageCount, unzip } from '../helpers/pdf';

/** Page counts of the PDFs in a zip, ordered by file name (natural order). */
async function zipPageCounts(zip: Uint8Array): Promise<number[]> {
  const entries = Object.entries(unzip(zip))
    .filter(([name]) => name.toLowerCase().endsWith('.pdf'))
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));
  return Promise.all(entries.map(([, bytes]) => pageCount(bytes)));
}

test.describe('WS2 Split', () => {
  test('T-SPL1 range "1-3,5" on text-10p gives a zip of 2 files with 3 and 1 pages', async ({ page, net }) => {
    await openTool(page, TOOLS.split);
    const mark = net.mark();
    await addFiles(page, [fixturePath('text-10p.pdf')]);
    await pick(page, 'Split mode', 'Ranges');
    await fillOption(page, 'Ranges', '1-3,5');
    const out = await runAndDownload(page);
    expect(out.name).toMatch(/\.zip$/i);
    expect(await zipPageCounts(out.bytes)).toEqual([3, 1]);
    expect(net.requestsSince(mark), 'no request after the file was added').toEqual([]);
  });

  test('T-SPL2 every 4 pages gives 3 files of 4, 4 and 2 pages', async ({ page }) => {
    await openTool(page, TOOLS.split);
    await addFiles(page, [fixturePath('text-10p.pdf')]);
    await pick(page, 'Split mode', 'Every N pages');
    await fillOption(page, 'Pages per file', '4');
    const out = await runAndDownload(page);
    expect(await zipPageCounts(out.bytes)).toEqual([4, 4, 2]);
  });

  test('T-SPL3 one file per page gives 10 files', async ({ page }) => {
    await openTool(page, TOOLS.split);
    await addFiles(page, [fixturePath('text-10p.pdf')]);
    await pick(page, 'Split mode', 'One file per page');
    const out = await runAndDownload(page);
    expect(await zipPageCounts(out.bytes)).toEqual(Array(10).fill(1));
  });

  test('T-SPL4 an invalid range shows an inline error and disables the button', async ({ page }) => {
    await openTool(page, TOOLS.split);
    await addFiles(page, [fixturePath('text-10p.pdf')]);
    await pick(page, 'Split mode', 'Ranges');
    await fillOption(page, 'Ranges', '5-2');
    await expect(ui.inlineError(page)).toBeVisible();
    await expect(ui.primary(page)).toBeDisabled();
    await fillOption(page, 'Ranges', '11');
    await expect(ui.inlineError(page)).toBeVisible();
    await expect(ui.primary(page)).toBeDisabled();
  });
});
