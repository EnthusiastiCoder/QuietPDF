<script lang="ts">
  import DropZone from '../DropZone.svelte';
  import OptionsPanel from '../OptionsPanel.svelte';
  import ProgressBar from '../ProgressBar.svelte';
  import ResultCard from '../ResultCard.svelte';
  import { getQpdf } from '../../lib/qpdf-setup';
  import { formatBytes, readFile, suffixed } from '../../lib/download';
  import { IncorrectPasswordError, unlockPdf } from '../../core/unlock';
  import type { ToolProps } from './index';

  let { accept, multiple }: ToolProps = $props();

  // The file is read as bytes only (no password prompt): the password goes in the panel.
  let file = $state<{ name: string; bytes: Uint8Array } | null>(null);
  let password = $state('');
  let busy = $state(false);
  let error = $state('');
  let result = $state<{ bytes: Uint8Array; name: string } | null>(null);

  async function addFiles(files: File[]): Promise<void> {
    error = '';
    result = null;
    try {
      file = { name: files[0].name, bytes: await readFile(files[0]) };
    } catch {
      file = null;
      error = `${files[0].name} could not be read.`;
    }
  }

  async function run(): Promise<void> {
    if (!file || busy) return;
    busy = true;
    error = '';
    try {
      const bytes = await unlockPdf(file.bytes, password);
      result = { bytes, name: suffixed(file.name, 'unlocked') };
    } catch (e) {
      error = e instanceof IncorrectPasswordError ? 'Incorrect password' : `Could not unlock the file: ${(e as Error).message}`;
    } finally {
      busy = false;
    }
  }

  function restart(): void {
    file = null;
    result = null;
    password = '';
  }
</script>

{#if result}
  <ResultCard bytes={result.bytes} filename={result.name} title="Your PDF is unlocked" onrestart={restart}>
    {#snippet message()}
      The password and the restrictions are removed. Anyone with this copy can open it.
    {/snippet}
  </ResultCard>
{:else}
  <DropZone {accept} {multiple} onfiles={addFiles} compact={!!file} warmup={() => getQpdf()} />
  {#if file}
    <div class="tool-layout has-panel">
      <p class="tool-note">{file.name}: {formatBytes(file.bytes.byteLength)}.</p>
      <OptionsPanel title="Unlock">
        <div class="field">
          <label for="ul-pw">Password</label>
          <input
            id="ul-pw"
            type="password"
            autocomplete="current-password"
            bind:value={password}
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={error ? 'ul-err' : undefined}
            onkeydown={(e) => e.key === 'Enter' && run()}
          />
        </div>
        {#if error}<p class="tool-err" id="ul-err" data-testid="inline-error" role="alert">{error}</p>{/if}
        <p class="tool-note">Leave the password empty if the file opens without one and only has restrictions. You must know the password: nothing is cracked.</p>
        {#snippet footer()}
          {#if busy}<ProgressBar done={0} total={0} label="Unlocking" />{/if}
          <button class="btn btn-primary" data-testid="primary-action" type="button" disabled={busy} onclick={run}>Unlock PDF</button>
        {/snippet}
      </OptionsPanel>
    </div>
  {/if}
{/if}
