import { describe, expect, test } from 'vitest';
import { need } from '../helpers/load';
import { readFixture } from '../helpers/fixtures';
import { allImages, pageCount } from '../helpers/pdf';

// Contract: src/core/images-to-pdf.ts exports
//   imagesToPdf(images: Uint8Array[], options: {
//     pageSize: 'fit' | 'a4' | 'letter'; orientation: 'auto' | 'portrait' | 'landscape';
//     margin: 'none' | 'small' | 'big'; output?: 'single' | 'per-image' }): Promise<Uint8Array>
// The image type is detected from the bytes. In Node it must work for JPEGs whose
// EXIF orientation is 1 (no canvas needed: the JPEG is embedded as is).
const load = () => need(() => import('../../src/core/images-to-pdf'), 'src/core/images-to-pdf.ts');

describe('imagesToPdf (core)', () => {
  test('T-IMG5 a JPEG with orientation 1 is embedded losslessly (stream bytes equal the input)', async () => {
    const { imagesToPdf } = await load();
    const jpg = readFixture('photo-1.jpg');
    const pdf = await imagesToPdf([jpg], { pageSize: 'fit', orientation: 'auto', margin: 'none' });
    expect(pdf).toBeInstanceOf(Uint8Array);
    expect(await pageCount(pdf)).toBe(1);
    const jpegs = (await allImages(pdf)).filter((i) => i.filter === 'DCTDecode');
    expect(jpegs).toHaveLength(1);
    expect(jpegs[0].raw.length).toBe(jpg.length);
    expect(Buffer.from(jpegs[0].raw).equals(Buffer.from(jpg))).toBe(true);
  });
});
