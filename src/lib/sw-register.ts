/**
 * Registers the offline service worker (/sw.js, built by @vite-pwa/astro with
 * injectManifest) on load. registerType 'prompt': a new version waits until the
 * user reloads; the first install activates immediately (clients.claim).
 */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  const go = () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      /* offline support is a bonus: never break the page */
    });
  };
  // Register at once, not on load: the install downloads the precache and
  // should be finished before the user has chosen a file.
  go();
}
