/// <reference lib="webworker" />
/**
 * Compress, step 1 (decision 7): decode, downsample and re-encode the images
 * off the main thread with OffscreenCanvas (see lib/jpeg-reencode.ts).
 * `ping` reports whether this worker can do it: some WebKit builds have no
 * OffscreenCanvas in workers, and the page then falls back to the main thread.
 */
import { expose, transfer, type WorkerContext } from '../lib/worker-rpc';
import { createReencoder, offscreenBackend } from '../lib/jpeg-reencode';
import { recompressImages, type CompressOptions } from '../core/compress';

export type CompressWorkerApi = {
  ping(): { offscreen: boolean };
  recompress(bytes: Uint8Array, opts: CompressOptions): Promise<{ bytes: Uint8Array; replaced: number }>;
};

const backend = offscreenBackend();

expose<CompressWorkerApi>({
  ping: () => ({ offscreen: backend !== null }),
  async recompress(bytes: Uint8Array, opts: CompressOptions, ctx: WorkerContext) {
    if (!backend) throw new Error('OffscreenCanvas is not available in this worker.');
    const out = await recompressImages(bytes, opts, createReencoder(backend), (done, total) => ctx.progress(done, total, 'Compressing images'), ctx.signal);
    return transfer(out, [out.bytes.buffer as ArrayBuffer]);
  },
});
