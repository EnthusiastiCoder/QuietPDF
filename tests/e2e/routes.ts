/**
 * The routes the e2e tests expect. The registry `src/content/tools.ts` (WS1) is
 * the source of truth in the app; these slugs are the contract it must meet.
 */

/** One entry per tool, in the plan's build and launch (India demand) order. */
export const TOOLS = {
  jpgToPdf: '/jpg-to-pdf',
  pdfToWord: '/pdf-to-word',
  merge: '/merge-pdf',
  compress: '/compress-pdf',
  split: '/split-pdf',
  pdfToJpg: '/pdf-to-jpg',
  organize: '/organize-pdf',
  sign: '/sign-pdf',
  protect: '/protect-pdf',
  unlock: '/unlock-pdf',
  pageNumbers: '/add-page-numbers',
  watermark: '/add-watermark',
  ocr: '/ocr-pdf',
  redact: '/redact-pdf',
  pdfToText: '/pdf-to-text',
} as const;

/** Organize opened in a preset mode (decision 14). */
export const ORGANIZE_PRESETS = {
  rotate: '/rotate-pdf',
  delete: '/delete-pdf-pages',
  reorder: '/reorder-pdf-pages',
  extract: '/extract-pdf-pages',
} as const;

/** Search-variant aliases and the main tool route they canonicalise to (decision 17). */
export const ALIASES: Record<string, string> = {
  '/image-to-pdf': TOOLS.jpgToPdf,
  '/png-to-pdf': TOOLS.jpgToPdf,
  '/pdf-to-png': TOOLS.pdfToJpg,
};

export const TOOL_ROUTES: string[] = Object.values(TOOLS);
export const ALL_TOOL_ROUTES: string[] = [
  ...TOOL_ROUTES,
  ...Object.values(ORGANIZE_PRESETS),
  ...Object.keys(ALIASES),
];

/** Every page of the site (F4 crawls these). */
export const ALL_ROUTES: string[] = [
  '/',
  ...ALL_TOOL_ROUTES,
  '/privacy',
  '/about',
  '/ilovepdf-alternative',
  '/smallpdf-alternative',
];

/** The first four home-page cards, in India demand order (F1). */
export const POPULAR_FIRST_FOUR = ['JPG to PDF', 'PDF to Word', 'Merge PDF', 'Compress PDF'];

/** The exact CSP from decision 3 (F3 compares the header to it, S6 the /privacy page). */
export const EXPECTED_CSP =
  "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src 'self'; " +
  "img-src 'self' blob: data:; font-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; " +
  "base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
