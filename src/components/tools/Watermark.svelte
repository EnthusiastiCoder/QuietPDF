<script lang="ts">
  import DropZone from '../DropZone.svelte';
  import PasswordPrompt from '../PasswordPrompt.svelte';
  import OptionsPanel from '../OptionsPanel.svelte';
  import ProgressBar from '../ProgressBar.svelte';
  import ResultCard from '../ResultCard.svelte';
  import { closePdf } from '../../lib/pdfjs-setup';
  import { intakePdf } from '../../lib/password-prompt.svelte';
  import { suffixed, formatBytes, readFile } from '../../lib/download';
  import { RangeParseError, parseRanges } from '../../lib/ranges';
  import { addWatermark } from '../../core/watermark';
  import type { ToolProps } from './index';

  let { accept, multiple }: ToolProps = $props();

  let file = $state<{ name: string; bytes: Uint8Array; pages: number } | null>(null);
  let kind = $state<'text' | 'image'>('text');
  let text = $state('CONFIDENTIAL');
  let image = $state<Uint8Array | null>(null);
  let opacity = $state(30);
  let rotation = $state(45);
  let position = $state<'center' | 'tiled'>('center');
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
  const ready = $derived(!rangeError && (kind === 'text' ? text.trim().length > 0 : image !== null));

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
    } catch {
      file = null;
      error = `${files[0].name} could not be read as a PDF.`;
    } finally {
      loading = false;
    }
  }

  async function pickImage(e: Event): Promise<void> {
    const f = (e.currentTarget as HTMLInputElement).files?.[0];
    image = f ? await readFile(f) : null;
  }

  async function run(): Promise<void> {
    if (!file || busy || !ready) return;
    busy = true;
    error = '';
    try {
      const bytes = await addWatermark(file.bytes, {
        kind,
        text,
        image: image ?? undefined,
        opacity: Math.min(100, Math.max(0, opacity)) / 100,
        rotation,
        position,
        range,
      });
      result = { bytes, name: suffixed(file.name, 'watermarked') };
    } catch (e) {
      error = `Could not add the watermark: ${(e as Error).message}`;
    } finally {
      busy = false;
    }
  }
</script>

<PasswordPrompt />

{#if result}
  <ResultCard bytes={result.bytes} filename={result.name} title="Your watermarked PDF is ready" onrestart={() => ((file = null), (result = null))} />
{:else}
  <DropZone {accept} {multiple} onfiles={addFiles} compact={!!file} />
  {#if error}<p class="tool-err" role="alert">{error}</p>{/if}
  {#if file}
    <div class="tool-layout has-panel">
      <p class="tool-note">{file.name}: {file.pages} page{file.pages === 1 ? '' : 's'}, {formatBytes(file.bytes.byteLength)}.</p>
      <OptionsPanel title="Watermark options">
        <div class="field">
          <label for="wm-kind">Watermark type</label>
          <select id="wm-kind" bind:value={kind}>
            <option value="text">Text</option>
            <option value="image">Image</option>
          </select>
        </div>
        {#if kind === 'text'}
          <div class="field">
            <label for="wm-text">Watermark text</label>
            <input id="wm-text" type="text" bind:value={text} />
          </div>
        {:else}
          <div class="field">
            <label for="wm-image">Watermark image</label>
            <input id="wm-image" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onchange={pickImage} />
          </div>
        {/if}
        <div class="field">
          <label for="wm-opacity">Opacity (%)</label>
          <input id="wm-opacity" type="number" min="0" max="100" bind:value={opacity} />
        </div>
        <div class="field">
          <label for="wm-rot">Rotation (degrees)</label>
          <input id="wm-rot" type="number" min="-180" max="180" bind:value={rotation} />
        </div>
        <div class="field">
          <label for="wm-pos">Position</label>
          <select id="wm-pos" bind:value={position}>
            <option value="center">Centre</option>
            <option value="tiled">Tiled (3 x 3)</option>
          </select>
        </div>
        <div class="field">
          <label for="wm-range">Page range</label>
          <input id="wm-range" type="text" placeholder="All pages, or 2-5" bind:value={range} aria-invalid={rangeError ? 'true' : undefined} />
        </div>
        {#if rangeError}<p class="tool-err" data-testid="inline-error" role="alert">{rangeError}</p>{/if}
        {#snippet footer()}
          {#if busy}<ProgressBar done={0} total={0} label="Watermarking" />{/if}
          <button class="btn btn-primary" data-testid="primary-action" type="button" disabled={busy || loading || !ready} onclick={run}>Add watermark</button>
        {/snippet}
      </OptionsPanel>
    </div>
  {/if}
{/if}
