<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { PDFDocumentProxy } from 'pdfjs-dist';
  import DropZone from '../DropZone.svelte';
  import PasswordPrompt from '../PasswordPrompt.svelte';
  import OptionsPanel from '../OptionsPanel.svelte';
  import ProgressBar from '../ProgressBar.svelte';
  import ResultCard from '../ResultCard.svelte';
  import RedactCanvas from '../RedactCanvas.svelte';
  import { closePdf, viewportRect } from '../../lib/pdfjs-setup';
  import { intakePdf } from '../../lib/password-prompt.svelte';
  import { formatBytes, suffixed } from '../../lib/download';
  import { isAbortError } from '../../lib/worker-rpc';
  import { findMatches, redactPdf, type RedactBox, type TextItemLike } from '../../core/redact';
  import { recognize, warmOcrPool } from '../../core/ocr';
  import type { ToolProps } from './index';

  let { accept, multiple }: ToolProps = $props();

  let file = $state<{ name: string; bytes: Uint8Array; doc: PDFDocumentProxy } | null>(null);
  let mode = $state<'search' | 'draw'>('search');
  let query = $state('');
  let boxes = $state<RedactBox[]>([]);
  let keepSearchable = $state(false);
  let loading = $state(false);
  let searching = $state(false);
  let found = $state<number | null>(null);
  let busy = $state(false);
  let error = $state('');
  let progress = $state({ done: 0, total: 0 });
  let result = $state<{ bytes: Uint8Array; name: string; pages: number } | null>(null);
  let ac: AbortController | null = null;

  onDestroy(() => {
    ac?.abort();
    closePdf(file?.doc);
  });

  /** English OCR (one worker) is loaded with the page, for "keep the rest searchable". */
  const warmup = () => warmOcrPool(['eng'], 1);

  async function addFiles(files: File[]): Promise<void> {
    error = '';
    result = null;
    boxes = [];
    found = null;
    closePdf(file?.doc);
    file = null;
    loading = true;
    try {
      const intake = await intakePdf(files[0]);
      if (!intake) return;
      file = { name: files[0].name, bytes: intake.bytes, doc: intake.doc };
    } catch {
      error = `${files[0].name} could not be read as a PDF.`;
    } finally {
      loading = false;
    }
  }

  async function findAll(): Promise<void> {
    if (!file || !query.trim() || searching) return;
    searching = true;
    error = '';
    try {
      const ctx = document.createElement('canvas').getContext('2d')!;
      ctx.font = '100px sans-serif';
      const measure = (s: string) => ctx.measureText(s).width;
      const added: RedactBox[] = [];
      for (let n = 1; n <= file.doc.numPages; n++) {
        const page = await file.doc.getPage(n);
        try {
          const tc = await page.getTextContent();
          const vp = page.getViewport({ scale: 1 });
          for (const r of findMatches(tc.items as TextItemLike[], query, measure)) {
            const [a, b, c, d] = viewportRect(vp, [r.x0, r.y0, r.x1, r.y1]);
            added.push({
              page: n - 1,
              x0: Math.max(0, Math.min(a, c) / vp.width),
              y0: Math.max(0, Math.min(b, d) / vp.height),
              x1: Math.min(1, Math.max(a, c) / vp.width),
              y1: Math.min(1, Math.max(b, d) / vp.height),
            });
          }
        } finally {
          page.cleanup();
        }
      }
      boxes = [...boxes, ...added];
      found = added.length;
    } catch (e) {
      error = `Search failed: ${(e as Error).message}`;
    } finally {
      searching = false;
    }
  }

  async function run(): Promise<void> {
    if (!file || busy || boxes.length === 0) return;
    busy = true;
    error = '';
    ac = new AbortController();
    try {
      const bytes = await redactPdf(file.bytes, file.doc, $state.snapshot(boxes), {
        ocr: keepSearchable ? (canvas) => recognize(canvas, 'eng') : undefined,
        signal: ac.signal,
        onProgress: (done, total) => (progress = { done, total }),
      });
      result = { bytes, name: suffixed(file.name, 'redacted'), pages: new Set(boxes.map((b) => b.page)).size };
    } catch (e) {
      if (!isAbortError(e)) error = `Could not redact: ${(e as Error).message}`;
    } finally {
      busy = false;
      ac = null;
    }
  }

  function restart(): void {
    closePdf(file?.doc);
    file = null;
    result = null;
    boxes = [];
    found = null;
  }
</script>

<PasswordPrompt />

{#if result}
  <ResultCard bytes={result.bytes} filename={result.name} title="Your redacted PDF is ready" onrestart={restart}>
    {#snippet message()}
      {result?.pages} page{result?.pages === 1 ? '' : 's'} redacted. Redacted pages are images now; the hidden text is gone, not covered. Metadata, annotations and attachments were removed.
    {/snippet}
  </ResultCard>
{:else}
  <p class="tool-note">Redacted pages become images; the hidden text is gone, not covered.</p>
  <DropZone {accept} {multiple} onfiles={addFiles} compact={!!file} {warmup} warmupTimeout={30_000} />
  {#if error}<p class="tool-err" role="alert">{error}</p>{/if}
  {#if file || loading}
    <div class="tool-layout has-panel">
      <div>
        {#if file}
          <p class="tool-note">{file.name}: {file.doc.numPages} page{file.doc.numPages === 1 ? '' : 's'}, {formatBytes(file.bytes.byteLength)}. {boxes.length} box{boxes.length === 1 ? '' : 'es'}.</p>
          <RedactCanvas
            doc={file.doc}
            {boxes}
            drawing={mode === 'draw'}
            onadd={(b) => (boxes = [...boxes, b])}
            onremove={(i) => (boxes = boxes.filter((_, k) => k !== i))}
          />
        {:else}
          <p class="tool-note">Reading the file…</p>
        {/if}
      </div>
      <OptionsPanel title="Redaction">
        <div class="field">
          <label for="rd-mode">Redact mode</label>
          <select id="rd-mode" bind:value={mode}>
            <option value="search">Search</option>
            <option value="draw">Draw boxes</option>
          </select>
        </div>
        {#if mode === 'search'}
          <div class="field">
            <label for="rd-query">Search text</label>
            <input id="rd-query" type="text" bind:value={query} onkeydown={(e) => e.key === 'Enter' && findAll()} />
          </div>
          <button type="button" class="btn" disabled={searching || loading || !file || !query.trim()} onclick={findAll}>Find matches</button>
          {#if found !== null}<p class="tool-note" role="status">{found} match{found === 1 ? '' : 'es'} found and boxed.</p>{/if}
        {:else}
          <p class="tool-note">Drag on a page to draw a box. Press × on a box to remove it.</p>
        {/if}
        <label class="check"><input type="checkbox" bind:checked={keepSearchable} /> Keep the rest searchable</label>
        {#if boxes.length}<button type="button" class="btn" onclick={() => ((boxes = []), (found = null))}>Clear all boxes</button>{/if}
        {#snippet footer()}
          {#if busy}<ProgressBar done={progress.done} total={progress.total} label="Redacting" oncancel={() => ac?.abort()} />{/if}
          <button class="btn btn-primary" data-testid="primary-action" type="button" disabled={busy || loading || searching || boxes.length === 0} onclick={run}>Redact and save</button>
        {/snippet}
      </OptionsPanel>
    </div>
  {/if}
{/if}

<style>
  .check {
    display: flex;
    gap: var(--space-2);
    align-items: center;
  }
</style>
