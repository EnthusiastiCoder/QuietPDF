<script lang="ts" module>
  export interface ThumbItem {
    /** Stable key. */
    id: string;
    /** Caption under the thumbnail (file name, "Page 3", ...). */
    label: string;
    /** Secondary caption (page count, size). */
    sub?: string;
    /** Draws the thumbnail; called lazily when the item scrolls into view. */
    render?: (signal: AbortSignal) => Promise<HTMLCanvasElement | HTMLImageElement | null>;
    /** Extra visual rotation in degrees (organize). */
    rotation?: number;
    /** Dimmed (e.g. marked for deletion). */
    dimmed?: boolean;
  }
</script>

<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { Snippet } from 'svelte';

  interface Props {
    items: ThumbItem[];
    /** Called with the new id order after a drag or a keyboard move. */
    onreorder?: (ids: string[]) => void;
    onremove?: (id: string) => void;
    /** Selected ids (organize, split by selection). */
    selected?: Set<string>;
    onselect?: (id: string, additive: boolean) => void;
    /** Per-item extra controls (rotate buttons, ...). */
    actions?: Snippet<[ThumbItem, number]>;
    label?: string;
  }

  let { items, onreorder, onremove, selected, onselect, actions, label = 'Files' }: Props = $props();

  let grid: HTMLOListElement | undefined = $state();
  let dragId: string | null = $state(null);
  let dropIndex: number | null = $state(null);
  let dragOffset = $state({ x: 0, y: 0 });
  let announce = $state('');

  // --- lazy thumbnails -----------------------------------------------------
  const rendered = new Map<string, AbortController>();
  let observer: IntersectionObserver | null = null;

  function lazy(node: HTMLElement, item: ThumbItem) {
    let current = item;
    const host = node;
    const start = () => {
      if (rendered.has(current.id) || !current.render) return;
      const ac = new AbortController();
      rendered.set(current.id, ac);
      current
        .render(ac.signal)
        .then((el) => {
          if (!el || ac.signal.aborted) return;
          el.classList.add('thumb-img');
          host.replaceChildren(el);
        })
        .catch(() => {
          if (!ac.signal.aborted) host.textContent = '';
        });
    };
    if (typeof IntersectionObserver === 'undefined') start();
    else {
      observer ??= new IntersectionObserver(
        (entries) => {
          for (const e of entries) if (e.isIntersecting) (e.target as HTMLElement & { _start?: () => void })._start?.();
        },
        { rootMargin: '200px' },
      );
      (host as HTMLElement & { _start?: () => void })._start = start;
      observer.observe(host);
    }
    return {
      update(next: ThumbItem) {
        current = next;
      },
      destroy() {
        observer?.unobserve(host);
        rendered.get(current.id)?.abort();
        rendered.delete(current.id);
      },
    };
  }

  onDestroy(() => observer?.disconnect());

  // --- pointer reorder (no library) ----------------------------------------
  let start: { x: number; y: number; id: string; pointer: number } | null = null;

  function onPointerDown(e: PointerEvent, id: string): void {
    if (!onreorder || e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button, input, a')) return;
    start = { x: e.clientX, y: e.clientY, id, pointer: e.pointerId };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
  }

  const onPointerUp = () => finish(true);
  const onPointerCancel = () => finish(false);
  let justDragged = false;

  function indexAt(x: number, y: number): number | null {
    if (!grid) return null;
    const els = Array.from(grid.querySelectorAll<HTMLElement>(':scope > li[data-id]'));
    let best: { i: number; d: number } | null = null;
    for (let i = 0; i < els.length; i++) {
      if (els[i].dataset.id === dragId) continue;
      const r = els[i].getBoundingClientRect();
      if (y >= r.top && y <= r.bottom && x >= r.left && x <= r.right) {
        // Left half: insert before; right half: insert after.
        return x < r.left + r.width / 2 ? i : i + 1;
      }
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const d = (cx - x) ** 2 + (cy - y) ** 2;
      if (!best || d < best.d) best = { i: x < cx ? i : i + 1, d };
    }
    return best?.i ?? null;
  }

  function onPointerMove(e: PointerEvent): void {
    if (!start || e.pointerId !== start.pointer) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (!dragId) {
      if (Math.hypot(dx, dy) < 4) return;
      dragId = start.id;
    }
    dragOffset = { x: dx, y: dy };
    dropIndex = indexAt(e.clientX, e.clientY);
  }

  function finish(commit: boolean): void {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerCancel);
    justDragged = dragId !== null;
    if (justDragged) setTimeout(() => (justDragged = false), 0);
    if (dragId && commit && dropIndex !== null) {
      const from = items.findIndex((x) => x.id === dragId);
      let to = dropIndex;
      if (from >= 0) {
        if (to > from) to -= 1;
        if (to !== from) move(from, to);
      }
    }
    start = null;
    dragId = null;
    dropIndex = null;
    dragOffset = { x: 0, y: 0 };
  }

  function move(from: number, to: number): void {
    const ids = items.map((x) => x.id);
    const [id] = ids.splice(from, 1);
    ids.splice(to, 0, id);
    onreorder?.(ids);
    announce = `${items[from]?.label ?? 'Item'} moved to position ${to + 1} of ${ids.length}.`;
  }

  function onKey(e: KeyboardEvent, i: number): void {
    if (!onreorder) return;
    const cols = grid ? Math.max(1, Math.round(grid.clientWidth / ((grid.firstElementChild as HTMLElement | null)?.offsetWidth || 1))) : 1;
    let to = i;
    if (e.key === 'ArrowLeft' && e.altKey) to = i - 1;
    else if (e.key === 'ArrowRight' && e.altKey) to = i + 1;
    else if (e.key === 'ArrowUp' && e.altKey) to = i - cols;
    else if (e.key === 'ArrowDown' && e.altKey) to = i + cols;
    else return;
    e.preventDefault();
    to = Math.max(0, Math.min(items.length - 1, to));
    if (to !== i) move(i, to);
  }
</script>

<ol class="thumb-grid" class:dragging={dragId !== null} bind:this={grid} aria-label={label}>
  {#each items as item, i (item.id)}
    <li
      data-id={item.id}
      data-testid="thumb"
      class="thumb"
      class:is-drag={dragId === item.id}
      class:drop-before={dropIndex === i && dragId !== item.id}
      class:drop-after={dropIndex === items.length && i === items.length - 1 && dragId !== item.id}
      class:selected={selected?.has(item.id)}
      class:dimmed={item.dimmed}
      style:transform={dragId === item.id ? `translate(${dragOffset.x}px, ${dragOffset.y}px)` : undefined}
      tabindex="0"
      aria-label={`${item.label}${item.sub ? `, ${item.sub}` : ''}, position ${i + 1} of ${items.length}${onreorder ? '. Alt+arrow keys to move.' : ''}`}
      aria-selected={selected ? selected.has(item.id) : undefined}
      onpointerdown={(e) => onPointerDown(e, item.id)}
      onkeydown={(e) => onKey(e, i)}
      onclick={(e) => {
        if (justDragged) {
          justDragged = false;
          return;
        }
        onselect?.(item.id, e.shiftKey || e.ctrlKey || e.metaKey);
      }}
    >
      <div class="frame" style:--rot={`${item.rotation ?? 0}deg`}>
        <div class="canvas-host" use:lazy={item}></div>
      </div>
      <div class="caption">
        <span class="name" title={item.label}>{item.label}</span>
        {#if item.sub}<span class="sub">{item.sub}</span>{/if}
      </div>
      <div class="tools">
        {#if actions}{@render actions(item, i)}{/if}
        {#if onremove}
          <button type="button" class="icon-btn" aria-label={`Remove ${item.label}`} onclick={() => onremove?.(item.id)}>×</button>
        {/if}
      </div>
    </li>
  {/each}
</ol>
<div class="visually-hidden" aria-live="polite">{announce}</div>

<style>
  .thumb-grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(8.5rem, 1fr));
    gap: var(--space-3);
  }
  .thumb {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-m);
    background: var(--surface);
    touch-action: none;
    user-select: none;
    cursor: grab;
  }
  .dragging .thumb {
    cursor: grabbing;
  }
  .thumb:focus-visible {
    outline: 3px solid var(--focus);
    outline-offset: 2px;
  }
  .thumb.is-drag {
    z-index: 5;
    opacity: 0.85;
    box-shadow: var(--shadow);
  }
  .thumb.drop-before::before,
  .thumb.drop-after::after {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    width: 3px;
    border-radius: 2px;
    background: var(--accent);
  }
  .thumb.drop-before::before {
    left: calc(-1 * var(--space-2));
  }
  .thumb.drop-after::after {
    right: calc(-1 * var(--space-2));
  }
  .thumb.selected {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent);
  }
  .thumb.dimmed .frame {
    opacity: 0.35;
  }
  .frame {
    aspect-ratio: 3 / 4;
    display: grid;
    place-items: center;
    background: var(--surface-2);
    border-radius: var(--radius-s);
    overflow: hidden;
  }
  .canvas-host {
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    transform: rotate(var(--rot));
    transition: transform 0.2s var(--ease);
  }
  .canvas-host :global(.thumb-img) {
    max-width: 100%;
    max-height: 100%;
    width: auto;
    height: auto;
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.2);
    background: #fff;
  }
  .caption {
    display: flex;
    flex-direction: column;
    min-width: 0;
    font-size: var(--step--1);
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sub {
    color: var(--text-muted);
  }
  .tools {
    position: absolute;
    top: var(--space-1);
    right: var(--space-1);
    display: flex;
    gap: var(--space-1);
  }
  .icon-btn {
    width: 1.75rem;
    height: 1.75rem;
    border: 1px solid var(--border);
    border-radius: 50%;
    background: var(--surface);
    color: var(--text);
    cursor: pointer;
    line-height: 1;
  }
</style>
