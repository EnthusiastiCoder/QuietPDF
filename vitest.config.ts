import { defineConfig } from 'vitest/config';

// Minimal harness written with the failing tests (before WS1). WS1 owns this file.
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
  },
});
