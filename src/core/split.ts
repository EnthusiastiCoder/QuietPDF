import { PDFDocument } from 'pdf-lib';

/** Copies the given 1-based pages (in order) into a new PDF. */
export async function extractPages(src: PDFDocument, pages: number[]): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  out.setProducer('QuietPDF');
  out.setCreator('QuietPDF');
  const copied = await out.copyPages(src, pages.map((p) => p - 1));
  for (const p of copied) out.addPage(p);
  return out.save();
}

/** Splits into one PDF per group of 1-based pages. */
export async function splitPdf(
  bytes: Uint8Array,
  groups: number[][],
  onProgress?: (done: number, total: number) => void,
): Promise<Uint8Array[]> {
  const src = await PDFDocument.load(bytes, { updateMetadata: false });
  const out: Uint8Array[] = [];
  for (let i = 0; i < groups.length; i++) {
    out.push(await extractPages(src, groups[i]));
    onProgress?.(i + 1, groups.length);
  }
  return out;
}

/** Groups of n consecutive pages. */
export function groupsEvery(n: number, pageCount: number): number[][] {
  const groups: number[][] = [];
  for (let p = 1; p <= pageCount; p += n) {
    groups.push(Array.from({ length: Math.min(n, pageCount - p + 1) }, (_, k) => p + k));
  }
  return groups;
}

export const groupsEach = (pageCount: number): number[][] => groupsEvery(1, pageCount);
