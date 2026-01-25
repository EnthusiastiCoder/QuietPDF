/**
 * Static privacy check on the built site (decision 3). Scans every .html and
 * .css file in dist/ and fails on:
 *  - any resource reference to another origin: src, srcset, poster, data,
 *    <link href> (except rel=canonical / alternate, which are not fetched),
 *    <form action>, <base href>, and CSS url() / @import;
 *  - protocol-relative URLs (//host/...);
 *  - an inline <script> (without src): the CSP is script-src 'self'.
 * Navigation links (<a href>) are not requests and are allowed.
 *
 * Usage: node scripts/check-third-party.ts [dir]   (default dist)
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';

const root = resolve(process.cwd(), process.argv[2] ?? 'dist');
if (!existsSync(root)) {
  console.error(`check:third-party: ${root} does not exist; run npm run build first.`);
  process.exit(1);
}

const problems: string[] = [];
let scanned = 0;

const OFF_ORIGIN = /^(?:[a-z][a-z0-9+.-]*:)?\/\//i;
const LOCAL_SCHEME = /^(?:data|blob|about|mailto|tel|javascript):/i;

function offOrigin(url: string): boolean {
  const u = url.trim().replace(/^['"]|['"]$/g, '');
  if (!u || LOCAL_SCHEME.test(u) || u.startsWith('#')) return false;
  return OFF_ORIGIN.test(u);
}

function attr(tag: string, name: string): string | undefined {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? (m[2] ?? m[3] ?? m[4] ?? '') : undefined;
}

function checkCss(css: string, where: string): void {
  for (const m of css.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi)) {
    if (offOrigin(m[2])) problems.push(`${where}: url(${m[2]})`);
  }
  for (const m of css.matchAll(/@import\s+(['"])([^'"]+)\1/gi)) {
    if (offOrigin(m[2])) problems.push(`${where}: @import ${m[2]}`);
  }
}

function checkHtml(html: string, where: string): void {
  // Inline scripts: <script> without a src attribute (JSON-LD data blocks are not executed).
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const tag = `<script${m[1]}>`;
    const type = (attr(tag, 'type') ?? '').toLowerCase();
    if (attr(tag, 'src') === undefined && type !== 'application/ld+json' && type !== 'application/json') {
      problems.push(`${where}: inline <script> (${m[2].trim().slice(0, 60) || 'empty'})`);
    }
  }
  for (const m of html.matchAll(/<([a-z][a-z0-9-]*)\b[^>]*>/gi)) {
    const tag = m[0];
    const name = m[1].toLowerCase();
    for (const a of ['src', 'poster', 'data', 'background']) {
      const v = attr(tag, a);
      if (v !== undefined && offOrigin(v)) problems.push(`${where}: <${name} ${a}="${v}">`);
    }
    const srcset = attr(tag, 'srcset');
    if (srcset) for (const part of srcset.split(',')) if (offOrigin(part.trim().split(/\s+/)[0])) problems.push(`${where}: <${name} srcset="${srcset}">`);
    if (name === 'link') {
      const rel = (attr(tag, 'rel') ?? '').toLowerCase().split(/\s+/);
      const href = attr(tag, 'href');
      if (href !== undefined && offOrigin(href) && !rel.includes('canonical') && !rel.includes('alternate')) {
        problems.push(`${where}: <link rel="${rel.join(' ')}" href="${href}">`);
      }
    }
    if (name === 'base' || name === 'form') {
      const v = attr(tag, name === 'base' ? 'href' : 'action');
      if (v !== undefined && offOrigin(v)) problems.push(`${where}: <${name}> ${v}`);
    }
    const style = attr(tag, 'style');
    if (style) checkCss(style, `${where} <${name} style>`);
  }
  for (const m of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) checkCss(m[1], `${where} <style>`);
}

function walk(dir: string): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(p);
      continue;
    }
    const ext = extname(entry.name).toLowerCase();
    if (ext !== '.html' && ext !== '.css') continue;
    scanned++;
    const text = readFileSync(p, 'utf8');
    const where = relative(root, p);
    if (ext === '.css') checkCss(text, where);
    else checkHtml(text, where);
  }
}
walk(root);

console.log(`check:third-party: scanned ${scanned} HTML/CSS files in ${relative(process.cwd(), root) || '.'}`);
if (problems.length) {
  console.error(`FAIL: ${problems.length} off-origin reference(s) or inline script(s):\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log('check:third-party: OK');
