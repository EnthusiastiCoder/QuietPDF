/**
 * Fails when dist/ breaks Cloudflare Pages limits (decision 1): any single file
 * larger than 24 MiB (the 25 MiB per-file cap, with headroom) or more than
 * 15,000 files (the 20,000 file cap, with headroom).
 *
 * Usage: node scripts/check-assets.ts [dir]   (default dist)
 */
import { readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const MAX_FILE_BYTES = 24 * 1024 * 1024;
const MAX_FILES = 15_000;

const root = resolve(process.cwd(), process.argv[2] ?? 'dist');
if (!existsSync(root)) {
  console.error(`check:assets: ${root} does not exist; run npm run build first.`);
  process.exit(1);
}

let count = 0;
let total = 0;
const tooBig: string[] = [];
const largest: { path: string; size: number }[] = [];

function walk(dir: string): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(p);
      continue;
    }
    const size = statSync(p).size;
    count++;
    total += size;
    largest.push({ path: relative(root, p), size });
    if (size > MAX_FILE_BYTES) tooBig.push(`${relative(root, p)} (${(size / 1048576).toFixed(1)} MiB)`);
  }
}
walk(root);

largest.sort((a, b) => b.size - a.size);
const mib = (n: number) => `${(n / 1048576).toFixed(2)} MiB`;
console.log(`check:assets: ${count} files, ${mib(total)} total in ${relative(process.cwd(), root) || '.'}`);
for (const f of largest.slice(0, 5)) console.log(`  ${mib(f.size).padStart(10)}  ${f.path}`);

let failed = false;
if (tooBig.length) {
  failed = true;
  console.error(`FAIL: ${tooBig.length} file(s) larger than ${mib(MAX_FILE_BYTES)}:\n  ${tooBig.join('\n  ')}`);
}
if (count > MAX_FILES) {
  failed = true;
  console.error(`FAIL: ${count} files, more than ${MAX_FILES}.`);
}
if (failed) process.exit(1);
console.log('check:assets: OK');
