import { describe, expect, test } from 'vitest';
import { need } from '../helpers/load';
import { readFixture } from '../helpers/fixtures';
import { pageSizes } from '../helpers/pdf';

// Contract: src/core/merge.ts exports
//   mergePdfs(files: Uint8Array[], options?: {}): Promise<Uint8Array>
const load = () => need(() => import('../../src/core/merge'), 'src/core/merge.ts');

const close = (a: number, b: number) => Math.abs(a - b) <= 1;

describe('mergePdfs (core)', () => {
  test('T-MRG3 merging mixed-sizes.pdf keeps each page its own size', async () => {
    const { mergePdfs } = await load();
    const out = await mergePdfs([readFixture('mixed-sizes.pdf'), readFixture('text-3p.pdf')]);
    const sizes = await pageSizes(out);
    expect(sizes).toHaveLength(5);
    // page 1: A4 portrait (595.28 x 841.89)
    expect(close(sizes[0].width, 595.28) && close(sizes[0].height, 841.89), JSON.stringify(sizes[0])).toBe(true);
    // page 2: Letter landscape (792 x 612)
    expect(close(sizes[1].width, 792) && close(sizes[1].height, 612), JSON.stringify(sizes[1])).toBe(true);
    // pages 3-5: text-3p, Letter portrait (612 x 792)
    for (const s of sizes.slice(2)) {
      expect(close(s.width, 612) && close(s.height, 792), JSON.stringify(s)).toBe(true);
    }
  });
});
