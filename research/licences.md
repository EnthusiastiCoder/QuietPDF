# Third-party licences

Recorded during WS1 (2026-11-22) from each package's `package.json` in `node_modules`.
Everything shipped to the browser is permissive; nothing is copyleft.

## Shipped in `dist/` (runtime)

| Package | Version | Licence | Shipped as |
|---|---|---|---|
| pdfjs-dist | 6.5.438 | Apache-2.0 | `/vendor/pdfjs/` worker, cmaps, standard fonts, wasm |
| pdf-lib | 1.17.1 | MIT | bundled JS |
| @neslinesli93/qpdf-wasm | 0.3.1 | ISC (wrapper); qpdf itself is Apache-2.0 | `/vendor/qpdf/` |
| tesseract.js | 7.0.0 | Apache-2.0 | `/vendor/tesseract/` worker |
| tesseract.js-core | 7.0.0 | Apache-2.0 | `/vendor/tesseract/` core wasm |
| @tesseract.js-data/eng | 1.0.0 | MIT (package); tessdata models are Apache-2.0 | `/vendor/tesseract/lang/` |
| @tesseract.js-data/hin | 1.0.0 | MIT (package); tessdata models are Apache-2.0 | `/vendor/tesseract/lang/` |
| fflate | 0.8.3 | MIT | bundled JS |
| svelte | 5.59.1 | MIT | bundled JS |
| workbox-precaching | 7.4.1 | MIT | bundled into `sw.js` |
| workbox-window | 7.4.1 | MIT | bundled JS |
| @fontsource-variable/inter | 5.3.0 | OFL-1.1 | self-hosted woff2 |

## Build and test only (not shipped)

| Package | Version | Licence |
|---|---|---|
| astro | 7.4.13 | MIT |
| @astrojs/svelte | 9.1.6 | MIT |
| @vite-pwa/astro | 2.0.4 | MIT |
| jpeg-js | 0.4.4 | BSD-3-Clause |

## Obligations

- Apache-2.0 (pdf.js, qpdf, tesseract): ship the licence text and NOTICE files in `public/third-party-licenses.txt` (not generated yet; footer links to it).
- OFL-1.1 (Inter): keep the font licence with the font files; do not sell the font on its own.
- MIT / ISC / BSD: include the copyright notice and licence text in the same notices file.
