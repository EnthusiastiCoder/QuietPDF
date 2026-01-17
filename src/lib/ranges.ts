/**
 * Page-range parser for Split, Organize, Page numbers and Watermark.
 *
 * Syntax: comma-separated parts; each part is `n`, `a-b`, `a-` (to the end)
 * or `-b` (from the start). Pages are 1-based and inclusive. Whitespace is
 * ignored. Invalid input throws a RangeParseError with a human message.
 */

export class RangeParseError extends Error {
  readonly input: string;
  constructor(message: string, input: string) {
    super(message);
    this.name = 'RangeParseError';
    this.input = input;
  }
}

export type PageRange = [number, number];

const PART = /^(\d+)?(-)?(\d+)?$/;

export function parseRanges(input: string, pageCount: number): PageRange[] {
  const text = input.replace(/\s+/g, '');
  if (!text) throw new RangeParseError('Enter at least one page or range, for example 1-3,5.', input);
  const out: PageRange[] = [];
  for (const part of text.split(',')) {
    if (!part) throw new RangeParseError('Remove the empty item between commas.', input);
    const m = PART.exec(part);
    if (!m || (!m[1] && !m[3])) {
      throw new RangeParseError(`"${part}" is not a page number or a range like 2-5.`, input);
    }
    const hasDash = m[2] === '-';
    const from = m[1] ? Number(m[1]) : 1;
    const to = hasDash ? (m[3] ? Number(m[3]) : pageCount) : from;
    if (from < 1 || to < 1) throw new RangeParseError('Pages start at 1; there is no page 0.', input);
    if (from > pageCount || to > pageCount) {
      const bad = Math.max(from, to);
      throw new RangeParseError(
        `Page ${bad} does not exist: this document has ${pageCount} page${pageCount === 1 ? '' : 's'}.`,
        input,
      );
    }
    if (from > to) throw new RangeParseError(`"${part}" runs backwards; write it as ${to}-${from}.`, input);
    out.push([from, to]);
  }
  return out;
}

/** The 1-based page numbers covered by the ranges, in the given order (duplicates kept). */
export function expandRanges(ranges: PageRange[]): number[] {
  const pages: number[] = [];
  for (const [a, b] of ranges) for (let p = a; p <= b; p++) pages.push(p);
  return pages;
}

/** Parses and returns the set of selected pages (for "apply to these pages" options). */
export function pageSet(input: string, pageCount: number): Set<number> {
  return new Set(expandRanges(parseRanges(input, pageCount)));
}
