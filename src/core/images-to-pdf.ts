import { PDFDocument, type PDFImage } from 'pdf-lib';
import { imageKind, jpegOrientation, rasterize } from '../lib/exif';

export interface ImagesToPdfOptions {
  pageSize: 'fit' | 'a4' | 'letter';
  orientation: 'auto' | 'portrait' | 'landscape';
  margin: 'none' | 'small' | 'big';
  output?: 'single' | 'per-image';
  onProgress?: (done: number, total: number) => void;
}

const SIZES = { a4: [595.28, 841.89], letter: [612, 792] } as const;
const MARGINS = { none: 0, small: 20, big: 50 } as const;
/** 96 dpi pixels to points for "Fit to image". */
const PX_TO_PT = 1;

async function embed(doc: PDFDocument, bytes: Uint8Array): Promise<PDFImage> {
  const kind = imageKind(bytes);
  if (kind === 'jpeg') {
    if (jpegOrientation(bytes) === 1) return doc.embedJpg(bytes);
    return doc.embedJpg(await rasterize(bytes, 'jpeg'));
  }
  if (kind === 'png') return doc.embedPng(bytes);
  if (kind === 'webp' || kind === 'gif') return doc.embedPng(await rasterize(bytes, 'png'));
  throw new Error('This file is not a JPG, PNG, WebP or GIF image.');
}

/** Puts every image on its own page, in the given order. */
export async function imagesToPdf(images: Uint8Array[], options: ImagesToPdfOptions): Promise<Uint8Array> {
  if (images.length === 0) throw new Error('Add at least one image.');
  const doc = await PDFDocument.create();
  doc.setProducer('QuietPDF');
  doc.setCreator('QuietPDF');
  const margin = MARGINS[options.margin];
  for (let i = 0; i < images.length; i++) {
    const img = await embed(doc, images[i]);
    let pw: number;
    let ph: number;
    if (options.pageSize === 'fit') {
      pw = img.width * PX_TO_PT + margin * 2;
      ph = img.height * PX_TO_PT + margin * 2;
    } else {
      let [w, h]: number[] = [...SIZES[options.pageSize]];
      const landscape = options.orientation === 'auto' ? img.width > img.height : options.orientation === 'landscape';
      if (landscape) [w, h] = [h, w];
      pw = w;
      ph = h;
    }
    const page = doc.addPage([pw, ph]);
    const scale = Math.min((pw - margin * 2) / img.width, (ph - margin * 2) / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    page.drawImage(img, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
    options.onProgress?.(i + 1, images.length);
  }
  return doc.save();
}
