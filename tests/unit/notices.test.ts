import { describe, expect, test } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

// WS5 repo readiness. N1 needs a build (`npm run build` writes dist/).
const root = resolve(import.meta.dirname, '..', '..');

describe('WS5 notices', () => {
  test('N1 dist/third-party-licenses.txt lists every shipped dependency and the OFL', () => {
    const file = resolve(root, 'dist', 'third-party-licenses.txt');
    expect(existsSync(file), `${file} exists (scripts/gen-notices.ts at prebuild, then npm run build)`).toBe(true);
    const text = readFileSync(file, 'utf8');
    for (const name of ['pdf-lib', 'pdfjs-dist', 'qpdf', 'tesseract.js', 'docx', 'fflate', 'Inter', 'SIL Open Font License']) {
      expect(text, `notices mention ${name}`).toContain(name);
    }
  });

  test('N2 no LICENSE file; COPYRIGHT exists; README says "© Arpan Mandal. All Rights Reserved."', () => {
    const rootFiles = readdirSync(root);
    expect(rootFiles.filter((f) => /^licen[cs]e(\.|$)/i.test(f)), 'no LICENSE file in the repo root').toEqual([]);
    expect(existsSync(resolve(root, 'COPYRIGHT')), 'COPYRIGHT exists').toBe(true);
    const readme = resolve(root, 'README.md');
    expect(existsSync(readme), 'README.md exists').toBe(true);
    expect(readFileSync(readme, 'utf8')).toContain('© Arpan Mandal. All Rights Reserved.');
  });
});
