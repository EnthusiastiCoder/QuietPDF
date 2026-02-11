/// <reference lib="webworker" />
/**
 * QuietPDF service worker (decision 6), built by @vite-pwa/astro with
 * injectManifest into dist/sw.js.
 *
 *  - Precaches the shell, every page and every tool's JS and WASM, so a tool
 *    works offline after the first visit. Clean URLs (/merge-pdf) map to the
 *    precached .html files.
 *  - Runtime-caches the OCR language data (CacheFirst): it is large and only
 *    the OCR page needs it.
 *  - Reports requests made by workers to the page, so the privacy meter can
 *    list them (they are not in the page's performance timeline).
 */
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> };

const LANG_CACHE = 'qp-ocr-lang-v1';
const LANG_PATH = '/vendor/tesseract/lang/';

self.addEventListener('install', () => {
  // The first install takes control at once; updates wait for the prompt.
  if (!self.registration.active) void self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
  if ((event.data as { type?: string } | null)?.type === 'SKIP_WAITING') void self.skipWaiting();
});

// 1. Report worker-initiated requests to the page (no respondWith here).
self.addEventListener('fetch', (event) => {
  const clientId = event.clientId;
  if (!clientId) return;
  event.waitUntil(
    (async () => {
      const client = await self.clients.get(clientId);
      if (!client || client.type !== 'worker') return;
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: false });
      for (const w of windows) w.postMessage({ type: 'qp-fetch', url: event.request.url, fromWorker: true });
    })().catch(() => {}),
  );
});

// 2. OCR language data: CacheFirst.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(LANG_PATH)) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(LANG_CACHE);
      const hit = await cache.match(event.request, { ignoreSearch: true });
      if (hit) return hit;
      const res = await fetch(event.request);
      if (res.ok) await cache.put(event.request, res.clone());
      return res;
    })(),
  );
});

// 3. Everything else from the precache.
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST, { cleanURLs: true, directoryIndex: 'index.html', ignoreURLParametersMatching: [/.*/] });
