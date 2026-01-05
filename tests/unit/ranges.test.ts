import { describe, expect, test } from 'vitest';
import { need } from '../helpers/load';

// Contract: src/lib/ranges.ts exports
//   parseRanges(input: string, pageCount: number): [number, number][]   (1-based, inclusive)
//   class RangeParseError extends Error                                   (thrown on invalid input)
const load = () => need(() => import('../../src/lib/ranges'), 'src/lib/ranges.ts');

describe('parseRanges', () => {
  test('U1 "1-3,5,8-" with 10 pages gives [[1,3],[5,5],[8,10]]', async () => {
    const { parseRanges } = await load();
    expect(parseRanges('1-3,5,8-', 10)).toEqual([
      [1, 3],
      [5, 5],
      [8, 10],
    ]);
  });

  test.each([
    ['0', 'page 0 does not exist'],
    ['5-2', 'a range that runs backwards'],
    ['11', 'a page past the end (10 pages)'],
    ['a', 'not a number'],
  ])('U2 invalid input %j (%s) throws a RangeParseError with a message', async (input) => {
    const { parseRanges, RangeParseError } = await load();
    expect(typeof RangeParseError).toBe('function');
    let thrown: unknown;
    try {
      parseRanges(input, 10);
    } catch (e) {
      thrown = e;
    }
    expect(thrown, `parseRanges(${JSON.stringify(input)}, 10) must throw`).toBeInstanceOf(RangeParseError);
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message.length).toBeGreaterThan(0);
  });
});
