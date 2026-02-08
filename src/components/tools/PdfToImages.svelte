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
  import { pdfToImages } from '../../core/pdf-to-images';
  import { zip } from '../../lib/zip';
  import type { ToolProps } from './index';

  let { accept, multiple, preset }: ToolProps = $props();

  let file = $state<{ name: string; pages: number; size: number } | null>(null);
  let format = $state<'jpg' | 'png'>(preset === 'png' ? 'png' : 'jpg');
  let dpi = $state(150);
  let busy = $state(false);
  let error = $state('');
  let progress = $state({ done: 0, total: 0 });
  let result = $state<{ bytes: Uint8Array; name: string; files: number } | null>(null);
  let doc: PDFDocumentProxy | null = null;

  onMount(() => void warmPdfjs().catch(() => {}));
  onDestroy(() => closePdf(doc));

  let loading = $state(false);

  async function addFiles(files: File[]): Promise<void> {
    error = '';
    result = null;
    // Show the options at once; the PDF is read while the user looks at them.
    file = { name: files[0].name, pages: 0, size: 0 };
    loading = true;
    try {
      const intake = await intakePdf(files[0]);
      if (!intake) {
        file = null;
        return;
      }
      closePdf(doc);
      doc = intake.doc;
      file = { name: files[0].name, pages: intake.doc.numPages, size: intake.bytes.byteLength };
    } catch {
      file = null;
      error = `${files[0].name} could not be read as a PDF.`;
    } finally {
      loading = false;
    }
  }

  async function run(): Promise<void> {
    if (!file || !doc || busy) return;
    busy = true;
    error = '';
    progress = { done: 0, total: file.pages };
    try {
      const base = baseName(file.name);
      const images = await pdfToImages(doc, { format, dpi, baseName: base, onProgress: (done, total) => (progress = { done, total }) });
      if (images.length === 1) {
        result = { bytes: images[0].data, name: images[0].name, files: 1 };
      } else {
        const zipped = await zip(images);
        result = { bytes: zipped, name: `${base}-images.zip`, files: images.length };
      }
    } catch (e) {
      error = `Could not convert: ${(e as Error).message}`;
    } finally {
      busy = false;
    }
  }

  function restart(): void {
    closePdf(doc);
    doc = null;
    file = null;
    result = null;
  }
</script>

<PasswordPrompt />

{#if result}
  <ResultCard bytes={result.bytes} filename={result.name} title="Your images are ready" onrestart={restart}>
    {#snippet sizes()}{result?.files} image{result?.files === 1 ? '' : 's'} · {formatBytes(result?.bytes.byteLength ?? 0)}{/snippet}
  </ResultCard>
{:else}
  <DropZone {accept} {multiple} onfiles={addFiles} compact={!!file} />
  {#if error}<p class="tool-err" role="alert">{error}</p>{/if}
  {#if file}
    <div class="tool-layout has-panel">
      <p class="tool-note">{file.name}: {file.pages} page{file.pages === 1 ? '' : 's'}, {formatBytes(file.size)}.</p>
      <OptionsPanel title="Image options">
        <div class="field">
          <label for="pi-format">Format</label>
          <select id="pi-format" bind:value={format}>
            <option value="jpg">JPG</option>
            <option value="png">PNG</option>
          </select>
        </div>
        <div class="field">
          <label for="pi-dpi">Resolution</label>
          <select id="pi-dpi" bind:value={dpi}>
            <option value={72}>72 dpi (screen)</option>
            <option value={150}>150 dpi (good)</option>
            <option value={300}>300 dpi (print)</option>
          </select>
        </div>
        {#snippet footer()}
          {#if busy}<ProgressBar done={progress.done} total={progress.total} label="Rendering" />{/if}
          <button class="btn btn-primary" data-testid="primary-action" type="button" disabled={busy || loading} onclick={run}>Convert to images</button>
        {/snippet}
      </OptionsPanel>
    </div>
  {/if}
{/if}
