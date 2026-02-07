<script lang="ts">
  interface Props {
    /** Called with the cropped PNG and its width/height ratio. */
    onuse: (png: Uint8Array, aspect: number) => void;
  }
  let { onuse }: Props = $props();

  let canvas: HTMLCanvasElement | undefined = $state();
  let drawing = false;
  let inked = $state(false);
  let last = { x: 0, y: 0 };

  function pos(e: PointerEvent): { x: number; y: number } {
    const r = (canvas as HTMLCanvasElement).getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * (canvas as HTMLCanvasElement).width, y: ((e.clientY - r.top) / r.height) * (canvas as HTMLCanvasElement).height };
  }
  function down(e: PointerEvent): void {
    if (!canvas) return;
    drawing = true;
    canvas.setPointerCapture(e.pointerId);
    last = pos(e);
    dot(last);
  }
  function dot(p: { x: number; y: number }): void {
    const ctx = (canvas as HTMLCanvasElement).getContext('2d') as CanvasRenderingContext2D;
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
    ctx.fill();
    inked = true;
  }
  function move(e: PointerEvent): void {
    if (!drawing || !canvas) return;
    const p = pos(e);
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last = p;
    inked = true;
  }
  function up(): void {
    drawing = false;
  }
  function clear(): void {
    if (!canvas) return;
    (canvas.getContext('2d') as CanvasRenderingContext2D).clearRect(0, 0, canvas.width, canvas.height);
    inked = false;
  }

  async function use(): Promise<void> {
    if (!canvas || !inked) return;
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    const { width, height } = canvas;
    const data = ctx.getImageData(0, 0, width, height).data;
    let x0 = width, y0 = height, x1 = 0, y1 = 0;
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        if (data[(y * width + x) * 4 + 3] > 0) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
    const pad = 6;
    x0 = Math.max(0, x0 - pad);
    y0 = Math.max(0, y0 - pad);
    x1 = Math.min(width - 1, x1 + pad);
    y1 = Math.min(height - 1, y1 + pad);
    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    (out.getContext('2d') as CanvasRenderingContext2D).drawImage(canvas, x0, y0, w, h, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((r) => out.toBlob(r, 'image/png'));
    if (blob) onuse(new Uint8Array(await blob.arrayBuffer()), w / h);
  }
</script>

<div class="pad">
  <canvas
    bind:this={canvas}
    data-testid="signature-pad"
    width="600"
    height="220"
    aria-label="Draw your signature here"
    onpointerdown={down}
    onpointermove={move}
    onpointerup={up}
    onpointercancel={up}
  ></canvas>
  <div class="row">
    <button type="button" class="btn" onclick={clear}>Clear</button>
    <button type="button" class="btn btn-primary" disabled={!inked} onclick={use}>Use signature</button>
  </div>
</div>

<style>
  .pad {
    display: grid;
    gap: var(--space-2);
  }
  canvas {
    width: 100%;
    max-width: 30rem;
    aspect-ratio: 600 / 220;
    background: #fff;
    border: 1px dashed var(--border);
    border-radius: var(--radius-m);
    touch-action: none;
    cursor: crosshair;
  }
  .row {
    display: flex;
    gap: var(--space-2);
  }
</style>
