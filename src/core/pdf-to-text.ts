/**
 * PDF to Text (decision 10): the text of every page in reading order, using
 * the same line, column and paragraph grouping as PDF to Word.
 *
 * Takes an open pdf.js document (the browser opens it with pdfjs-setup, the
 * unit tests with the Node legacy build), so the core stays testable in Node.
 */
import type { PDFPageProxy } from 'pdfjs-dist';
import { blocksToText, extractPage, layoutPage, medianSize, type PageItems } from './text-layout';

/** The part of a pdf.js document the converters use. */
export interface PdfLike {
  numPages: number;
  getPage(n: number): Promise<PDFPageProxy>;
}

export interface ExtractOptions {
  /** Also collect image placements (PDF to Word). */
  images?: boolean;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
}

/** Reads every page's positioned text items (and image boxes). */
export async function extractDocument(doc: PdfLike, opts: ExtractOptions = {}): Promise<PageItems[]> {
  const pages: PageItems[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    throwIfAborted(opts.signal);
    const page = await doc.getPage(n);
    try {
      pages.push(await extractPage(page, { images: opts.images ?? false }));
    } finally {
      page.cleanup();
    }
    opts.onProgress?.(n, doc.numPages);
  }
  return pages;
}

/**
 * True when the document has (almost) no text layer: a scan or photos of
 * pages. Such input needs OCR before it can be converted.
 */
export function looksScanned(pages: PageItems[]): boolean {
  if (pages.length === 0) return false;
  const chars = pages.reduce((n, p) => n + p.items.reduce((m, it) => m + it.str.replace(/\s+/g, '').length, 0), 0);
  return chars < Math.max(8, pages.length * 4);
}

/** Lays out extracted pages and returns the plain text. */
export function pagesToText(pages: PageItems[]): string {
  const med = medianSize(pages);
  return blocksToText(pages.map((p) => layoutPage(p, med)));
}

export async function pdfToText(doc: PdfLike, opts: ExtractOptions = {}): Promise<string> {
  return pagesToText(await extractDocument(doc, { ...opts, images: false }));
}
