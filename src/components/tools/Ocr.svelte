<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { PDFDocumentProxy } from 'pdfjs-dist';
  import DropZone from '../DropZone.svelte';
  import PasswordPrompt from '../PasswordPrompt.svelte';
  import OptionsPanel from '../OptionsPanel.svelte';
  import ProgressBar from '../ProgressBar.svelte';
  import ResultCard from '../ResultCard.svelte';
  import ThumbGrid, { type ThumbItem } from '../ThumbGrid.svelte';
  import { closePdf, renderThumb, warmPdfjs } from '../../lib/pdfjs-setup';
  import { intakePdf } from '../../lib/password-prompt.svelte';
  import { markFileAdded } from '../../lib/privacy-meter';
  import { baseName, formatBytes, suffixed } from '../../lib/download';
  import { hasHandoff, takeHandoff } from '../../lib/handoff';
  import { isAbortError } from '../../lib/worker-rpc';
  import { ocrDocument, prefetchDevanagariFont, warmOcrPool, type OcrLanguage, type OcrOutput } from '../../core/ocr';
  import type { ToolProps } from './index';

  let { accept, multiple }: ToolProps = $props();

  const WARMUP_TIMEOUT = 60_000;

  let file = $state<{ name: string; bytes: Uint8Array; doc: PDFDocumentProxy } | null>(null);
  let lang = $state<OcrLanguage>('eng');
  let output = $state<OcrOutput>('pdf');
  let loading = $state(false);
  let busy = $state(false);
  let error = $state('');
  let progress = $state({ done: 0, total: 0 });
  let result = $state<{ bytes: Uint8Array; name: string; text: string } | null>(null);
  let ac: AbortController | null = null;

  onDestroy(() => {
    ac?.abort();
    closePdf(file?.doc);
  });

  /** Both languages are loaded on page load, so OCR never fetches after a file is added. */
  const warmup = () => Promise.all([warmOcrPool(['eng', 'hin']), prefetchDevanagariFont().catch(() => null)]);

  onMount(() => {
    if (!hasHandoff()) return;
    // Chained from another tool ("run OCR first"): take the parked file once warm-up is done.
    void (async () => {
      await Promise.race([Promise.allSettled([warmPdfjs(), warmup()]), new Promise((r) => setTimeout(r, WARMUP_TIMEOUT))]);
      const parked = await takeHandoff().catch(() => null);
      if (!parked) return;
      markFileAdded();
      await addFiles([new File([parked.bytes as BlobPart], parked.name, { type: 'application/pdf' })]);
    })();
  });

  async function addFiles(files: File[]): Promise<void> {
    error = '';
    result = null;
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

  const items = $derived<ThumbItem[]>(
    file
      ? [
          {
            id: 'file',
            label: file.name,
            sub: `${file.doc.numPages} page${file.doc.numPages === 1 ? '' : 's'} · ${formatBytes(file.bytes.byteLength)}`,
            render: (signal) => renderThumb(file!.doc, 1, 160, signal),
          },
        ]
      : [],
  );

  async function run(): Promise<void> {
    if (!file || busy) return;
    busy = true;
    error = '';
    ac = new AbortController();
    progress = { done: 0, total: file.doc.numPages };
    try {
      const out = await ocrDocument(file.bytes, file.doc, {
        lang,
        output,
        signal: ac.signal,
        onProgress: (done, total) => (progress = { done, total }),
      });
      result = {
        bytes: out.bytes,
        text: out.text,
        name: output === 'txt' ? `${baseName(file.name)}.txt` : suffixed(file.name, 'ocr'),
      };
    } catch (e) {
      if (!isAbortError(e)) error = `OCR failed: ${(e as Error).message}`;
    } finally {
      busy = false;
      ac = null;
    }
  }

  function restart(): void {
    closePdf(file?.doc);
    file = null;
    result = null;
  }
</script>

<PasswordPrompt />

{#snippet hindiNote()}
  Hindi words are in the .txt output only: the searchable layer uses a standard Latin font.
{/snippet}

{#if result}
  <ResultCard
    bytes={result.bytes}
    filename={result.name}
    title={output === 'txt' ? 'Your text is ready' : 'Your searchable PDF is ready'}
    onrestart={restart}
    message={output === 'pdf' && lang !== 'eng' ? hindiNote : undefined}
  >
    {#snippet sizes()}
      {progress.total} page{progress.total === 1 ? '' : 's'} · {result?.text.replace(/\s+/g, '').length ?? 0} characters recognised
    {/snippet}
  </ResultCard>
{:else}
  <DropZone {accept} {multiple} onfiles={addFiles} compact={!!file} {warmup} warmupTimeout={WARMUP_TIMEOUT} />
  {#if error}<p class="tool-err" role="alert">{error}</p>{/if}
  {#if file || loading}
    <div class="tool-layout has-panel">
      <div>
        {#if file}<ThumbGrid {items} label="File" />{/if}
        {#if busy}<ProgressBar done={progress.done} total={progress.total} label="Recognising text" oncancel={() => ac?.abort()} />{/if}
      </div>
      <OptionsPanel title="OCR options">
        <div class="field">
          <label for="ocr-lang">Language</label>
          <select id="ocr-lang" bind:value={lang}>
            <option value="eng">English</option>
            <option value="hin">Hindi</option>
            <option value="eng+hin">English + Hindi</option>
          </select>
        </div>
        <div class="field">
          <label for="ocr-out">Output</label>
          <select id="ocr-out" bind:value={output}>
            <option value="pdf">Searchable PDF</option>
            <option value="txt">Text (.txt)</option>
          </select>
        </div>
        <p class="tool-note">Text recognition runs on this device. It takes a few seconds per page.</p>
        {#snippet footer()}
          <button class="btn btn-primary" data-testid="primary-action" type="button" disabled={busy || loading || !file} onclick={run}>Recognise text</button>
        {/snippet}
      </OptionsPanel>
    </div>
  {/if}
{/if}
