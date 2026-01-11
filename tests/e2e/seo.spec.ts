import type { APIRequestContext, Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { ALIASES, EXPECTED_CSP, ORGANIZE_PRESETS, TOOL_ROUTES } from './routes';

/** The main tool routes plus the Organize presets: each has its own landing content. */
const LANDING_ROUTES = [...TOOL_ROUTES, ...Object.values(ORGANIZE_PRESETS)];

const trimSlash = (p: string) => (p.length > 1 ? p.replace(/\/+$/, '') : p);

async function visit(page: Page, route: string) {
  const res = await page.goto(route);
  expect(res?.status(), `GET ${route}`).toBe(200);
}

async function jsonLd(page: Page): Promise<Record<string, unknown>[]> {
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  const out: Record<string, unknown>[] = [];
  for (const b of blocks) {
    const parsed = JSON.parse(b) as unknown; // must parse
    const items = Array.isArray(parsed) ? parsed : [parsed];
    for (const item of items as Record<string, unknown>[]) {
      out.push(item);
      if (Array.isArray(item['@graph'])) out.push(...(item['@graph'] as Record<string, unknown>[]));
    }
  }
  return out;
}

const hasType = (node: Record<string, unknown>, type: string) =>
  node['@type'] === type || (Array.isArray(node['@type']) && (node['@type'] as string[]).includes(type));

async function sitemapLocs(request: APIRequestContext): Promise<string[]> {
  let res = await request.get('/sitemap-index.xml');
  if (res.status() !== 200) res = await request.get('/sitemap.xml');
  expect(res.status(), 'a sitemap exists').toBe(200);
  const locs = (xml: string) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
  const top = await res.text();
  if (!top.includes('<sitemapindex')) return locs(top);
  const all: string[] = [];
  for (const child of locs(top)) {
    const r = await request.get(new URL(child).pathname);
    expect(r.status(), `child sitemap ${child}`).toBe(200);
    all.push(...locs(await r.text()));
  }
  return all;
}

test.describe('WS4 SEO', () => {
  test('S1 every tool route has a unique title and meta description and exactly one H1', async ({ page }) => {
    test.setTimeout(180_000);
    const titles = new Map<string, string>();
    const descriptions = new Map<string, string>();
    for (const route of LANDING_ROUTES) {
      await visit(page, route);
      const title = (await page.title()).trim();
      const description = ((await page.locator('meta[name="description"]').getAttribute('content')) ?? '').trim();
      expect(title, `${route} title`).not.toBe('');
      expect(description, `${route} meta description`).not.toBe('');
      expect(titles.get(title), `${route} title duplicates`).toBeUndefined();
      expect(descriptions.get(description), `${route} description duplicates`).toBeUndefined();
      titles.set(title, route);
      descriptions.set(description, route);
      await expect(page.locator('h1'), `${route} H1 count`).toHaveCount(1);
    }
  });

  test('S2 every tool route has a canonical link; aliases canonicalise to their main tool', async ({ page }) => {
    test.setTimeout(180_000);
    for (const route of LANDING_ROUTES) {
      await visit(page, route);
      const href = await page.locator('link[rel="canonical"]').getAttribute('href');
      expect(href, `${route} canonical`).toBeTruthy();
      expect(trimSlash(new URL(href!).pathname)).toBe(route);
    }
    for (const [alias, main] of Object.entries(ALIASES)) {
      await visit(page, alias);
      const href = await page.locator('link[rel="canonical"]').getAttribute('href');
      expect(href, `${alias} canonical`).toBeTruthy();
      expect(trimSlash(new URL(href!).pathname), `${alias} canonicalises to ${main}`).toBe(main);
    }
  });

  test('S3 JSON-LD parses and has SoftwareApplication (price "0") and FAQPage (4+ questions)', async ({ page }) => {
    test.setTimeout(180_000);
    for (const route of LANDING_ROUTES) {
      await visit(page, route);
      const nodes = await jsonLd(page);
      const app = nodes.find((n) => hasType(n, 'SoftwareApplication'));
      expect(app, `${route} SoftwareApplication`).toBeDefined();
      const offers = (Array.isArray(app!.offers) ? app!.offers[0] : app!.offers) as Record<string, unknown> | undefined;
      expect(String(offers?.price), `${route} offers.price`).toBe('0');
      const faq = nodes.find((n) => hasType(n, 'FAQPage'));
      expect(faq, `${route} FAQPage`).toBeDefined();
      expect((faq!.mainEntity as unknown[]).length, `${route} FAQ count`).toBeGreaterThanOrEqual(4);
      expect(nodes.some((n) => hasType(n, 'HowTo')), `${route} HowTo`).toBe(true);
      expect(nodes.some((n) => hasType(n, 'BreadcrumbList')), `${route} BreadcrumbList`).toBe(true);
    }
  });

  test('S4 the sitemap lists every tool route and robots.txt references it', async ({ request }) => {
    const paths = new Set((await sitemapLocs(request)).map((u) => trimSlash(new URL(u).pathname)));
    for (const route of TOOL_ROUTES) expect(paths.has(route), `sitemap lists ${route}`).toBe(true);
    const robots = await request.get('/robots.txt');
    expect(robots.status()).toBe(200);
    expect(await robots.text()).toMatch(/^Sitemap:\s*\S*sitemap(-index)?\.xml/im);
  });

  test('S5 OG image URLs are same-origin and return 200', async ({ page, request }) => {
    test.setTimeout(180_000);
    for (const route of LANDING_ROUTES) {
      await visit(page, route);
      const og = await page.locator('meta[property="og:image"]').getAttribute('content');
      const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
      expect(og, `${route} og:image`).toBeTruthy();
      expect(new URL(og!).origin, `${route} og:image is on the site origin`).toBe(new URL(canonical!).origin);
      const img = await request.get(new URL(og!).pathname);
      expect(img.status(), `${route} og:image ${og}`).toBe(200);
      expect(img.headers()['content-type']).toMatch(/^image\//);
    }
  });

  test('S6 /privacy lists the exact CSP and the verify steps; /ilovepdf-alternative has dated sources', async ({ page }) => {
    await visit(page, '/privacy');
    const body = ((await page.locator('main').textContent()) ?? '').replace(/\s+/g, ' ');
    expect(body).toContain(EXPECTED_CSP);
    await expect(page.getByRole('heading', { name: /verify it yourself/i })).toBeVisible();
    expect(body).toMatch(/network/i);
    expect(body).toMatch(/airplane|offline/i);

    await visit(page, '/ilovepdf-alternative');
    const sources = page.getByRole('heading', { name: /sources/i });
    await expect(sources).toBeVisible();
    const items = page.locator('main li').filter({ has: page.locator('a[href^="http"]') });
    expect(await items.count()).toBeGreaterThanOrEqual(1);
    for (const t of await items.allTextContents()) {
      expect(t, 'each source is dated').toMatch(/\b20\d{2}-\d{2}-\d{2}\b/);
    }
  });
});
