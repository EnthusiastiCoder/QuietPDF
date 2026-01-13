// @ts-check
import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';

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
  integrations: [svelte()],
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
