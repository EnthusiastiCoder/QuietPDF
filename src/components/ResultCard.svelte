<script lang="ts" module>
  export interface ContinueLink {
    label: string;
    href: string;
  }
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import { downloadBytes, formatBytes } from '../lib/download';

  interface Props {
    /** Result bytes and the file name to save as. */
    bytes: Uint8Array;
    filename: string;
    title?: string;
    /** Size line (compress: before, after, % saved). */
    sizes?: Snippet;
    /** Notice ("already optimised", warnings). */
    message?: Snippet;
    /** Extra content (preview, text output). */
    children?: Snippet;
    onrestart?: () => void;
    continueWith?: ContinueLink[];
  }

  let { bytes, filename, title = 'Done', sizes, message, children, onrestart, continueWith = [] }: Props = $props();

  const size = $derived(bytes.byteLength);

  function download(): void {
    downloadBytes(bytes, filename);
  }
</script>

<section class="result card" data-testid="result-card" aria-live="polite">
  <div class="head">
    <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="var(--success-soft)"></circle>
      <path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="var(--success)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></path>
    </svg>
    <div>
      <h2>{title}</h2>
      <p class="file">{filename} · {formatBytes(size)}</p>
    </div>
  </div>
  {#if sizes}<p class="sizes" data-testid="result-sizes">{@render sizes()}</p>{/if}
  {#if message}<p class="message" data-testid="result-message">{@render message()}</p>{/if}
  {#if children}{@render children()}{/if}
  <div class="actions">
    <button type="button" class="btn btn-primary" data-testid="download" onclick={download}>Download {filename}</button>
    {#if onrestart}<button type="button" class="btn" onclick={onrestart}>Start over</button>{/if}
  </div>
  {#if continueWith.length > 0}
    <nav class="continue" aria-label="Continue with another tool">
      <span>Continue with:</span>
      {#each continueWith as c (c.href)}<a href={c.href}>{c.label}</a>{/each}
    </nav>
  {/if}
</section>

<style>
  .result {
    display: grid;
    gap: var(--space-3);
    padding: var(--space-5);
  }
  .head {
    display: flex;
    gap: var(--space-3);
    align-items: center;
  }
  h2 {
    margin: 0;
    font-size: var(--step-2);
  }
  .file,
  .sizes,
  .message {
    margin: 0;
  }
  .file {
    color: var(--text-muted);
    font-size: var(--step--1);
    word-break: break-all;
  }
  .message {
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-s);
    background: var(--accent-soft);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .continue {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2) var(--space-3);
    font-size: var(--step--1);
    color: var(--text-muted);
  }
</style>
