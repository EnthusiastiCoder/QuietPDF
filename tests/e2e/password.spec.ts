import { test, expect } from './fixtures';
import { ui, openTool, addFiles, runAndDownload } from './ui';
import { TOOLS } from './routes';
import { fixturePath } from '../helpers/fixtures';
import { isEncrypted, pageCount } from '../helpers/pdf';

test.describe('WS2 encrypted input', () => {
  test('T-PW1 encrypted.pdf on Merge asks for the password; wrong is rejected, open123 proceeds, output is not encrypted', async ({ page }) => {
    await openTool(page, TOOLS.merge);
    await addFiles(page, [fixturePath('encrypted.pdf')]);
    const prompt = ui.passwordPrompt(page);
    await expect(prompt).toBeVisible();

    const field = prompt.getByLabel('Password', { exact: true });
    const submit = prompt.getByRole('button', { name: /unlock|open|continue/i });
    await field.fill('wrong-password');
    await submit.click();
    await expect(ui.passwordError(page)).toBeVisible();
    await expect(prompt).toBeVisible();

    await field.fill('open123');
    await submit.click();
    await expect(prompt).toBeHidden();
    await expect(ui.thumbs(page)).toHaveCount(1);

    await addFiles(page, [fixturePath('text-10p.pdf')]);
    await expect(ui.thumbs(page)).toHaveCount(2);
    const out = await runAndDownload(page);
    expect(isEncrypted(out.bytes)).toBe(false);
    expect(await pageCount(out.bytes)).toBe(13);
  });
});
