<script lang="ts">
  import DropZone from '../DropZone.svelte';
  import PasswordPrompt from '../PasswordPrompt.svelte';
  import OptionsPanel from '../OptionsPanel.svelte';
  import ProgressBar from '../ProgressBar.svelte';
  import ResultCard from '../ResultCard.svelte';
  import { closePdf } from '../../lib/pdfjs-setup';
  import { getQpdf } from '../../lib/qpdf-setup';
  import { intakePdf } from '../../lib/password-prompt.svelte';
  import { formatBytes, suffixed } from '../../lib/download';
  import { protectPdf } from '../../core/protect';
  import type { ToolProps } from './index';

  let { accept, multiple }: ToolProps = $props();

  let file = $state<{ name: string; bytes: Uint8Array; pages: number } | null>(null);
  let password = $state('');
  let confirm = $state('');
  let allowPrint = $state(true);
  let allowCopy = $state(true);
  let loading = $state(false);
  let busy = $state(false);
  let error = $state('');
  let result = $state<{ bytes: Uint8Array; name: string } | null>(null);

  const mismatch = $derived(confirm.length > 0 && password !== confirm);
  const ready = $derived(password.length > 0 && password === confirm);

  async function addFiles(files: File[]): Promise<void> {
    error = '';
    result = null;
    file = { name: files[0].name, bytes: new Uint8Array(0), pages: 0 };
    loading = true;
    try {
      const intake = await intakePdf(files[0]);
      if (!intake) {
        file = null;
        return;
      }
      const pages = intake.doc.numPages;
      closePdf(intake.doc);
      file = { name: files[0].name, bytes: intake.bytes, pages };
    } catch {
      file = null;
      error = `${files[0].name} could not be read as a PDF.`;
    } finally {
      loading = false;
    }
  }

  async function run(): Promise<void> {
    if (!file || busy || !ready) return;
    busy = true;
    error = '';
    try {
      const bytes = await protectPdf(file.bytes, { password, allowPrint, allowCopy });
      result = { bytes, name: suffixed(file.name, 'protected') };
    } catch (e) {
      error = `Could not protect the file: ${(e as Error).message}`;
    } finally {
      busy = false;
    }
  }

  function restart(): void {
    file = null;
    result = null;
    password = '';
    confirm = '';
  }
</script>

<PasswordPrompt />

{#if result}
  <ResultCard bytes={result.bytes} filename={result.name} title="Your PDF is password-protected" onrestart={restart}>
    {#snippet message()}
      Encrypted with AES-256. Keep the password safe: it cannot be recovered.
    {/snippet}
  </ResultCard>
{:else}
  <DropZone {accept} {multiple} onfiles={addFiles} compact={!!file} warmup={() => getQpdf()} />
  {#if error}<p class="tool-err" role="alert">{error}</p>{/if}
  {#if file}
    <div class="tool-layout has-panel">
      <p class="tool-note">{file.name}: {file.pages} page{file.pages === 1 ? '' : 's'}, {formatBytes(file.bytes.byteLength)}.</p>
      <OptionsPanel title="Protection">
        <div class="field">
          <label for="pr-pw">Password</label>
          <input id="pr-pw" type="password" autocomplete="new-password" bind:value={password} />
        </div>
        <div class="field">
          <label for="pr-confirm">Confirm password</label>
          <input
            id="pr-confirm"
            type="password"
            autocomplete="new-password"
            bind:value={confirm}
            aria-invalid={mismatch ? 'true' : undefined}
            aria-describedby={mismatch ? 'pr-err' : undefined}
          />
        </div>
        {#if mismatch}<p class="tool-err" id="pr-err" data-testid="inline-error" role="alert">The passwords do not match.</p>{/if}
        <label class="check"><input type="checkbox" bind:checked={allowPrint} /> Allow printing</label>
        <label class="check"><input type="checkbox" bind:checked={allowCopy} /> Allow copying text and images</label>
        <p class="tool-note">AES-256 encryption. There is no way to recover a forgotten password.</p>
        {#snippet footer()}
          {#if busy}<ProgressBar done={0} total={0} label="Encrypting" />{/if}
          <button class="btn btn-primary" data-testid="primary-action" type="button" disabled={busy || loading || !ready} onclick={run}>Protect PDF</button>
        {/snippet}
      </OptionsPanel>
    </div>
  {/if}
{/if}

<style>
  .check {
    display: flex;
    gap: var(--space-2);
    align-items: center;
  }
</style>
