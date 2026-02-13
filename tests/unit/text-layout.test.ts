import { describe, expect, test } from 'vitest';
import { readFixture } from '../helpers/fixtures';
import { docxParagraphs, unzipText, openWithPdfjs } from '../helpers/pdf';
import { findColumnSplit, groupLines, linesToBlocks, type TextItemIn } from '../../src/core/text-layout';
import { extractDocument, looksScanned, pagesToText } from '../../src/core/pdf-to-text';
import { pagesToDocx } from '../../src/core/pdf-to-docx';

const item = (str: string, x: number, y: number, size = 12, width = str.length * size * 0.5, bold = false): TextItemIn => ({
  str,
  x,
  y,
  width,
  size,
  bold,
  italic: false,
});

describe('text layout (core)', () => {
  test('lines on one baseline join into one line, left to right', () => {
    const lines = groupLines([item('world', 120, 700.2), item('Hello', 72, 700)]);
    expect(lines).toHaveLength(1);
    expect(lines[0].runs.map((r) => r.text).join('')).toBe('Hello world');
  });

  test('a larger line gap starts a new paragraph; a bold line is its own paragraph', () => {
    const lines = groupLines([
      item('one a', 72, 700),
      item('one b', 72, 685),
      item('two a', 72, 658),
      item('two b', 72, 643),
      item('Bold', 72, 610, 12, 30, true),
    ]);
    const blocks = linesToBlocks(lines, 12);
    expect(blocks.map((b) => b.text)).toEqual(['one a one b', 'two a two b', 'Bold']);
    expect(blocks[2].runs[0].bold).toBe(true);
  });

  test('a two-column page has a gutter; a single column does not', () => {
    const two = [1, 2, 3].flatMap((r) => [item(`LEFT-${r}`, 72, 700 - r * 40), item(`RIGHT-${r}`, 340, 700 - r * 40)]);
    const split = findColumnSplit(two, 612);
    expect(split).not.toBeNull();
    expect(split!).toBeGreaterThan(130);
    expect(split!).toBeLessThan(340);
    const one = [1, 2, 3, 4].map((r) => item(`Line ${r}`, 72, 700 - r * 15));
    expect(findColumnSplit(one, 612)).toBeNull();
  });

  test('headings.pdf: heading, 3 paragraphs, bold "Important", columns read in order', async () => {
    const doc = await openWithPdfjs(readFixture('headings.pdf'));
    const pages = await extractDocument(doc);
    expect(looksScanned(pages)).toBe(false);
    const text = pagesToText(pages);
    for (const n of [1, 2, 3]) expect(text).toMatch(new RegExp(`BODY-PARA-${n}-START[^\\n]*BODY-PARA-${n}-END`));
    expect(text.indexOf('LEFT-COL-3')).toBeLessThan(text.indexOf('RIGHT-COL-1'));

    const xml = unzipText(await pagesToDocx(pages), 'word/document.xml');
    const paras = docxParagraphs(xml);
    expect(paras.find((p) => p.text.includes('Quarterly Report'))?.style).toBe('Heading1');
    expect(paras.find((p) => p.text === 'Important')?.xml).toMatch(/<w:b\/>/);
    expect(xml).toMatch(/<w:br w:type="page"\/>/);
  });

  test('scanned.pdf has no text layer', async () => {
    const doc = await openWithPdfjs(readFixture('scanned.pdf'));
    expect(looksScanned(await extractDocument(doc))).toBe(true);
  });
});
