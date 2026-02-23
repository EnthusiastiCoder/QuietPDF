import { describe, expect, test } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { readFixture } from '../helpers/fixtures';
import {
  MIN_SAVING_BYTES,
  PRESETS,
  compressPdf,
  contentTokens,
  findCandidates,
  imagePlacedSizes,
  pickSmaller,
  targetSize,
} from '../../src/core/compress';

describe('compress (core)', () => {
  test('pickSmaller keeps the original unless the saving is at least 2% and 10 KiB', () => {
    const original = new Uint8Array(100_000);
    expect(pickSmaller(original, new Uint8Array(99_000)).bytes).toBe(original); // 1 KB saved
    expect(pickSmaller(original, new Uint8Array(100_000 - MIN_SAVING_BYTES)).changed).toBe(true);
    const big = new Uint8Array(2_000_000);
    expect(pickSmaller(big, new Uint8Array(1_990_000)).changed).toBe(false); // 0.5% saved
    expect(pickSmaller(big, new Uint8Array(2_100_000)).bytes).toBe(big); // larger: never returned
  });

  test('targetSize follows the preset dpi at the placed size and never upscales', () => {
    // 3000x2000 px placed at 11 x 7.33 in: 120 dpi gives 1320 x 880
    expect(targetSize({ width: 3000, height: 2000 }, { w: 792, h: 528 }, PRESETS.recommended)).toEqual({ w: 1320, h: 880 });
    expect(targetSize({ width: 300, height: 200 }, { w: 792, h: 528 }, PRESETS.strong)).toEqual({ w: 300, h: 200 });
    // unknown placement: the longest side is capped
    expect(targetSize({ width: 4000, height: 1000 }, undefined, PRESETS.light)).toEqual({ w: 2000, h: 500 });
  });

  test('contentTokens skips strings, comments and inline image data', () => {
    const toks = [...contentTokens('q 1 0 0 1 5 5 cm (a \\) Do) Tj % c\n BI /W 2 ID \x00\xffQ EI /Im1 Do Q')];
    expect(toks).toEqual(['q', '1', '0', '0', '1', '5', '5', 'cm', '(a \\) Do)', 'Tj', 'BI', '/W', '2', 'ID', '/Im1', 'Do', 'Q']);
  });

  test('with-image.pdf: the photo is a candidate and its placed size is found', async () => {
    const doc = await PDFDocument.load(readFixture('with-image.pdf'));
    const candidates = findCandidates(doc);
    expect(candidates.length).toBeGreaterThanOrEqual(1);
    const sizes = imagePlacedSizes(doc);
    const placed = sizes.get(candidates[0].ref.toString());
    expect(placed).toBeDefined();
    expect(placed!.w).toBeGreaterThan(10);
    expect(placed!.h).toBeGreaterThan(10);
  });

  test('compressPdf returns the original bytes when nothing worthwhile is saved', async () => {
    const input = readFixture('text-3p.pdf');
    const out = await compressPdf(
      input,
      { level: 'recommended' },
      { recompress: async (b) => ({ bytes: b, replaced: 0 }), rewrite: async (b) => b.slice(0, b.length - 500) },
    );
    expect(out.changed).toBe(false);
    expect(out.bytes).toBe(input);
  });

  test('compressPdf survives a failing rewrite and keeps a smaller step-1 result', async () => {
    const input = new Uint8Array(500_000);
    const smaller = new Uint8Array(100_000);
    const out = await compressPdf(
      input,
      { level: 'strong' },
      {
        recompress: async () => ({ bytes: smaller, replaced: 3 }),
        rewrite: async () => {
          throw new Error('qpdf failed');
        },
      },
    );
    expect(out).toEqual({ bytes: smaller, changed: true, imagesReplaced: 3 });
  });
});
