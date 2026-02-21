/**
 * True redaction without MuPDF (decision 8).
 *
 * Every page with at least one box is rendered by pdf.js to a 200 dpi bitmap,
 * the boxes are painted solid black ON THE BITMAP, and the page is replaced by
 * a page of the same size holding only that image (8-bit RGB, Flate). The text,
 * vector and image data under the boxes are gone, not covered.
 *
 * The output is a NEW document: pages without boxes are copied over, and
 * nothing else is (no Info dict, no XMP, no attachments, no document
 * JavaScript, no outline). Before the copy, the redacted source pages are
 * blanked, so no reference from a copied page (a link /Dest, an annotation
 * /P) can drag their old content into the output.
 *
 * Optional "keep the rest searchable": the redacted bitmap is OCRed and an
 * invisible text layer is added; the painted-over text cannot be recognised.
 */
import type { PDFDocumentProxy } from 'pdfjs-dist';
import {
  PDFDocument,
  PDFName,
  StandardFonts,
  concatTransformationMatrix,
  drawObject,
  popGraphicsState,
  pushGraphicsState,
  type PDFFont,
} from 'pdf-lib';
import { zlibSync } from 'fflate';
import { renderPage } from '../lib/pdfjs-setup';
import { addInvisibleText, type OcrPage } from './ocr';

/** A redaction box: 0-based page, fractions of the displayed page (origin top-left). */
export interface RedactBox {
  page: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** A rectangle in PDF user space (points, origin bottom-left). */
export interface PdfRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface TextItemLike {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

/**
 * Finds `query` (case-insensitive) inside text items and returns a padded box
 * around each match. `measure` gives a string's advance in any consistent
 * unit (canvas measureText), used to place a match inside its item.
 */
export function findMatches(items: TextItemLike[], query: string, measure: (s: string) => number): PdfRect[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const out: PdfRect[] = [];
  for (const it of items) {
    if (!it.str || !it.transform) continue;
    const lower = it.str.toLowerCase();
    const full = measure(it.str) || 1;
    const [a, b, c, d, e, f] = it.transform;
    const sx = Math.hypot(a, b) || 1;
    const sy = Math.hypot(c, d) || 1;
    const dir = [a / sx, b / sx];
    const up = [c / sy, d / sy];
    const h = it.height || sy;
    for (let at = lower.indexOf(q); at >= 0; at = lower.indexOf(q, at + 1)) {
      const s0 = (measure(it.str.slice(0, at)) / full) * it.width - 1;
      const s1 = (measure(it.str.slice(0, at + q.length)) / full) * it.width + 1;
      const t0 = -0.25 * h;
      const t1 = 0.95 * h;
      const corners = [
        [s0, t0],
        [s1, t0],
        [s0, t1],
        [s1, t1],
      ].map(([s, t]) => [e + s * dir[0] + t * up[0], f + s * dir[1] + t * up[1]]);
      const xs = corners.map((p) => p[0]);
      const ys = corners.map((p) => p[1]);
      out.push({ x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) });
    }
  }
  return out;
}

export interface RedactOptions {
  /** Render resolution of redacted pages (default 200 dpi). */
  dpi?: number;
  /** OCR for "keep the rest searchable"; omitted means image-only pages. */
  ocr?: (canvas: HTMLCanvasElement) => Promise<OcrPage>;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
}

/** Paints the boxes black and returns the pixels as 8-bit RGB. */
function paintAndExtract(canvas: HTMLCanvasElement, boxes: RedactBox[]): Uint8Array {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#000';
  for (const b of boxes) {
    const x = Math.floor(Math.min(b.x0, b.x1) * canvas.width);
    const y = Math.floor(Math.min(b.y0, b.y1) * canvas.height);
    const w = Math.ceil(Math.abs(b.x1 - b.x0) * canvas.width) + 1;
    const h = Math.ceil(Math.abs(b.y1 - b.y0) * canvas.height) + 1;
    ctx.fillRect(x, y, w, h);
  }
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const rgb = new Uint8Array(canvas.width * canvas.height * 3);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
    // Composite over white (the canvas starts transparent outside painted areas).
    const alpha = data[i + 3] / 255;
    rgb[j] = Math.round(data[i] * alpha + 255 * (1 - alpha));
    rgb[j + 1] = Math.round(data[i + 1] * alpha + 255 * (1 - alpha));
    rgb[j + 2] = Math.round(data[i + 2] * alpha + 255 * (1 - alpha));
  }
  return rgb;
}

interface RasterPage {
  rgb: Uint8Array;
  width: number;
  height: number;
  /** Page size in points (as displayed, rotation applied). */
  widthPt: number;
  heightPt: number;
  ocr?: OcrPage;
}

/**
 * Redacts `bytes` (decrypted) using `doc`, the same file open in pdf.js.
 * Returns the new PDF.
 */
export async function redactPdf(bytes: Uint8Array, doc: PDFDocumentProxy, boxes: RedactBox[], opts: RedactOptions = {}): Promise<Uint8Array> {
  const dpi = opts.dpi ?? 200;
  const scale = dpi / 72;
  const byPage = new Map<number, RedactBox[]>();
  for (const b of boxes) {
    if (b.page < 0 || b.page >= doc.numPages) continue;
    byPage.set(b.page, [...(byPage.get(b.page) ?? []), b]);
  }
  const redacted = [...byPage.keys()].sort((a, b) => a - b);
  const total = redacted.length + 1;
  let done = 0;
  opts.onProgress?.(0, total);

  // 1. Rasterise the redacted pages, boxes painted into the pixels.
  const rasters = new Map<number, RasterPage>();
  for (const index of redacted) {
    throwIfAborted(opts.signal);
    const page = await doc.getPage(index + 1);
    try {
      const canvas = await renderPage(page, { scale, signal: opts.signal });
      // White background under transparent areas, so OCR sees what a viewer sees.
      const rgb = paintAndExtract(canvas, byPage.get(index)!);
      const base = page.getViewport({ scale: 1 });
      const raster: RasterPage = { rgb, width: canvas.width, height: canvas.height, widthPt: base.width, heightPt: base.height };
      if (opts.ocr) {
        const ctx = canvas.getContext('2d')!;
        ctx.globalCompositeOperation = 'destination-over';
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        raster.ocr = await opts.ocr(canvas);
      }
      canvas.width = canvas.height = 0;
      rasters.set(index, raster);
    } finally {
      page.cleanup();
    }
    opts.onProgress?.(++done, total);
  }

  // 2. Blank the redacted pages in the source, so nothing can pull their content along.
  const src = await PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: true });
  const srcPages = src.getPages();
  for (const index of redacted) {
    const node = srcPages[index].node;
    node.set(PDFName.of('Contents'), src.context.register(src.context.stream(new Uint8Array(0))));
    node.set(PDFName.of('Resources'), src.context.obj({}));
    for (const key of ['Annots', 'AA', 'Thumb', 'B', 'StructParents', 'PieceInfo', 'Metadata']) node.delete(PDFName.of(key));
  }

  // 3. Build the new document.
  const out = await PDFDocument.create({ updateMetadata: false });
  const keep = srcPages.map((_, i) => i).filter((i) => !rasters.has(i));
  const copied = keep.length ? await out.copyPages(src, keep) : [];
  const copiedByIndex = new Map(keep.map((i, k) => [i, copied[k]]));
  let font: PDFFont | null = null;

  for (let i = 0; i < srcPages.length; i++) {
    const raster = rasters.get(i);
    if (!raster) {
      const p = out.addPage(copiedByIndex.get(i)!);
      // No page-level JavaScript actions in the output.
      p.node.delete(PDFName.of('AA'));
      continue;
    }
    const page = out.addPage([raster.widthPt, raster.heightPt]);
    const image = out.context.register(
      out.context.stream(zlibSync(raster.rgb, { level: 6 }), {
        Type: 'XObject',
        Subtype: 'Image',
        Width: raster.width,
        Height: raster.height,
        ColorSpace: 'DeviceRGB',
        BitsPerComponent: 8,
        Filter: 'FlateDecode',
      }),
    );
    const name = page.node.newXObject('Redacted', image);
    page.pushOperators(
      pushGraphicsState(),
      concatTransformationMatrix(raster.widthPt, 0, 0, raster.heightPt, 0, 0),
      drawObject(name),
      popGraphicsState(),
    );
    if (raster.ocr) {
      font ??= await out.embedFont(StandardFonts.Helvetica);
      const sx = raster.widthPt / raster.width;
      const sy = raster.heightPt / raster.height;
      addInvisibleText(page, font, raster.ocr, (x, y) => [x * sx, raster.heightPt - y * sy]);
    }
  }

  const saved = await out.save();
  opts.onProgress?.(total, total);
  return saved;
}
