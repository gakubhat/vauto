import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Suites share one Supabase project — never run them in parallel.
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
