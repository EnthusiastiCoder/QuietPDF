import { test, expect } from './fixtures';
import { ui, openTool, addFiles, runAndDownload, fillOption } from './ui';
import { TOOLS } from './routes';
import { fixturePath } from '../helpers/fixtures';
import { isEncrypted, openWithPdfjs } from '../helpers/pdf';

test.describe('WS3 Unlock', () => {
  test('T-ULK1 encrypted.pdf with open123 gives a file that opens without a password, 3 pages', async ({ page, net }) => {
    await openTool(page, TOOLS.unlock);
    const mark = net.mark();
    await addFiles(page, [fixturePath('encrypted.pdf')]);
    await fillOption(page, 'Password', 'open123');
    const out = await runAndDownload(page);
    expect(isEncrypted(out.bytes)).toBe(false);
    const doc = await openWithPdfjs(out.bytes);
    expect(doc.numPages).toBe(3);
    expect(net.requestsSince(mark), 'no request after the file was added').toEqual([]);
  });

  test('T-ULK2 a wrong password shows "Incorrect password" with no crash', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await openTool(page, TOOLS.unlock);
    await addFiles(page, [fixturePath('encrypted.pdf')]);
    await fillOption(page, 'Password', 'not-the-password');
    await ui.primary(page).click();
    await expect(page.getByText('Incorrect password')).toBeVisible();
    await expect(ui.result(page)).toBeHidden();
    await expect(ui.primary(page)).toBeVisible();
    expect(errors).toEqual([]);
  });
});
