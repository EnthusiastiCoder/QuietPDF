// Runs before first paint (blocking, external: the CSP allows no inline script).
// The choice lives in sessionStorage only: it persists across pages in this tab.
(function () {
  var theme = null;
  try {
    theme = sessionStorage.getItem('qp-theme');
  } catch (e) {}
  if (theme !== 'light' && theme !== 'dark') {
    theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.setAttribute('data-theme', theme);
})();
