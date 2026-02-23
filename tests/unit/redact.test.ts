import { describe, expect, test } from 'vitest';
import { findMatches } from '../../src/core/redact';
import { fontStyle } from '../../src/core/text-layout';

const mono = (s: string) => s.length; // every glyph the same width

describe('redact search (core)', () => {
  test('a match inside an item gets a padded box over just that substring', () => {
    const [box] = findMatches([{ str: 'SSN 123-45-6789', transform: [14, 0, 0, 14, 72, 670], width: 150, height: 14 }], '123-45-6789', mono);
    // 4 of 15 glyphs before the match: starts at 72 + 40 - 1
    expect(box.x0).toBeCloseTo(111);
    expect(box.x1).toBeCloseTo(72 + 150 + 1);
    expect(box.y0).toBeLessThan(670);
    expect(box.y1).toBeGreaterThan(670 + 10);
  });

  test('matching is case-insensitive and finds every occurrence', () => {
    const boxes = findMatches([{ str: 'abc ABC abc', transform: [10, 0, 0, 10, 0, 0], width: 110, height: 10 }], 'Abc', mono);
    expect(boxes).toHaveLength(3);
    expect(findMatches([{ str: 'x', transform: [1, 0, 0, 1, 0, 0], width: 1, height: 1 }], '  ', mono)).toEqual([]);
  });
});

describe('font style from pdf.js font objects', () => {
  test('the PDF font name gives bold and italic when the flags are absent', () => {
    expect(fontStyle({ name: 'ABCDEF+Arial-BoldMT' })).toEqual({ bold: true, italic: false });
    expect(fontStyle({ name: 'Helvetica-Oblique' })).toEqual({ bold: false, italic: true });
    expect(fontStyle({ bold: true })).toEqual({ bold: true, italic: false });
    expect(fontStyle(undefined)).toEqual({ bold: false, italic: false });
  });
});
