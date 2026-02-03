import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { pageSet } from '../lib/ranges';

export type NumberFormat = 'n' | 'page-n' | 'page-n-of-total' | 'n-of-total';
export type NumberPosition = 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';

export interface PageNumberOptions {
  format: NumberFormat;
  position: NumberPosition;
  start: number;
  skipFirst: boolean;
  /** Page range text; empty means all pages. */
  range?: string;
  fontSize?: number;
}

export function numberLabel(format: NumberFormat, n: number, total: number): string {
  switch (format) {
    case 'page-n': return `Page ${n}`;
    case 'page-n-of-total': return `Page ${n} of ${total}`;
    case 'n-of-total': return `${n} / ${total}`;
    default: return String(n);
  }
}

export async function addPageNumbers(bytes: Uint8Array, o: PageNumberOptions): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const size = o.fontSize ?? 11;
  const pages = doc.getPages();
  const total = pages.length;
  const wanted = o.range?.trim() ? pageSet(o.range, total) : null;
  const inset = 28;
  pages.forEach((page, i) => {
    if (o.skipFirst && i === 0) return;
    if (wanted && !wanted.has(i + 1)) return;
    const label = numberLabel(o.format, o.start + i, o.start + total - 1);
    const w = font.widthOfTextAtSize(label, size);
    const { width, height } = page.getSize();
    const [v, h] = o.position.split('-') as ['top' | 'bottom', 'left' | 'center' | 'right'];
    const x = h === 'left' ? inset : h === 'right' ? width - inset - w : (width - w) / 2;
    const y = v === 'bottom' ? inset - size / 2 : height - inset - size / 2;
    page.drawText(label, { x, y, size, font, color: rgb(0.1, 0.1, 0.1) });
  });
  return doc.save();
}
