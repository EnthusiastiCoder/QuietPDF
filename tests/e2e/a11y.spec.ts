import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures';
import { ui, openTool, addFiles } from './ui';
import { ALL_TOOL_ROUTES, TOOLS } from './routes';
import { fixturePath } from '../helpers/fixtures';

test.describe('WS4 accessibility', () => {
  test('A1 axe finds no serious or critical violations on the key routes', async ({ page }) => {
    test.setTimeout(180_000);
    for (const route of ['/', TOOLS.jpgToPdf, TOOLS.merge, TOOLS.compress, TOOLS.pdfToWord, TOOLS.sign]) {
      const res = await page.goto(route);
      expect(res?.status(), `GET ${route}`).toBe(200);
      await page.waitForLoadState('networkidle');
      const results = await new AxeBuilder({ page }).analyze();
      const bad = results.violations
        .filter((v) => v.impact === 'serious' || v.impact === 'critical')
        .map((v) => `${v.id} (${v.impact}): ${v.nodes.length} node(s)`);
      expect(bad, `${route} axe violations`).toEqual([]);
    }
  });

  test('A2 keyboard-only merge: Tab to the picker, add files, Tab to the action, Enter, result appears', async ({ page }) => {
    await openTool(page, TOOLS.merge);
    const inDropZone = () =>
      page.evaluate(() => !!document.activeElement?.closest('[data-testid="drop-zone"]'));
    let reached = false;
    for (let i = 0; i < 40 && !reached; i++) {
      await page.keyboard.press('Tab');
      reached = await inDropZone();
    }
    expect(reached, 'the drop zone picker is reachable with Tab').toBe(true);

    const files = [fixturePath('text-3p.pdf'), fixturePath('text-10p.pdf')];
    const focusedIsInput = await page.evaluate(
      () => document.activeElement instanceof HTMLInputElement && document.activeElement.type === 'file',
    );
    if (focusedIsInput) {
      await page.locator(':focus').setInputFiles(files);
    } else {
      const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.keyboard.press('Enter')]);
      await chooser.setFiles(files);
    }
    await expect(ui.thumbs(page)).toHaveCount(2);

    let onPrimary = false;
    for (let i = 0; i < 60 && !onPrimary; i++) {
      await page.keyboard.press('Tab');
      onPrimary = await page.evaluate(() => document.activeElement?.getAttribute('data-testid') === 'primary-action');
    }
    expect(onPrimary, 'the primary action is reachable with Tab').toBe(true);
    await page.keyboard.press('Enter');
    await expect(ui.result(page)).toBeVisible({ timeout: 60_000 });
  });

  test('A3 mobile: options render as a bottom sheet; no horizontal scroll on any tool route @ui', async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 412, height: 915 });
    await openTool(page, TOOLS.jpgToPdf);
    await addFiles(page, [fixturePath('photo-1.jpg')]);
    await expect(ui.optionsPanel(page)).toHaveAttribute('data-layout', 'sheet');

    for (const route of ALL_TOOL_ROUTES) {
      const res = await page.goto(route);
      expect(res?.status(), `GET ${route}`).toBe(200);
      const { scrollWidth, innerWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      expect(scrollWidth, `${route} horizontal scroll`).toBeLessThanOrEqual(innerWidth);
    }
  });
});
