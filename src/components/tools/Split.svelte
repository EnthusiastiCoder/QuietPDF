<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { PDFDocumentProxy } from 'pdfjs-dist';
  import DropZone from '../DropZone.svelte';
  import PasswordPrompt from '../PasswordPrompt.svelte';
  import OptionsPanel from '../OptionsPanel.svelte';
  import ProgressBar from '../ProgressBar.svelte';
  import ResultCard from '../ResultCard.svelte';
  import { intakePdf } from '../../lib/password-prompt.svelte';
  import { closePdf, warmPdfjs } from '../../lib/pdfjs-setup';
  import { baseName, formatBytes } from '../../lib/download';
  import { expandRanges, parseRanges, RangeParseError } from '../../lib/ranges';
  import { groupsEach, groupsEvery, splitPdf } from '../../core/split';
  import { zip } from '../../lib/zip';
  import type { ToolProps } from './index';

  let { accept, multiple }: ToolProps = $props();

  let file = $state<{ name: string; bytes: Uint8Array; pages: number } | null>(null);
  let mode = $state<'ranges' | 'every' | 'each'>('ranges');
  let ranges = $state('');
  let every = $state(1);
  let busy = $state(false);
  let error = $state('');
  let progress = $state({ done: 0, total: 0 });
  let result = $state<{ bytes: Uint8Array; name: string; files: number } | null>(null);
  let doc: PDFDocumentProxy | null = null;

  onMount(() => void warmPdfjs().catch(() => {}));
  onDestroy(() => closePdf(doc));

  /** The page groups for the current options, or an error message. */
  const plan = $derived.by((): { groups: number[][] } | { error: string } => {
    if (!file) return { error: '' };
    if (mode === 'each') return { groups: groupsEach(file.pages) };
    if (mode === 'every') {
      if (!Number.isInteger(every) || every < 1) return { error: 'Enter a whole number of pages, 1 or more.' };
      return { groups: groupsEvery(every, file.pages) };
    }
    try {
      return { groups: parseRanges(ranges, file.pages).map((r) => expandRanges([r])) };
    } catch (e) {
      return { error: e instanceof RangeParseError ? e.message : 'Check the page ranges.' };
    }
  });
  const planError = $derived('error' in plan ? plan.error : '');

  let loading = $state(false);

  async function addFiles(files: File[]): Promise<void> {
    error = '';
    result = null;
    // Show the options at once; the PDF is read while the user looks at them.
    file = { name: files[0].name, bytes: new Uint8Array(0), pages: 0 };
    loading = true;
    try {
      const intake = await intakePdf(files[0]);
      if (!intake) {
        file = null;
        return;
      }
      closePdf(doc);
      doc = intake.doc;
      file = { name: files[0].name, bytes: intake.bytes, pages: intake.doc.numPages };
    } catch (e) {
      file = null;
      error = `${files[0].name} could not be read as a PDF.`;
    } finally {
      loading = false;
    }
  }

  async function run(): Promise<void> {
    if (!file || busy || !('groups' in plan)) return;
    busy = true;
    error = '';
    const { groups } = plan;
    progress = { done: 0, total: groups.length };
    try {
      const parts = await splitPdf(file.bytes, groups, (done, total) => (progress = { done, total }));
      const base = baseName(file.name);
      const pad = String(parts.length).length;
      const zipped = await zip(parts.map((data, i) => ({ name: `${base}-${String(i + 1).padStart(pad, '0')}.pdf`, data })));
      result = { bytes: zipped, name: `${base}-split.zip`, files: parts.length };
    } catch (e) {
      error = `Could not split: ${(e as Error).message}`;
    } finally {
      busy = false;
    }
  }

  function restart(): void {
    closePdf(doc);
    doc = null;
    file = null;
    result = null;
    ranges = '';
  }
</script>

<PasswordPrompt />

{#if result}
  <ResultCard bytes={result.bytes} filename={result.name} title="Your split PDFs are ready" onrestart={restart}>
    {#snippet sizes()}{result?.files} files · {formatBytes(result?.bytes.byteLength ?? 0)}{/snippet}
  </ResultCard>
{:else}
  <DropZone {accept} {multiple} onfiles={addFiles} compact={!!file} />
  {#if error}<p class="tool-err" role="alert">{error}</p>{/if}
  {#if file}
    <div class="tool-layout has-panel">
      <p class="tool-note">{file.name}: {file.pages} page{file.pages === 1 ? '' : 's'}, {formatBytes(file.bytes.byteLength)}.</p>
      <OptionsPanel title="Split options">
        <div class="field">
          <label for="s-mode">Split mode</label>
          <select id="s-mode" bind:value={mode}>
            <option value="ranges">Ranges</option>
            <option value="every">Every N pages</option>
            <option value="each">One file per page</option>
          </select>
        </div>
        {#if mode === 'ranges'}
          <div class="field">
            <label for="s-ranges">Ranges</label>
            <input id="s-ranges" type="text" placeholder="1-3,5" bind:value={ranges} aria-invalid={planError ? 'true' : undefined} />
          </div>
        {:else if mode === 'every'}
          <div class="field">
            <label for="s-every">Pages per file</label>
            <input id="s-every" type="number" min="1" bind:value={every} />
          </div>
        {/if}
        {#if planError && (mode !== 'ranges' || ranges.trim() || true)}
          {#if mode !== 'ranges' || ranges.trim()}<p class="tool-err" data-testid="inline-error" role="alert">{planError}</p>{/if}
        {/if}
        {#snippet footer()}
          {#if busy}<ProgressBar done={progress.done} total={progress.total} label="Splitting" unit="file" />{/if}
          <button class="btn btn-primary" data-testid="primary-action" type="button" disabled={busy || loading || !!planError} onclick={run}>Split PDF</button>
        {/snippet}
      </OptionsPanel>
    </div>
  {/if}
{/if}
