<script lang="ts">
  import { onMount } from 'svelte';
  import { isImageFile, isPdfFile } from '../lib/download';
  import { markFileAdded } from '../lib/privacy-meter';
  import { warmPdfjs } from '../lib/pdfjs-setup';

  interface Props {
    accept: 'pdf' | 'image';
    multiple?: boolean;
    /** Called with the accepted files (already type-checked). */
    onfiles: (files: File[]) => void;
    /** Compact variant shown once files are added ("Add more files"). */
    compact?: boolean;
  }

  let { accept, multiple = false, onfiles, compact = false }: Props = $props();

  let over = $state(false);
  // Offered once warm-up is done (offline copy installed, pdf.js data in memory),
  // so that adding a file never triggers a download. Capped so a failure cannot block.
  let ready = $state(false);
  let error = $state('');
  let input: HTMLInputElement;

  const inputId = `drop-${Math.random().toString(36).slice(2, 8)}`;
  const acceptAttr = $derived(accept === 'pdf' ? 'application/pdf,.pdf' : 'image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif');
  const kind = $derived(accept === 'pdf' ? 'PDF' : 'image');
  const hint = $derived(accept === 'pdf' ? 'PDF files' : 'JPG, PNG, WebP or GIF images');

  function take(list: FileList | File[] | null | undefined): void {
    const files = Array.from(list ?? []);
    if (files.length === 0) return;
    const ok = files.filter((f) => (accept === 'pdf' ? isPdfFile(f) : isImageFile(f)));
    const rejected = files.length - ok.length;
    if (rejected > 0) {
      error =
        accept === 'pdf'
          ? `${rejected === 1 ? 'That file is' : `${rejected} files are`} not a PDF. This tool accepts PDF files only.`
          : `${rejected === 1 ? 'That file is' : `${rejected} files are`} not a supported image (JPG, PNG, WebP or GIF).`;
    } else {
      error = '';
    }
    if (ok.length === 0) return;
    const chosen = multiple ? ok : ok.slice(0, 1);
    markFileAdded();
    onfiles(chosen);
  }

  function onDrop(e: DragEvent): void {
    e.preventDefault();
    over = false;
    take(e.dataTransfer?.files);
  }

  function onDragOver(e: DragEvent): void {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    over = true;
  }

  function onChange(): void {
    take(input.files);
    input.value = '';
  }

  onMount(() => {
    const sw = 'serviceWorker' in navigator && !import.meta.env.DEV ? navigator.serviceWorker.ready : Promise.resolve();
    const warm = Promise.allSettled([sw, accept === 'pdf' ? warmPdfjs() : Promise.resolve()]);
    void Promise.race([warm, new Promise((r) => setTimeout(r, 10_000))]).then(() => (ready = true));
  });

  onMount(() => {
    // Paste from the clipboard anywhere on the page (decision 16).
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length) {
        e.preventDefault();
        take(files);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });
</script>

<div
  class="drop"
  class:over
  class:compact
  class:pending={!ready}
  data-testid="drop-zone"
  role="group"
  aria-label={`Add ${kind} files`}
  ondragenter={onDragOver}
  ondragover={onDragOver}
  ondragleave={() => (over = false)}
  ondrop={onDrop}
>
  <input
    bind:this={input}
    id={inputId}
    class="visually-hidden"
    type="file"
    accept={acceptAttr}
    {multiple}
    onchange={onChange}
    aria-describedby={error ? `${inputId}-err` : undefined}
  />
  <label for={inputId} class="pick">
    {#if !compact}
      <svg class="glyph" viewBox="0 0 24 24" width="40" height="40" aria-hidden="true">
        <path fill="currentColor" d="M6 2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm7 1.5V9h5.5L13 3.5ZM12 11l-4 4h3v4h2v-4h3l-4-4Z" />
      </svg>
    {/if}
    <span class="btn btn-primary choose">{compact ? `Add more ${kind} files` : multiple ? `Choose ${kind} files` : `Choose a ${kind} file`}</span>
    {#if !compact}
      <span class="sub">or drop {hint} here. You can also paste.</span>
      <span class="sub tiny">Files never leave your device.</span>
    {/if}
  </label>
  {#if error}
    <p class="err" id={`${inputId}-err`} data-testid="inline-error" role="alert">{error}</p>
  {/if}
</div>

<style>
  .drop.pending {
    visibility: hidden;
  }
  .drop {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    min-height: 11rem;
    padding: var(--space-5) var(--space-4);
    border: 2px dashed var(--border);
    border-radius: var(--radius-l);
    background: var(--surface);
    text-align: center;
    transition: border-color 0.15s var(--ease), background 0.15s var(--ease);
  }
  .drop.compact {
    min-height: 0;
    padding: var(--space-3);
  }
  .drop.over {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .drop:focus-within {
    border-color: var(--accent);
  }
  .drop:focus-within .choose {
    outline: 3px solid var(--focus);
    outline-offset: 2px;
  }
  .pick {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    cursor: pointer;
  }
  .glyph {
    color: var(--accent);
  }
  .sub {
    color: var(--text-muted);
    font-size: var(--step--1);
  }
  .tiny {
    font-size: 0.8rem;
  }
  .err {
    margin: var(--space-2) 0 0;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-s);
    background: var(--danger-soft);
    color: var(--danger);
    font-size: var(--step--1);
  }
</style>
