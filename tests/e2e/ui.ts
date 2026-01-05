/**
 * The UI contract the e2e tests rely on. WS1-WS3 components must expose these
 * test ids and accessible names; change them here, in one place, if needed.
 *
 * Test ids:
 *   tool-grid, tool-card            home grid (cards link to the tool route)
 *   drop-zone (contains input[type=file])
 *   inline-error                    validation error shown next to the input/options
 *   thumb                           one thumbnail in ThumbGrid (file or page), in display order
 *   primary-action                  the one primary button of a tool page
 *   progress, progress-counter      ProgressBar and its "n / total" page counter
 *   result-card, download           ResultCard and its download control
 *   result-sizes                    ResultCard size line (compress: before, after, % saved)
 *   result-message                  ResultCard notice ("already optimised", ...)
 *   privacy-meter, privacy-panel, privacy-panel-url
 *   theme-toggle                    sets <html data-theme="light|dark">
 *   password-prompt, password-error the encrypted-input prompt (decision 14)
 *   page-canvas                     a rendered page preview (sign, redact): data-page="1-based"
 *   options-panel                   OptionsPanel (bottom sheet on mobile: data-layout="sheet")
 *
 * Options are form controls found by their accessible label (see pick()).
 */
import type { Locator, Page } from '@playwright/test';
import { expect } from './fixtures';

export const ui = {
  toolGrid: (p: Page) => p.getByTestId('tool-grid'),
  toolCards: (p: Page) => p.getByTestId('tool-card'),
  dropZone: (p: Page) => p.getByTestId('drop-zone'),
  fileInput: (p: Page) => p.getByTestId('drop-zone').locator('input[type=file]'),
  inlineError: (p: Page) => p.getByTestId('inline-error'),
  thumbs: (p: Page) => p.getByTestId('thumb'),
  primary: (p: Page) => p.getByTestId('primary-action'),
  progress: (p: Page) => p.getByTestId('progress'),
  progressCounter: (p: Page) => p.getByTestId('progress-counter'),
  result: (p: Page) => p.getByTestId('result-card'),
  resultSizes: (p: Page) => p.getByTestId('result-sizes'),
  resultMessage: (p: Page) => p.getByTestId('result-message'),
  privacyMeter: (p: Page) => p.getByTestId('privacy-meter'),
  privacyPanel: (p: Page) => p.getByTestId('privacy-panel'),
  privacyPanelUrls: (p: Page) => p.getByTestId('privacy-panel-url'),
  themeToggle: (p: Page) => p.getByTestId('theme-toggle'),
  passwordPrompt: (p: Page) => p.getByTestId('password-prompt'),
  passwordError: (p: Page) => p.getByTestId('password-error'),
  pageCanvas: (p: Page, pageNo: number) => p.locator(`[data-testid="page-canvas"][data-page="${pageNo}"]`),
  optionsPanel: (p: Page) => p.getByTestId('options-panel'),
};

/** Opens a tool route and waits until its warm-up (WASM, workers, lang data) has finished. */
export async function openTool(page: Page, route: string): Promise<void> {
  const res = await page.goto(route);
  expect(res?.status(), `GET ${route}`).toBe(200);
  await page.waitForLoadState('networkidle');
  await expect(ui.dropZone(page)).toBeVisible();
}

/** Adds files through the drop zone's picker. */
export async function addFiles(page: Page, paths: string[]): Promise<void> {
  await ui.fileInput(page).setInputFiles(paths);
}

/**
 * Selects an option in a labelled control: a native <select>, a radio group,
 * or a group of toggle buttons, whichever the component renders.
 */
export async function pick(page: Page, groupLabel: string | RegExp, optionLabel: string | RegExp): Promise<void> {
  const select = page.getByRole('combobox', { name: groupLabel });
  if (await select.count()) {
    const options = await select.first().locator('option').allTextContents();
    const match = options.find((o) => (typeof optionLabel === 'string' ? o.trim() === optionLabel : optionLabel.test(o)));
    if (!match) throw new Error(`option ${optionLabel} not in ${groupLabel}: ${options.join(' | ')}`);
    await select.first().selectOption({ label: match });
    return;
  }
  const group = page.getByRole('radiogroup', { name: groupLabel }).or(page.getByRole('group', { name: groupLabel }));
  await expect(group.first(), `options group "${groupLabel}"`).toBeVisible();
  const choice = group.first().getByRole('radio', { name: optionLabel }).or(group.first().getByRole('button', { name: optionLabel }));
  await choice.first().click();
}

/** Fills a labelled text/number/range input (string labels match exactly, case-insensitive regexes are looser). */
export async function fillOption(page: Page, label: string | RegExp, value: string): Promise<void> {
  const input = typeof label === 'string' ? page.getByLabel(label, { exact: true }) : page.getByLabel(label);
  await input.first().fill(value);
}

/** Ticks a labelled checkbox or switch. */
export async function check(page: Page, label: string | RegExp): Promise<void> {
  await page.getByLabel(label).first().check();
}

export interface Downloaded {
  name: string;
  bytes: Uint8Array;
}

/** Runs the primary action, waits for the result card, and downloads the result. */
export async function runAndDownload(page: Page, opts: { timeout?: number } = {}): Promise<Downloaded> {
  const timeout = opts.timeout ?? 60_000;
  await ui.primary(page).click();
  await expect(ui.result(page)).toBeVisible({ timeout });
  return downloadResult(page);
}

export async function downloadResult(page: Page): Promise<Downloaded> {
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    ui.result(page).getByTestId('download').click(),
  ]);
  const path = await dl.path();
  const { readFileSync } = await import('node:fs');
  return { name: dl.suggestedFilename(), bytes: new Uint8Array(readFileSync(path)) };
}

/** Drags one locator onto another with real pointer moves (works for svelte-dnd-action and sortablejs). */
export async function dragOnto(page: Page, from: Locator, to: Locator): Promise<void> {
  const a = await from.boundingBox();
  const b = await to.boundingBox();
  if (!a || !b) throw new Error('drag source or target is not visible');
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 5, a.y + a.height / 2 + 5, { steps: 5 });
  await page.mouse.move(b.x + b.width / 4, b.y + b.height / 2, { steps: 15 });
  await page.mouse.up();
}

/** Converts a point in PDF space (points, origin bottom-left) to page coordinates over a page canvas. */
export async function pdfPointToScreen(
  canvas: Locator,
  pageSize: { width: number; height: number },
  xPt: number,
  yPt: number,
): Promise<{ x: number; y: number }> {
  const box = await canvas.boundingBox();
  if (!box) throw new Error('page canvas is not visible');
  return {
    x: box.x + (xPt / pageSize.width) * box.width,
    y: box.y + ((pageSize.height - yPt) / pageSize.height) * box.height,
  };
}
