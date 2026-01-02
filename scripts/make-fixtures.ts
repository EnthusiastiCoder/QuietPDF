/**
 * Fixture generator: STUB written with the failing tests. WS1 implements it
 * (decision 18): deterministic output with pdf-lib and jpeg-js, and Playwright
 * Chromium for the raster text images. Small fixtures (< 1 MB each) are
 * committed in tests/fixtures/; the `.gen/` ones are generated in Playwright
 * globalSetup into tests/fixtures/.gen/ (gitignored).
 *
 * The details below are the contract the tests rely on. Where the plan's
 * fixtures table is loose, the exact markers the tests search for are given.
 */

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

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('make-fixtures.ts')) {
  console.error('scripts/make-fixtures.ts is a stub: WS1 implements the generator. Fixtures expected:');
  for (const f of FIXTURES) console.error(`  ${f.generated ? '.gen/' : ''}${f.file}: ${f.spec}`);
  process.exit(1);
}
