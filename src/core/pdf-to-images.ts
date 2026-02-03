import type { PDFDocumentProxy } from 'pdfjs-dist';
import { renderPage } from '../lib/pdfjs-setup';

export interface ImageFile {
  name: string;
  data: Uint8Array;
}

export interface PdfToImagesOptions {
  format: 'jpg' | 'png';
  dpi: number;
  /** File name without extension. */
  baseName: string;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

/** Renders every page with pdf.js at the given dpi and encodes it. Browser only. */
export async function pdfToImages(doc: PDFDocumentProxy, o: PdfToImagesOptions): Promise<ImageFile[]> {
  const total = doc.numPages;
  const pad = String(total).length;
  const out: ImageFile[] = [];
  for (let n = 1; n <= total; n++) {
    if (o.signal?.aborted) throw new Error('Cancelled');
    const page = await doc.getPage(n);
    let canvas: HTMLCanvasElement | undefined;
    try {
      canvas = await renderPage(page, { scale: o.dpi / 72 });
      if (o.format === 'jpg') {
        // JPEG has no alpha: paint white under the page.
        const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
        ctx.globalCompositeOperation = 'destination-over';
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      const c = canvas;
      const blob = await new Promise<Blob | null>((r) => c.toBlob(r, o.format === 'jpg' ? 'image/jpeg' : 'image/png', 0.92));
      if (!blob) throw new Error(`Could not encode page ${n}.`);
      out.push({ name: `${o.baseName}-${String(n).padStart(pad, '0')}.${o.format}`, data: new Uint8Array(await blob.arrayBuffer()) });
    } finally {
      if (canvas) canvas.width = 0;
      page.cleanup();
    }
    o.onProgress?.(n, total);
    await new Promise((r) => setTimeout(r, 0));
  }
  return out;
}
