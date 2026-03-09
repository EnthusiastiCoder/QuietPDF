/**
 * Generates the Open Graph images (1200x630 PNG) into public/og/ from the tool
 * registry. Run: node scripts/gen-og.ts [slug...]  (no args = all).
 */
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { TOOLS } from '../src/content/tools.ts';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

function svg(h1: string, line: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<rect width="1200" height="630" fill="#f6f8fd"/>
<rect x="0" y="0" width="24" height="630" fill="#2a5bd7"/>
<text x="90" y="120" font-family="Arial, Helvetica, sans-serif" font-size="44" font-weight="700" fill="#2a5bd7">QuietPDF</text>
<text x="90" y="330" font-family="Arial, Helvetica, sans-serif" font-size="96" font-weight="700" fill="#111827">${esc(h1)}</text>
<text x="90" y="420" font-family="Arial, Helvetica, sans-serif" font-size="40" fill="#374151">${esc(line)}</text>
<text x="90" y="540" font-family="Arial, Helvetica, sans-serif" font-size="34" fill="#374151">Runs in your browser. Your files are never uploaded.</text>
</svg>`;
}

const items = [{ file: 'default', h1: 'Private PDF tools', line: 'Free, no signup, works offline' }, ...TOOLS.map((t) => ({ file: t.slug, h1: t.h1, line: 'Free, no signup, no limits' }))];
const only = process.argv.slice(2);
mkdirSync('public/og', { recursive: true });
for (const it of items) {
  if (only.length && !only.includes(it.file)) continue;
  await sharp(Buffer.from(svg(it.h1, it.line))).png({ compressionLevel: 9, palette: true }).toFile(`public/og/${it.file}.png`);
}
