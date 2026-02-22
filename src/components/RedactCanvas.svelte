<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { PDFDocumentProxy } from 'pdfjs-dist';
  import { renderPage } from '../lib/pdfjs-setup';
  import type { RedactBox } from '../core/redact';

  interface Props {
    doc: PDFDocumentProxy;
    boxes: RedactBox[];
    /** Drawing with the pointer is on (Draw boxes mode). */
    drawing?: boolean;
    onadd?: (box: RedactBox) => void;
    onremove?: (index: number) => void;
  }

  let { doc, boxes, drawing = false, onadd, onremove }: Props = $props();

  let sizes = $state<{ width: number; height: number }[]>([]);
  let host: HTMLDivElement | undefined = $state();
  let draft = $state<RedactBox | null>(null);
  let start: { page: number; x: number; y: number; rect: DOMRect } | null = null;
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
            await renderPage(page, { width: 720, canvas, signal: ac.signal });
          } catch {
            /* cancelled */
          }
        }
        page.cleanup();
      }
    })();
  });

  const clamp = (v: number) => Math.min(1, Math.max(0, v));

  function canvasRect(el: HTMLElement): DOMRect {
    return (el.querySelector('canvas') as HTMLCanvasElement).getBoundingClientRect();
  }

  function down(e: PointerEvent, page: number): void {
    if (!drawing || e.button !== 0) return;
    const el = e.currentTarget as HTMLElement;
    const rect = canvasRect(el);
    const x = clamp((e.clientX - rect.left) / rect.width);
    const y = clamp((e.clientY - rect.top) / rect.height);
    start = { page, x, y, rect };
    draft = { page, x0: x, y0: y, x1: x, y1: y };
    el.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  }

  function move(e: PointerEvent): void {
    if (!start) return;
    const { rect } = start;
    draft = {
      page: start.page,
      x0: Math.min(start.x, clamp((e.clientX - rect.left) / rect.width)),
      y0: Math.min(start.y, clamp((e.clientY - rect.top) / rect.height)),
      x1: Math.max(start.x, clamp((e.clientX - rect.left) / rect.width)),
      y1: Math.max(start.y, clamp((e.clientY - rect.top) / rect.height)),
    };
  }

  function up(): void {
    if (!start || !draft) return;
    const b = draft;
    start = null;
    draft = null;
    if (b.x1 - b.x0 > 0.003 && b.y1 - b.y0 > 0.003) onadd?.(b);
  }
</script>

<div class="pages" bind:this={host}>
  {#each sizes as size, i (i)}
    <div
      class="page"
      class:drawing
      style:aspect-ratio={`${size.width} / ${size.height}`}
      role="presentation"
      onpointerdown={(e) => down(e, i)}
      onpointermove={move}
      onpointerup={up}
      onpointercancel={up}
    >
      <canvas
        data-testid="page-canvas"
        data-page={i + 1}
        aria-label={drawing ? `Page ${i + 1}. Drag to draw a redaction box.` : `Page ${i + 1}`}
      ></canvas>
      {#each boxes as b, bi (bi)}
        {#if b.page === i}
          <div class="box" style:left={`${b.x0 * 100}%`} style:top={`${b.y0 * 100}%`} style:width={`${(b.x1 - b.x0) * 100}%`} style:height={`${(b.y1 - b.y0) * 100}%`}>
            <button type="button" class="remove" aria-label={`Remove redaction box ${bi + 1} on page ${i + 1}`} onpointerdown={(e) => e.stopPropagation()} onclick={() => onremove?.(bi)}>×</button>
          </div>
        {/if}
      {/each}
      {#if draft && draft.page === i}
        <div class="box draft" style:left={`${draft.x0 * 100}%`} style:top={`${draft.y0 * 100}%`} style:width={`${(draft.x1 - draft.x0) * 100}%`} style:height={`${(draft.y1 - draft.y0) * 100}%`}></div>
      {/if}
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
    max-width: 720px;
    box-shadow: 0 1px 4px rgb(0 0 0 / 0.25);
    background: #fff;
    user-select: none;
  }
  .page.drawing {
    cursor: crosshair;
    touch-action: none;
  }
  canvas {
    display: block;
    width: 100%;
    height: 100%;
  }
  .box {
    position: absolute;
    background: rgb(0 0 0 / 0.85);
    outline: 2px solid var(--danger, #c00);
    pointer-events: none;
  }
  .box.draft {
    background: rgb(0 0 0 / 0.4);
    outline-style: dashed;
  }
  .remove {
    position: absolute;
    top: -0.75rem;
    right: -0.75rem;
    width: 1.5rem;
    height: 1.5rem;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: var(--danger, #c00);
    color: #fff;
    font-size: 0.9rem;
    line-height: 1;
    cursor: pointer;
    pointer-events: auto;
  }
</style>
