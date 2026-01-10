import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { ui, openTool, addFiles, runAndDownload, fillOption } from './ui';
import { TOOLS } from './routes';
import { fixturePath } from '../helpers/fixtures';
import { encryptDictText, openWithPdfjs } from '../helpers/pdf';

async function protect(page: Page, password: string) {
  await openTool(page, TOOLS.protect);
  await addFiles(page, [fixturePath('text-3p.pdf')]);
  await fillOption(page, 'Password', password);
  await fillOption(page, 'Confirm password', password);
  return runAndDownload(page);
}

test.describe('WS3 Protect', () => {
  test('T-PRT1 with password pw1: opening without it throws PasswordException, with it gives 3 pages', async ({ page, net }) => {
    await openTool(page, TOOLS.protect);
    const mark = net.mark();
    await addFiles(page, [fixturePath('text-3p.pdf')]);
    await fillOption(page, 'Password', 'pw1');
    await fillOption(page, 'Confirm password', 'pw1');
    const out = await runAndDownload(page);

    let error: unknown;
    try {
      await openWithPdfjs(out.bytes);
    } catch (e) {
      error = e;
    }
    expect(error, 'opening without a password must fail').toBeDefined();
    expect((error as { name?: string }).name).toBe('PasswordException');

    const doc = await openWithPdfjs(out.bytes, 'pw1');
    expect(doc.numPages).toBe(3);
    expect(net.requestsSince(mark), 'no request after the file was added').toEqual([]);
  });

  test('T-PRT2 the encryption is AES-256 (/V 5, /R 6)', async ({ page }) => {
    const out = await protect(page, 'pw1');
    const dict = encryptDictText(out.bytes);
    expect(dict, 'the trailer has an /Encrypt dictionary').toBeDefined();
    expect(dict).toMatch(/\/V\s+5\b/);
    expect(dict).toMatch(/\/R\s+6\b/);
  });

  test('T-PRT3 mismatched confirm passwords disable the button', async ({ page }) => {
    await openTool(page, TOOLS.protect);
    await addFiles(page, [fixturePath('text-3p.pdf')]);
    await fillOption(page, 'Password', 'pw1');
    await fillOption(page, 'Confirm password', 'pw2');
    await expect(ui.primary(page)).toBeDisabled();
    await fillOption(page, 'Confirm password', 'pw1');
    await expect(ui.primary(page)).toBeEnabled();
  });
});
