<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { PDFDocumentProxy } from 'pdfjs-dist';
  import DropZone from '../DropZone.svelte';
  import PasswordPrompt from '../PasswordPrompt.svelte';
  import ProgressBar from '../ProgressBar.svelte';
  import ResultCard from '../ResultCard.svelte';
  import { closePdf, renderPage, viewportRect } from '../../lib/pdfjs-setup';
  import { intakePdf } from '../../lib/password-prompt.svelte';
  import { formatBytes, suffixed } from '../../lib/download';
  import { handOff } from '../../lib/handoff';
  import { extractDocument, looksScanned } from '../../core/pdf-to-text';
  import { pagesToDocx, type PngImage } from '../../core/pdf-to-docx';
  import type { ImageBox, PageItems } from '../../core/text-layout';
  import type { ToolProps } from './index';

  let { accept, multiple }: ToolProps = $props();

  let file = $state<{ name: string; bytes: Uint8Array; doc: PDFDocumentProxy; pages: PageItems[] } | null>(null);
  let scanned = $state(false);
  let reading = $state(false);
  let busy = $state(false);
  let error = $state('');
  let progress = $state({ done: 0, total: 0 });
  let result = $state<{ bytes: Uint8Array; name: string } | null>(null);
  let ac: AbortController | null = null;

  onDestroy(() => closePdf(file?.doc));

  async function addFiles(files: File[]): Promise<void> {
    error = '';
    result = null;
    scanned = false;
    closePdf(file?.doc);
    file = null;
    reading = true;
    try {
      const intake = await intakePdf(files[0]);
      if (!intake) return;
      progress = { done: 0, total: intake.doc.numPages };
      const pages = await extractDocument(intake.doc, { images: true, onProgress: (done, total) => (progress = { done, total }) });
      file = { name: files[0].name, bytes: intake.bytes, doc: intake.doc, pages };
      scanned = looksScanned(pages);
    } catch {
      error = `${files[0].name} could not be read as a PDF.`;
    } finally {
      reading = false;
    }
  }

  /** Cuts the image boxes of one page out of a 150 dpi render. */
  async function renderImages(pageNo: number, boxes: ImageBox[]): Promise<(PngImage | null)[]> {
    if (!file) return boxes.map(() => null);
    const page = await file.doc.getPage(pageNo);
    try {
      const scale = 150 / 72;
      const canvas = await renderPage(page, { scale, rotation: -page.rotate, signal: ac?.signal });
      const viewport = page.getViewport({ scale, rotation: 0 });
      const [vx, vy] = page.view;
      const out: (PngImage | null)[] = [];
      for (const b of boxes) {
        const [x0, y0, x1, y1] = viewportRect(viewport, [b.x + vx, b.y + vy, b.x + vx + b.width, b.y + vy + b.height]);
        const left = Math.max(0, Math.floor(Math.min(x0, x1)));
        const top = Math.max(0, Math.floor(Math.min(y0, y1)));
        const w = Math.min(canvas.width - left, Math.ceil(Math.abs(x1 - x0)));
        const h = Math.min(canvas.height - top, Math.ceil(Math.abs(y1 - y0)));
        if (w < 2 || h < 2) {
          out.push(null);
          continue;
        }
        const crop = document.createElement('canvas');
        crop.width = w;
        crop.height = h;
        crop.getContext('2d')!.drawImage(canvas, left, top, w, h, 0, 0, w, h);
        const blob = await new Promise<Blob | null>((r) => crop.toBlob(r, 'image/png'));
        out.push(blob ? { png: new Uint8Array(await blob.arrayBuffer()), widthPt: b.width, heightPt: b.height } : null);
      }
      canvas.width = canvas.height = 0;
      return out;
    } finally {
      page.cleanup();
    }
  }

  async function convert(): Promise<void> {
    if (!file || busy) return;
    busy = true;
    error = '';
    ac = new AbortController();
    progress = { done: 0, total: file.pages.length };
    try {
      let done = 0;
      const bytes = await pagesToDocx(file.pages, {
        renderImages: async (n, boxes) => {
          const r = await renderImages(n, boxes);
          progress = { done: ++done, total: file?.pages.length ?? 0 };
          return r;
        },
      });
      result = { bytes, name: suffixed(file.name, 'converted', 'docx').replace(/-converted\.docx$/, '.docx') };
    } catch (e) {
      if ((e as Error).name !== 'AbortError') error = `Could not convert: ${(e as Error).message}`;
    } finally {
      busy = false;
      ac = null;
    }
  }

  function toOcr(): void {
    if (!file) return;
    void handOff({ name: file.name, bytes: file.bytes }, '/ocr-pdf');
  }

  function restart(): void {
    closePdf(file?.doc);
    file = null;
    result = null;
    scanned = false;
  }
</script>

<PasswordPrompt />

{#if result}
  <ResultCard bytes={result.bytes} filename={result.name} title="Your Word document is ready" onrestart={restart}>
    {#snippet sizes()}
      {file?.pages.length ?? 0} pages · {formatBytes(result?.bytes.byteLength ?? 0)}
    {/snippet}
  </ResultCard>
{:else}
  <p class="tool-note quality">Text, headings, paragraphs and images are kept. Exact layout, tables and fonts are approximate.</p>
  <DropZone {accept} {multiple} onfiles={addFiles} compact={!!file} />
  {#if reading}
    <ProgressBar done={progress.done} total={progress.total} label="Reading" />
  {/if}
  {#if error}<p class="tool-err" role="alert">{error}</p>{/if}
  {#if file}
    {#if scanned}
      <div class="scanned card" role="status">
        <p><strong>This looks scanned: run OCR first.</strong> The pages are images with no text layer, so there is no text to convert yet.</p>
        <button type="button" class="btn btn-primary" onclick={toOcr}>Run OCR on this file</button>
      </div>
    {:else}
      <p class="tool-note">{file.name}: {file.pages.length} page{file.pages.length === 1 ? '' : 's'}, {formatBytes(file.bytes.byteLength)}.</p>
      <div class="actions">
        {#if busy}<ProgressBar done={progress.done} total={progress.total} label="Converting" oncancel={() => ac?.abort()} />{/if}
        <button class="btn btn-primary" data-testid="primary-action" type="button" disabled={busy} onclick={convert}>Convert to Word</button>
      </div>
    {/if}
  {/if}
{/if}

<style>
  .quality {
    margin-top: 0;
  }
  .scanned {
    display: grid;
    gap: var(--space-3);
    margin-top: var(--space-4);
    padding: var(--space-4);
  }
  .scanned p {
    margin: 0;
  }
  .actions {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: var(--space-2);
    margin-top: var(--space-4);
  }
  @media (min-width: 640px) {
    .actions {
      align-items: flex-end;
    }
  }
</style>
