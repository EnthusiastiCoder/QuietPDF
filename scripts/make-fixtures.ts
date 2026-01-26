/**
 * Fixture generator (decision 18): deterministic output with pdf-lib and
 * jpeg-js, Playwright Chromium for the raster text images and canvas-encoded
 * PNG/WebP, qpdf-wasm (in Node) for the encrypted copy (the one fixture that
 * differs per run: AES-256 salts and keys are random). Small fixtures
 * (< 1 MB each) are committed in tests/fixtures/; the `.gen/` ones are
 * generated in Playwright globalSetup into tests/fixtures/.gen/ (gitignored).
 *
 * Usage: node scripts/make-fixtures.ts          (all fixtures)
 *        node scripts/make-fixtures.ts --gen    (only the .gen/ ones)
 *
 * The details below are the contract the tests rely on. Where the plan's
 * fixtures table is loose, the exact markers the tests search for are given.
 */

import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, PDFName, PDFString, StandardFonts, type PDFFont } from 'pdf-lib';
import jpeg from 'jpeg-js';

export interface FixtureSpec {
  file: string;
  generated?: boolean; // true: built in globalSetup into tests/fixtures/.gen/
  spec: string;
}

export const FIXTURES: FixtureSpec[] = [
  {
    file: 'text-3p.pdf',
    spec: '3 Letter (612x792) pages; page n has the text "PAGE-n-ALPHA" (Helvetica) and a paragraph; Info Title "Fixture". No images.',
  },
  { file: 'text-10p.pdf', spec: '10 Letter pages, each with a large label "P1".."P10" and nothing else.' },
  { file: 'mixed-sizes.pdf', spec: 'page 1 A4 portrait (595.28x841.89), page 2 Letter landscape (792x612).' },
  {
    file: 'headings.pdf',
    spec:
      'page 1: 24pt heading "Quarterly Report"; a 12pt body of 3 paragraphs, paragraph n starts with "BODY-PARA-n-START" ' +
      'and ends with "BODY-PARA-n-END" and wraps over at least 3 lines; then a Helvetica-Bold line "Important" (the last text on page 1). ' +
      'page 2: heading "Appendix". page 3: two columns, left "LEFT-COL-1".."LEFT-COL-3" (top to bottom), right "RIGHT-COL-1".."RIGHT-COL-3" ' +
      '(rows aligned with the left column, so a row-wise reader would interleave them).',
  },
  {
    file: 'with-image.pdf',
    spec: '1 page: heading text "WITH-IMAGE-HEADING" and one embedded 600x400 JPEG.',
  },
  {
    file: 'secret.pdf',
    spec:
      '2 pages. page 1: "Name: John Doe", "SSN 123-45-6789", "Public line" (separate lines), plus one annotation (e.g. a Text note). ' +
      'page 2: "Nothing secret". Info Author "Jane"; an XMP Metadata stream on the catalog.',
  },
  {
    file: 'scanned.pdf',
    spec: '1 page that is only a 300-dpi raster of "The quick brown fox jumps over the lazy dog 2026" (rendered by Playwright). No text.',
  },
  { file: 'scanned-hi.pdf', spec: '1 raster page of the Hindi text "नमस्ते दुनिया". No text.' },
  {
    file: 'encrypted.pdf',
    spec: 'text-3p.pdf encrypted with AES-256 (V 5, R 6), user password "open123" (qpdf-wasm in Node, or committed once with a note).',
  },
  { file: 'form.pdf', spec: 'an AcroForm with a text field "name".' },
  {
    file: 'photo-portrait-exif6.jpg',
    spec: '1200x800 stored pixels with an EXIF APP1 segment, Orientation=6 (displays as 800x1200).',
  },
  {
    file: 'photo-1.jpg',
    spec: 'small synthetic JPEG with distinct solid colour blocks, no EXIF (orientation 1). Dimensions differ from photo-2 and photo-3.',
  },
  { file: 'photo-2.png', spec: 'small synthetic PNG with distinct solid colour blocks; dimensions differ from photo-1 and photo-3.' },
  { file: 'photo-3.webp', spec: 'small synthetic WebP with distinct solid colour blocks; dimensions differ from photo-1 and photo-2.' },
  { file: 'large-200p.pdf', generated: true, spec: '200 text pages.' },
  {
    file: 'photos-hi-res.pdf',
    generated: true,
    spec: '5 pages, each with a 3000x2000 noisy-gradient JPEG at q 0.95 placed at full-page size.',
  },
];

const here = dirname(fileURLToPath(import.meta.url));
export const FIXTURES_DIR = resolve(here, '..', 'tests', 'fixtures');
export const GEN_DIR = resolve(FIXTURES_DIR, '.gen');

const FIXED_DATE = new Date('2026-01-01T00:00:00Z');
const LETTER: [number, number] = [612, 792];
const MAX_COMMITTED = 1024 * 1024;

const LOREM =
  'The committee reviewed the figures for the quarter and found that revenue grew steadily across every region, ' +
  'while costs stayed within the agreed budget. Further detail on each line item follows in the appendix, together ' +
  'with the method used to collect the numbers and the caveats that apply to them.';

// ---------- helpers ----------

async function newDoc(title = 'Fixture'): Promise<PDFDocument> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  doc.setTitle(title);
  doc.setProducer('QuietPDF fixtures');
  doc.setCreator('scripts/make-fixtures.ts');
  doc.setCreationDate(FIXED_DATE);
  doc.setModificationDate(FIXED_DATE);
  return doc;
}

function save(doc: PDFDocument): Promise<Uint8Array> {
  return doc.save({ useObjectStreams: false });
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && font.widthOfTextAtSize(next, size) > width) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Small deterministic PRNG (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BLOCK_COLOURS: [number, number, number][] = [
  [220, 40, 40],
  [40, 170, 60],
  [40, 80, 220],
  [240, 200, 30],
];

/** RGBA pixels in four solid quadrants (red, green / blue, yellow). */
function blocks(width: number, height: number): Buffer {
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const c = BLOCK_COLOURS[(y < height / 2 ? 0 : 2) + (x < width / 2 ? 0 : 1)];
      const i = (y * width + x) * 4;
      data[i] = c[0];
      data[i + 1] = c[1];
      data[i + 2] = c[2];
      data[i + 3] = 255;
    }
  }
  return data;
}

function encodeJpeg(width: number, height: number, data: Buffer, quality: number): Uint8Array {
  return new Uint8Array(jpeg.encode({ width, height, data }, quality).data);
}

/** Inserts an EXIF APP1 segment (IFD0 with one Orientation entry) right after SOI. */
function withExifOrientation(jpg: Uint8Array, orientation: number): Uint8Array {
  const tiff = [
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, // "MM", 42, IFD0 at offset 8
    0x00, 0x01, // 1 entry
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientation, 0x00, 0x00, // 0x0112 SHORT x1
    0x00, 0x00, 0x00, 0x00, // no next IFD
  ];
  const payload = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff]; // "Exif\0\0"
  const len = payload.length + 2;
  const app1 = [0xff, 0xe1, len >> 8, len & 0xff, ...payload];
  const out = new Uint8Array(jpg.length + app1.length);
  out.set(jpg.subarray(0, 2), 0);
  out.set(app1, 2);
  out.set(jpg.subarray(2), 2 + app1.length);
  return out;
}

// ---------- PDF fixtures ----------

export async function textPdf3(): Promise<Uint8Array> {
  const doc = await newDoc('Fixture');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let n = 1; n <= 3; n++) {
    const page = doc.addPage(LETTER);
    page.drawText(`PAGE-${n}-ALPHA`, { x: 72, y: 700, size: 24, font });
    let y = 660;
    for (const line of wrap(`Page ${n}. ${LOREM}`, font, 12, 468)) {
      page.drawText(line, { x: 72, y, size: 12, font });
      y -= 16;
    }
  }
  return save(doc);
}

async function textPdf10(): Promise<Uint8Array> {
  const doc = await newDoc('Fixture 10');
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  for (let n = 1; n <= 10; n++) {
    const page = doc.addPage(LETTER);
    const label = `P${n}`;
    const size = 160;
    page.drawText(label, { x: (612 - font.widthOfTextAtSize(label, size)) / 2, y: 340, size, font });
  }
  return save(doc);
}

async function mixedSizes(): Promise<Uint8Array> {
  const doc = await newDoc('Mixed sizes');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const a4 = doc.addPage([595.28, 841.89]);
  a4.drawText('A4 portrait', { x: 72, y: 760, size: 24, font });
  const land = doc.addPage([792, 612]);
  land.drawText('Letter landscape', { x: 72, y: 530, size: 24, font });
  return save(doc);
}

async function headings(): Promise<Uint8Array> {
  const doc = await newDoc('Quarterly Report');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const p1 = doc.addPage(LETTER);
  p1.drawText('Quarterly Report', { x: 72, y: 720, size: 24, font: bold });
  let y = 684;
  for (let n = 1; n <= 3; n++) {
    const text = `BODY-PARA-${n}-START ${LOREM} BODY-PARA-${n}-END`;
    const lines = wrap(text, font, 12, 468);
    if (lines.length < 3) throw new Error('headings.pdf: paragraph too short');
    for (const line of lines) {
      p1.drawText(line, { x: 72, y, size: 12, font });
      y -= 15;
    }
    y -= 12;
  }
  p1.drawText('Important', { x: 72, y: y - 6, size: 12, font: bold });

  const p2 = doc.addPage(LETTER);
  p2.drawText('Appendix', { x: 72, y: 720, size: 24, font: bold });

  const p3 = doc.addPage(LETTER);
  for (let r = 1; r <= 3; r++) {
    const ry = 700 - (r - 1) * 40;
    p3.drawText(`LEFT-COL-${r}`, { x: 72, y: ry, size: 12, font });
    p3.drawText(`RIGHT-COL-${r}`, { x: 340, y: ry, size: 12, font });
  }
  return save(doc);
}

async function withImage(): Promise<Uint8Array> {
  const doc = await newDoc('With image');
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage(LETTER);
  page.drawText('WITH-IMAGE-HEADING', { x: 72, y: 720, size: 24, font: bold });
  const img = await doc.embedJpg(encodeJpeg(600, 400, blocks(600, 400), 85));
  page.drawImage(img, { x: 72, y: 380, width: 450, height: 300 });
  return save(doc);
}

async function secret(): Promise<Uint8Array> {
  const doc = await newDoc('Secret');
  doc.setAuthor('Jane');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const p1 = doc.addPage(LETTER);
  p1.drawText('Name: John Doe', { x: 72, y: 700, size: 14, font });
  p1.drawText('SSN 123-45-6789', { x: 72, y: 670, size: 14, font });
  p1.drawText('Public line', { x: 72, y: 640, size: 14, font });
  const annot = doc.context.obj({
    Type: 'Annot',
    Subtype: 'Text',
    Rect: [400, 680, 420, 700],
    Contents: PDFString.of('Private note'),
    T: PDFString.of('Jane'),
    Open: false,
  });
  p1.node.addAnnot(doc.context.register(annot));
  const p2 = doc.addPage(LETTER);
  p2.drawText('Nothing secret', { x: 72, y: 700, size: 14, font });

  const xmp =
    '<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>\n' +
    '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
    '<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">' +
    '<dc:creator><rdf:Seq><rdf:li>Jane</rdf:li></rdf:Seq></dc:creator>' +
    '</rdf:Description></rdf:RDF></x:xmpmeta>\n<?xpacket end="w"?>';
  const stream = doc.context.stream(new TextEncoder().encode(xmp), { Type: 'Metadata', Subtype: 'XML' });
  doc.catalog.set(PDFName.of('Metadata'), doc.context.register(stream));
  return save(doc);
}

async function form(): Promise<Uint8Array> {
  const doc = await newDoc('Form');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage(LETTER);
  page.drawText('Name:', { x: 72, y: 706, size: 14, font });
  const field = doc.getForm().createTextField('name');
  field.addToPage(page, { x: 130, y: 700, width: 250, height: 24, font });
  return save(doc);
}

async function encrypt(input: Uint8Array): Promise<Uint8Array> {
  const require = createRequire(import.meta.url);
  const Module = require('@neslinesli93/qpdf-wasm');
  const wasmPath = resolve(here, '..', 'node_modules', '@neslinesli93', 'qpdf-wasm', 'dist', 'qpdf.wasm');
  const q = await Module({ noInitialRun: true, locateFile: () => wasmPath, print: () => {}, printErr: () => {} });
  q.FS.writeFile('in.pdf', input);
  const code = q.callMain(['--static-id', 'in.pdf', '--encrypt', 'open123', 'owner', '256', '--', 'out.pdf']);
  if (code !== 0 && code !== 3) throw new Error(`qpdf --encrypt failed (${code})`);
  return q.FS.readFile('out.pdf') as Uint8Array;
}

async function imagePdf(png: Uint8Array, title: string): Promise<Uint8Array> {
  const doc = await newDoc(title);
  const page = doc.addPage(LETTER);
  const img = await doc.embedPng(png);
  page.drawImage(img, { x: 0, y: 0, width: 612, height: 792 });
  return save(doc);
}

// ---------- browser-rendered rasters ----------

interface Rasters {
  scanned: Uint8Array;
  scannedHi: Uint8Array;
  photo2: Uint8Array;
  photo3: Uint8Array;
}

async function renderRasters(): Promise<Rasters> {
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch();
  try {
    // Letter page at 300 dpi: 816x1056 CSS px * 3.125 = 2550x3300 px.
    const ctx = await browser.newContext({ viewport: { width: 816, height: 1056 }, deviceScaleFactor: 3.125 });
    const page = await ctx.newPage();
    const shot = async (html: string): Promise<Uint8Array> => {
      await page.setContent(
        `<!doctype html><html><body style="margin:0;background:#fff;color:#000">${html}</body></html>`,
      );
      await page.evaluate(() => document.fonts.ready);
      return new Uint8Array(await page.screenshot({ type: 'png', fullPage: false }));
    };
    const scanned = await shot(
      '<p style="font:32px/1.4 Arial,sans-serif;margin:96px 72px">The quick brown fox jumps over the lazy dog 2026</p>',
    );
    const scannedHi = await shot(
      '<p lang="hi" style="font:44px/1.5 \'Nirmala UI\',Mangal,\'Noto Sans Devanagari\',sans-serif;margin:96px 72px">नमस्ते दुनिया</p>',
    );

    const canvasImage = (w: number, h: number, type: string): Promise<string> =>
      page.evaluate(
        ([w, h, type, colours]) => {
          const c = document.createElement('canvas');
          c.width = w;
          c.height = h;
          const g = c.getContext('2d')!;
          const cs = colours as number[][];
          for (let i = 0; i < 4; i++) {
            g.fillStyle = `rgb(${cs[i].join(',')})`;
            g.fillRect((i % 2) * (w / 2), Math.floor(i / 2) * (h / 2), w / 2, h / 2);
          }
          return c.toDataURL(type, 0.9);
        },
        [w, h, type, BLOCK_COLOURS] as const,
      );
    const fromDataUrl = (u: string) => new Uint8Array(Buffer.from(u.slice(u.indexOf(',') + 1), 'base64'));
    const photo2 = fromDataUrl(await canvasImage(400, 300, 'image/png'));
    const photo3 = fromDataUrl(await canvasImage(360, 480, 'image/webp'));
    if (!(await canvasImage(2, 2, 'image/webp')).startsWith('data:image/webp')) throw new Error('no WebP encoder');
    return { scanned, scannedHi, photo2, photo3 };
  } finally {
    await browser.close();
  }
}

// ---------- generated (large) fixtures ----------

async function large200(): Promise<Uint8Array> {
  const doc = await newDoc('Large 200');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let n = 1; n <= 200; n++) {
    const page = doc.addPage(LETTER);
    page.drawText(`LARGE-PAGE-${n}`, { x: 72, y: 720, size: 20, font });
    let y = 690;
    for (const line of wrap(LOREM, font, 11, 468)) {
      page.drawText(line, { x: 72, y, size: 11, font });
      y -= 14;
    }
  }
  return save(doc);
}

function noisyGradient(width: number, height: number, seed: number): Buffer {
  const rand = rng(seed);
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const n = (rand() - 0.5) * 24;
      data[i] = Math.max(0, Math.min(255, (x / width) * 255 + n));
      data[i + 1] = Math.max(0, Math.min(255, (y / height) * 255 + n));
      data[i + 2] = Math.max(0, Math.min(255, 128 + ((seed * 40) % 128) - n));
      data[i + 3] = 255;
    }
  }
  return data;
}

async function photosHiRes(): Promise<Uint8Array> {
  const doc = await newDoc('Photos hi-res');
  for (let p = 1; p <= 5; p++) {
    const jpg = encodeJpeg(3000, 2000, noisyGradient(3000, 2000, p), 95);
    const img = await doc.embedJpg(jpg);
    const page = doc.addPage([792, 528]);
    page.drawImage(img, { x: 0, y: 0, width: 792, height: 528 });
  }
  return save(doc);
}

/** Builds the `.gen/` fixtures that are missing (or all, with force). */
export async function generateLarge(dir = GEN_DIR, force = false): Promise<void> {
  mkdirSync(dir, { recursive: true });
  const jobs: [string, () => Promise<Uint8Array>][] = [
    ['large-200p.pdf', large200],
    ['photos-hi-res.pdf', photosHiRes],
  ];
  for (const [file, make] of jobs) {
    const p = resolve(dir, file);
    if (!force && existsSync(p) && statSync(p).size > 0) continue;
    writeFileSync(p, await make());
    console.log(`  .gen/${file} ${(statSync(p).size / 1024).toFixed(0)} KiB`);
  }
}

/** Builds every committed fixture into `dir`. */
export async function generateCommitted(dir = FIXTURES_DIR): Promise<void> {
  mkdirSync(dir, { recursive: true });
  const text3 = await textPdf3();
  const r = await renderRasters();
  const out: [string, Uint8Array][] = [
    ['text-3p.pdf', text3],
    ['text-10p.pdf', await textPdf10()],
    ['mixed-sizes.pdf', await mixedSizes()],
    ['headings.pdf', await headings()],
    ['with-image.pdf', await withImage()],
    ['secret.pdf', await secret()],
    ['scanned.pdf', await imagePdf(r.scanned, 'Scanned')],
    ['scanned-hi.pdf', await imagePdf(r.scannedHi, 'Scanned Hindi')],
    ['encrypted.pdf', await encrypt(text3)],
    ['form.pdf', await form()],
    ['photo-portrait-exif6.jpg', withExifOrientation(encodeJpeg(1200, 800, blocks(1200, 800), 80), 6)],
    ['photo-1.jpg', encodeJpeg(320, 240, blocks(320, 240), 85)],
    ['photo-2.png', r.photo2],
    ['photo-3.webp', r.photo3],
  ];
  for (const [file, bytes] of out) {
    if (bytes.length >= MAX_COMMITTED) throw new Error(`${file} is ${bytes.length} bytes, over the 1 MB limit`);
    writeFileSync(resolve(dir, file), bytes);
    console.log(`  ${file} ${(bytes.length / 1024).toFixed(1)} KiB`);
  }
}

const isMain =
  import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('make-fixtures.ts');
if (isMain) {
  const onlyGen = process.argv.includes('--gen');
  if (!onlyGen) await generateCommitted();
  await generateLarge(GEN_DIR, !onlyGen);
}
