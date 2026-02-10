import { PDFArray, PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import { pageSet } from '../lib/ranges';
import { imageKind, rasterize } from '../lib/exif';

export interface WatermarkOptions {
  kind: 'text' | 'image';
  text?: string;
  image?: Uint8Array;
  /** 0-1 */
  opacity: number;
  /** Degrees, counter-clockwise. */
  rotation: number;
  position: 'center' | 'tiled';
  /** Stack the mark over the page content (default) or behind it. */
  layer?: 'over' | 'behind';
  /** Page range text; empty means all pages. */
  range?: string;
  fontSize?: number;
}

export async function addWatermark(bytes: Uint8Array, o: WatermarkOptions): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const pages = doc.getPages();
  const wanted = o.range?.trim() ? pageSet(o.range, pages.length) : null;
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  let image;
  if (o.kind === 'image') {
    if (!o.image) throw new Error('Choose a watermark image.');
    const kind = imageKind(o.image);
    image =
      kind === 'jpeg' ? await doc.embedJpg(o.image)
      : kind === 'png' ? await doc.embedPng(o.image)
      : await doc.embedPng(await rasterize(o.image, 'png'));
  } else if (!o.text?.trim()) {
    throw new Error('Enter the watermark text.');
  }
  const rad = (o.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  /** Calls draw with the origin that keeps a w x h item, rotated about its centre, centred on (cx, cy). */
  const place = (cx: number, cy: number, w: number, h: number, draw: (x: number, y: number) => void) => {
    draw(cx - (w / 2) * cos + (h / 2) * sin, cy - (w / 2) * sin - (h / 2) * cos);
  };

  /** pdf-lib appends the mark's stream last; move it first so the page paints over it. */
  const toBack = (page: (typeof pages)[number]) => {
    if (o.layer !== 'behind') return;
    const contents = page.node.Contents();
    if (!(contents instanceof PDFArray) || contents.size() < 2) return;
    const last = contents.get(contents.size() - 1);
    contents.remove(contents.size() - 1);
    contents.insert(0, last);
  };

  pages.forEach((page, i) => {
    if (wanted && !wanted.has(i + 1)) return;
    const { width, height } = page.getSize();
    if (image) {
      const n = o.position === 'tiled' ? 3 : 1;
      const cellW = width / n;
      const cellH = height / n;
      const iw = Math.min(cellW * 0.6, image.width);
      const ih = (image.height / image.width) * iw;
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          place(cellW * (c + 0.5), cellH * (r + 0.5), iw, ih, (x, y) =>
            page.drawImage(image, { x, y, width: iw, height: ih, rotate: degrees(o.rotation), opacity: o.opacity }),
          );
        }
      }
      toBack(page);
      return;
    }
    const text = (o.text as string).trim();
    const draw = (cx: number, cy: number, s: number) => {
      const tw = font.widthOfTextAtSize(text, s);
      const th = font.heightAtSize(s, { descender: false });
      place(cx, cy, tw, th, (x, y) =>
        page.drawText(text, { x, y, size: s, font, color: rgb(0.5, 0.5, 0.5), rotate: degrees(o.rotation), opacity: o.opacity }),
      );
    };
    const base = o.fontSize ?? Math.min(width, height) / 8;
    if (o.position === 'tiled') {
      const s = Math.min(base / 2, (width / 3 / font.widthOfTextAtSize(text, base)) * base * 0.9);
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) draw((width / 3) * (c + 0.5), (height / 3) * (r + 0.5), s);
    } else {
      // Shrink so the rotated text fits inside the page.
      const w = font.widthOfTextAtSize(text, base);
      const h = font.heightAtSize(base, { descender: false });
      const extent = Math.abs(w * cos) + Math.abs(h * sin);
      draw(width / 2, height / 2, extent > width * 0.9 ? (base * width * 0.9) / extent : base);
    }
    toBack(page);
  });
  return doc.save();
}
