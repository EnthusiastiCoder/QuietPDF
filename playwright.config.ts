import { defineConfig, devices } from '@playwright/test';

// QuietPDF's own fixed port. Other local projects own 4321 (Nopload),
// 4799 (Framelab), 4173 (JEE Quest), 4391 (ForeverQR) and 4399/4400: never
// share one.
const PORT = Number(process.env.QP_PORT ?? 4451);

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  // RAM on the dev machine is tight: one worker unless overridden.
  workers: process.env.CI ? undefined : 1,
  reporter: [['list']],
  globalSetup: './tests/global-setup.ts',
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
    env: { QP_PORT: String(PORT) },
    port: PORT,
    // Never reuse a running server: if the port is busy, fail rather than
    // test whatever else is listening there.
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
