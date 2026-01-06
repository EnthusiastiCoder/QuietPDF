import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test, expect } from './fixtures';
import { ui, openTool, addFiles, runAndDownload } from './ui';
import { ALL_ROUTES, ALL_TOOL_ROUTES, EXPECTED_CSP, POPULAR_FIRST_FOUR, TOOLS } from './routes';
import { fixturePath } from '../helpers/fixtures';
import { pageCount } from '../helpers/pdf';

const normaliseCsp = (s: string) =>
  s.split(';').map((d) => d.trim().replace(/\s+/g, ' ')).filter(Boolean).join('; ');

test.describe('WS1 foundation', () => {
  test('F1 home shows the tool grid with JPG to PDF, PDF to Word, Merge, Compress first', async ({ page }) => {
    const res = await page.goto('/');
    expect(res?.status()).toBe(200);
    await expect(ui.toolGrid(page)).toBeVisible();
    const cards = ui.toolCards(page);
    expect(await cards.count()).toBeGreaterThanOrEqual(15);
    for (let i = 0; i < POPULAR_FIRST_FOUR.length; i++) {
      await expect(cards.nth(i)).toContainText(POPULAR_FIRST_FOUR[i]);
    }
  });

  test('F2 every registry route returns 200 with an H1 and a drop zone', async ({ page }) => {
    test.setTimeout(180_000);
    const home = await page.goto('/');
    expect(home?.status()).toBe(200);
    const linked = await ui.toolCards(page).evaluateAll((els) =>
      els.map((el) => (el instanceof HTMLAnchorElement ? el : el.querySelector('a'))?.getAttribute('href') ?? ''),
    );
    const routes = [...new Set([...ALL_TOOL_ROUTES, ...linked.filter(Boolean).map((h) => new URL(h, page.url()).pathname)])];
    for (const route of routes) {
      const res = await page.goto(route);
      expect(res?.status(), `GET ${route}`).toBe(200);
      await expect(page.locator('h1'), `${route} has exactly one H1`).toHaveCount(1);
      await expect(page.locator('h1')).toBeVisible();
      await expect(ui.dropZone(page), `${route} has a drop zone`).toBeVisible();
    }
  });

  test('F3 / and /merge-pdf send the exact CSP and Referrer-Policy: no-referrer', async ({ request }) => {
    for (const route of ['/', TOOLS.merge]) {
      const res = await request.get(route);
      expect(res.status(), `GET ${route}`).toBe(200);
      const headers = res.headers();
      expect(headers['content-security-policy'], `${route} CSP`).toBeDefined();
      expect(normaliseCsp(headers['content-security-policy'])).toBe(normaliseCsp(EXPECTED_CSP));
      expect(headers['referrer-policy']).toBe('no-referrer');
      expect(headers['x-content-type-options']).toBe('nosniff');
      expect(headers['permissions-policy']).toContain('camera=()');
    }
  });

  test('F4 crawling every route makes zero third-party requests', async ({ page, net }) => {
    test.setTimeout(240_000);
    for (const route of ALL_ROUTES) {
      const res = await page.goto(route);
      expect(res?.status(), `GET ${route}`).toBe(200);
      await page.waitForLoadState('networkidle');
      expect(net.thirdParty().map((r) => r.url), `third-party requests after ${route}`).toEqual([]);
    }
    expect(net.all().length).toBeGreaterThan(ALL_ROUTES.length);
  });

  test('F5 a fetch to https://example.com is blocked by the CSP', async ({ page }) => {
    const res = await page.goto('/');
    expect(res?.status()).toBe(200);
    const outcome = await page.evaluate(async () => {
      const violation = new Promise<string>((resolve) =>
        document.addEventListener(
          'securitypolicyviolation',
          (e) => resolve(`${e.effectiveDirective} ${e.blockedURI}`),
          { once: true },
        ),
      );
      let rejected = false;
      try {
        await fetch('https://example.com/');
      } catch {
        rejected = true;
      }
      const v = await Promise.race([violation, new Promise<null>((r) => setTimeout(() => r(null), 3000))]);
      return { rejected, violation: v };
    });
    expect(outcome.violation, 'securitypolicyviolation fired').not.toBeNull();
    expect(outcome.violation).toContain('connect-src');
    expect(outcome.violation).toContain('example.com');
    expect(outcome.rejected).toBe(true);
  });

  test('F6 the PrivacyMeter reads 0 third-party requests and lists only same-origin URLs', async ({ page, serverOrigin }) => {
    await openTool(page, TOOLS.merge);
    const meter = ui.privacyMeter(page);
    await expect(meter).toBeVisible();
    await expect(meter).toContainText('Third-party requests: 0');
    await expect(meter).toContainText('Files uploaded: 0 bytes');
    await meter.click();
    await expect(ui.privacyPanel(page)).toBeVisible();
    const urls = await ui.privacyPanelUrls(page).allTextContents();
    expect(urls.length).toBeGreaterThan(0);
    for (const u of urls) {
      expect(new URL(u.trim(), serverOrigin).origin, u).toBe(serverOrigin);
    }
    await expect(ui.privacyPanel(page).getByRole('link', { name: /verify it yourself/i })).toHaveAttribute('href', '/privacy');
  });

  test('F7 offline after the first visit: merge works and gives 13 pages', async ({ page, context }) => {
    test.setTimeout(120_000);
    await openTool(page, TOOLS.merge);
    const swReady = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return false;
      await navigator.serviceWorker.ready;
      return true;
    });
    expect(swReady, 'service worker ready').toBe(true);
    await page.reload();
    await expect
      .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 30_000 })
      .toBe(true);

    await context.setOffline(true);
    await page.reload();
    await expect(ui.dropZone(page)).toBeVisible();
    await addFiles(page, [fixturePath('text-3p.pdf'), fixturePath('text-10p.pdf')]);
    const out = await runAndDownload(page);
    expect(await pageCount(out.bytes)).toBe(13);
    await context.setOffline(false);
  });

  test('F8 check:assets and check:third-party pass on dist/', async () => {
    test.setTimeout(180_000);
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts?: Record<string, string> };
    expect(pkg.scripts?.['check:assets'], 'package.json has a check:assets script').toBeDefined();
    expect(pkg.scripts?.['check:third-party'], 'package.json has a check:third-party script').toBeDefined();
    for (const script of ['check:assets', 'check:third-party']) {
      let output = '';
      let code = 0;
      try {
        output = execSync(`npm run ${script}`, { stdio: 'pipe', encoding: 'utf8' });
      } catch (e) {
        const err = e as { status?: number; stdout?: string; stderr?: string };
        code = err.status ?? 1;
        output = `${err.stdout ?? ''}${err.stderr ?? ''}`;
      }
      expect(code, `npm run ${script}:\n${output}`).toBe(0);
    }
  });

  test('F9 the drop zone accepts drag-and-drop and the picker; a non-PDF shows an inline error', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await openTool(page, TOOLS.merge);

    const drop = async (name: string, type: string) => {
      const b64 = readFileSync(fixturePath(name as never)).toString('base64');
      const dt = await page.evaluateHandle(
        ({ b64, name, type }) => {
          const bin = atob(b64);
          const arr = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          const data = new DataTransfer();
          data.items.add(new File([arr], name, { type }));
          return data;
        },
        { b64, name, type },
      );
      for (const ev of ['dragenter', 'dragover', 'drop']) {
        await ui.dropZone(page).dispatchEvent(ev, { dataTransfer: dt });
      }
    };

    await drop('text-3p.pdf', 'application/pdf');
    await expect(ui.thumbs(page)).toHaveCount(1);

    await addFiles(page, [fixturePath('text-10p.pdf')]);
    await expect(ui.thumbs(page)).toHaveCount(2);

    await drop('photo-1.jpg', 'image/jpeg');
    await expect(ui.inlineError(page)).toBeVisible();
    await expect(ui.inlineError(page)).toContainText(/pdf/i);
    await expect(ui.thumbs(page)).toHaveCount(2);
    await expect(ui.dropZone(page)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('F10 theme toggle persists in-session; H1 and drop zone above the fold at 360x640 @ui', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await openTool(page, TOOLS.jpgToPdf);
    await expect(page.locator('h1')).toBeInViewport({ ratio: 1 });
    await expect(ui.dropZone(page)).toBeInViewport({ ratio: 1 });

    const html = page.locator('html');
    const before = await html.getAttribute('data-theme');
    expect(['light', 'dark']).toContain(before);
    await ui.themeToggle(page).click();
    const after = before === 'dark' ? 'light' : 'dark';
    await expect(html).toHaveAttribute('data-theme', after);
    await page.goto(TOOLS.merge);
    await expect(page.locator('html')).toHaveAttribute('data-theme', after);
  });
});
