/**
 * JPEG EXIF orientation reading (pure, runs in Node and the browser) and the
 * browser-only rasteriser that bakes an orientation or a non-PDF-native format
 * (WebP, GIF) into a PNG or JPEG.
 */

/** EXIF Orientation (1-8) of a JPEG; 1 when absent or not a JPEG. */
export function jpegOrientation(bytes: Uint8Array): number {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return 1;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = 2;
  while (p + 4 <= bytes.length) {
    if (bytes[p] !== 0xff) return 1;
    const marker = bytes[p + 1];
    if (marker === 0xda || marker === 0xd9) return 1; // start of scan / end: no EXIF found
    const len = dv.getUint16(p + 2);
    if (marker === 0xe1 && len >= 16 && String.fromCharCode(...bytes.subarray(p + 4, p + 8)) === 'Exif') {
      const t = p + 10; // TIFF header
      const little = bytes[t] === 0x49;
      const u16 = (o: number) => dv.getUint16(t + o, little);
      const u32 = (o: number) => dv.getUint32(t + o, little);
      const ifd = u32(4);
      const n = u16(ifd);
      for (let i = 0; i < n; i++) {
        const e = ifd + 2 + i * 12;
        if (u16(e) === 0x0112) {
          const v = u16(e + 8);
          return v >= 1 && v <= 8 ? v : 1;
        }
      }
      return 1;
    }
    p += 2 + len;
  }
  return 1;
}

export type ImageKind = 'jpeg' | 'png' | 'webp' | 'gif' | 'unknown';

export function imageKind(b: Uint8Array): ImageKind {
  if (b[0] === 0xff && b[1] === 0xd8) return 'jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'gif';
  if (String.fromCharCode(...b.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...b.subarray(8, 12)) === 'WEBP') return 'webp';
  return 'unknown';
}

/**
 * Decodes with the browser (EXIF orientation applied) and re-encodes: PNG for
 * lossless sources, JPEG for rotated photos. Browser only.
 */
export async function rasterize(bytes: Uint8Array, as: 'png' | 'jpeg'): Promise<Uint8Array> {
  const blob = new Blob([bytes as BlobPart]);
  const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is not available in this browser.');
    if (as === 'jpeg') {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(bmp, 0, 0);
    const out = await new Promise<Blob | null>((r) => canvas.toBlob(r, as === 'png' ? 'image/png' : 'image/jpeg', 0.92));
    canvas.width = 0;
    if (!out) throw new Error('Could not convert the image.');
    return new Uint8Array(await out.arrayBuffer());
  } finally {
    bmp.close();
  }
}
