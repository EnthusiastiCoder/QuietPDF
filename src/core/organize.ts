import { PDFDocument, degrees } from 'pdf-lib';

export interface PageOp {
  /** 0-based source page, or -1 for a new blank page. */
  src: number;
  /** Clockwise rotation to add, in degrees (multiple of 90). */
  rotate: number;
}

/** Builds a new PDF from the page operations, in order (reorder, delete, duplicate, rotate, blank). */
export async function organizePdf(bytes: Uint8Array, ops: PageOp[]): Promise<Uint8Array> {
  if (ops.length === 0) throw new Error('Keep at least one page.');
  const src = await PDFDocument.load(bytes, { updateMetadata: false });
  const out = await PDFDocument.create();
  out.setProducer('QuietPDF');
  out.setCreator('QuietPDF');
  const first = src.getPage(0).getSize();
  for (const op of ops) {
    if (op.src < 0) {
      const page = out.addPage([first.width, first.height]);
      if (op.rotate) page.setRotation(degrees(((op.rotate % 360) + 360) % 360));
      continue;
    }
    const [copy] = await out.copyPages(src, [op.src]);
    const page = out.addPage(copy);
    if (op.rotate) page.setRotation(degrees((((page.getRotation().angle + op.rotate) % 360) + 360) % 360));
  }
  return out.save();
}
