/**
 * pdf.js, self-hosted (decision 3). Everything pdf.js loads comes from
 * /vendor/pdfjs/ on this origin, and the binary data it needs (standard fonts,
 * cMaps, image-codec wasm) goes through an in-memory cache that is filled at
 * warm-up, so adding a file makes no new network request in the common case.
 *
 * Security options: no scripting (pdf.js 6 has no eval path), no XFA.
 */
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';

type Pdfjs = typeof import('pdfjs-dist');

export const PDFJS_BASE = '/vendor/pdfjs/';
const CMAP_URL = `${PDFJS_BASE}cmaps/`;
const FONT_URL = `${PDFJS_BASE}standard_fonts/`;
const WASM_URL = `${PDFJS_BASE}wasm/`;
const ICC_URL = `${PDFJS_BASE}iccs/`;

/** Files prefetched at idle time: the 14 standard fonts and the image codecs. */
const STANDARD_FONTS = [
  'FoxitDingbats.pfb',
  'FoxitFixed.pfb',
  'FoxitFixedBold.pfb',
  'FoxitFixedBoldItalic.pfb',
  'FoxitFixedItalic.pfb',
  'FoxitSerif.pfb',
  'FoxitSerifBold.pfb',
  'FoxitSerifBoldItalic.pfb',
  'FoxitSerifItalic.pfb',
  'FoxitSymbol.pfb',
  'LiberationSans-Regular.ttf',
  'LiberationSans-Bold.ttf',
  'LiberationSans-Italic.ttf',
  'LiberationSans-BoldItalic.ttf',
];
const WASM_FILES = ['openjpeg.wasm', 'jbig2.wasm', 'qcms_bg.wasm'];

const cache = new Map<string, Promise<Uint8Array>>();

function fetchBytes(url: string): Promise<Uint8Array> {
  let p = cache.get(url);
  if (!p) {
    p = fetch(url).then(async (r) => {
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      return new Uint8Array(await r.arrayBuffer());
    });
    p.catch(() => cache.delete(url));
    cache.set(url, p);
  }
  return p;
}

/** pdf.js BinaryDataFactory that serves from the warm-up cache. */
class CachedBinaryDataFactory {
  private readonly base: Record<string, string | null>;
  constructor({ cMapUrl = null, standardFontDataUrl = null, wasmUrl = null }: { cMapUrl?: string | null; standardFontDataUrl?: string | null; wasmUrl?: string | null }) {
    this.base = { cMapUrl, standardFontDataUrl, wasmUrl };
  }
  async fetch({ kind, filename }: { kind: string; filename: string }): Promise<Uint8Array> {
    const base = this.base[kind];
    if (!base) throw new Error(`pdf.js asked for unknown binary kind ${kind}`);
    // Copy: pdf.js may transfer the buffer to its worker.
    return (await fetchBytes(`${base}${filename}`)).slice();
  }
}

let pdfjsPromise: Promise<Pdfjs> | null = null;
let worker: InstanceType<Pdfjs['PDFWorker']> | null = null;

export function getPdfjs(): Promise<Pdfjs> {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist').then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = `${PDFJS_BASE}pdf.worker.min.mjs`;
      return lib;
    });
  }
  return pdfjsPromise;
}

async function getWorker(): Promise<InstanceType<Pdfjs['PDFWorker']>> {
  const lib = await getPdfjs();
  if (!worker || worker.destroyed) {
    worker = lib.PDFWorker.create({ port: new Worker(`${PDFJS_BASE}pdf.worker.min.mjs`, { type: 'module' }) });
  }
  return worker;
}

let warming: Promise<void> | null = null;
/**
 * Loads the library and its worker and prefetches the binary data into memory.
 * Resolves when everything is in memory, so a tool can offer its drop zone only
 * once adding a file makes no network request. Tools call this on mount.
 */
export function warmPdfjs(): Promise<void> {
  warming ??= (async () => {
    await getWorker();
    await Promise.allSettled([
      ...WASM_FILES.map((f) => fetchBytes(`${WASM_URL}${f}`)),
      ...STANDARD_FONTS.map((f) => fetchBytes(`${FONT_URL}${f}`)),
    ]);
  })();
  return warming;
}

export interface OpenOptions {
  password?: string;
}

/** Opens a PDF from bytes. The bytes are copied (pdf.js transfers its input). */
export async function openPdf(data: Uint8Array | ArrayBuffer, opts: OpenOptions = {}): Promise<PDFDocumentProxy> {
  const lib = await getPdfjs();
  const w = await getWorker();
  const bytes = data instanceof Uint8Array ? data.slice() : new Uint8Array(data.slice(0));
  const task = lib.getDocument({
    data: bytes,
    password: opts.password,
    worker: w,
    cMapUrl: CMAP_URL,
    cMapPacked: true,
    standardFontDataUrl: FONT_URL,
    wasmUrl: WASM_URL,
    iccUrl: ICC_URL,
    useWorkerFetch: false,
    BinaryDataFactory: CachedBinaryDataFactory,
    enableXfa: false,
    disableAutoFetch: true,
    disableStream: true,
  });
  return task.promise;
}

/** Whether an error from openPdf means a password is needed (or was wrong). */
export async function isPasswordError(e: unknown): Promise<boolean> {
  return (e as { name?: string } | null)?.name === 'PasswordException';
}

export interface RenderOptions {
  /** Target width in CSS pixels; the scale is derived from it. */
  width?: number;
  /** Explicit scale (overrides width). */
  scale?: number;
  /** Extra rotation in degrees, added to the page's own /Rotate. */
  rotation?: number;
  canvas?: HTMLCanvasElement;
  signal?: AbortSignal;
}

/** Renders one page into a canvas (created if not given). */
export async function renderPage(page: PDFPageProxy, opts: RenderOptions = {}): Promise<HTMLCanvasElement> {
  const rotation = ((page.rotate + (opts.rotation ?? 0)) % 360 + 360) % 360;
  const base = page.getViewport({ scale: 1, rotation });
  const dpr = typeof devicePixelRatio === 'number' ? Math.min(devicePixelRatio, 2) : 1;
  const scale = opts.scale ?? ((opts.width ?? base.width) / base.width) * dpr;
  const viewport = page.getViewport({ scale, rotation });
  const canvas = opts.canvas ?? document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  const task = page.render({ canvas, viewport });
  const onAbort = () => task.cancel();
  opts.signal?.addEventListener('abort', onAbort, { once: true });
  try {
    await task.promise;
  } finally {
    opts.signal?.removeEventListener('abort', onAbort);
  }
  return canvas;
}

/** Renders a small thumbnail of page `n` (1-based). */
export async function renderThumb(doc: PDFDocumentProxy, n: number, width = 160, signal?: AbortSignal): Promise<HTMLCanvasElement> {
  const page = await doc.getPage(n);
  try {
    return await renderPage(page, { width, signal });
  } finally {
    page.cleanup();
  }
}

/** Releases a document's memory (the document proxy has no destroy of its own). */
export function closePdf(doc: PDFDocumentProxy | null | undefined): void {
  void doc?.loadingTask?.destroy().catch(() => {});
}
