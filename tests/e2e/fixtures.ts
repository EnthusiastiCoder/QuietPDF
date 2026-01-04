import { test as base, expect, type Request } from '@playwright/test';

/**
 * Shared Playwright fixture (decision 3, "Tests").
 *
 * Every e2e test imports `test` from here. It records every request made by
 * every page and service worker in the browser context, and fails the test if
 * any request went to an origin other than the test server.
 *
 * Requests the browser blocked itself under the CSP (they never left the
 * machine) are not counted as third-party traffic; F5 relies on that.
 */

export interface RecordedRequest {
  url: string;
  origin: string;
  method: string;
  resourceType: string;
  blockedByCsp: boolean;
  fromServiceWorker: boolean;
}

export interface NetRecorder {
  /** Every request recorded so far (data: and blob: URLs excluded). */
  all(): RecordedRequest[];
  /** Requests to any origin other than the test server, excluding CSP-blocked ones. */
  thirdParty(): RecordedRequest[];
  /** A mark to pass to requestsSince(). */
  mark(): number;
  /** Network requests (any origin) made after `mark`, excluding CSP-blocked ones. */
  requestsSince(mark: number): RecordedRequest[];
}

const LOCAL_SCHEMES = /^(data|blob|about|chrome-extension|chrome):/i;

export const test = base.extend<{ net: NetRecorder; serverOrigin: string }>({
  serverOrigin: async ({ baseURL }, use) => {
    if (!baseURL) throw new Error('baseURL is not configured in playwright.config.ts');
    await use(new URL(baseURL).origin);
  },

  net: [
    async ({ context, serverOrigin }, use, testInfo) => {
      const log: RecordedRequest[] = [];
      const byRequest = new Map<Request, RecordedRequest>();

      const onRequest = (req: Request) => {
        const url = req.url();
        if (LOCAL_SCHEMES.test(url)) return;
        let origin = '';
        try {
          origin = new URL(url).origin;
        } catch {
          origin = url;
        }
        const entry: RecordedRequest = {
          url,
          origin,
          method: req.method(),
          resourceType: req.resourceType(),
          blockedByCsp: false,
          fromServiceWorker: !!req.serviceWorker(),
        };
        log.push(entry);
        byRequest.set(req, entry);
      };
      const onFailed = (req: Request) => {
        const entry = byRequest.get(req);
        const reason = req.failure()?.errorText ?? '';
        if (entry && /BLOCKED_BY_CSP|Content Security Policy|csp/i.test(reason)) {
          entry.blockedByCsp = true;
        }
      };

      context.on('request', onRequest);
      context.on('requestfailed', onFailed);

      const live = () => log.filter((r) => !r.blockedByCsp);
      const recorder: NetRecorder = {
        all: () => [...log],
        thirdParty: () => live().filter((r) => r.origin !== serverOrigin),
        mark: () => log.length,
        requestsSince: (mark) => log.slice(mark).filter((r) => !r.blockedByCsp),
      };

      await use(recorder);

      context.off('request', onRequest);
      context.off('requestfailed', onFailed);

      const offenders = recorder.thirdParty();
      if (offenders.length) {
        await testInfo.attach('third-party-requests.json', {
          body: JSON.stringify(offenders, null, 2),
          contentType: 'application/json',
        });
      }
      expect(
        offenders.map((r) => r.url),
        `third-party requests are forbidden (test server is ${serverOrigin})`,
      ).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
