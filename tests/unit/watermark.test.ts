import { describe, expect, test } from 'vitest';
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { addWatermark } from '../../src/core/watermark';

async function streams(bytes: Uint8Array): Promise<string[]> {
  const doc = await PDFDocument.load(bytes);
  const page = doc.getPage(0);
  const contents = page.node.Contents() as PDFArray;
  const out: string[] = [];
  for (let i = 0; i < contents.size(); i++) {
    const s = doc.context.lookup(contents.get(i)) as PDFRawStream;
    out.push(Buffer.from(decodePDFRawStream(s).decode()).toString('latin1'));
  }
  return out;
}

async function source(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([300, 300]).drawText('BODY', { x: 20, y: 20 });
  return doc.save();
}

describe('addWatermark layer', () => {
  const opts = { kind: 'text' as const, text: 'DRAFT', opacity: 0.3, rotation: 0, position: 'center' as const };

  test('over puts the mark after the page content', async () => {
    const s = await streams(await addWatermark(await source(), { ...opts, layer: 'over' }));
    expect(s[s.length - 1]).toMatch(/\bgs\b/);
    expect(s[0]).not.toMatch(/\bgs\b/);
  });

  test('behind puts the mark before the page content', async () => {
    const s = await streams(await addWatermark(await source(), { ...opts, layer: 'behind' }));
    expect(s[0]).toMatch(/\bgs\b/);
    expect(s[s.length - 1]).not.toMatch(/\bgs\b/);
  });
});
