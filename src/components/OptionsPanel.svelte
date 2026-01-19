<script lang="ts">
  import { onMount } from 'svelte';
  import type { Snippet } from 'svelte';

  interface Props {
    title?: string;
    children: Snippet;
    /** Footer area (usually the primary action). */
    footer?: Snippet;
  }

  let { title = 'Options', children, footer }: Props = $props();

  // A bottom sheet under 640px, a side panel otherwise (decision 18).
  let layout = $state<'sheet' | 'side'>('side');
  onMount(() => {
    const mq = window.matchMedia('(max-width: 639.98px)');
    const set = () => (layout = mq.matches ? 'sheet' : 'side');
    set();
    mq.addEventListener('change', set);
    return () => mq.removeEventListener('change', set);
  });
</script>

<section class="options" data-testid="options-panel" data-layout={layout} aria-label={title}>
  <h2 class="title">{title}</h2>
  <div class="body">{@render children()}</div>
  {#if footer}<div class="footer">{@render footer()}</div>{/if}
</section>

<style>
  .options {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-4);
    border: 1px solid var(--border);
    border-radius: var(--radius-m);
    background: var(--surface);
  }
  .title {
    font-size: var(--step-1);
    margin: 0;
  }
  .body {
    display: grid;
    gap: var(--space-3);
  }
  .footer {
    display: grid;
    gap: var(--space-2);
  }
  .options[data-layout='side'] {
    position: sticky;
    top: calc(var(--header-height) + var(--space-3));
  }
  .options[data-layout='sheet'] {
    position: sticky;
    bottom: 0;
    z-index: 15;
    border-radius: var(--radius-l) var(--radius-l) 0 0;
    box-shadow: 0 -4px 16px rgb(0 0 0 / 0.08);
    max-height: 70vh;
    overflow: auto;
  }
</style>
