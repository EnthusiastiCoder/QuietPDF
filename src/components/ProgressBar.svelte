<script lang="ts">
  interface Props {
    /** Units done (pages, files). */
    done: number;
    /** Total units; 0 or less shows an indeterminate bar. */
    total: number;
    /** What is happening ("Merging", "Reading page"). */
    label?: string;
    /** Unit noun for the counter ("page", "file"). */
    unit?: string;
    oncancel?: () => void;
  }

  let { done, total, label = 'Working', unit = 'page', oncancel }: Props = $props();

  const pct = $derived(total > 0 ? Math.min(100, Math.round((done / total) * 100)) : null);
</script>

<div class="progress" data-testid="progress" role="status" aria-live="polite">
  <div class="row">
    <span class="label">{label}…</span>
    {#if total > 0}
      <span class="counter" data-testid="progress-counter">{Math.min(done, total)} / {total} {unit}{total === 1 ? '' : 's'}</span>
    {/if}
  </div>
  <div
    class="track"
    role="progressbar"
    aria-label={label}
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={pct ?? undefined}
  >
    <div class="bar" class:indeterminate={pct === null} style:width={pct === null ? undefined : `${pct}%`}></div>
  </div>
  {#if oncancel}
    <button type="button" class="btn" onclick={oncancel}>Cancel</button>
  {/if}
</div>

<style>
  .progress {
    display: grid;
    gap: var(--space-2);
    padding: var(--space-4);
    border: 1px solid var(--border);
    border-radius: var(--radius-m);
    background: var(--surface);
  }
  .row {
    display: flex;
    justify-content: space-between;
    gap: var(--space-3);
    font-size: var(--step--1);
  }
  .counter {
    font-variant-numeric: tabular-nums;
    color: var(--text-muted);
  }
  .track {
    height: 0.5rem;
    border-radius: 999px;
    background: var(--surface-2);
    overflow: hidden;
  }
  .bar {
    height: 100%;
    background: var(--accent);
    transition: width 0.2s var(--ease);
  }
  .bar.indeterminate {
    width: 30%;
    animation: slide 1.2s infinite var(--ease);
  }
  .btn {
    justify-self: start;
  }
  @keyframes slide {
    from {
      transform: translateX(-100%);
    }
    to {
      transform: translateX(340%);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .bar.indeterminate {
      animation: none;
      width: 100%;
      opacity: 0.5;
    }
  }
</style>
