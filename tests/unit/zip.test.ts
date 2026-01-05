import { describe, expect, test } from 'vitest';
import { unzipSync, strToU8 } from 'fflate';
import { need } from '../helpers/load';

// Contract: src/lib/zip.ts exports
//   zip(entries: { name: string; data: Uint8Array }[]): Uint8Array | Promise<Uint8Array>
const load = () => need(() => import('../../src/lib/zip'), 'src/lib/zip.ts');

describe('zip', () => {
  test('U3 a zip of 2 entries round-trips through fflate unzip', async () => {
    const { zip } = await load();
    const a = strToU8('%PDF-1.7 first file');
    const b = new Uint8Array([0, 1, 2, 3, 250, 251, 252, 253, 254, 255]);
    const archive = await zip([
      { name: 'part-1.pdf', data: a },
      { name: 'part-2.pdf', data: b },
    ]);
    expect(archive).toBeInstanceOf(Uint8Array);
    const out = unzipSync(archive);
    expect(Object.keys(out).sort()).toEqual(['part-1.pdf', 'part-2.pdf']);
    expect(Array.from(out['part-1.pdf'])).toEqual(Array.from(a));
    expect(Array.from(out['part-2.pdf'])).toEqual(Array.from(b));
  });
});
