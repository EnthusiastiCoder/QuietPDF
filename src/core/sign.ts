import { PDFDict, PDFDocument, PDFName, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

export interface SignaturePlacement {
  /** 0-based page. */
  page: number;
  /** Centre of the signature in PDF points (origin bottom-left). */
  cx: number;
  cy: number;
  /** Width in points. */
  width: number;
}

export type SignatureSource =
  | { kind: 'image'; png: Uint8Array; aspect: number }
  | { kind: 'text'; text: string; font: Uint8Array };

export async function signPdf(bytes: Uint8Array, source: SignatureSource, placements: SignaturePlacement[]): Promise<Uint8Array> {
  if (placements.length === 0) throw new Error('Click a page to place your signature.');
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const pages = doc.getPages();
  if (source.kind === 'image') {
    const img = await doc.embedPng(source.png);
    for (const p of placements) {
      const w = p.width;
      const h = w / source.aspect;
      pages[p.page].drawImage(img, { x: p.cx - w / 2, y: p.cy - h / 2, width: w, height: h });
    }
  } else {
    doc.registerFontkit(fontkit);
    const font = await doc.embedFont(source.font, { subset: true });
    for (const p of placements) {
      const size = (100 * p.width) / font.widthOfTextAtSize(source.text, 100);
      const h = font.heightAtSize(size, { descender: false });
      pages[p.page].drawText(source.text, {
        x: p.cx - p.width / 2,
        y: p.cy - h / 2,
        size,
        font,
        color: rgb(0.05, 0.1, 0.35),
      });
    }
  }
  const out = await doc.save();
  return source.kind === 'text' ? tagSubsets(out) : out;
}

/** pdf-lib names a subset "Name-1234"; PDF wants the "ABCDEF+Name" prefix form. */
async function tagSubsets(saved: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.load(saved, { updateMetadata: false });
  const tag = 'QPSIGN';
  let changed = false;
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFDict)) continue;
    for (const key of ['BaseFont', 'FontName']) {
      const v = obj.get(PDFName.of(key));
      if (v instanceof PDFName) {
        const m = /^\/(.+)-\d+$/.exec(v.toString());
        if (m && !/^[A-Z]{6}\+/.test(m[1])) {
          obj.set(PDFName.of(key), PDFName.of(`${tag}+${m[1]}`));
          changed = true;
        }
      }
    }
  }
  return changed ? doc.save() : saved;
}
