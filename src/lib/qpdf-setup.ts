/**
 * qpdf (WASM), self-hosted at /vendor/qpdf/ (decision 3). Used for protect,
 * unlock and linearised/compressed rewrites.
 *
 * The package ships an emscripten classic script (`var Module = ...`), not an
 * ES module, and the CSP forbids eval, so it is loaded with importScripts in a
 * classic worker, or with a same-origin <script> tag on the main thread.
 */

export const QPDF_BASE = '/vendor/qpdf/';

export interface QpdfInstance {
  callMain(args: string[]): number;
  FS: {
    writeFile(path: string, data: Uint8Array): void;
    readFile(path: string): Uint8Array;
    unlink(path: string): void;
    mkdir(path: string): void;
  };
}

type QpdfFactory = (opts: Record<string, unknown>) => Promise<QpdfInstance>;

declare const importScripts: ((...urls: string[]) => void) | undefined;

function loadFactory(): Promise<QpdfFactory> {
  const g = globalThis as unknown as { Module?: QpdfFactory; document?: Document };
  if (typeof g.Module === 'function') return Promise.resolve(g.Module);
  const src = `${QPDF_BASE}qpdf.js`;
  if (typeof importScripts === 'function') {
    importScripts(src);
    return Promise.resolve(g.Module as unknown as QpdfFactory);
  }
  if (g.document) {
    return new Promise((resolve, reject) => {
      const s = g.document!.createElement('script');
      s.src = src;
      s.onload = () => (typeof g.Module === 'function' ? resolve(g.Module) : reject(new Error('qpdf did not load')));
      s.onerror = () => reject(new Error('qpdf did not load'));
      g.document!.head.append(s);
    });
  }
  return Promise.reject(new Error('qpdf: no way to load the script in this context'));
}

let instance: Promise<QpdfInstance> | null = null;
const log: string[] = [];

/** Returns the shared qpdf instance (loaded once). */
export function getQpdf(): Promise<QpdfInstance> {
  if (!instance) {
    instance = loadFactory().then((factory) =>
      factory({
        locateFile: (f: string) => `${QPDF_BASE}${f}`,
        noInitialRun: true,
        print: (s: string) => log.push(s),
        printErr: (s: string) => log.push(s),
      }),
    );
    instance.catch(() => (instance = null));
  }
  return instance;
}

export class QpdfError extends Error {
  constructor(
    message: string,
    readonly code: number,
    readonly output: string,
  ) {
    super(message);
    this.name = 'QpdfError';
  }
}

let seq = 0;

/**
 * Runs qpdf on one input. `args` go between the input and output paths, e.g.
 * `['--decrypt', '--password=x']`. qpdf exit code 3 (warnings) still succeeds.
 */
export async function runQpdf(input: Uint8Array, args: string[], before: string[] = []): Promise<Uint8Array> {
  const q = await getQpdf();
  const id = ++seq;
  const inPath = `/in-${id}.pdf`;
  const outPath = `/out-${id}.pdf`;
  q.FS.writeFile(inPath, input);
  log.length = 0;
  let code: number;
  try {
    code = q.callMain([...before, inPath, ...args, outPath]);
  } catch (e) {
    code = typeof (e as { status?: number }).status === 'number' ? (e as { status: number }).status : 2;
  }
  try {
    if (code !== 0 && code !== 3) throw new QpdfError(log.join('\n') || `qpdf failed (${code})`, code, log.join('\n'));
    return q.FS.readFile(outPath);
  } finally {
    for (const p of [inPath, outPath]) {
      try {
        q.FS.unlink(p);
      } catch {
        /* not created */
      }
    }
  }
}
