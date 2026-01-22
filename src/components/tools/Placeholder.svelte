<script lang="ts">
  import DropZone from '../DropZone.svelte';
  import type { ToolProps } from './index';

  let { accept, multiple }: ToolProps = $props();

  let count = $state(0);
</script>

<DropZone {accept} {multiple} onfiles={(files) => (count += files.length)} />
<p class="note" role="status">
  {#if count > 0}
    Got {count} file{count === 1 ? '' : 's'}. This tool is being finished and will process them here, on your device, soon.
  {:else}
    This tool is coming soon. Like every QuietPDF tool, it will run entirely in your browser.
  {/if}
</p>

<style>
  .note {
    margin-top: var(--space-3);
    color: var(--text-muted);
    font-size: var(--step--1);
  }
</style>
