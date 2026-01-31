/**
 * Static preview server for dist/ that behaves like Cloudflare Pages:
 *  - headers from dist/_headers (path line, then indented "Name: value" lines;
 *    every matching block applies, "*" is a wildcard);
 *  - clean URLs: /merge-pdf serves merge-pdf.html, / serves index.html;
 *  - unknown paths get 404.html with status 404.
 *
 * Usage: node scripts/preview.ts   (port: QP_PORT, default 4399)
 */
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync, createReadStream } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';

const ROOT = resolve(process.cwd(), 'dist');
const PORT = Number(process.env.QP_PORT ?? 4399);

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.pfb': 'application/x-font-type1',
  '.bcmap': 'application/octet-stream',
  '.icc': 'application/vnd.iccprofile',
  '.gz': 'application/gzip',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

interface HeaderRule {
  pattern: RegExp;
  headers: [string, string][];
}

function parseHeaders(text: string): HeaderRule[] {
  const rules: HeaderRule[] = [];
  let current: HeaderRule | null = null;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    if (/^\s/.test(raw)) {
      const i = raw.indexOf(':');
      if (current && i > 0) current.headers.push([raw.slice(0, i).trim(), raw.slice(i + 1).trim()]);
    } else {
      const path = raw.trim();
      const re = '^' + path.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$';
      current = { pattern: new RegExp(re), headers: [] };
      rules.push(current);
    }
  }
  return rules;
}

const headersFile = join(ROOT, '_headers');
const rules = existsSync(headersFile) ? parseHeaders(readFileSync(headersFile, 'utf8')) : [];

function isFile(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

function resolveFile(pathname: string): string | null {
  const rel = normalize(decodeURIComponent(pathname)).replace(/^[/\\]+/, '');
  const base = join(ROOT, rel);
  if (base !== ROOT && !base.startsWith(ROOT + sep)) return null;
  const candidates = pathname.endsWith('/') ? [join(base, 'index.html')] : [base, `${base}.html`, join(base, 'index.html')];
  return candidates.find(isFile) ?? null;
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    res.end();
    return;
  }
  let file = resolveFile(url.pathname);
  let status = 200;
  if (!file) {
    status = 404;
    file = isFile(join(ROOT, '404.html')) ? join(ROOT, '404.html') : null;
  }
  const headers: Record<string, string> = {};
  for (const rule of rules) if (rule.pattern.test(url.pathname)) for (const [k, v] of rule.headers) headers[k] = v;
  if (!file) {
    res.writeHead(404, { ...headers, 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }
  headers['Content-Type'] = MIME[extname(file).toLowerCase()] ?? 'application/octet-stream';
  headers['Content-Length'] = String(statSync(file).size);
  res.writeHead(status, headers);
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  createReadStream(file).pipe(res);
});

server.listen(PORT, () => {
  console.log(`QuietPDF preview: http://localhost:${PORT} (serving ${ROOT})`);
});
