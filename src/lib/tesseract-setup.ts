/**
 * tesseract.js, self-hosted at /vendor/tesseract/ (decision 3): the worker
 * script, the LSTM-only cores and the eng and hin models. Nothing is fetched
 * from a CDN: every path is set explicitly, and workerBlobURL is off so the
 * worker is a same-origin script (worker-src 'self').
 */
import type { Worker as TesseractWorker } from 'tesseract.js';

export const TESSERACT_BASE = '/vendor/tesseract/';
export type OcrLang = 'eng' | 'hin';

export const TESSERACT_OPTIONS = {
  workerPath: `${TESSERACT_BASE}worker.min.js`,
  corePath: `${TESSERACT_BASE}core/`,
  langPath: `${TESSERACT_BASE}lang`,
  workerBlobURL: false,
  gzip: true,
  // The models are already cached by the service worker; avoid a second copy in IndexedDB.
  cacheMethod: 'none',
} as const;

const workers = new Map<string, Promise<TesseractWorker>>();

/** Returns a ready worker for the given languages (shared per language set). */
export function getOcrWorker(langs: OcrLang[] = ['eng'], logger?: (m: { status: string; progress: number }) => void): Promise<TesseractWorker> {
  const key = [...langs].sort().join('+');
  let w = workers.get(key);
  if (!w) {
    w = import('tesseract.js').then(({ createWorker, OEM }) =>
      createWorker(langs, OEM.LSTM_ONLY, {
        ...TESSERACT_OPTIONS,
        logger: logger ? (m) => logger(m) : undefined,
      }),
    );
    w.catch(() => workers.delete(key));
    workers.set(key, w);
  }
  return w;
}

export async function terminateOcrWorkers(): Promise<void> {
  const all = [...workers.values()];
  workers.clear();
  await Promise.all(all.map(async (p) => (await p.catch(() => null))?.terminate()));
}
