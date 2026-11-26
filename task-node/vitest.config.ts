import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 15_000,
    hookTimeout: 15_000,
    // Integration suites bind ports and share one Redis; keep files sequential for determinism.
    fileParallelism: false,
  },
});
