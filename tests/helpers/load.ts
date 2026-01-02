/**
 * Loads a source module that a test needs. Until the module exists the test
 * fails with "not implemented yet" (missing behaviour) instead of crashing the
 * whole file at import time.
 *
 *   const { parseRanges } = await need(() => import('../../src/lib/ranges'), 'src/lib/ranges.ts');
 */
export async function need<T>(importer: () => Promise<T>, path: string): Promise<T> {
  try {
    return await importer();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/Cannot find module|Failed to load url|Failed to resolve import|ERR_MODULE_NOT_FOUND|does not exist/i.test(msg)) {
      throw new Error(`${path} is not implemented yet (module not found)`);
    }
    throw e;
  }
}
