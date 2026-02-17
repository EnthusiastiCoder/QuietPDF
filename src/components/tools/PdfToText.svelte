<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { PDFDocumentProxy } from 'pdfjs-dist';
  import DropZone from '../DropZone.svelte';
  import PasswordPrompt from '../PasswordPrompt.svelte';
  import ProgressBar from '../ProgressBar.svelte';
  import ResultCard from '../ResultCard.svelte';
  import { closePdf } from '../../lib/pdfjs-setup';
  import { intakePdf } from '../../lib/password-prompt.svelte';
  import { baseName, formatBytes } from '../../lib/download';
  import { handOff } from '../../lib/handoff';
  import { extractDocument, looksScanned, pagesToText } from '../../core/pdf-to-text';
  import type { PageItems } from '../../core/text-layout';
  import type { ToolProps } from './index';

  let { accept, multiple }: ToolProps = $props();

  let file = $state<{ name: string; bytes: Uint8Array; doc: PDFDocumentProxy; pages: PageItems[] } | null>(null);
  let scanned = $state(false);
  let reading = $state(false);
  let error = $state('');
  let progress = $state({ done: 0, total: 0 });
  let result = $state<{ bytes: Uint8Array; name: string; text: string } | null>(null);

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
      const pages = await extractDocument(intake.doc, { onProgress: (done, total) => (progress = { done, total }) });
      file = { name: files[0].name, bytes: intake.bytes, doc: intake.doc, pages };
      scanned = looksScanned(pages);
    } catch {
      error = `${files[0].name} could not be read as a PDF.`;
    } finally {
      reading = false;
    }
  }

  function convert(): void {
    if (!file) return;
    error = '';
    try {
      const text = pagesToText(file.pages);
      result = { bytes: new TextEncoder().encode(text), name: `${baseName(file.name)}.txt`, text };
    } catch (e) {
      error = `Could not convert: ${(e as Error).message}`;
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
  <ResultCard bytes={result.bytes} filename={result.name} title="Your text file is ready" onrestart={restart}>
    {#snippet sizes()}
      {file?.pages.length ?? 0} pages · {result?.text.length ?? 0} characters
    {/snippet}
    <textarea class="preview" readonly rows="10" aria-label="Text preview" value={result.text.slice(0, 20000)}></textarea>
  </ResultCard>
{:else}
  <DropZone {accept} {multiple} onfiles={addFiles} compact={!!file} />
  {#if reading}
    <ProgressBar done={progress.done} total={progress.total} label="Reading" />
  {/if}
  {#if error}<p class="tool-err" role="alert">{error}</p>{/if}
  {#if file}
    {#if scanned}
      <div class="scanned card" role="status">
        <p><strong>This looks scanned: run OCR first.</strong> The pages are images with no text layer, so there is no text to extract yet.</p>
        <button type="button" class="btn btn-primary" onclick={toOcr}>Run OCR on this file</button>
      </div>
    {:else}
      <p class="tool-note">{file.name}: {file.pages.length} page{file.pages.length === 1 ? '' : 's'}, {formatBytes(file.bytes.byteLength)}.</p>
      <div class="actions">
        <button class="btn btn-primary" data-testid="primary-action" type="button" onclick={convert}>Convert to text</button>
      </div>
    {/if}
  {/if}
{/if}

<style>
  .preview {
    width: 100%;
    font-family: ui-monospace, monospace;
    font-size: var(--step--1);
    resize: vertical;
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
