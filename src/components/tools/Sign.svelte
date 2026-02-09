<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { PDFDocumentProxy } from 'pdfjs-dist';
  import DropZone from '../DropZone.svelte';
  import PasswordPrompt from '../PasswordPrompt.svelte';
  import OptionsPanel from '../OptionsPanel.svelte';
  import ProgressBar from '../ProgressBar.svelte';
  import ResultCard from '../ResultCard.svelte';
  import PageCanvas from '../PageCanvas.svelte';
  import SignaturePad from '../SignaturePad.svelte';
  import { intakePdf } from '../../lib/password-prompt.svelte';
  import { closePdf, warmPdfjs } from '../../lib/pdfjs-setup';
  import { suffixed, readFile } from '../../lib/download';
  import { signPdf, type SignaturePlacement, type SignatureSource } from '../../core/sign';
  import type { ToolProps } from './index';

  let { accept, multiple }: ToolProps = $props();

  const SIG_WIDTH = 150;

  let file = $state<{ name: string; bytes: Uint8Array } | null>(null);
  let doc = $state<PDFDocumentProxy | null>(null);
  let tab = $state<'draw' | 'type' | 'upload'>('draw');
  let name = $state('');
  let fontId = $state('dancing');
  let source = $state<SignatureSource | null>(null);
  type Placed = SignaturePlacement & { fx: number; fy: number; pageWidth: number };
  let placements = $state<Placed[]>([]);
  let busy = $state(false);
  let error = $state('');
  let result = $state<{ bytes: Uint8Array; name: string } | null>(null);
  let fontBytes: Uint8Array | null = null;

  onMount(() => void warmPdfjs().catch(() => {}));
  onDestroy(() => closePdf(doc));

  const marks = $derived(
    placements.map((p) => ({ page: p.page, fx: p.fx, fy: p.fy, fw: p.width / p.pageWidth })),
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
      placements = [];
    } catch {
      error = `${files[0].name} could not be read as a PDF.`;
    }
  }

  function useDrawn(png: Uint8Array, aspect: number): void {
    source = { kind: 'image', png, aspect };
  }

  async function useTyped(): Promise<void> {
    if (!name.trim()) return;
    error = '';
    try {
      if (!fontBytes) {
        const res = await fetch('/vendor/fonts/dancing-script.woff');
        if (!res.ok) throw new Error('font missing');
        fontBytes = new Uint8Array(await res.arrayBuffer());
      }
      source = { kind: 'text', text: name.trim(), font: fontBytes };
    } catch {
      error = 'Could not load the signature font.';
    }
  }

  async function useUploaded(e: Event): Promise<void> {
    const f = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!f) return;
    const bytes = await readFile(f);
    try {
      const bmp = await createImageBitmap(new Blob([bytes as BlobPart]));
      const c = document.createElement('canvas');
      c.width = bmp.width;
      c.height = bmp.height;
      (c.getContext('2d') as CanvasRenderingContext2D).drawImage(bmp, 0, 0);
      const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'));
      if (blob) source = { kind: 'image', png: new Uint8Array(await blob.arrayBuffer()), aspect: bmp.width / bmp.height };
    } catch {
      error = 'That image could not be read.';
    }
  }

  function place(page: number, fx: number, fy: number, size: { width: number; height: number }): void {
    if (!source) return;
    placements = [...placements, { page, cx: fx * size.width, cy: (1 - fy) * size.height, width: SIG_WIDTH, fx, fy, pageWidth: size.width }];
  }

  async function run(): Promise<void> {
    if (!file || !source || busy || placements.length === 0) return;
    busy = true;
    error = '';
    try {
      const bytes = await signPdf(
        file.bytes,
        source,
        placements.map(({ page, cx, cy, width }) => ({ page, cx, cy, width })),
      );
      result = { bytes, name: suffixed(file.name, 'signed') };
    } catch (e) {
      error = `Could not sign: ${(e as Error).message}`;
    } finally {
      busy = false;
    }
  }

  function restart(): void {
    closePdf(doc);
    doc = null;
    file = null;
    result = null;
    placements = [];
    source = null;
  }
</script>

<PasswordPrompt />

{#if result}
  <ResultCard bytes={result.bytes} filename={result.name} title="Your signed PDF is ready" onrestart={restart} />
{:else}
  <DropZone {accept} {multiple} onfiles={addFiles} compact={!!file} />
  {#if error}<p class="tool-err" role="alert">{error}</p>{/if}
  {#if file && doc}
    <div class="tool-layout has-panel">
      <div>
        <p class="tool-note">
          {source ? 'Click a page to place your signature. Click more pages to add more.' : 'Create your signature first, then click a page to place it.'}
        </p>
        <PageCanvas {doc} {marks} onplace={place} onremovemark={(i) => (placements = placements.filter((_, j) => j !== i))} />
      </div>
      <OptionsPanel title="Your signature">
        <div role="tablist" aria-label="Signature source" class="tabs">
          <button type="button" role="tab" aria-selected={tab === 'draw'} class="btn" onclick={() => (tab = 'draw')}>Draw</button>
          <button type="button" role="tab" aria-selected={tab === 'type'} class="btn" onclick={() => (tab = 'type')}>Type</button>
          <button type="button" role="tab" aria-selected={tab === 'upload'} class="btn" onclick={() => (tab = 'upload')}>Upload</button>
        </div>
        {#if tab === 'draw'}
          <SignaturePad onuse={useDrawn} />
        {:else if tab === 'type'}
          <div class="field">
            <label for="sg-name">Your name</label>
            <input id="sg-name" type="text" bind:value={name} autocomplete="off" />
          </div>
          <div class="field">
            <label for="sg-font">Font</label>
            <select id="sg-font" bind:value={fontId}>
              <option value="dancing">Dancing Script</option>
            </select>
          </div>
          <button type="button" class="btn btn-primary" disabled={!name.trim()} onclick={useTyped}>Use signature</button>
        {:else}
          <div class="field">
            <label for="sg-up">Signature image</label>
            <input id="sg-up" type="file" accept="image/png,image/jpeg,image/webp" onchange={useUploaded} />
          </div>
        {/if}
        {#if source}<p class="tool-note" data-testid="signature-ready">Signature ready. {placements.length} placed.</p>{/if}
        {#snippet footer()}
          {#if busy}<ProgressBar done={0} total={0} label="Signing" />{/if}
          <button class="btn btn-primary" data-testid="primary-action" type="button" disabled={busy || !source || placements.length === 0} onclick={run}>Sign PDF</button>
        {/snippet}
      </OptionsPanel>
    </div>
  {/if}
{/if}
