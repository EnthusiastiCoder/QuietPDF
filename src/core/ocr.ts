/**
 * OCR (decision 9): tesseract.js in a small worker pool, pdf.js renders each
 * page at 300 dpi. Output either plain text, or a searchable PDF: the ORIGINAL
 * page kept as is, plus an invisible text layer (TextRenderingMode.Invisible)
 * with each word fitted to its box in Helvetica.
 *
 * Every pool worker loads all the languages the page offers at warm-up, so a
 * later language switch (worker.reinitialize) fetches nothing: tesseract.js
 * only loads languages it does not already have.
 *
 * Limitation: the text layer uses the standard Helvetica font (WinAnsi), so
 * Devanagari words are left out of the searchable PDF. The .txt output keeps
 * them.
 */
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { Worker as TesseractWorker } from 'tesseract.js';
import {
  PDFDocument,
  StandardFonts,
  TextRenderingMode,
  beginText,
  endText,
  popGraphicsState,
  pushGraphicsState,
  setFontAndSize,
  setTextMatrix,
  setTextRenderingMode,
  showText,
  type PDFFont,
  type PDFPage,
} from 'pdf-lib';
import { TESSERACT_OPTIONS, type OcrLang } from '../lib/tesseract-setup';
import { renderPage } from '../lib/pdfjs-setup';

export type OcrLanguage = 'eng' | 'hin' | 'eng+hin';
export type OcrOutput = 'pdf' | 'txt';

export interface OcrWord {
  text: string;
  /** Pixel box in the recognised image (origin top-left). */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface OcrPage {
  text: string;
  /** Words grouped by line, in reading order. */
  lines: OcrWord[][];
}

// ------------------------------------------------------------ pool

interface PoolWorker {
  worker: TesseractWorker;
  lang: string;
  busy: boolean;
}

let pool: Promise<PoolWorker[]> | null = null;
let poolLangs: OcrLang[] = [];
const waiting: ((w: PoolWorker) => void)[] = [];

/** 2 workers, or half the cores when fewer (decision 9). */
export function poolSize(): number {
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 2 : 2;
  return Math.max(1, Math.min(2, Math.floor(cores / 2)));
}

/**
 * Starts the pool and loads the language data (call on page load, before a
 * file can be added). Resolves when every worker is ready.
 */
export function warmOcrPool(langs: OcrLang[] = ['eng', 'hin'], size = poolSize()): Promise<PoolWorker[]> {
  if (!pool) {
    poolLangs = langs;
    const lang = langs.join('+');
    pool = import('tesseract.js').then(async ({ createWorker, OEM }) => {
      const make = async (): Promise<PoolWorker> => ({
        worker: await createWorker(langs, OEM.LSTM_ONLY, { ...TESSERACT_OPTIONS }),
        lang,
        busy: false,
      });
      return Promise.all(Array.from({ length: size }, make));
    });
    pool.catch(() => (pool = null));
  }
  return pool;
}

async function acquire(): Promise<PoolWorker> {
  const workers = await warmOcrPool();
  const free = workers.find((w) => !w.busy);
  if (free) {
    free.busy = true;
    return free;
  }
  return new Promise((resolve) => waiting.push(resolve));
}

function release(w: PoolWorker): void {
  const next = waiting.shift();
  if (next) next(w);
  else w.busy = false;
}

export async function terminateOcrPool(): Promise<void> {
  const p = pool;
  pool = null;
  const workers = await p?.catch(() => []);
  await Promise.all((workers ?? []).map((w) => w.worker.terminate()));
}

/** Recognises one image (a canvas) in the given language. */
export async function recognize(image: HTMLCanvasElement, lang: OcrLanguage): Promise<OcrPage> {
  const needed = lang.split('+') as OcrLang[];
  if (pool && needed.some((l) => !poolLangs.includes(l))) {
    throw new Error(`OCR language ${lang} was not loaded on this page.`);
  }
  const w = await acquire();
  try {
    if (w.lang !== lang) {
      await w.worker.reinitialize(lang);
      w.lang = lang;
    }
    const { data } = await w.worker.recognize(image, {}, { text: true, blocks: true });
    const lines: OcrWord[][] = [];
    for (const block of data.blocks ?? []) {
      for (const para of block.paragraphs ?? []) {
        for (const line of para.lines ?? []) {
          const words = (line.words ?? [])
            .filter((wd) => wd.text.trim() && wd.confidence > 0)
            .map((wd) => ({ text: wd.text.trim(), x0: wd.bbox.x0, y0: wd.bbox.y0, x1: wd.bbox.x1, y1: wd.bbox.y1 }));
          if (words.length) lines.push(words);
        }
      }
    }
    return { text: data.text ?? '', lines };
  } finally {
    release(w);
  }
}

// ------------------------------------------------------------ text layer

/** Maps a pixel point of the recognised image to PDF user space. */
export type ToPdf = (x: number, y: number) => [number, number];

/**
 * Draws the words as invisible text on a page: one text object per word,
 * fitted to the word's box width, rotated with the page if needed. Words the
 * font cannot encode are skipped. Returns how many words were written.
 */
export function addInvisibleText(page: PDFPage, font: PDFFont, ocr: OcrPage, toPdf: ToPdf): number {
  const ctx = page.doc.context;
  page.node.wrapContentStreams(ctx.getPushGraphicsStateContentStream(), ctx.getPopGraphicsStateContentStream());
  const fontKey = page.node.newFontDictionary(font.name, font.ref);
  const ops = [pushGraphicsState(), beginText(), setTextRenderingMode(TextRenderingMode.Invisible)];
  let written = 0;
  for (const line of ocr.lines) {
    line.forEach((word, i) => {
      // A trailing space keeps the words apart when the text is extracted.
      const str = i < line.length - 1 ? `${word.text} ` : word.text;
      let encoded;
      let unit: number;
      try {
        encoded = font.encodeText(str);
        unit = font.widthOfTextAtSize(word.text, 1);
      } catch {
        return; // not in WinAnsi (e.g. Devanagari)
      }
      if (!(unit > 0)) return;
      const [ax, ay] = toPdf(word.x0, word.y1);
      const [bx, by] = toPdf(word.x1, word.y1);
      const [cx, cy] = toPdf(word.x0, word.y0);
      const width = Math.hypot(bx - ax, by - ay);
      const height = Math.hypot(cx - ax, cy - ay);
      if (width < 0.5 || height < 0.5) return;
      const cos = (bx - ax) / width;
      const sin = (by - ay) / width;
      const size = Math.max(1, width / unit);
      // Vertical: scale the glyphs to the box height (horizontal scale stays fitted to the width).
      const vscale = height / size / 0.9;
      const baselineLift = height * 0.18;
      ops.push(
        setFontAndSize(fontKey, size),
        setTextMatrix(cos, sin, -sin * vscale, cos * vscale, ax - sin * baselineLift, ay + cos * baselineLift),
        showText(encoded),
      );
      written++;
    });
  }
  ops.push(endText(), popGraphicsState());
  if (written > 0) page.pushOperators(...ops);
  return written;
}

// ------------------------------------------------------------ document

export interface OcrDocumentOptions {
  lang: OcrLanguage;
  output: OcrOutput;
  /** Render resolution (default 300 dpi). */
  dpi?: number;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
}

/**
 * OCRs every page. `bytes` are the (decrypted) file bytes, `doc` the same file
 * open in pdf.js. Returns the searchable PDF or the UTF-8 text.
 */
export async function ocrDocument(bytes: Uint8Array, doc: PDFDocumentProxy, opts: OcrDocumentOptions): Promise<{ bytes: Uint8Array; text: string }> {
  const dpi = opts.dpi ?? 300;
  const scale = dpi / 72;
  const total = doc.numPages;
  const results: OcrPage[] = new Array(total);
  const toPdfs: ToPdf[] = new Array(total);
  let next = 1;
  let done = 0;
  opts.onProgress?.(0, total);
  const workers = await warmOcrPool();
  const lane = async () => {
    while (next <= total) {
      throwIfAborted(opts.signal);
      const n = next++;
      const page = await doc.getPage(n);
      try {
        const canvas = await renderPage(page, { scale, signal: opts.signal });
        const viewport = page.getViewport({ scale: canvas.width / page.getViewport({ scale: 1 }).width });
        toPdfs[n - 1] = (x, y) => viewport.convertToPdfPoint(x, y) as [number, number];
        try {
          results[n - 1] = await recognize(canvas, opts.lang);
        } finally {
          canvas.width = canvas.height = 0;
        }
      } finally {
        page.cleanup();
      }
      opts.onProgress?.(++done, total);
    }
  };
  await Promise.all(Array.from({ length: Math.min(workers.length, total) }, lane));
  throwIfAborted(opts.signal);

  const text = results.map((r) => r.text.trim()).join('\n\n\f');
  if (opts.output === 'txt') return { bytes: new TextEncoder().encode(text), text };

  const out = await PDFDocument.load(bytes, { updateMetadata: false });
  const font = await out.embedFont(StandardFonts.Helvetica);
  out.getPages().forEach((p, i) => {
    if (results[i]) addInvisibleText(p, font, results[i], toPdfs[i]);
  });
  return { bytes: await out.save(), text };
}
