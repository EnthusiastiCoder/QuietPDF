/**
 * Reading-order text layout (decision 10), shared by PDF to Word and PDF to
 * Text. Pure functions over positioned text items, plus `extractPage`, which
 * reads those items from a pdf.js page (browser build or the Node legacy build).
 *
 *  - Lines: items grouped by baseline (tolerance 0.5 x font height).
 *  - Columns: a simple two-column page is detected from the x coverage of the
 *    narrow items (an empty vertical band near the middle with text on both
 *    sides), then read column by column.
 *  - Paragraphs: lines split on a larger line gap, a size or weight change, or
 *    a first-line indent.
 *  - Headings: font size at least 1.3 x the document's median size.
 */
import type { PDFPageProxy } from 'pdfjs-dist';

export interface TextItemIn {
  str: string;
  /** Baseline origin, PDF points (origin bottom-left). */
  x: number;
  y: number;
  width: number;
  /** Font height in points. */
  size: number;
  bold: boolean;
  italic: boolean;
}

export interface ImageBox {
  /** PDF points, origin bottom-left. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Run {
  text: string;
  bold: boolean;
  italic: boolean;
}

export interface TextBlock {
  kind: 'text';
  /** 0 = body paragraph, 1 or 2 = heading level. */
  heading: 0 | 1 | 2;
  runs: Run[];
  text: string;
  size: number;
  /** Top of the block (largest y), for ordering. */
  top: number;
}

export interface ImageBlock<I extends ImageBox = ImageBox> {
  kind: 'image';
  image: I;
  top: number;
}

export type Block<I extends ImageBox = ImageBox> = TextBlock | ImageBlock<I>;

export interface PageItems<I extends ImageBox = ImageBox> {
  width: number;
  height: number;
  items: TextItemIn[];
  images: I[];
}

interface Line {
  y: number;
  x0: number;
  x1: number;
  size: number;
  runs: Run[];
  allBold: boolean;
}

const median = (xs: number[]): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const visible = (it: TextItemIn) => it.str.trim().length > 0;

/** The median font size over all items, weighted by their character count. */
export function medianSize(pages: { items: TextItemIn[] }[]): number {
  const sizes: number[] = [];
  for (const p of pages) {
    for (const it of p.items) {
      if (!visible(it)) continue;
      const n = Math.min(200, it.str.trim().length);
      for (let i = 0; i < n; i++) sizes.push(it.size);
    }
  }
  return median(sizes) || 12;
}

/**
 * Finds the x of a gutter between two columns, or null for a single-column
 * page. Only items narrower than 45% of the page count towards the coverage,
 * so a heading that spans both columns does not hide the gutter.
 */
export function findColumnSplit(items: TextItemIn[], pageWidth: number): number | null {
  const narrow = items.filter((it) => visible(it) && it.width < pageWidth * 0.45);
  if (narrow.length < 4) return null;
  const w = Math.max(1, Math.ceil(pageWidth));
  const cover = new Uint8Array(w);
  for (const it of narrow) {
    const a = Math.max(0, Math.floor(it.x));
    const b = Math.min(w - 1, Math.ceil(it.x + it.width));
    for (let i = a; i <= b; i++) cover[i] = 1;
  }
  const lo = Math.floor(w * 0.25);
  const hi = Math.ceil(w * 0.75);
  const minGap = Math.max(12, w * 0.03);
  let best: { start: number; len: number } | null = null;
  let start = -1;
  for (let i = lo; i <= hi; i++) {
    const empty = i < hi && cover[i] === 0;
    if (empty && start < 0) start = i;
    if (!empty && start >= 0) {
      const len = i - start;
      if (len >= minGap && (!best || len > best.len)) best = { start, len };
      start = -1;
    }
  }
  if (!best) return null;
  const split = best.start + best.len / 2;
  const left = narrow.filter((it) => it.x + it.width <= split);
  const right = narrow.filter((it) => it.x >= split);
  if (left.length < 2 || right.length < 2) return null;
  // The two sides must sit next to each other, not one above the other.
  const top = (xs: TextItemIn[]) => Math.max(...xs.map((it) => it.y + it.size));
  const bottom = (xs: TextItemIn[]) => Math.min(...xs.map((it) => it.y));
  const overlap = Math.min(top(left), top(right)) - Math.max(bottom(left), bottom(right));
  if (overlap <= 0) return null;
  const sideBySide = left.filter((l) => right.some((r) => Math.abs(r.y - l.y) < Math.max(l.size, r.size) * 2)).length;
  return sideBySide >= 2 ? split : null;
}

function sameFormat(a: Run, b: Run): boolean {
  return a.bold === b.bold && a.italic === b.italic;
}

function pushRun(runs: Run[], run: Run): void {
  if (!run.text) return;
  const last = runs[runs.length - 1];
  if (last && sameFormat(last, run)) last.text += run.text;
  else runs.push({ ...run });
}

/** Groups items (already of one column) into lines, top to bottom. */
export function groupLines(items: TextItemIn[]): Line[] {
  const sorted = items.filter(visible).sort((a, b) => b.y - a.y || a.x - b.x);
  const groups: TextItemIn[][] = [];
  for (const it of sorted) {
    const g = groups[groups.length - 1];
    if (g) {
      const ref = g[0];
      const tol = 0.5 * Math.max(ref.size, it.size);
      if (Math.abs(ref.y - it.y) <= tol) {
        g.push(it);
        continue;
      }
    }
    groups.push([it]);
  }
  return groups.map((g) => {
    g.sort((a, b) => a.x - b.x);
    const runs: Run[] = [];
    let prevEnd: number | null = null;
    let prevText = '';
    for (const it of g) {
      if (prevEnd !== null) {
        const gap = it.x - prevEnd;
        if (gap > it.size * 0.15 && !/\s$/.test(prevText) && !/^\s/.test(it.str)) {
          pushRun(runs, { text: ' ', bold: it.bold, italic: it.italic });
        }
      }
      pushRun(runs, { text: it.str, bold: it.bold, italic: it.italic });
      prevEnd = it.x + it.width;
      prevText = it.str;
    }
    const y = median(g.map((it) => it.y));
    return {
      y,
      x0: Math.min(...g.map((it) => it.x)),
      x1: Math.max(...g.map((it) => it.x + it.width)),
      size: Math.max(...g.map((it) => it.size)),
      runs,
      allBold: g.every((it) => it.bold),
    };
  });
}

function headingLevel(size: number, docMedian: number): 0 | 1 | 2 {
  if (size >= docMedian * 1.6) return 1;
  if (size >= docMedian * 1.3) return 2;
  return 0;
}

function joinRuns(target: Run[], next: Run[]): void {
  const last = target[target.length - 1];
  const first = next[0];
  if (last && first) {
    // A word broken over two lines ("exam-" + "ple") is joined without the hyphen.
    if (/[A-Za-z]-$/.test(last.text) && /^[a-z]/.test(first.text)) {
      last.text = last.text.slice(0, -1);
    } else if (!/\s$/.test(last.text) && !/^\s/.test(first.text)) {
      pushRun(target, { text: ' ', bold: first.bold && last.bold, italic: first.italic && last.italic });
    }
  }
  for (const r of next) pushRun(target, r);
}

/** Splits lines (of one column, top to bottom) into paragraph and heading blocks. */
export function linesToBlocks(lines: Line[], docMedian: number): TextBlock[] {
  const gaps: number[] = [];
  for (let i = 1; i < lines.length; i++) {
    const g = lines[i - 1].y - lines[i].y;
    if (Math.abs(lines[i].size - lines[i - 1].size) < 0.5 && g > 0 && g < lines[i].size * 2.5) gaps.push(g);
  }
  const typical = median(gaps);
  const blocks: TextBlock[] = [];
  let cur: { block: TextBlock; last: Line } | null = null;
  for (const line of lines) {
    const level = headingLevel(line.size, docMedian);
    let split = !cur;
    if (cur) {
      const prev = cur.last;
      const gap = prev.y - line.y;
      const limit = typical > 0 ? typical * 1.35 : line.size * 1.6;
      if (level !== cur.block.heading) split = true;
      else if (Math.abs(line.size - prev.size) > Math.max(prev.size, line.size) * 0.15) split = true;
      else if (gap > limit || gap < 0) split = true;
      else if (line.allBold !== prev.allBold) split = true;
      else if (line.x0 > prev.x0 + line.size * 1.5) split = true;
    }
    if (split) {
      const block: TextBlock = { kind: 'text', heading: level, runs: line.runs.map((r) => ({ ...r })), text: '', size: line.size, top: line.y + line.size };
      blocks.push(block);
      cur = { block, last: line };
    } else if (cur) {
      joinRuns(cur.block.runs, line.runs);
      cur.last = line;
    }
  }
  for (const b of blocks) {
    // Trim the block's outer whitespace.
    if (b.runs.length) {
      b.runs[0].text = b.runs[0].text.replace(/^\s+/, '');
      const l = b.runs[b.runs.length - 1];
      l.text = l.text.replace(/\s+$/, '');
      b.runs = b.runs.filter((r) => r.text.length > 0);
    }
    b.text = b.runs.map((r) => r.text).join('');
  }
  return blocks.filter((b) => b.text.length > 0);
}

function mergeByTop<I extends ImageBox>(texts: TextBlock[], images: I[]): Block<I>[] {
  const imgs: ImageBlock<I>[] = images.map((image) => ({ kind: 'image', image, top: image.y + image.height })).sort((a, b) => b.top - a.top);
  const out: Block<I>[] = [];
  let i = 0;
  for (const t of texts) {
    while (i < imgs.length && imgs[i].top > t.top) out.push(imgs[i++]);
    out.push(t);
  }
  while (i < imgs.length) out.push(imgs[i++]);
  return out;
}

/** Lays out one page into blocks in reading order. */
export function layoutPage<I extends ImageBox>(page: PageItems<I>, docMedian: number): Block<I>[] {
  const split = findColumnSplit(page.items, page.width);
  const items = page.items.filter(visible);
  if (split === null) {
    return mergeByTop(linesToBlocks(groupLines(items), docMedian), page.images);
  }
  const left = items.filter((it) => it.x + it.width <= split);
  const right = items.filter((it) => it.x >= split);
  const full = items.filter((it) => it.x < split && it.x + it.width > split);
  const colTop = Math.max(...[...left, ...right].map((it) => it.y + it.size));
  const above = full.filter((it) => it.y >= colTop);
  const below = full.filter((it) => it.y < colTop);
  const side = (im: ImageBox) => (im.x + im.width <= split ? 'left' : im.x >= split ? 'right' : im.y >= colTop ? 'above' : 'below');
  const part = (xs: TextItemIn[], where: string) =>
    mergeByTop(
      linesToBlocks(groupLines(xs), docMedian),
      page.images.filter((im) => side(im) === where),
    );
  return [...part(above, 'above'), ...part(left, 'left'), ...part(right, 'right'), ...part(below, 'below')];
}

/** Plain text of laid-out pages: one line per paragraph, blank lines between. */
export function blocksToText(pages: Block[][]): string {
  return (
    pages
      .map((blocks) =>
        blocks
          .filter((b): b is TextBlock => b.kind === 'text')
          .map((b) => b.text)
          .join('\n\n'),
      )
      .join('\n\n\f\n')
      .trim() + '\n'
  );
}

// ---------------------------------------------------------------- pdf.js extraction

/** pdf.js operator codes used to find image placements (stable across versions). */
const OPS = { save: 10, restore: 11, transform: 12, paintImageXObject: 85, paintInlineImageXObject: 86, paintImageXObjectRepeat: 88, paintImageMaskXObject: 83 } as const;

type M = [number, number, number, number, number, number];
const mul = (m: M, c: M): M => [
  m[0] * c[0] + m[1] * c[2],
  m[0] * c[1] + m[1] * c[3],
  m[2] * c[0] + m[3] * c[2],
  m[2] * c[1] + m[3] * c[3],
  m[4] * c[0] + m[5] * c[2] + c[4],
  m[4] * c[1] + m[5] * c[3] + c[5],
];

interface FontInfoLike {
  bold?: boolean;
  black?: boolean;
  italic?: boolean;
}

/**
 * Reads the text items (with bold and italic from the font) and the image
 * placements of a pdf.js page, in unrotated PDF points.
 */
export async function extractPage(page: PDFPageProxy, opts: { images?: boolean } = {}): Promise<PageItems> {
  const [x0, y0, x1, y1] = page.view;
  // The operator list loads the fonts into commonObjs (for bold/italic) and lists image placements.
  const ops = await page.getOperatorList();
  const tc = await page.getTextContent({ includeMarkedContent: false });
  const items: TextItemIn[] = [];
  for (const raw of tc.items as { str?: string; transform?: number[]; width?: number; height?: number; fontName?: string }[]) {
    if (typeof raw.str !== 'string' || !raw.transform || !raw.str) continue;
    let font: FontInfoLike | undefined;
    try {
      font = raw.fontName && page.commonObjs.has(raw.fontName) ? (page.commonObjs.get(raw.fontName) as FontInfoLike) : undefined;
    } catch {
      font = undefined;
    }
    const t = raw.transform;
    const size = raw.height || Math.hypot(t[2], t[3]) || 12;
    items.push({
      str: raw.str,
      x: t[4] - x0,
      y: t[5] - y0,
      width: raw.width ?? 0,
      size,
      bold: !!(font?.bold || font?.black),
      italic: !!font?.italic,
    });
  }
  const images: ImageBox[] = [];
  if (opts.images !== false) {
    let ctm: M = [1, 0, 0, 1, 0, 0];
    const stack: M[] = [];
    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i];
      if (fn === OPS.save) stack.push(ctm);
      else if (fn === OPS.restore) ctm = stack.pop() ?? [1, 0, 0, 1, 0, 0];
      else if (fn === OPS.transform) ctm = mul(ops.argsArray[i] as M, ctm);
      else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject) {
        const pts = [
          [0, 0],
          [1, 0],
          [0, 1],
          [1, 1],
        ].map(([u, v]) => [u * ctm[0] + v * ctm[2] + ctm[4], u * ctm[1] + v * ctm[3] + ctm[5]]);
        const xs = pts.map((p) => p[0]);
        const ys = pts.map((p) => p[1]);
        const box = { x: Math.min(...xs) - x0, y: Math.min(...ys) - y0, width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
        // Ignore specks (rules, bullets drawn as images).
        if (box.width >= 24 && box.height >= 24) images.push(box);
      }
    }
  }
  return { width: x1 - x0, height: y1 - y0, items, images };
}
