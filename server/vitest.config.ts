import { defineConfig } from 'vitest/config';

// The flow suites hit a real database and take ~15 minutes. They are opt-in so a
// routine `npm test` stays instant. Run them with `npm run test:all` (or
// `npm run test:flows`), which set RUN_DB_TESTS=1.
const runDb = process.env.RUN_DB_TESTS === '1' || process.env.RUN_DB_TESTS === 'true';

export default defineConfig({
  test: {
    environment: 'node',
    // Default: pure suites only (top-level *.test.ts). The DB-backed suites live
    // in tests/flows/ and are included only when RUN_DB_TESTS=1.
    include: runDb ? ['tests/**/*.test.ts'] : ['tests/*.test.ts'],
    // Suites share one Supabase project - never run them in parallel.
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
