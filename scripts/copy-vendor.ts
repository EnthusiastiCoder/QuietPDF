/**
 * Copies the engines' runtime files from node_modules into public/vendor/ so the
 * site self-hosts every byte it loads (decision 3: no third-party origin, ever).
 * public/vendor/ is gitignored and rebuilt on every `npm run build` (prebuild).
 *
 * Only the variants the app uses are copied, to keep the deploy small:
 *  - pdf.js: the worker, cMaps, standard fonts, ICC profile and the image-codec
 *    wasm (no quickjs: scripting is off).
 *  - qpdf: the emscripten glue and wasm.
 *  - tesseract.js: the worker, the LSTM-only cores (plain, SIMD and relaxed
 *    SIMD; the .wasm.js files embed their wasm) and one eng and one hin model.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const nm = join(root, 'node_modules');
const out = join(root, 'public', 'vendor');

interface Copy {
  from: string;
  to: string;
  filter?: (name: string) => boolean;
}

const COPIES: Copy[] = [
  { from: 'pdfjs-dist/build/pdf.worker.min.mjs', to: 'pdfjs/pdf.worker.min.mjs' },
  { from: 'pdfjs-dist/cmaps', to: 'pdfjs/cmaps/' },
  { from: 'pdfjs-dist/standard_fonts', to: 'pdfjs/standard_fonts/' },
  { from: 'pdfjs-dist/iccs', to: 'pdfjs/iccs/' },
  { from: 'pdfjs-dist/wasm', to: 'pdfjs/wasm/', filter: (n) => !n.startsWith('quickjs') && !n.startsWith('LICENSE_PDFJS_QUICKJS') && !n.startsWith('LICENSE_QUICKJS') },
  { from: '@neslinesli93/qpdf-wasm/dist/qpdf.js', to: 'qpdf/qpdf.js' },
  { from: '@neslinesli93/qpdf-wasm/dist/qpdf.wasm', to: 'qpdf/qpdf.wasm' },
  { from: 'tesseract.js/dist/worker.min.js', to: 'tesseract/worker.min.js' },
  { from: 'tesseract.js-core/tesseract-core-lstm.wasm.js', to: 'tesseract/core/tesseract-core-lstm.wasm.js' },
  { from: 'tesseract.js-core/tesseract-core-simd-lstm.wasm.js', to: 'tesseract/core/tesseract-core-simd-lstm.wasm.js' },
  { from: 'tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js', to: 'tesseract/core/tesseract-core-relaxedsimd-lstm.wasm.js' },
  { from: '@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', to: 'tesseract/lang/eng.traineddata.gz' },
  { from: '@fontsource/dancing-script/files/dancing-script-latin-400-normal.woff', to: 'fonts/dancing-script.woff' },
  { from: '@tesseract.js-data/hin/4.0.0/hin.traineddata.gz', to: 'tesseract/lang/hin.traineddata.gz' },
];

function dirSize(p: string): number {
  const s = statSync(p);
  if (!s.isDirectory()) return s.size;
  return readdirSync(p).reduce((n, f) => n + dirSize(join(p, f)), 0);
}

rmSync(out, { recursive: true, force: true });
for (const c of COPIES) {
  const src = join(nm, c.from);
  if (!existsSync(src)) {
    console.error(`copy-vendor: missing ${src} (run npm install)`);
    process.exit(1);
  }
  const dest = join(out, c.to);
  const isDir = statSync(src).isDirectory();
  mkdirSync(isDir ? dest : dirname(dest), { recursive: true });
  cpSync(src, dest, {
    recursive: true,
    filter: (s) => !c.filter || s === src || c.filter(s.slice(src.length + 1)),
  });
}
console.log(`copy-vendor: ${(dirSize(out) / 1048576).toFixed(1)} MiB into public/vendor`);
