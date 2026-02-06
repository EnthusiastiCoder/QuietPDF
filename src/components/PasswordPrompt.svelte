<script lang="ts">
  import { cancelPassword, promptState, submitPassword } from '../lib/password-prompt.svelte';

  let password = $state('');

  $effect(() => {
    if (!promptState.open) password = '';
  });

  function submit(e: SubmitEvent): void {
    e.preventDefault();
    void submitPassword(password);
  }
</script>

{#if promptState.open}
  <div class="backdrop">
    <form class="dialog card" data-testid="password-prompt" role="dialog" aria-modal="true" aria-labelledby="pw-title" onsubmit={submit}>
      <h2 id="pw-title">This PDF is password-protected</h2>
      <p class="file">{promptState.name}</p>
      <label for="pw-field">Password</label>
      <!-- svelte-ignore a11y_autofocus -->
      <input id="pw-field" type="password" autocomplete="off" autofocus bind:value={password} />
      {#if promptState.error}
        <p class="err" data-testid="password-error" role="alert">{promptState.error}</p>
      {/if}
      <div class="row">
        <button type="button" class="btn" onclick={cancelPassword}>Cancel</button>
        <button type="submit" class="btn btn-primary" disabled={promptState.busy || !password}>Unlock</button>
      </div>
    </form>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: grid;
    place-items: center;
    padding: var(--space-4);
    background: rgb(0 0 0 / 0.45);
  }
  .dialog {
    display: grid;
    gap: var(--space-2);
    width: min(24rem, 100%);
    padding: var(--space-4);
    background: var(--surface);
  }
  h2 {
    margin: 0;
    font-size: var(--step-1);
  }
  .file {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--step--1);
    overflow-wrap: anywhere;
  }
  .err {
    margin: 0;
    color: var(--danger);
    font-size: var(--step--1);
  }
  .row {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    margin-top: var(--space-2);
  }
</style>
