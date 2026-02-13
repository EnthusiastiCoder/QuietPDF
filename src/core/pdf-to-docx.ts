/**
 * PDF to Word, realistic (decision 10). Text, headings, paragraphs, bold and
 * italic, simple two-column pages and embedded images are kept; exact layout,
 * tables and fonts are approximate. Each PDF page starts a new Word page.
 *
 * Images are cut out of the rendered page by a callback (canvas work happens
 * in the browser); without one, the converter writes text only (Node tests).
 */
import { Document, HeadingLevel, ImageRun, Packer, PageBreak, Paragraph, TextRun } from 'docx';
import { layoutPage, medianSize, type Block, type ImageBox, type PageItems } from './text-layout';
import { extractDocument, type ExtractOptions, type PdfLike } from './pdf-to-text';

export interface PngImage {
  png: Uint8Array;
  /** Placed size on the PDF page, in points. */
  widthPt: number;
  heightPt: number;
}

/** Renders the given image boxes of page `pageNo` (1-based) to PNGs, same order. Null skips a box. */
export type ImageRenderer = (pageNo: number, boxes: ImageBox[]) => Promise<(PngImage | null)[]>;

export interface DocxOptions extends ExtractOptions {
  renderImages?: ImageRenderer;
}

const PT_TO_PX = 96 / 72;
/** Text width of a Letter/A4 page with 1-inch margins, in points. */
const MAX_IMAGE_WIDTH_PT = 451;

function paragraphFor(block: Block<ImageBox & { png?: PngImage | null }>): Paragraph | null {
  if (block.kind === 'image') {
    const img = block.image.png;
    if (!img) return null;
    const scale = Math.min(1, MAX_IMAGE_WIDTH_PT / img.widthPt);
    return new Paragraph({
      children: [
        new ImageRun({
          type: 'png',
          data: img.png,
          transformation: {
            width: Math.round(img.widthPt * scale * PT_TO_PX),
            height: Math.round(img.heightPt * scale * PT_TO_PX),
          },
        }),
      ],
    });
  }
  return new Paragraph({
    heading: block.heading === 1 ? HeadingLevel.HEADING_1 : block.heading === 2 ? HeadingLevel.HEADING_2 : undefined,
    children: block.runs.map((r) => new TextRun({ text: r.text, bold: r.bold || undefined, italics: r.italic || undefined })),
  });
}

/** Builds the .docx from laid-out pages. */
export async function blocksToDocx(pages: Block<ImageBox & { png?: PngImage | null }>[][], pageSize?: { width: number; height: number }): Promise<Uint8Array> {
  const children: Paragraph[] = [];
  pages.forEach((blocks, i) => {
    if (i > 0) children.push(new Paragraph({ children: [new PageBreak()] }));
    for (const b of blocks) {
      const p = paragraphFor(b);
      if (p) children.push(p);
    }
  });
  if (children.length === 0) children.push(new Paragraph({ children: [] }));
  const doc = new Document({
    creator: 'QuietPDF',
    sections: [
      {
        properties: pageSize
          ? { page: { size: { width: Math.round(pageSize.width * 20), height: Math.round(pageSize.height * 20) } } }
          : {},
        children,
      },
    ],
  });
  return new Uint8Array(await Packer.toArrayBuffer(doc));
}

/** Converts extracted pages (see extractDocument) to a .docx. */
export async function pagesToDocx(pages: PageItems[], opts: DocxOptions = {}): Promise<Uint8Array> {
  const med = medianSize(pages);
  const laid: Block<ImageBox & { png?: PngImage | null }>[][] = [];
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    let images: (ImageBox & { png?: PngImage | null })[] = p.images;
    if (opts.renderImages && p.images.length) {
      const pngs = await opts.renderImages(i + 1, p.images);
      images = p.images.map((b, k) => ({ ...b, png: pngs[k] ?? null }));
    } else {
      images = [];
    }
    laid.push(layoutPage({ ...p, images }, med));
  }
  return blocksToDocx(laid, pages[0] ? { width: pages[0].width, height: pages[0].height } : undefined);
}

export async function pdfToDocx(doc: PdfLike, opts: DocxOptions = {}): Promise<Uint8Array> {
  const pages = await extractDocument(doc, { ...opts, images: !!opts.renderImages });
  return pagesToDocx(pages, opts);
}
