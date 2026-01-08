import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { ui, openTool, addFiles, runAndDownload, pick, fillOption, pdfPointToScreen } from './ui';
import { TOOLS } from './routes';
import { fixturePath, readFixture } from '../helpers/fixtures';
import { imagePlacements, pageContent, pageFontNames, pageSizes } from '../helpers/pdf';

// Sign contract:
//   tabs/buttons "Draw", "Type", "Upload" choose the signature source;
//   test id "signature-pad" is the drawing canvas; "Use signature" confirms it;
//   then clicking a point on a page canvas places the signature centred on that point.

const LETTER = { width: 612, height: 792 };

async function drawSignature(page: Page) {
  await page.getByRole('tab', { name: 'Draw' }).or(page.getByRole('button', { name: 'Draw', exact: true })).first().click();
  const pad = page.getByTestId('signature-pad');
  const box = await pad.boundingBox();
  if (!box) throw new Error('signature pad not visible');
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.6);
  await page.mouse.down();
  for (let i = 1; i <= 20; i++) {
    await page.mouse.move(box.x + box.width * (0.2 + i * 0.03), box.y + box.height * (0.6 - Math.sin(i / 3) * 0.25));
  }
  await page.mouse.up();
  await page.getByRole('button', { name: 'Use signature' }).click();
}

async function placeAt(page: Page, pageNo: number, xPt: number, yPt: number) {
  const canvas = ui.pageCanvas(page, pageNo);
  await canvas.scrollIntoViewIfNeeded();
  const pt = await pdfPointToScreen(canvas, LETTER, xPt, yPt);
  await page.mouse.click(pt.x, pt.y);
}

test.describe('WS2 Sign', () => {
  test('T-SGN1 a drawn signature placed on page 1 becomes an image XObject at that position (±5 pt)', async ({ page, net }) => {
    await openTool(page, TOOLS.sign);
    const mark = net.mark();
    await addFiles(page, [fixturePath('text-3p.pdf')]);
    await drawSignature(page);
    await placeAt(page, 1, 200, 300);
    const out = await runAndDownload(page);
    const images = (await imagePlacements(out.bytes, 0)).filter((p) => p.kind === 'image');
    expect(images.length, 'page 1 has a new image').toBeGreaterThanOrEqual(1);
    const centred = images.find(
      (p) => Math.abs(p.x + p.width / 2 - 200) <= 5 && Math.abs(p.y + p.height / 2 - 300) <= 5,
    );
    expect(centred, `placements: ${JSON.stringify(images)}`).toBeDefined();
    expect(net.requestsSince(mark), 'no request after the file was added').toEqual([]);
  });

  test('T-SGN2 a typed signature embeds a subset of the script font', async ({ page }) => {
    await openTool(page, TOOLS.sign);
    await addFiles(page, [fixturePath('text-3p.pdf')]);
    await page.getByRole('tab', { name: 'Type' }).or(page.getByRole('button', { name: 'Type', exact: true })).first().click();
    await fillOption(page, 'Your name', 'Arpan Mandal');
    await pick(page, 'Font', /Dancing Script/);
    await page.getByRole('button', { name: 'Use signature' }).click();
    await placeAt(page, 1, 300, 200);
    const out = await runAndDownload(page);
    const fonts = await pageFontNames(out.bytes, 0);
    const script = fonts.find((f) => /DancingScript/i.test(f));
    expect(script, `fonts on page 1: ${fonts.join(', ')}`).toBeDefined();
    expect(script, 'subset tag ABCDEF+').toMatch(/^[A-Z]{6}\+/);
  });

  test('T-SGN3 a signature on page 2 leaves page 1 unchanged', async ({ page }) => {
    await openTool(page, TOOLS.sign);
    await addFiles(page, [fixturePath('text-3p.pdf')]);
    await drawSignature(page);
    await placeAt(page, 2, 300, 300);
    const out = await runAndDownload(page);
    const input = readFixture('text-3p.pdf');
    expect(await pageSizes(out.bytes)).toHaveLength(3);
    expect(await pageContent(out.bytes, 0)).toBe(await pageContent(input, 0));
    expect((await imagePlacements(out.bytes, 0)).filter((p) => p.kind === 'image')).toHaveLength(0);
    expect((await imagePlacements(out.bytes, 1)).filter((p) => p.kind === 'image').length).toBeGreaterThanOrEqual(1);
  });
});
