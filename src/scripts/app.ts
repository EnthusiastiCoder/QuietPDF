/**
 * Shared page bootstrap, loaded as a bundled module on every page (no inline
 * scripts: the CSP is script-src 'self').
 */
import { mount } from 'svelte';
import { startMeter } from '../lib/privacy-meter';
import PrivacyMeter from '../components/PrivacyMeter.svelte';
import InstallPrompt from '../components/InstallPrompt.svelte';
import { registerServiceWorker } from '../lib/sw-register';

startMeter();

const meterRoot = document.getElementById('privacy-meter-root');
if (meterRoot) mount(PrivacyMeter, { target: meterRoot });

const installRoot = document.getElementById('install-prompt-root');
if (installRoot) mount(InstallPrompt, { target: installRoot });

// Theme toggle: the choice persists for this tab's session only.
document.querySelector<HTMLButtonElement>('[data-testid="theme-toggle"]')?.addEventListener('click', () => {
  const html = document.documentElement;
  const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  try {
    sessionStorage.setItem('qp-theme', next);
  } catch {
    /* storage blocked: the toggle still works for this page */
  }
});

// Header search: picking a datalist option (or typing a tool name) navigates to it.
const form = document.querySelector<HTMLFormElement>('[data-tool-search]');
const input = form?.querySelector<HTMLInputElement>('input');
const options = Array.from(document.querySelectorAll<HTMLOptionElement>('#tool-search-list option'));
function findSlug(value: string): string | undefined {
  const v = value.trim().toLowerCase();
  if (!v) return undefined;
  const exact = options.find((o) => o.value.toLowerCase() === v);
  if (exact) return exact.dataset.slug;
  return options.find((o) => o.value.toLowerCase().includes(v))?.dataset.slug;
}
input?.addEventListener('change', () => {
  const exact = options.find((o) => o.value === input.value);
  if (exact?.dataset.slug) location.href = `/${exact.dataset.slug}`;
});
form?.addEventListener('submit', (e) => {
  e.preventDefault();
  const slug = input ? findSlug(input.value) : undefined;
  if (slug) location.href = `/${slug}`;
});

registerServiceWorker();
