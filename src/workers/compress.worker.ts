/// <reference lib="webworker" />
/**
 * Compress, step 1 (decision 7): decode, downsample and re-encode the images
 * off the main thread. JPEG input is decoded with createImageBitmap, raw
 * Flate samples are expanded to RGBA; both are drawn scaled into an
 * OffscreenCanvas and encoded with convertToBlob as JPEG.
 */
import { expose, transfer, type WorkerContext } from '../lib/worker-rpc';
import { recompressImages, type CompressOptions, type Reencode } from '../core/compress';

export type CompressWorkerApi = {
  ping(): true;
  recompress(bytes: Uint8Array, opts: CompressOptions): Promise<{ bytes: Uint8Array; replaced: number }>;
};

async function decodeJpeg(data: Uint8Array): Promise<ImageBitmap> {
  const blob = new Blob([data as BlobPart], { type: 'image/jpeg' });
  try {
    // PDF viewers ignore EXIF orientation, so must we.
    return await createImageBitmap(blob, { imageOrientation: 'none' } as ImageBitmapOptions);
  } catch {
    return createImageBitmap(blob);
  }
}

function rawToImageData(data: Uint8Array, width: number, height: number, channels: 1 | 3): ImageData {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0, j = 0, n = width * height; i < n; i++, j += channels) {
    const o = i * 4;
    if (channels === 1) {
      rgba[o] = rgba[o + 1] = rgba[o + 2] = data[j];
    } else {
      rgba[o] = data[j];
      rgba[o + 1] = data[j + 1];
      rgba[o + 2] = data[j + 2];
    }
    rgba[o + 3] = 255;
  }
  return new ImageData(rgba, width, height);
}

const reencode: Reencode = async (img, data, target, { quality, grayscale }) => {
  let source: ImageBitmap | OffscreenCanvas;
  if (img.kind === 'jpeg') {
    source = await decodeJpeg(data);
  } else {
    const full = new OffscreenCanvas(img.width, img.height);
    full.getContext('2d')!.putImageData(rawToImageData(data, img.width, img.height, img.channels), 0, 0);
    source = full;
  }
  try {
    const canvas = new OffscreenCanvas(target.w, target.h);
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, target.w, target.h);
    ctx.drawImage(source, 0, 0, target.w, target.h);
    if (grayscale) {
      const px = ctx.getImageData(0, 0, target.w, target.h);
      const d = px.data;
      for (let i = 0; i < d.length; i += 4) {
        const y = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
        d[i] = d[i + 1] = d[i + 2] = y;
      }
      ctx.putImageData(px, 0, 0);
    }
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
    if (blob.type !== 'image/jpeg') return null;
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    if ('close' in source) source.close();
    else {
      source.width = 0;
      source.height = 0;
    }
  }
};

expose<CompressWorkerApi>({
  ping: () => true,
  async recompress(bytes: Uint8Array, opts: CompressOptions, ctx: WorkerContext) {
    const out = await recompressImages(bytes, opts, reencode, (done, total) => ctx.progress(done, total, 'Compressing images'), ctx.signal);
    return transfer(out, [out.bytes.buffer as ArrayBuffer]);
  },
});
