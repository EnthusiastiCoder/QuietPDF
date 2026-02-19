/**
 * Compress (decision 7), without Ghostscript:
 *   1. Re-encode the raster images (DCT, or 8-bit Flate gray/RGB without a
 *      predictor) as JPEG at the preset's resolution and quality, using the
 *      size each image is placed at on the page. Replace a stream only when
 *      the new one is smaller. (Runs in a module worker: compress.worker.ts.)
 *   2. Rewrite with qpdf: object streams, recompressed Flate, unreferenced
 *      resources dropped. (Main thread: qpdf is a classic script.)
 *   3. Never return a larger file. When the saving is negligible (under 2% or
 *      under 10 KiB) the ORIGINAL bytes come back with "already optimised".
 */
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFRef,
  PDFStream,
  decodePDFRawStream,
} from 'pdf-lib';

export type CompressLevel = 'light' | 'recommended' | 'strong';

export interface Preset {
  /** Target resolution at the placed size. */
  dpi: number;
  /** JPEG quality 0-1. */
  quality: number;
  /** Longest side in pixels when the placed size is unknown. */
  maxSide: number;
}

export const PRESETS: Record<CompressLevel, Preset> = {
  light: { dpi: 150, quality: 0.85, maxSide: 2000 },
  recommended: { dpi: 120, quality: 0.72, maxSide: 1600 },
  strong: { dpi: 96, quality: 0.55, maxSide: 1200 },
};

export interface CompressOptions {
  level: CompressLevel;
  /** Strong only: convert images to grayscale. */
  grayscale?: boolean;
}

/** qpdf rewrite flags (decision 7). */
export const QPDF_COMPRESS_ARGS = [
  '--object-streams=generate',
  '--compress-streams=y',
  '--recompress-flate',
  '--compression-level=9',
  '--remove-unreferenced-resources=yes',
];

/** A result must save at least this much to be worth returning. */
export const MIN_SAVING_RATIO = 0.02;
export const MIN_SAVING_BYTES = 10 * 1024;

export interface CompressResult {
  bytes: Uint8Array;
  /** False when the original bytes are returned ("already optimised"). */
  changed: boolean;
  imagesReplaced: number;
}

/** Picks the candidate only when it saves enough; otherwise the original. */
export function pickSmaller(original: Uint8Array, candidate: Uint8Array): { bytes: Uint8Array; changed: boolean } {
  const saved = original.byteLength - candidate.byteLength;
  if (saved >= MIN_SAVING_BYTES && saved >= original.byteLength * MIN_SAVING_RATIO) return { bytes: candidate, changed: true };
  return { bytes: original, changed: false };
}

// ------------------------------------------------------------ placements

type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function mul(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[1] * b[2],
    a[0] * b[1] + a[1] * b[3],
    a[2] * b[0] + a[3] * b[2],
    a[2] * b[1] + a[3] * b[3],
    a[4] * b[0] + a[5] * b[2] + b[4],
    a[4] * b[1] + a[5] * b[3] + b[5],
  ];
}

function latin1(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return s;
}

function streamBytes(s: PDFStream): Uint8Array {
  if (s instanceof PDFRawStream) {
    try {
      return decodePDFRawStream(s).decode();
    } catch {
      return s.getContents();
    }
  }
  return s.getContents();
}

/** Minimal content-stream tokenizer: enough for q, Q, cm and Do. */
export function* contentTokens(src: string): Generator<string> {
  let i = 0;
  const n = src.length;
  while (i < n) {
    const ch = src[i];
    if (ch === ' ' || ch === '\n' || ch === '\r' || ch === '\t' || ch === '\f' || ch === '\0') {
      i++;
      continue;
    }
    if (ch === '%') {
      while (i < n && src[i] !== '\n' && src[i] !== '\r') i++;
      continue;
    }
    if (ch === '(') {
      let depth = 0;
      const start = i;
      for (; i < n; i++) {
        if (src[i] === '\\') {
          i++;
          continue;
        }
        if (src[i] === '(') depth++;
        else if (src[i] === ')' && --depth === 0) {
          i++;
          break;
        }
      }
      yield src.slice(start, i);
      continue;
    }
    if (ch === '<' && src[i + 1] === '<') {
      yield '<<';
      i += 2;
      continue;
    }
    if (ch === '>' && src[i + 1] === '>') {
      yield '>>';
      i += 2;
      continue;
    }
    if (ch === '<') {
      const end = src.indexOf('>', i);
      const stop = end < 0 ? n : end + 1;
      yield src.slice(i, stop);
      i = stop;
      continue;
    }
    if (ch === '[' || ch === ']' || ch === '{' || ch === '}') {
      yield ch;
      i++;
      continue;
    }
    const start = i;
    i++;
    while (i < n && !/[\s()<>[\]{}/%]/.test(src[i])) i++;
    const tok = src.slice(start, i);
    yield tok;
    // Inline image data is binary: skip to EI.
    if (tok === 'ID') {
      const end = src.indexOf('EI', i);
      i = end < 0 ? n : end + 2;
    }
  }
}

function lookupDict(doc: PDFDocument, dict: PDFDict | undefined, key: string): PDFDict | undefined {
  const v = dict?.get(PDFName.of(key));
  const o = v instanceof PDFRef ? doc.context.lookup(v) : v;
  return o instanceof PDFDict ? o : undefined;
}

/**
 * The largest size (in points) each image XObject is drawn at, keyed by the
 * ref's string. Walks every page's content, through Form XObjects.
 */
export function imagePlacedSizes(doc: PDFDocument): Map<string, { w: number; h: number }> {
  const sizes = new Map<string, { w: number; h: number }>();
  const run = (content: string, res: PDFDict | undefined, base: Matrix, depth: number) => {
    let ctm = base;
    const stack: Matrix[] = [];
    let operands: string[] = [];
    for (const t of contentTokens(content)) {
      const c = t.charCodeAt(0);
      // operand: number, name, string, array bracket
      if ((c >= 48 && c <= 57) || c === 43 || c === 45 || c === 46 || c === 47 || c === 40 || c === 60 || t === '[' || t === ']') {
        operands.push(t);
        continue;
      }
      if (t === 'q') stack.push(ctm);
      else if (t === 'Q') ctm = stack.pop() ?? base;
      else if (t === 'cm') {
        const m = operands.slice(-6).map(Number) as Matrix;
        if (m.length === 6 && m.every((v) => Number.isFinite(v))) ctm = mul(m, ctm);
      } else if (t === 'Do') {
        const name = operands[operands.length - 1]?.slice(1) ?? '';
        const xobjs = lookupDict(doc, res, 'XObject');
        const ref = xobjs?.get(PDFName.of(name));
        const x = ref ? doc.context.lookup(ref) : undefined;
        if (x instanceof PDFStream) {
          const subtype = x.dict.lookup(PDFName.of('Subtype'));
          if (subtype === PDFName.of('Image') && ref instanceof PDFRef) {
            const w = Math.hypot(ctm[0], ctm[1]);
            const h = Math.hypot(ctm[2], ctm[3]);
            const key = ref.toString();
            const prev = sizes.get(key);
            sizes.set(key, { w: Math.max(w, prev?.w ?? 0), h: Math.max(h, prev?.h ?? 0) });
          } else if (subtype === PDFName.of('Form') && depth < 8) {
            const fm = x.dict.lookup(PDFName.of('Matrix'));
            let formMatrix: Matrix = IDENTITY;
            if (fm instanceof PDFArray && fm.size() === 6) {
              formMatrix = Array.from({ length: 6 }, (_, k) => (fm.lookup(k) as PDFNumber | undefined)?.asNumber?.() ?? 0) as Matrix;
            }
            run(latin1(streamBytes(x)), lookupDict(doc, x.dict, 'Resources') ?? res, mul(formMatrix, ctm), depth + 1);
          }
        }
      }
      operands = [];
    }
  };
  for (const page of doc.getPages()) {
    const contents = page.node.Contents();
    const parts: PDFStream[] = [];
    if (contents instanceof PDFStream) parts.push(contents);
    else if (contents instanceof PDFArray) {
      for (let i = 0; i < contents.size(); i++) {
        const s = contents.lookup(i);
        if (s instanceof PDFStream) parts.push(s);
      }
    }
    const content = parts.map((s) => latin1(streamBytes(s))).join('\n');
    run(content, page.node.Resources(), IDENTITY, 0);
  }
  return sizes;
}

// ------------------------------------------------------------ candidates

export interface ImageCandidate {
  ref: PDFRef;
  stream: PDFRawStream;
  width: number;
  height: number;
  /** 'jpeg' (raw DCT bytes) or 'raw' (decoded 8-bit samples). */
  kind: 'jpeg' | 'raw';
  channels: 1 | 3;
}

function nameOf(v: unknown): string | undefined {
  return v instanceof PDFName ? v.decodeText() : undefined;
}

function colorChannels(doc: PDFDocument, cs: unknown): 1 | 3 | 4 | 0 {
  const o = cs instanceof PDFRef ? doc.context.lookup(cs) : cs;
  const n = nameOf(o);
  if (n === 'DeviceRGB' || n === 'CalRGB') return 3;
  if (n === 'DeviceGray' || n === 'CalGray') return 1;
  if (n === 'DeviceCMYK') return 4;
  if (o instanceof PDFArray && nameOf(o.lookup(0)) === 'ICCBased') {
    const s = o.lookup(1);
    const nn = s instanceof PDFStream ? s.dict.lookup(PDFName.of('N')) : undefined;
    const v = nn instanceof PDFNumber ? nn.asNumber() : 0;
    return v === 1 || v === 3 || v === 4 ? v : 0;
  }
  return 0;
}

/** Image XObjects that can be safely re-encoded as JPEG. */
export function findCandidates(doc: PDFDocument): ImageCandidate[] {
  const smaskTargets = new Set<string>();
  const images: [PDFRef, PDFRawStream][] = [];
  for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    if (obj.dict.lookup(PDFName.of('Subtype')) !== PDFName.of('Image')) continue;
    images.push([ref, obj]);
    const sm = obj.dict.get(PDFName.of('SMask'));
    if (sm instanceof PDFRef) smaskTargets.add(sm.toString());
    const mask = obj.dict.get(PDFName.of('Mask'));
    if (mask instanceof PDFRef) smaskTargets.add(mask.toString());
  }
  const out: ImageCandidate[] = [];
  for (const [ref, s] of images) {
    if (smaskTargets.has(ref.toString())) continue;
    const d = s.dict;
    if (d.get(PDFName.of('ImageMask'))?.toString() === 'true') continue;
    if (d.has(PDFName.of('Decode'))) continue;
    const filter = d.lookup(PDFName.of('Filter'));
    const filters = filter instanceof PDFArray ? Array.from({ length: filter.size() }, (_, i) => nameOf(filter.lookup(i))) : [nameOf(filter)];
    if (filters.length !== 1) continue;
    const bpc = (d.lookup(PDFName.of('BitsPerComponent')) as PDFNumber | undefined)?.asNumber?.();
    const width = (d.lookup(PDFName.of('Width')) as PDFNumber | undefined)?.asNumber?.() ?? 0;
    const height = (d.lookup(PDFName.of('Height')) as PDFNumber | undefined)?.asNumber?.() ?? 0;
    if (width < 16 || height < 16 || bpc !== 8) continue;
    const ch = colorChannels(doc, d.get(PDFName.of('ColorSpace')));
    if (ch !== 1 && ch !== 3) continue;
    if (filters[0] === 'DCTDecode') {
      out.push({ ref, stream: s, width, height, kind: 'jpeg', channels: ch });
    } else if (filters[0] === 'FlateDecode') {
      const parms = d.lookup(PDFName.of('DecodeParms'));
      const predictor = parms instanceof PDFDict ? (parms.lookup(PDFName.of('Predictor')) as PDFNumber | undefined)?.asNumber?.() ?? 1 : 1;
      if (predictor > 1) continue;
      out.push({ ref, stream: s, width, height, kind: 'raw', channels: ch });
    }
  }
  return out;
}

/** Target pixel size for an image: the preset dpi at its placed size, never upscaled. */
export function targetSize(img: { width: number; height: number }, placed: { w: number; h: number } | undefined, preset: Preset): { w: number; h: number } {
  let scale: number;
  if (placed && placed.w > 0.5 && placed.h > 0.5) {
    scale = Math.max((placed.w / 72) * preset.dpi / img.width, (placed.h / 72) * preset.dpi / img.height);
  } else {
    scale = preset.maxSide / Math.max(img.width, img.height);
  }
  scale = Math.min(1, scale);
  return { w: Math.max(1, Math.round(img.width * scale)), h: Math.max(1, Math.round(img.height * scale)) };
}

/** Encodes pixels to JPEG; supplied by the caller (OffscreenCanvas in the worker). */
export type Reencode = (
  img: ImageCandidate,
  data: Uint8Array,
  target: { w: number; h: number },
  opts: { quality: number; grayscale: boolean },
) => Promise<Uint8Array | null>;

export interface RecompressProgress {
  (done: number, total: number): void;
}

/**
 * Re-encodes every candidate image, replacing a stream only when the new one
 * is smaller. Returns the saved document and how many images were replaced.
 */
export async function recompressImages(
  bytes: Uint8Array,
  opts: CompressOptions,
  reencode: Reencode,
  onProgress?: RecompressProgress,
  signal?: AbortSignal,
): Promise<{ bytes: Uint8Array; replaced: number }> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const preset = PRESETS[opts.level];
  const placed = imagePlacedSizes(doc);
  const candidates = findCandidates(doc);
  let replaced = 0;
  for (let i = 0; i < candidates.length; i++) {
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    const img = candidates[i];
    onProgress?.(i, candidates.length);
    const target = targetSize(img, placed.get(img.ref.toString()), preset);
    const grayscale = !!opts.grayscale;
    let data: Uint8Array;
    try {
      data = img.kind === 'jpeg' ? img.stream.getContents() : decodePDFRawStream(img.stream).decode();
    } catch {
      continue;
    }
    if (img.kind === 'raw' && data.length < img.width * img.height * img.channels) continue;
    const jpeg = await reencode(img, data, target, { quality: preset.quality, grayscale }).catch(() => null);
    if (!jpeg || jpeg.length >= img.stream.getContents().length) continue;
    const dict = doc.context.obj({
      Type: 'XObject',
      Subtype: 'Image',
      Width: target.w,
      Height: target.h,
      // Canvas JPEGs are always 3-component, grayscale ones included.
      ColorSpace: 'DeviceRGB',
      BitsPerComponent: 8,
      Filter: 'DCTDecode',
    }) as PDFDict;
    for (const key of ['SMask', 'Intent', 'Interpolate', 'Metadata', 'OC']) {
      const v = img.stream.dict.get(PDFName.of(key));
      if (v) dict.set(PDFName.of(key), v);
    }
    doc.context.assign(img.ref, PDFRawStream.of(dict, jpeg));
    replaced++;
  }
  onProgress?.(candidates.length, candidates.length);
  if (replaced === 0) return { bytes, replaced };
  return { bytes: await doc.save({ useObjectStreams: false }), replaced };
}

/**
 * The whole pipeline. `recompress` runs step 1 (a worker in the browser) and
 * `rewrite` runs qpdf; both are injected so the orchestration is testable.
 */
export async function compressPdf(
  bytes: Uint8Array,
  opts: CompressOptions,
  steps: {
    recompress: (bytes: Uint8Array, opts: CompressOptions) => Promise<{ bytes: Uint8Array; replaced: number }>;
    rewrite: (bytes: Uint8Array) => Promise<Uint8Array>;
  },
): Promise<CompressResult> {
  const step1 = await steps.recompress(bytes, opts);
  let candidate = step1.bytes;
  try {
    const rewritten = await steps.rewrite(candidate);
    if (rewritten.byteLength < candidate.byteLength) candidate = rewritten;
  } catch {
    /* qpdf could not rewrite: keep step 1's output */
  }
  const picked = pickSmaller(bytes, candidate);
  return { ...picked, imagesReplaced: picked.changed ? step1.replaced : 0 };
}
