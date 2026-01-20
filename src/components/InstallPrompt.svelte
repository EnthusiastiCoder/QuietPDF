<script lang="ts">
  import { onMount } from 'svelte';

  interface BeforeInstallPromptEvent extends Event {
    prompt(): Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
  }

  let deferred: BeforeInstallPromptEvent | null = $state(null);
  let dismissed = $state(false);

  onMount(() => {
    try {
      dismissed = sessionStorage.getItem('qp-install-dismissed') === '1';
    } catch {
      /* ignore */
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      deferred = e as BeforeInstallPromptEvent;
    };
    const onInstalled = () => (deferred = null);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  });

  async function install(): Promise<void> {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    deferred = null;
  }

  function dismiss(): void {
    dismissed = true;
    try {
      sessionStorage.setItem('qp-install-dismissed', '1');
    } catch {
      /* ignore */
    }
  }
</script>

{#if deferred && !dismissed}
  <div class="install" role="region" aria-label="Install QuietPDF">
    <span>Install QuietPDF to use it offline.</span>
    <button type="button" class="btn btn-primary" onclick={install}>Install</button>
    <button type="button" class="btn" onclick={dismiss}>Not now</button>
  </div>
{/if}

<style>
  .install {
    position: fixed;
    left: var(--space-3);
    bottom: var(--space-3);
    z-index: 29;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--radius-m);
    background: var(--surface);
    box-shadow: var(--shadow);
    font-size: var(--step--1);
  }
</style>
