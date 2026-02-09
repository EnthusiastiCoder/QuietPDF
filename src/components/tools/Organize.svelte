<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { PDFDocumentProxy } from 'pdfjs-dist';
  import DropZone from '../DropZone.svelte';
  import PasswordPrompt from '../PasswordPrompt.svelte';
  import OptionsPanel from '../OptionsPanel.svelte';
  import ProgressBar from '../ProgressBar.svelte';
  import ResultCard from '../ResultCard.svelte';
  import ThumbGrid, { type ThumbItem } from '../ThumbGrid.svelte';
  import { intakePdf } from '../../lib/password-prompt.svelte';
  import { closePdf, renderThumb, warmPdfjs } from '../../lib/pdfjs-setup';
  import { formatBytes, suffixed } from '../../lib/download';
  import { organizePdf } from '../../core/organize';
  import type { ToolProps } from './index';

  let { accept, multiple, preset }: ToolProps = $props();

  interface Pg {
    id: string;
    /** 0-based source page, -1 blank */
    src: number;
    rotate: number;
  }

  let file = $state<{ name: string; bytes: Uint8Array } | null>(null);
  let pages = $state<Pg[]>([]);
  let busy = $state(false);
  let error = $state('');
  let result = $state<{ bytes: Uint8Array; name: string; pages: number } | null>(null);
  let doc: PDFDocumentProxy | null = null;
  let seq = 0;

  onMount(() => void warmPdfjs().catch(() => {}));
  onDestroy(() => closePdf(doc));

  const items = $derived<ThumbItem[]>(
    pages.map((p, i) => ({
      id: p.id,
      label: p.src < 0 ? 'Blank page' : `Page ${p.src + 1}`,
      sub: `Position ${i + 1}`,
      rotation: p.rotate,
      render: p.src < 0 || !doc ? undefined : (signal) => renderThumb(doc as PDFDocumentProxy, p.src + 1, 160, signal),
    })),
  );

  async function addFiles(files: File[]): Promise<void> {
    error = '';
    result = null;
    try {
      const intake = await intakePdf(files[0]);
      if (!intake) return;
      closePdf(doc);
      doc = intake.doc;
      file = { name: files[0].name, bytes: intake.bytes };
      pages = Array.from({ length: intake.doc.numPages }, (_, i) => ({ id: `p${seq++}`, src: i, rotate: 0 }));
    } catch {
      error = `${files[0].name} could not be read as a PDF.`;
    }
  }

  const rotate = (id: string) => (pages = pages.map((p) => (p.id === id ? { ...p, rotate: (p.rotate + 90) % 360 } : p)));
  const rotateAll = () => (pages = pages.map((p) => ({ ...p, rotate: (p.rotate + 90) % 360 })));
  const remove = (id: string) => (pages = pages.filter((p) => p.id !== id));
  const duplicate = (id: string) => {
    const i = pages.findIndex((p) => p.id === id);
    if (i >= 0) pages = [...pages.slice(0, i + 1), { ...pages[i], id: `p${seq++}` }, ...pages.slice(i + 1)];
  };
  const blankAfter = (id: string) => {
    const i = pages.findIndex((p) => p.id === id);
    if (i >= 0) pages = [...pages.slice(0, i + 1), { id: `p${seq++}`, src: -1, rotate: 0 }, ...pages.slice(i + 1)];
  };
  function reorder(ids: string[]): void {
    const by = new Map(pages.map((p) => [p.id, p]));
    pages = ids.map((id) => by.get(id)).filter((p): p is Pg => !!p);
  }

  async function run(): Promise<void> {
    if (!file || busy || pages.length === 0) return;
    busy = true;
    error = '';
    try {
      const bytes = await organizePdf(file.bytes, pages.map((p) => ({ src: p.src, rotate: p.rotate })));
      result = { bytes, name: suffixed(file.name, 'organized'), pages: pages.length };
    } catch (e) {
      error = `Could not save: ${(e as Error).message}`;
    } finally {
      busy = false;
    }
  }

  const hint = $derived(
    preset === 'rotate' ? 'Rotate single pages, or all at once.'
    : preset === 'delete' ? 'Delete the pages you do not need.'
    : preset === 'reorder' ? 'Drag pages into a new order.'
    : preset === 'extract' ? 'Delete the pages you do not want to keep.'
    : 'Rotate, delete, duplicate or drag pages into a new order.',
  );
</script>

<PasswordPrompt />

{#if result}
  <ResultCard bytes={result.bytes} filename={result.name} title="Your PDF is ready" onrestart={() => ((file = null), (pages = []), (result = null))}>
    {#snippet sizes()}{result?.pages} page{result?.pages === 1 ? '' : 's'} · {formatBytes(result?.bytes.byteLength ?? 0)}{/snippet}
  </ResultCard>
{:else}
  <DropZone {accept} {multiple} onfiles={addFiles} compact={!!file} />
  {#if error}<p class="tool-err" role="alert">{error}</p>{/if}
  {#if file}
    <div class="tool-layout has-panel">
      <div>
        <p class="tool-note">{hint}</p>
        <ThumbGrid {items} label="Pages" onreorder={reorder}>
          {#snippet actions(item)}
            <button type="button" class="icon-btn" aria-label={`Rotate ${item.label}`} title="Rotate" onclick={() => rotate(item.id)}>↻</button>
            <button type="button" class="icon-btn" aria-label={`Delete ${item.label}`} title="Delete" onclick={() => remove(item.id)}>×</button>
            <button type="button" class="icon-btn" aria-label={`Duplicate ${item.label}`} title="Duplicate" onclick={() => duplicate(item.id)}>⧉</button>
            <button type="button" class="icon-btn" aria-label={`Insert blank page after ${item.label}`} title="Insert blank page after" onclick={() => blankAfter(item.id)}>+</button>
          {/snippet}
        </ThumbGrid>
      </div>
      <OptionsPanel title="Page options">
        <button type="button" class="btn" onclick={rotateAll}>Rotate all</button>
        <p class="tool-note">{pages.length} page{pages.length === 1 ? '' : 's'} will be saved.</p>
        {#snippet footer()}
          {#if busy}<ProgressBar done={0} total={0} label="Saving" />{/if}
          <button class="btn btn-primary" data-testid="primary-action" type="button" disabled={busy || pages.length === 0} onclick={run}>Save PDF</button>
        {/snippet}
      </OptionsPanel>
    </div>
  {/if}
{/if}

<style>
  .icon-btn {
    width: 1.75rem;
    height: 1.75rem;
    border: 1px solid var(--border);
    border-radius: 50%;
    background: var(--surface);
    color: var(--text);
    cursor: pointer;
    line-height: 1;
  }
</style>
