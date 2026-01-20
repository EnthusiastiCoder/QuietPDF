<script lang="ts">
  import { onMount } from 'svelte';
  import { subscribe, type MeterState } from '../lib/privacy-meter';
  import { formatBytes } from '../lib/download';

  let state = $state<MeterState>({ entries: [], thirdParty: 0, uploadedBytes: 0, sinceFile: null });
  let open = $state(false);
  let panel: HTMLElement | undefined = $state();

  onMount(() => subscribe((s) => (state = s)));

  const uploaded = $derived(state.uploadedBytes === 0 ? '0 bytes' : formatBytes(state.uploadedBytes));
  const since = $derived(state.sinceFile === null ? '–' : String(state.sinceFile));

  function display(url: string): string {
    try {
      const u = new URL(url, location.href);
      return u.origin === location.origin ? u.pathname + u.search : u.href;
    } catch {
      return url;
    }
  }

  function toggle(): void {
    open = !open;
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape' && open) {
      open = false;
    }
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="meter-wrap">
  {#if open}
    <section class="panel" data-testid="privacy-panel" bind:this={panel} aria-label="Network activity on this page">
      <header>
        <h2>What this page loaded</h2>
        <button type="button" class="close" aria-label="Close" onclick={() => (open = false)}>×</button>
      </header>
      <p class="note">
        Every request this page made, from the browser's own timeline. All of them come from this site; none carries your files.
      </p>
      <ol>
        {#each state.entries as e, i (i)}
          <li class:third={e.thirdParty}>
            <span class="url" data-testid="privacy-panel-url">{display(e.url)}</span>
            <span class="meta">{e.via === 'worker' ? 'worker' : ''}{e.size ? ` ${formatBytes(e.size)}` : ''}</span>
          </li>
        {/each}
      </ol>
      <a href="/privacy">Verify it yourself</a>
    </section>
  {/if}
  <button
    type="button"
    class="meter"
    class:bad={state.thirdParty > 0 || state.uploadedBytes > 0}
    data-testid="privacy-meter"
    aria-expanded={open}
    onclick={toggle}
  >
    <span class="dot" aria-hidden="true"></span>
    <span>Third-party requests: {state.thirdParty}</span>
    <span class="sep" aria-hidden="true">·</span>
    <span>Files uploaded: {uploaded}</span>
    <span class="sep" aria-hidden="true">·</span>
    <span>Requests since you added a file: {since}</span>
  </button>
</div>

<style>
  .meter-wrap {
    position: fixed;
    right: var(--space-3);
    bottom: var(--space-3);
    z-index: 30;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: var(--space-2);
    max-width: calc(100vw - 2 * var(--space-3));
  }
  .meter {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0 var(--space-2);
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--surface);
    color: var(--text-muted);
    font: inherit;
    font-size: 0.75rem;
    box-shadow: var(--shadow);
    cursor: pointer;
    text-align: left;
  }
  .dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    background: var(--success);
  }
  .bad .dot {
    background: var(--danger);
  }
  .panel {
    width: min(28rem, calc(100vw - 2 * var(--space-3)));
    max-height: 60vh;
    overflow: auto;
    padding: var(--space-4);
    border: 1px solid var(--border);
    border-radius: var(--radius-m);
    background: var(--surface);
    box-shadow: var(--shadow);
    font-size: var(--step--1);
  }
  .panel header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .panel h2 {
    font-size: var(--step-1);
    margin: 0;
  }
  .close {
    border: 0;
    background: transparent;
    color: var(--text);
    font-size: 1.4rem;
    cursor: pointer;
  }
  .note {
    color: var(--text-muted);
  }
  ol {
    padding-left: 1.25rem;
    margin: 0 0 var(--space-3);
  }
  li {
    display: flex;
    justify-content: space-between;
    gap: var(--space-2);
    word-break: break-all;
  }
  li.third {
    color: var(--danger);
  }
  .url {
    font-family: var(--font-mono);
  }
  .meta {
    color: var(--text-muted);
    white-space: nowrap;
  }
  @media (max-width: 640px) {
    .sep,
    .meter span:last-child {
      display: none;
    }
  }
</style>
