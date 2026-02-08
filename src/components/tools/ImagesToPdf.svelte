<script lang="ts">
  import DropZone from '../DropZone.svelte';
  import ThumbGrid, { type ThumbItem } from '../ThumbGrid.svelte';
  import OptionsPanel from '../OptionsPanel.svelte';
  import ProgressBar from '../ProgressBar.svelte';
  import ResultCard from '../ResultCard.svelte';
  import { formatBytes, readFile } from '../../lib/download';
  import { imagesToPdf } from '../../core/images-to-pdf';
  import type { ToolProps } from './index';

  let { accept, multiple }: ToolProps = $props();

  interface Entry {
    id: string;
    name: string;
    bytes: Uint8Array;
    url: string;
  }

  let entries = $state<Entry[]>([]);
  let pageSize = $state<'fit' | 'a4' | 'letter'>('fit');
  let orientation = $state<'auto' | 'portrait' | 'landscape'>('portrait');
  let margin = $state<'none' | 'small' | 'big'>('small');
  let busy = $state(false);
  let error = $state('');
  let progress = $state({ done: 0, total: 0 });
  let result = $state<Uint8Array | null>(null);
  let seq = 0;

  const items = $derived<ThumbItem[]>(
    entries.map((e) => ({
      id: e.id,
      label: e.name,
      sub: formatBytes(e.bytes.byteLength),
      render: async () => {
        const img = new Image();
        img.alt = '';
        img.draggable = false;
        img.src = e.url;
        await img.decode().catch(() => {});
        return img;
      },
    })),
  );

  async function addFiles(files: File[]): Promise<void> {
    error = '';
    result = null;
    const added: Entry[] = [];
    for (const f of files) {
      const bytes = await readFile(f);
      added.push({ id: `i${++seq}`, name: f.name, bytes, url: URL.createObjectURL(new Blob([bytes as BlobPart], { type: f.type })) });
    }
    entries = [...entries, ...added];
  }

  function reorder(ids: string[]): void {
    const by = new Map(entries.map((e) => [e.id, e]));
    entries = ids.map((id) => by.get(id)).filter((e): e is Entry => !!e);
    result = null;
  }

  function remove(id: string): void {
    const e = entries.find((x) => x.id === id);
    if (e) URL.revokeObjectURL(e.url);
    entries = entries.filter((x) => x.id !== id);
    result = null;
  }

  async function convert(): Promise<void> {
    if (busy || entries.length === 0) return;
    busy = true;
    error = '';
    progress = { done: 0, total: entries.length };
    try {
      result = await imagesToPdf(
        entries.map((e) => e.bytes),
        { pageSize, orientation, margin, onProgress: (done, total) => (progress = { done, total }) },
      );
    } catch (e) {
      error = `Could not create the PDF: ${(e as Error).message}`;
    } finally {
      busy = false;
    }
  }

  function restart(): void {
    for (const e of entries) URL.revokeObjectURL(e.url);
    entries = [];
    result = null;
    error = '';
  }
</script>

{#if result}
  <ResultCard bytes={result} filename="images.pdf" title="Your PDF is ready" onrestart={restart}>
    {#snippet sizes()}{entries.length} page{entries.length === 1 ? '' : 's'} · {formatBytes(result?.byteLength ?? 0)}{/snippet}
  </ResultCard>
{:else}
  <DropZone {accept} {multiple} onfiles={addFiles} compact={entries.length > 0} />
  {#if error}<p class="tool-err" role="alert">{error}</p>{/if}
  {#if entries.length > 0}
    <div class="tool-layout has-panel">
      <div>
        <p class="tool-note">Drag the images (or use Alt + arrow keys) to set the page order.</p>
        <ThumbGrid {items} onreorder={reorder} onremove={remove} label="Images" />
      </div>
      <OptionsPanel title="Page options">
        <div class="field">
          <label for="i-size">Page size</label>
          <select id="i-size" bind:value={pageSize}>
            <option value="fit">Fit to image</option>
            <option value="a4">A4</option>
            <option value="letter">Letter</option>
          </select>
        </div>
        <div class="field">
          <label for="i-orient">Orientation</label>
          <select id="i-orient" bind:value={orientation} disabled={pageSize === 'fit'}>
            <option value="auto">Auto</option>
            <option value="portrait">Portrait</option>
            <option value="landscape">Landscape</option>
          </select>
        </div>
        <div class="field">
          <label for="i-margin">Margin</label>
          <select id="i-margin" bind:value={margin}>
            <option value="none">None</option>
            <option value="small">Small</option>
            <option value="big">Big</option>
          </select>
        </div>
        {#snippet footer()}
          {#if busy}<ProgressBar done={progress.done} total={progress.total} label="Creating PDF" unit="image" />{/if}
          <button class="btn btn-primary" data-testid="primary-action" type="button" disabled={busy} onclick={convert}>Convert to PDF</button>
        {/snippet}
      </OptionsPanel>
    </div>
  {/if}
{/if}
