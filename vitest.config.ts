import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    // `server-only` throws outside React Server Components; it is a no-op guard in tests.
    alias: {
      'server-only': new URL('./tests/server-only-stub.ts', import.meta.url).pathname,
      '@/': new URL('./', import.meta.url).pathname,
    },
  },
  test: {
    environment: 'node',
    projects: [
      { extends: true, test: { name: 'unit', include: ['lib/**/*.test.ts'] } },
      {
        extends: true,
        test: { name: 'integration', include: ['tests/integration/**/*.test.ts'], fileParallelism: false },
      },
    ],
  },
})
