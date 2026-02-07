<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { PDFDocumentProxy } from 'pdfjs-dist';
  import { renderPage } from '../lib/pdfjs-setup';

  interface Mark {
    page: number;
    /** Fractions of the page width and height, origin top-left. */
    fx: number;
    fy: number;
    /** Width as a fraction of the page width. */
    fw: number;
  }
  interface Props {
    doc: PDFDocumentProxy;
    marks?: Mark[];
    /** Called with the 0-based page, the click as fractions (origin top-left) and the page size in points. */
    onplace?: (page: number, fx: number, fy: number, size: { width: number; height: number }) => void;
    onremovemark?: (index: number) => void;
  }
  let { doc, marks = [], onplace, onremovemark }: Props = $props();

  let sizes = $state<{ width: number; height: number }[]>([]);
  let host: HTMLDivElement | undefined = $state();
  const ac = new AbortController();
  onDestroy(() => ac.abort());

  $effect(() => {
    const d = doc;
    sizes = [];
    void (async () => {
      const out: { width: number; height: number }[] = [];
      for (let n = 1; n <= d.numPages; n++) {
        if (ac.signal.aborted) return;
        const page = await d.getPage(n);
        const vp = page.getViewport({ scale: 1 });
        out.push({ width: vp.width, height: vp.height });
        sizes = [...out];
        await Promise.resolve();
        const canvas = host?.querySelector<HTMLCanvasElement>(`canvas[data-page="${n}"]`);
        if (canvas) {
          try {
            await renderPage(page, { width: 640, canvas, signal: ac.signal });
          } catch {
            /* cancelled */
          }
        }
        page.cleanup();
      }
    })();
  });

  function click(e: MouseEvent, i: number): void {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    onplace?.(i, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, sizes[i]);
  }
</script>

<div class="pages" bind:this={host}>
  {#each sizes as size, i (i)}
    <div class="page" style:aspect-ratio={`${size.width} / ${size.height}`}>
      <canvas data-testid="page-canvas" data-page={i + 1} aria-label={`Page ${i + 1}. Click to place your signature.`} onclick={(e) => click(e, i)}></canvas>
      {#each marks as m, mi (mi)}
        {#if m.page === i}
          <button
            type="button"
            class="mark"
            style:left={`${m.fx * 100}%`}
            style:top={`${m.fy * 100}%`}
            style:width={`${m.fw * 100}%`}
            aria-label={`Remove signature on page ${i + 1}`}
            onclick={() => onremovemark?.(mi)}>×</button>
        {/if}
      {/each}
    </div>
  {/each}
</div>

<style>
  .pages {
    display: grid;
    gap: var(--space-3);
    justify-items: center;
  }
  .page {
    position: relative;
    width: 100%;
    max-width: 640px;
    box-shadow: 0 1px 4px rgb(0 0 0 / 0.25);
    background: #fff;
  }
  canvas {
    display: block;
    width: 100%;
    height: 100%;
    cursor: crosshair;
  }
  .mark {
    position: absolute;
    transform: translate(-50%, -50%);
    aspect-ratio: 3 / 1;
    border: 2px dashed var(--accent);
    background: rgb(0 0 0 / 0.04);
    color: var(--accent);
    cursor: pointer;
    font-size: 0.8rem;
    text-align: right;
    padding: 0 4px;
    pointer-events: none;
  }
  .mark:focus-visible {
    pointer-events: auto;
  }
</style>
