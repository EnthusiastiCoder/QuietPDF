/**
 * Node-side inspection helpers for the PDFs the tools produce.
 * Used by both the unit tests (vitest) and the e2e tests (Playwright).
 */
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFStream,
  decodePDFRawStream,
  type PDFObject,
} from 'pdf-lib';
import { unzipSync, strFromU8 } from 'fflate';
import jpeg from 'jpeg-js';

// ---------------------------------------------------------------- loading

export async function loadPdf(bytes: Uint8Array, opts: { ignoreEncryption?: boolean } = {}) {
  return PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: opts.ignoreEncryption });
}

export async function pageCount(bytes: Uint8Array): Promise<number> {
  return (await loadPdf(bytes)).getPageCount();
}

export async function pageSizes(bytes: Uint8Array): Promise<{ width: number; height: number }[]> {
  const doc = await loadPdf(bytes);
  return doc.getPages().map((p) => p.getSize());
}

export async function pageRotations(bytes: Uint8Array): Promise<number[]> {
  const doc = await loadPdf(bytes);
  return doc.getPages().map((p) => p.getRotation().angle);
}

export function isPdf(bytes: Uint8Array): boolean {
  return latin1(bytes.subarray(0, 5)) === '%PDF-';
}

// ---------------------------------------------------------------- text (pdf.js)

type PdfjsModule = typeof import('pdfjs-dist/legacy/build/pdf.mjs');
let pdfjsPromise: Promise<PdfjsModule> | undefined;
function pdfjs(): Promise<PdfjsModule> {
  pdfjsPromise ??= import('pdfjs-dist/legacy/build/pdf.mjs');
  return pdfjsPromise;
}

/** Opens a PDF with pdf.js (rejects with a PasswordException when a password is needed). */
export async function openWithPdfjs(bytes: Uint8Array, password?: string) {
  const lib = await pdfjs();
  const task = lib.getDocument({
    data: new Uint8Array(bytes), // pdf.js detaches the buffer it is given
    password,
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0,
  });
  return task.promise;
}

async function closePdfjs(doc: unknown): Promise<void> {
  const d = doc as { loadingTask?: { destroy(): Promise<void> }; destroy?: () => Promise<void> };
  if (d.loadingTask) await d.loadingTask.destroy();
  else if (d.destroy) await d.destroy();
}

/** The text of every page, items joined by spaces (line ends become newlines). */
export async function pageTexts(bytes: Uint8Array, password?: string): Promise<string[]> {
  const doc = await openWithPdfjs(bytes, password);
  const out: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    let s = '';
    for (const item of tc.items as { str?: string; hasEOL?: boolean }[]) {
      if (typeof item.str !== 'string') continue;
      s += item.str + (item.hasEOL ? '\n' : ' ');
    }
    out.push(s.replace(/[ \t]+/g, ' ').trim());
  }
  await closePdfjs(doc);
  return out;
}

/** Positions (PDF points, origin bottom-left) of text items whose string contains `needle`. */
export async function findTextBoxes(bytes: Uint8Array, pageNo: number, needle: string) {
  const doc = await openWithPdfjs(bytes);
  const page = await doc.getPage(pageNo);
  const tc = await page.getTextContent();
  const boxes: { x: number; y: number; width: number; height: number; str: string }[] = [];
  for (const item of tc.items as { str?: string; transform?: number[]; width?: number; height?: number }[]) {
    if (!item.str || !item.transform || !item.str.includes(needle)) continue;
    boxes.push({ x: item.transform[4], y: item.transform[5], width: item.width ?? 0, height: item.height ?? 0, str: item.str });
  }
  await closePdfjs(doc);
  return boxes;
}

// ---------------------------------------------------------------- streams

export function latin1(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return s;
}

export function decodeStream(stream: PDFStream): Uint8Array {
  if (stream instanceof PDFRawStream) return decodePDFRawStream(stream).decode();
  return (stream as unknown as { getContents(): Uint8Array }).getContents();
}

function pageNode(doc: PDFDocument, index: number) {
  const page = doc.getPage(index);
  return page.node;
}

/** The decoded content stream(s) of a page, concatenated, as latin1 text. */
export async function pageContent(bytes: Uint8Array, index: number): Promise<string> {
  const doc = await loadPdf(bytes);
  return contentOfNode(doc, index);
}

function contentOfNode(doc: PDFDocument, index: number): string {
  const node = pageNode(doc, index);
  const contents = node.Contents();
  if (!contents) return '';
  const streams: PDFStream[] = [];
  if (contents instanceof PDFArray) {
    for (let i = 0; i < contents.size(); i++) streams.push(contents.lookup(i, PDFStream));
  } else {
    streams.push(contents as PDFStream);
  }
  return streams.map((s) => latin1(decodeStream(s))).join('\n');
}

/**
 * Every stream in the file, decoded where possible, plus the decoded contents of
 * hex and literal strings found in them, as one searchable latin1 string.
 * Used to prove that redacted text is gone, not covered.
 */
export async function everythingSearchable(bytes: Uint8Array): Promise<string> {
  const doc = await loadPdf(bytes, { ignoreEncryption: true });
  const parts: string[] = [latin1(bytes)];
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFRawStream) {
      let text: string;
      try {
        text = latin1(decodePDFRawStream(obj).decode());
      } catch {
        text = latin1(obj.getContents());
      }
      parts.push(text, decodeStringsIn(text));
    } else {
      const text = obj.toString();
      parts.push(text, decodeStringsIn(text));
    }
  }
  return parts.join('\n');
}

function decodeStringsIn(text: string): string {
  const out: string[] = [];
  for (const m of text.matchAll(/<([0-9A-Fa-f\s]+)>/g)) {
    const hex = m[1].replace(/\s+/g, '');
    let s = '';
    for (let i = 0; i + 1 < hex.length; i += 2) s += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
    out.push(s);
    // UTF-16BE strings (FEFF prefix) as used by Info/XMP text
    if (hex.toUpperCase().startsWith('FEFF')) {
      let u = '';
      for (let i = 4; i + 3 < hex.length; i += 4) u += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
      out.push(u);
    }
  }
  for (const m of text.matchAll(/\(((?:\\.|[^\\)])*)\)/g)) out.push(m[1].replace(/\\(.)/g, '$1'));
  return out.join('\n');
}

// ---------------------------------------------------------------- resources

function lookupDict(dict: PDFDict | undefined, key: string): PDFDict | undefined {
  if (!dict) return undefined;
  const v = dict.lookup(PDFName.of(key));
  return v instanceof PDFDict ? v : undefined;
}

function nameOf(n: PDFName): string {
  return n.decodeText();
}

function num(obj: PDFObject | undefined): number | undefined {
  return obj instanceof PDFNumber ? obj.asNumber() : undefined;
}

/** BaseFont names of the fonts in a page's resources (recursing into Form XObjects). */
export async function pageFontNames(bytes: Uint8Array, index: number): Promise<string[]> {
  const doc = await loadPdf(bytes);
  const names = new Set<string>();
  const visit = (res: PDFDict | undefined, depth: number) => {
    const fonts = lookupDict(res, 'Font');
    if (fonts) {
      for (const [, v] of fonts.entries()) {
        const f = doc.context.lookup(v);
        if (f instanceof PDFDict) {
          const base = f.lookup(PDFName.of('BaseFont'));
          if (base instanceof PDFName) names.add(nameOf(base));
        }
      }
    }
    if (depth > 4) return;
    const xobjs = lookupDict(res, 'XObject');
    if (xobjs) {
      for (const [, v] of xobjs.entries()) {
        const x = doc.context.lookup(v);
        if (x instanceof PDFStream && x.dict.lookup(PDFName.of('Subtype')) === PDFName.of('Form')) {
          visit(lookupDict(x.dict, 'Resources'), depth + 1);
        }
      }
    }
  };
  visit(pageNode(doc, index).Resources(), 0);
  return [...names];
}

/** Fill (ca) and stroke (CA) alpha values of the ExtGStates a page uses (recursing into forms). */
export async function pageAlphas(bytes: Uint8Array, index: number): Promise<number[]> {
  const doc = await loadPdf(bytes);
  const out: number[] = [];
  const visit = (res: PDFDict | undefined, depth: number) => {
    const gs = lookupDict(res, 'ExtGState');
    if (gs) {
      for (const [, v] of gs.entries()) {
        const d = doc.context.lookup(v);
        if (d instanceof PDFDict) {
          for (const k of ['CA', 'ca']) {
            const n = num(d.lookup(PDFName.of(k)));
            if (n !== undefined) out.push(n);
          }
        }
      }
    }
    if (depth > 4) return;
    const xobjs = lookupDict(res, 'XObject');
    if (xobjs) {
      for (const [, v] of xobjs.entries()) {
        const x = doc.context.lookup(v);
        if (x instanceof PDFStream && x.dict.lookup(PDFName.of('Subtype')) === PDFName.of('Form')) {
          visit(lookupDict(x.dict, 'Resources'), depth + 1);
        }
      }
    }
  };
  visit(pageNode(doc, index).Resources(), 0);
  return out;
}

export interface ImageInfo {
  filter: string | undefined;
  width: number;
  height: number;
  colorSpace: string | undefined;
  bitsPerComponent: number | undefined;
  raw: Uint8Array;
  stream: PDFStream;
}

function imageInfo(stream: PDFStream): ImageInfo {
  const d = stream.dict;
  const f = d.lookup(PDFName.of('Filter'));
  let filter: string | undefined;
  if (f instanceof PDFName) filter = nameOf(f);
  else if (f instanceof PDFArray && f.size() > 0) filter = nameOf(f.lookup(0, PDFName));
  const cs = d.lookup(PDFName.of('ColorSpace'));
  return {
    filter,
    width: num(d.lookup(PDFName.of('Width'))) ?? 0,
    height: num(d.lookup(PDFName.of('Height'))) ?? 0,
    colorSpace: cs instanceof PDFName ? nameOf(cs) : undefined,
    bitsPerComponent: num(d.lookup(PDFName.of('BitsPerComponent'))),
    raw: stream instanceof PDFRawStream ? stream.getContents() : new Uint8Array(),
    stream,
  };
}

/** Every image XObject in the file. */
export async function allImages(bytes: Uint8Array): Promise<ImageInfo[]> {
  const doc = await loadPdf(bytes);
  const out: ImageInfo[] = [];
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFStream && obj.dict.lookup(PDFName.of('Subtype')) === PDFName.of('Image')) {
      out.push(imageInfo(obj));
    }
  }
  return out;
}

// ---------------------------------------------------------------- placements

type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function mul(m: Matrix, c: Matrix): Matrix {
  return [
    m[0] * c[0] + m[1] * c[2],
    m[0] * c[1] + m[1] * c[3],
    m[2] * c[0] + m[3] * c[2],
    m[2] * c[1] + m[3] * c[3],
    m[4] * c[0] + m[5] * c[2] + c[4],
    m[4] * c[1] + m[5] * c[3] + c[5],
  ];
}

function tokenize(src: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const ch = src[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === '%') { while (i < n && src[i] !== '\n' && src[i] !== '\r') i++; continue; }
    if (ch === '(') {
      let depth = 0; const start = i;
      for (; i < n; i++) {
        if (src[i] === '\\') { i++; continue; }
        if (src[i] === '(') depth++;
        else if (src[i] === ')') { depth--; if (depth === 0) { i++; break; } }
      }
      tokens.push(src.slice(start, i));
      continue;
    }
    if (ch === '<' && src[i + 1] === '<') { tokens.push('<<'); i += 2; continue; }
    if (ch === '>' && src[i + 1] === '>') { tokens.push('>>'); i += 2; continue; }
    if (ch === '<') { const end = src.indexOf('>', i); tokens.push(src.slice(i, end + 1)); i = end + 1; continue; }
    if (ch === '[' || ch === ']' || ch === '{' || ch === '}') { tokens.push(ch); i++; continue; }
    const start = i;
    i++;
    while (i < n && !/[\s()<>\[\]{}\/%]/.test(src[i])) i++;
    tokens.push(src.slice(start, i));
  }
  return tokens;
}

export interface Placement {
  name: string;
  kind: 'image' | 'form';
  /** Bounding box of the drawn unit square, in page points (origin bottom-left). */
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Every image drawn on a page (through `Do`), with its bounding box. Recurses into Form XObjects. */
export async function imagePlacements(bytes: Uint8Array, index: number): Promise<Placement[]> {
  const doc = await loadPdf(bytes);
  const out: Placement[] = [];

  const run = (content: string, res: PDFDict | undefined, base: Matrix, depth: number) => {
    let ctm = base;
    const stack: Matrix[] = [];
    let operands: string[] = [];
    for (const t of tokenize(content)) {
      if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(t) || t.startsWith('/') || t.startsWith('(') || t.startsWith('<') || t === '[' || t === ']') {
        operands.push(t);
        continue;
      }
      switch (t) {
        case 'q': stack.push(ctm); break;
        case 'Q': ctm = stack.pop() ?? base; break;
        case 'cm': {
          const m = operands.slice(-6).map(Number) as Matrix;
          if (m.length === 6 && m.every((v) => Number.isFinite(v))) ctm = mul(m, ctm);
          break;
        }
        case 'Do': {
          const name = operands[operands.length - 1]?.slice(1) ?? '';
          const xobjs = lookupDict(res, 'XObject');
          const x = xobjs ? doc.context.lookup(xobjs.get(PDFName.of(name))) : undefined;
          if (x instanceof PDFStream) {
            const subtype = x.dict.lookup(PDFName.of('Subtype'));
            if (subtype === PDFName.of('Image')) {
              const pts = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([u, v]) => [u * ctm[0] + v * ctm[2] + ctm[4], u * ctm[1] + v * ctm[3] + ctm[5]]);
              const xs = pts.map((p) => p[0]);
              const ys = pts.map((p) => p[1]);
              out.push({ name, kind: 'image', x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) });
            } else if (subtype === PDFName.of('Form') && depth < 6) {
              const fm = x.dict.lookup(PDFName.of('Matrix'));
              let formMatrix: Matrix = IDENTITY;
              if (fm instanceof PDFArray && fm.size() === 6) {
                formMatrix = Array.from({ length: 6 }, (_, k) => num(fm.lookup(k)) ?? 0) as Matrix;
              }
              run(latin1(decodeStream(x)), lookupDict(x.dict, 'Resources') ?? res, mul(formMatrix, ctm), depth + 1);
            }
          }
          break;
        }
        default: break;
      }
      operands = [];
    }
  };

  const node = pageNode(doc, index);
  run(contentOfNode(doc, index), node.Resources(), IDENTITY, 0);
  return out;
}

/** The images drawn on a page, in drawing order, with their stream info (top-level page resources). */
export async function pageImages(bytes: Uint8Array, index: number): Promise<(ImageInfo & Placement)[]> {
  const doc = await loadPdf(bytes);
  const xobjs = lookupDict(pageNode(doc, index).Resources(), 'XObject');
  const out: (ImageInfo & Placement)[] = [];
  for (const p of await imagePlacements(bytes, index)) {
    if (p.kind !== 'image') continue;
    const stream = xobjs ? doc.context.lookup(xobjs.get(PDFName.of(p.name))) : undefined;
    if (stream instanceof PDFStream) out.push({ ...imageInfo(stream), ...p });
  }
  return out;
}

/**
 * Samples the RGB colour at (xPt, yPt) of a page made of one full-page image
 * (a rasterised/redacted page). Supports DCTDecode and 8-bit Flate RGB/Gray.
 */
export async function sampleRasterPage(bytes: Uint8Array, index: number, xPt: number, yPt: number): Promise<[number, number, number]> {
  const doc = await loadPdf(bytes);
  const placements = await imagePlacements(bytes, index);
  const size = doc.getPage(index).getSize();
  const target = placements
    .filter((p) => p.kind === 'image')
    .sort((a, b) => b.width * b.height - a.width * a.height)[0];
  if (!target || target.width < size.width * 0.9 || target.height < size.height * 0.9) {
    throw new Error(`page ${index + 1} is not a single full-page image (placements: ${JSON.stringify(placements)})`);
  }
  const res = pageNode(doc, index).Resources();
  const stream = doc.context.lookup(lookupDict(res, 'XObject')?.get(PDFName.of(target.name)));
  if (!(stream instanceof PDFStream)) throw new Error('image stream not found');
  const info = imageInfo(stream);
  let rgba: Uint8Array;
  let channels = 4;
  if (info.filter === 'DCTDecode') {
    rgba = jpeg.decode(info.raw, { useTArray: true, formatAsRGBA: true }).data;
  } else if (info.filter === 'FlateDecode' && info.bitsPerComponent === 8) {
    const parms = lookupDict(stream.dict, 'DecodeParms');
    if (parms && num(parms.lookup(PDFName.of('Predictor')))! > 1) throw new Error('PNG predictors are not supported by this helper');
    rgba = decodeStream(stream);
    channels = info.colorSpace === 'DeviceGray' ? 1 : 3;
  } else {
    throw new Error(`unsupported image encoding ${info.filter} / ${info.bitsPerComponent} bpc`);
  }
  const col = Math.min(info.width - 1, Math.max(0, Math.floor(((xPt - target.x) / target.width) * info.width)));
  const row = Math.min(info.height - 1, Math.max(0, Math.floor(((target.y + target.height - yPt) / target.height) * info.height)));
  const o = (row * info.width + col) * channels;
  return channels === 1 ? [rgba[o], rgba[o], rgba[o]] : [rgba[o], rgba[o + 1], rgba[o + 2]];
}

// ---------------------------------------------------------------- metadata, encryption

export async function infoDict(bytes: Uint8Array): Promise<Record<string, string>> {
  const doc = await loadPdf(bytes);
  const ref = doc.context.trailerInfo.Info;
  const info = ref ? doc.context.lookup(ref) : undefined;
  const out: Record<string, string> = {};
  if (info instanceof PDFDict) {
    for (const [k, v] of info.entries()) {
      const val = doc.context.lookup(v);
      out[nameOf(k)] = val && 'decodeText' in val ? (val as { decodeText(): string }).decodeText() : String(val);
    }
  }
  return out;
}

export async function hasXmpMetadata(bytes: Uint8Array): Promise<boolean> {
  const doc = await loadPdf(bytes);
  if (doc.catalog.get(PDFName.of('Metadata'))) return true;
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFStream && obj.dict.lookup(PDFName.of('Type')) === PDFName.of('Metadata')) return true;
  }
  return false;
}

export async function annotationCount(bytes: Uint8Array, index: number): Promise<number> {
  const doc = await loadPdf(bytes);
  const annots = pageNode(doc, index).Annots();
  return annots ? annots.size() : 0;
}

/** The raw text of the trailer's /Encrypt dictionary, or undefined if the file is not encrypted. */
export function encryptDictText(bytes: Uint8Array): string | undefined {
  const s = latin1(bytes);
  const m = /\/Encrypt\s+(\d+)\s+(\d+)\s+R/.exec(s);
  if (!m) return undefined;
  const objStart = new RegExp(`(^|[^0-9])${m[1]}\\s+${m[2]}\\s+obj`).exec(s);
  if (!objStart) return undefined;
  const end = s.indexOf('endobj', objStart.index);
  return s.slice(objStart.index, end);
}

export function isEncrypted(bytes: Uint8Array): boolean {
  return /\/Encrypt\s+\d+\s+\d+\s+R/.test(latin1(bytes));
}

// ---------------------------------------------------------------- zip / docx

export function unzip(bytes: Uint8Array): Record<string, Uint8Array> {
  return unzipSync(bytes);
}

export function unzipText(bytes: Uint8Array, name: string): string {
  const entries = unzipSync(bytes);
  const e = entries[name];
  if (!e) throw new Error(`zip has no entry ${name}; entries: ${Object.keys(entries).join(', ')}`);
  return strFromU8(e);
}

export interface DocxParagraph {
  xml: string;
  text: string;
  style: string | undefined;
}

/** The paragraphs of word/document.xml in document order. */
export function docxParagraphs(documentXml: string): DocxParagraph[] {
  const out: DocxParagraph[] = [];
  for (const m of documentXml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>|<w:p\/>/g)) {
    const xml = m[0];
    const text = [...xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((t) => t[1]).join('');
    const style = /<w:pStyle\s+w:val="([^"]+)"/.exec(xml)?.[1];
    out.push({ xml, text, style });
  }
  return out;
}

