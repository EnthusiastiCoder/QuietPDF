# Compression results (WS3)

Measured 2026-11-22 on the production build (`npm run build`, served by `scripts/preview.ts` on port 4451), driving the real UI with Playwright: add the file, pick the level, press Compress, wait for the result card, download.

- Input: `tests/fixtures/.gen/photos-hi-res.pdf`: 5 pages of 792 x 528 pt, each a 3000 x 2000 px JPEG at quality 95; 21,750,788 B (20.7 MiB).
- Machine: 12 logical cores, 15.6 GB RAM, no GPU. One browser at a time.
- Time: from the click on Compress to the result card (image re-encode plus the qpdf rewrite). The file was already read and the engines warmed.
- Pipeline (decision 7): images re-encoded as JPEG at the preset dpi for their placed size (11 x 7.33 in here), only when smaller; then qpdf `--object-streams=generate --compress-streams=y --recompress-flate --compression-level=9 --remove-unreferenced-resources=yes`.

| Browser | Preset | Target | Input (B) | Output (B) | Reduction | Time |
|---|---|---|---:|---:|---:|---:|
| Chromium | Light | 150 dpi, q 0.85 (1650 x 1100 px) | 21,750,788 | 782,739 | 96.4% | 1.4 s |
| Chromium | Recommended | 120 dpi, q 0.72 (1320 x 880 px) | 21,750,788 | 161,213 | 99.3% | 1.4 s |
| Chromium | Strong | 96 dpi, q 0.55 (1056 x 704 px) | 21,750,788 | 46,118 | 99.8% | 0.9 s |
| Firefox | Light | 150 dpi, q 0.85 | 21,750,788 | 1,150,426 | 94.7% | 1.1 s |
| Firefox | Recommended | 120 dpi, q 0.72 | 21,750,788 | 394,601 | 98.2% | 0.5 s |
| Firefox | Strong | 96 dpi, q 0.55 | 21,750,788 | 137,682 | 99.4% | 0.8 s |
| WebKit | Light | 150 dpi, q 0.85 | 21,750,788 | 1,174,028 | 94.6% | 1.4 s |
| WebKit | Recommended | 120 dpi, q 0.72 | 21,750,788 | 372,678 | 98.3% | 1.4 s |
| WebKit | Strong | 96 dpi, q 0.55 | 21,750,788 | 130,358 | 99.4% | 1.3 s |

**Target met:** Recommended gives at least 50% reduction in every browser (98.2% to 99.3%). Strong <= Recommended <= Light holds in every browser (T-CMP3).

## Caveats

- The fixture's photos are synthetic (generated with jpeg-js, smooth content at q 95), so they compress much better than real camera photos. Expect smaller savings on real scans and photos; the ordering of the presets is what generalises.
- The encoders differ: Chromium's JPEG encoder gives the smallest files, Firefox and WebKit are 2-3x larger at the same quality setting.
- Playwright's WebKit build on Windows has no `OffscreenCanvas` in workers, so there the re-encode falls back to the main thread (an `HTMLCanvasElement`). The worker reports this at warm-up (`ping`), before a file can be added.

## Small or text-only files

A result is kept only if it saves at least 2% **and** at least 10 KiB; otherwise the original bytes come back with "Already optimised". qpdf alone shrinks `text-3p.pdf` from 3,238 B to 2,377 B, and T-CMP2 requires the original bytes back, so a plain "is it smaller" test would not do. A file larger than the input is never returned.
