import { defineConfig, devices } from '@playwright/test';

// Minimal harness written with the failing tests (before WS1).
// WS1 owns this file: it adds globalSetup (tests/fixtures/.gen/ large fixtures)
// and keeps the projects and webServer below as the plan specifies.
const PORT = Number(process.env.QP_PORT ?? 4321);

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    acceptDownloads: true,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, grep: /@smoke/ },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, grep: /@smoke/ },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] }, grep: /@ui/ },
  ],
  webServer: {
    command: 'npm run build && npm run preview',
    // Wait on the port, not a URL: the pre-WS1 placeholder preview answers 404
    // everywhere, and the tests must then fail on the missing behaviour.
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
});
