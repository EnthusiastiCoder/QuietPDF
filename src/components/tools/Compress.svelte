<script lang="ts">
  import { onDestroy } from 'svelte';
  import DropZone from '../DropZone.svelte';
  import PasswordPrompt from '../PasswordPrompt.svelte';
  import OptionsPanel from '../OptionsPanel.svelte';
  import ProgressBar from '../ProgressBar.svelte';
  import ResultCard from '../ResultCard.svelte';
  import { closePdf } from '../../lib/pdfjs-setup';
  import { getQpdf, runQpdf } from '../../lib/qpdf-setup';
  import { intakePdf } from '../../lib/password-prompt.svelte';
  import { formatBytes, suffixed } from '../../lib/download';
  import { createWorkerClient, isAbortError } from '../../lib/worker-rpc';
  import { QPDF_COMPRESS_ARGS, compressPdf, type CompressLevel } from '../../core/compress';
  import type { CompressWorkerApi } from '../../workers/compress.worker';
  import type { ToolProps } from './index';

  let { accept, multiple }: ToolProps = $props();

  const worker = createWorkerClient<CompressWorkerApi>(
    () => new Worker(new URL('../../workers/compress.worker.ts', import.meta.url), { type: 'module' }),
  );
  onDestroy(() => worker.terminate());

  /** Loads the worker (and its pdf-lib chunk) and qpdf before a file can be added. */
  function warmup(): Promise<unknown> {
    return Promise.all([worker.call('ping', []), getQpdf()]);
  }

  let file = $state<{ name: string; bytes: Uint8Array; pages: number } | null>(null);
  let level = $state<CompressLevel>('recommended');
  let grayscale = $state(false);
  let loading = $state(false);
  let busy = $state(false);
  let error = $state('');
  let progress = $state({ done: 0, total: 0, label: 'Compressing' });
  let result = $state<{ bytes: Uint8Array; name: string; changed: boolean; before: number; ms: number } | null>(null);
  let ac: AbortController | null = null;

  async function addFiles(files: File[]): Promise<void> {
    error = '';
    result = null;
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

  async function run(): Promise<void> {
    if (!file || busy) return;
    busy = true;
    error = '';
    ac = new AbortController();
    const signal = ac.signal;
    progress = { done: 0, total: 0, label: 'Compressing images' };
    const t0 = performance.now();
    try {
      const input = file.bytes;
      const out = await compressPdf(
        input,
        { level, grayscale: level === 'strong' && grayscale },
        {
          recompress: (bytes, opts) => {
            const copy = bytes.slice();
            return worker.call('recompress', [copy, opts], {
              signal,
              transfer: [copy.buffer],
              onProgress: (p) => (progress = { done: p.done, total: p.total, label: p.label ?? 'Compressing images' }),
            });
          },
          rewrite: (bytes) => {
            progress = { done: 0, total: 0, label: 'Optimising the file structure' };
            return runQpdf(bytes, QPDF_COMPRESS_ARGS);
          },
        },
      );
      if (signal.aborted) return;
      result = {
        bytes: out.bytes,
        name: suffixed(file.name, 'compressed'),
        changed: out.changed,
        before: input.byteLength,
        ms: Math.round(performance.now() - t0),
      };
    } catch (e) {
      if (!isAbortError(e)) error = `Could not compress: ${(e as Error).message}`;
    } finally {
      busy = false;
      ac = null;
    }
  }

  function restart(): void {
    file = null;
    result = null;
  }

  const saved = $derived(result ? Math.max(0, Math.round((1 - result.bytes.byteLength / result.before) * 100)) : 0);
</script>

<PasswordPrompt />

{#if result}
  <ResultCard bytes={result.bytes} filename={result.name} title={result.changed ? 'Your compressed PDF is ready' : 'Your PDF is already optimised'} onrestart={restart}>
    {#snippet sizes()}
      {formatBytes(result?.before ?? 0)} → {formatBytes(result?.bytes.byteLength ?? 0)} · {saved}% saved
    {/snippet}
    {#snippet message()}
      {#if result?.changed}
        Compressed in {((result?.ms ?? 0) / 1000).toFixed(1)} s, on this device.
      {:else}
        Already optimised: compressing would not make this file meaningfully smaller, so the original is kept unchanged.
      {/if}
    {/snippet}
  </ResultCard>
{:else}
  <DropZone {accept} {multiple} onfiles={addFiles} compact={!!file} {warmup} />
  {#if error}<p class="tool-err" role="alert">{error}</p>{/if}
  {#if file}
    <div class="tool-layout has-panel">
      <p class="tool-note">{file.name}: {file.pages} page{file.pages === 1 ? '' : 's'}, {formatBytes(file.bytes.byteLength)}.</p>
      <OptionsPanel title="Compression">
        <div class="field">
          <label for="cmp-level">Compression level</label>
          <select id="cmp-level" bind:value={level}>
            <option value="light">Light</option>
            <option value="recommended">Recommended</option>
            <option value="strong">Strong</option>
          </select>
        </div>
        <p class="tool-note">
          {#if level === 'light'}Best quality: images at about 150 dpi.{:else if level === 'recommended'}Good quality, much smaller: images at about 120 dpi.{:else}Smallest file: images at about 96 dpi.{/if}
        </p>
        {#if level === 'strong'}
          <label class="check"><input type="checkbox" bind:checked={grayscale} /> Convert images to grayscale</label>
        {/if}
        {#snippet footer()}
          {#if busy}<ProgressBar done={progress.done} total={progress.total} label={progress.label} unit="image" oncancel={() => ac?.abort()} />{/if}
          <button class="btn btn-primary" data-testid="primary-action" type="button" disabled={busy || loading} onclick={run}>Compress PDF</button>
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
