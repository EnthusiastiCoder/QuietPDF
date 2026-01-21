import { PDFDocument } from 'pdf-lib';

export interface MergeOptions {
  /** Called after each input file has been copied (done, total). */
  onProgress?: (done: number, total: number) => void;
}

/**
 * Merges PDFs in the given order. Every page keeps its own size, rotation and
 * content; the output has fresh metadata (no input Info is carried over).
 */
export async function mergePdfs(files: Uint8Array[], options: MergeOptions = {}): Promise<Uint8Array> {
  if (files.length === 0) throw new Error('Add at least one PDF to merge.');
  const out = await PDFDocument.create();
  out.setProducer('QuietPDF');
  out.setCreator('QuietPDF');
  for (let i = 0; i < files.length; i++) {
    const src = await PDFDocument.load(files[i], { updateMetadata: false });
    const pages = await out.copyPages(src, src.getPageIndices());
    for (const p of pages) out.addPage(p);
    options.onProgress?.(i + 1, files.length);
  }
  return out.save();
}
