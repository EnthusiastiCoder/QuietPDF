<script lang="ts">
  import DropZone from '../DropZone.svelte';
  import PasswordPrompt from '../PasswordPrompt.svelte';
  import OptionsPanel from '../OptionsPanel.svelte';
  import ProgressBar from '../ProgressBar.svelte';
  import ResultCard from '../ResultCard.svelte';
  import { closePdf } from '../../lib/pdfjs-setup';
  import { intakePdf } from '../../lib/password-prompt.svelte';
  import { suffixed, formatBytes } from '../../lib/download';
  import { RangeParseError, parseRanges } from '../../lib/ranges';
  import { addPageNumbers, type NumberFormat, type NumberPosition } from '../../core/page-numbers';
  import type { ToolProps } from './index';

  let { accept, multiple }: ToolProps = $props();

  let file = $state<{ name: string; bytes: Uint8Array; pages: number } | null>(null);
  let format = $state<NumberFormat>('n');
  let position = $state<NumberPosition>('bottom-center');
  let start = $state(1);
  let skipFirst = $state(false);
  let range = $state('');
  let busy = $state(false);
  let error = $state('');
  let result = $state<{ bytes: Uint8Array; name: string } | null>(null);

  const rangeError = $derived.by(() => {
    if (!file || !range.trim()) return '';
    try {
      parseRanges(range, file.pages);
      return '';
    } catch (e) {
      return e instanceof RangeParseError ? e.message : 'Check the page range.';
    }
  });
  const startOk = $derived(Number.isInteger(start));

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
      const pages = intake.doc.numPages;
      closePdf(intake.doc);
      file = { name: files[0].name, bytes: intake.bytes, pages };
    } catch (e) {
      file = null;
      error = `${files[0].name} could not be read as a PDF.`;
    } finally {
      loading = false;
    }
  }

  async function run(): Promise<void> {
    if (!file || busy || rangeError || !startOk) return;
    busy = true;
    error = '';
    try {
      const bytes = await addPageNumbers(file.bytes, { format, position, start, skipFirst, range });
      result = { bytes, name: suffixed(file.name, 'numbered') };
    } catch (e) {
      error = `Could not add page numbers: ${(e as Error).message}`;
    } finally {
      busy = false;
    }
  }
</script>

<PasswordPrompt />

{#if result}
  <ResultCard bytes={result.bytes} filename={result.name} title="Your numbered PDF is ready" onrestart={() => ((file = null), (result = null))} />
{:else}
  <DropZone {accept} {multiple} onfiles={addFiles} compact={!!file} />
  {#if error}<p class="tool-err" role="alert">{error}</p>{/if}
  {#if file}
    <div class="tool-layout has-panel">
      <p class="tool-note">{file.name}: {file.pages} page{file.pages === 1 ? '' : 's'}, {formatBytes(file.bytes.byteLength)}.</p>
      <OptionsPanel title="Numbering options">
        <div class="field">
          <label for="pn-format">Format</label>
          <select id="pn-format" bind:value={format}>
            <option value="n">1</option>
            <option value="page-n">Page 1</option>
            <option value="page-n-of-total">Page 1 of N</option>
            <option value="n-of-total">1 / N</option>
          </select>
        </div>
        <div class="field">
          <label for="pn-pos">Position</label>
          <select id="pn-pos" bind:value={position}>
            <option value="bottom-center">Bottom centre</option>
            <option value="bottom-right">Bottom right</option>
            <option value="bottom-left">Bottom left</option>
            <option value="top-center">Top centre</option>
            <option value="top-right">Top right</option>
            <option value="top-left">Top left</option>
          </select>
        </div>
        <div class="field">
          <label for="pn-start">Start number</label>
          <input id="pn-start" type="number" step="1" bind:value={start} />
        </div>
        <div class="field">
          <label for="pn-range">Page range</label>
          <input id="pn-range" type="text" placeholder="All pages, or 2-5" bind:value={range} aria-invalid={rangeError ? 'true' : undefined} />
        </div>
        <label class="field-check"><input type="checkbox" bind:checked={skipFirst} /> Skip the first page</label>
        {#if rangeError}<p class="tool-err" data-testid="inline-error" role="alert">{rangeError}</p>{/if}
        {#snippet footer()}
          {#if busy}<ProgressBar done={0} total={0} label="Numbering" />{/if}
          <button class="btn btn-primary" data-testid="primary-action" type="button" disabled={busy || loading || !!rangeError || !startOk} onclick={run}>Add page numbers</button>
        {/snippet}
      </OptionsPanel>
    </div>
  {/if}
{/if}
