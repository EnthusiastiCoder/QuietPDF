/**
 * Writes public/third-party-licenses.txt: the licence text (and NOTICE, where
 * one exists) of every third-party package, font and model the site ships.
 * Run at prebuild. The file is generated and gitignored.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const nm = (p: string) => join(root, 'node_modules', p);

interface Entry {
  name: string;
  license: string;
  note?: string;
  files: string[]; // paths relative to node_modules (or absolute-from-root with "@root/")
  fallback?: string; // file whose text stands in when the package ships none
}

const APACHE = 'tesseract.js-core/LICENSE';

const ENTRIES: Entry[] = [
  { name: 'pdf-lib', license: 'MIT', files: ['pdf-lib/LICENSE.md'] },
  { name: '@pdf-lib/fontkit', license: 'MIT', files: [], note: 'Copyright (c) Andrew Dillon, MIT License (the package ships no licence file; see its package.json and repository).' },
  { name: 'pdfjs-dist (pdf.js)', license: 'Apache-2.0', files: ['pdfjs-dist/LICENSE'] },
  { name: 'qpdf (compiled to WebAssembly by @neslinesli93/qpdf-wasm)', license: 'ISC (wrapper) and Apache-2.0 (qpdf)', files: ['@neslinesli93/qpdf-wasm/LICENSE', 'pdfjs-dist/LICENSE'], note: 'qpdf is Copyright (c) Jay Berkenbilt and is licensed under the Apache License 2.0 (text below).' },
  { name: 'tesseract.js', license: 'Apache-2.0', files: ['tesseract.js/LICENSE.md'] },
  { name: 'tesseract.js-core', license: 'Apache-2.0', files: [APACHE] },
  { name: 'Tesseract trained language models (eng, hin) via @tesseract.js-data/eng and /hin', license: 'Apache-2.0 (upstream tessdata); packages MIT', files: [APACHE], note: 'The models are from the Tesseract project (https://github.com/tesseract-ocr/tessdata), Apache License 2.0 (text below).' },
  { name: 'docx', license: 'MIT', files: ['docx/LICENSE'] },
  { name: 'fflate', license: 'MIT', files: ['fflate/LICENSE'] },
  { name: 'Inter (@fontsource-variable/inter)', license: 'SIL Open Font License 1.1', files: ['@fontsource-variable/inter/LICENSE'] },
  { name: 'Dancing Script (@fontsource/dancing-script)', license: 'SIL Open Font License 1.1', files: ['@fontsource/dancing-script/LICENSE'] },
  { name: 'Noto Sans Devanagari (subset, used by PDF to DOCX and OCR output)', license: 'SIL Open Font License 1.1', files: ['@root/public/vendor/fonts/NotoSansDevanagari-OFL.txt'] },
  { name: 'Svelte', license: 'MIT', files: ['svelte/LICENSE.md'] },
  { name: 'Astro', license: 'MIT', files: ['astro/LICENSE'] },
];

const rule = '='.repeat(78);
let out = `Third-party notices\n\nQuietPDF is (c) Arpan Mandal. All Rights Reserved. It includes the following\nthird-party software, fonts and models, each under its own licence.\n\n`;
for (const e of ENTRIES) {
  out += `${rule}\n${e.name}\nLicence: ${e.license}\n${rule}\n`;
  if (e.note) out += `${e.note}\n`;
  for (const f of e.files) {
    const p = f.startsWith('@root/') ? join(root, f.slice(6)) : nm(f);
    if (!existsSync(p)) throw new Error(`gen-notices: missing ${p}; run npm install and copy-vendor first`);
    out += `\n${readFileSync(p, 'utf8').trim()}\n`;
  }
  out += '\n';
}
writeFileSync(join(root, 'public', 'third-party-licenses.txt'), out);
console.log(`gen-notices: wrote public/third-party-licenses.txt (${ENTRIES.length} entries)`);
