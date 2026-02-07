<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { PDFDocumentProxy } from 'pdfjs-dist';
  import DropZone from '../DropZone.svelte';
  import ThumbGrid, { type ThumbItem } from '../ThumbGrid.svelte';
  import ProgressBar from '../ProgressBar.svelte';
  import ResultCard from '../ResultCard.svelte';
  import { closePdf, renderThumb, warmPdfjs } from '../../lib/pdfjs-setup';
  import { formatBytes } from '../../lib/download';
  import PasswordPrompt from '../PasswordPrompt.svelte';
  import { intakePdf } from '../../lib/password-prompt.svelte';
  import { mergePdfs } from '../../core/merge';
  import type { ToolProps } from './index';

  let { accept, multiple }: ToolProps = $props();

  interface Entry {
    id: string;
    name: string;
    bytes: Uint8Array;
    pages: number;
    doc: PDFDocumentProxy | null;
  }

  let entries = $state<Entry[]>([]);
  let loading = $state(0);
  let error = $state('');
  let busy = $state(false);
  let progress = $state({ done: 0, total: 0 });
  let result = $state<Uint8Array | null>(null);
  let seq = 0;

  const totalPages = $derived(entries.reduce((n, e) => n + e.pages, 0));

  const items = $derived<ThumbItem[]>(
    entries.map((e) => ({
      id: e.id,
      label: e.name,
      sub: `${e.pages} page${e.pages === 1 ? '' : 's'} · ${formatBytes(e.bytes.byteLength)}`,
      render: e.doc ? (signal: AbortSignal) => renderThumb(e.doc as PDFDocumentProxy, 1, 160, signal) : undefined,
    })),
  );

  onMount(() => {
    void warmPdfjs().catch(() => {});
  });

  onDestroy(() => {
    for (const e of entries) closePdf(e.doc);
  });

  async function addFiles(files: File[]): Promise<void> {
    error = '';
    result = null;
    loading += files.length;
    const added: Entry[] = [];
    const failed: string[] = [];
    for (const file of files) {
      try {
        let intake;
        try {
          intake = await intakePdf(file);
        } catch {
          failed.push(`${file.name} could not be read as a PDF.`);
          continue;
        }
        if (!intake) continue;
        const { bytes, doc } = intake;
        const pages = doc.numPages;
        added.push({ id: `f${++seq}`, name: file.name, bytes, pages, doc });
      } finally {
        loading -= 1;
      }
    }
    entries = [...entries, ...added];
    if (failed.length) error = failed.join(' ');
  }

  function reorder(ids: string[]): void {
    const byId = new Map(entries.map((e) => [e.id, e]));
    entries = ids.map((id) => byId.get(id)).filter((e): e is Entry => !!e);
    result = null;
  }

  function remove(id: string): void {
    const e = entries.find((x) => x.id === id);
    closePdf(e?.doc);
    entries = entries.filter((x) => x.id !== id);
    result = null;
  }

  async function merge(): Promise<void> {
    if (entries.length === 0 || busy) return;
    busy = true;
    error = '';
    progress = { done: 0, total: entries.length };
    try {
      result = await mergePdfs(
        entries.map((e) => e.bytes),
        { onProgress: (done, total) => (progress = { done, total }) },
      );
    } catch (e) {
      error = `Could not merge: ${(e as Error).message}`;
    } finally {
      busy = false;
    }
  }

  function restart(): void {
    for (const e of entries) closePdf(e.doc);
    entries = [];
    result = null;
    error = '';
  }
</script>

<PasswordPrompt />

{#if result}
  <ResultCard bytes={result} filename="merged.pdf" title="Your merged PDF is ready" onrestart={restart}>
    {#snippet sizes()}
      {totalPages} pages · {formatBytes(result?.byteLength ?? 0)}
    {/snippet}
  </ResultCard>
{:else}
  <DropZone {accept} {multiple} onfiles={addFiles} compact={entries.length > 0} />

  {#if loading > 0}
    <p class="status" role="status">Reading {loading} file{loading === 1 ? '' : 's'}…</p>
  {/if}
  {#if error}
    <p class="err" role="alert">{error}</p>
  {/if}

  {#if entries.length > 0}
    <p class="hint">Drag the files (or use Alt + arrow keys) to set the order. {entries.length} file{entries.length === 1 ? '' : 's'}, {totalPages} pages.</p>
    <ThumbGrid {items} onreorder={reorder} onremove={remove} label="Files to merge" />

    <div class="actions">
      {#if busy}
        <ProgressBar done={progress.done} total={progress.total} label="Merging" unit="file" />
      {/if}
      <button class="btn btn-primary" data-testid="primary-action" type="button" disabled={busy || loading > 0 || entries.length === 0} onclick={merge}>
        Merge PDF
      </button>
    </div>
  {/if}
{/if}

<style>
  .status,
  .hint {
    margin: var(--space-3) 0;
    color: var(--text-muted);
    font-size: var(--step--1);
  }
  .err {
    margin: var(--space-3) 0;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-s);
    background: var(--danger-soft);
    color: var(--danger);
    font-size: var(--step--1);
  }
  .actions {
    position: sticky;
    bottom: 0;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: var(--space-2);
    margin-top: var(--space-4);
    padding: var(--space-3) 0;
    background: var(--bg);
  }
  @media (min-width: 640px) {
    .actions {
      align-items: flex-end;
    }
  }
</style>
