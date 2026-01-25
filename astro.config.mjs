// @ts-check
import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import { AstroPWAIntegration } from '@vite-pwa/astro';

const site = process.env.SITE_URL || 'https://quietpdf.pages.dev';

// Static output, one .html file per route (build.format 'file'), so the service
// worker's clean-URL precache lookup serves /merge-pdf offline.
// No Astro islands: their inline bootstrap <script> would break the exact CSP
// (script-src 'self'). Svelte components are mounted from bundled modules.
export default defineConfig({
  site,
  output: 'static',
  trailingSlash: 'never',
  build: {
    format: 'file',
    inlineStylesheets: 'never',
  },
  integrations: [
    svelte(),
    // PWA (decision 6): custom service worker (src/sw.ts), registered by
    // src/lib/sw-register.ts (no injected inline registration script).
    AstroPWAIntegration({
      // @vite-pwa/astro 2 (unplugin-pwa): a TypeScript service worker uses the
      // buildSW strategy (injectManifest is for prebuilt JS workers).
      strategies: 'buildSW',
      filename: 'sw.js',
      swType: 'classic',
      registerType: 'prompt',
      injectRegister: false,
      manifestFilename: 'manifest.webmanifest',
      manifest: {
        name: 'QuietPDF - private PDF tools',
        short_name: 'QuietPDF',
        description: 'PDF tools that run entirely in your browser. Nothing is uploaded.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#2a5bd7',
        icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      maximumFileSizeToCacheInBytes: 30 * 1024 * 1024,
      buildSW: {
        swSrc: 'src/sw.ts',
        globPatterns: ['**/*.{html,js,mjs,css,woff2,wasm,svg,bcmap,pfb,ttf,icc,txt,webmanifest}'],
        // OCR language data is runtime-cached (CacheFirst) by the service worker.
        globIgnores: ['vendor/tesseract/lang/**', 'sw.js', 'manifest.webmanifest'],
      },
      devOptions: { enabled: false },
    }),
  ],
  vite: {
    build: {
      // Never inline a script or asset as a data: URL or inline <script>.
      assetsInlineLimit: 0,
    },
    worker: {
      format: 'es',
    },
  },
});
