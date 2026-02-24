/**
 * Image re-encoding for Compress (decision 7): decode (createImageBitmap for
 * JPEG, raw samples to RGBA for Flate), draw scaled into a canvas, encode as
 * JPEG. The canvas comes from a factory, so the same code runs in the worker
 * (OffscreenCanvas) and, where a browser has no OffscreenCanvas in workers
 * (some WebKit builds), on the main thread with an HTMLCanvasElement.
 */
import type { Reencode } from '../core/compress';

type Ctx2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

export interface CanvasLike {
  width: number;
  height: number;
  getContext(kind: '2d'): Ctx2D | null;
}

export interface CanvasBackend {
  create(width: number, height: number): CanvasLike;
  toJpeg(canvas: CanvasLike, quality: number): Promise<Blob | null>;
}

/** OffscreenCanvas with a working 2D context and JPEG encoder (worker or window). */
export function offscreenBackend(): CanvasBackend | null {
  try {
    if (typeof OffscreenCanvas === 'undefined') return null;
    const probe = new OffscreenCanvas(1, 1);
    if (!probe.getContext('2d') || typeof probe.convertToBlob !== 'function') return null;
  } catch {
    return null;
  }
  return {
    create: (w, h) => new OffscreenCanvas(w, h) as unknown as CanvasLike,
    toJpeg: (c, quality) => (c as unknown as OffscreenCanvas).convertToBlob({ type: 'image/jpeg', quality }),
  };
}

/** HTMLCanvasElement (main thread only). */
export function domBackend(): CanvasBackend {
  return {
    create: (w, h) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      return c as unknown as CanvasLike;
    },
    toJpeg: (c, quality) => new Promise((resolve) => (c as unknown as HTMLCanvasElement).toBlob(resolve, 'image/jpeg', quality)),
  };
}

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

export function createReencoder(backend: CanvasBackend): Reencode {
  return async (img, data, target, { quality, grayscale }) => {
    let bitmap: ImageBitmap | null = null;
    let full: CanvasLike | null = null;
    if (img.kind === 'jpeg') {
      bitmap = await decodeJpeg(data);
    } else {
      full = backend.create(img.width, img.height);
      full.getContext('2d')!.putImageData(rawToImageData(data, img.width, img.height, img.channels), 0, 0);
    }
    const canvas = backend.create(target.w, target.h);
    try {
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, target.w, target.h);
      ctx.drawImage((bitmap ?? full) as CanvasImageSource, 0, 0, target.w, target.h);
      if (grayscale) {
        const px = ctx.getImageData(0, 0, target.w, target.h);
        const d = px.data;
        for (let i = 0; i < d.length; i += 4) {
          const y = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
          d[i] = d[i + 1] = d[i + 2] = y;
        }
        ctx.putImageData(px, 0, 0);
      }
      const blob = await backend.toJpeg(canvas, quality);
      if (!blob || blob.type !== 'image/jpeg') return null;
      return new Uint8Array(await blob.arrayBuffer());
    } finally {
      bitmap?.close();
      for (const c of [full, canvas]) {
        if (c) c.width = c.height = 0;
      }
    }
  };
}
