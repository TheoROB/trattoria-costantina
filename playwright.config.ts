import fs from 'node:fs'
import { defineConfig, devices } from '@playwright/test'

if (fs.existsSync('.env.local')) process.loadEnvFile('.env.local')

const PORT = Number(process.env.E2E_PORT ?? 3100)
// Second server wired to an unreachable database to check the degraded menu.
export const DB_DOWN_PORT = PORT + 1
// Test-only secret for the e2e servers.
const E2E_AUTH_HMAC_SECRET = 'e2e-only-hmac-secret-not-for-production-0123'

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  reporter: 'list',
  globalSetup: './tests/e2e/global-setup.ts',
  use: { baseURL: `http://localhost:${PORT}` },
  projects: [
    { name: 'chromium', testMatch: 'e2e/**/*.spec.ts', testIgnore: 'e2e/admin/**', use: { ...devices['Desktop Chrome'] } },
    // Admin suites change the menu and the auth tables: one at a time, after the public suite.
    { name: 'admin', testMatch: 'e2e/admin/**/*.spec.ts', dependencies: ['chromium'], workers: 1, use: { ...devices['Desktop Chrome'] } },
    { name: 'security', testMatch: 'security/**/*.spec.ts', dependencies: ['admin'], workers: 1, use: { ...devices['Desktop Chrome'] } },
  ],
  // Runs against the production build: `npm run build` first.
  webServer: [
    {
      // Server output is kept for the "no secret in logs" checks.
      command: `mkdir -p .e2e-logs && npm run start -- -p ${PORT} >> .e2e-logs/server.log 2>&1`,
      url: `http://localhost:${PORT}`,
      reuseExistingServer: !process.env.CI,
      env: { DATABASE_URL: process.env.DATABASE_URL_TEST ?? '', AUTH_HMAC_SECRET: E2E_AUTH_HMAC_SECRET },
    },
    {
      command: `npm run start -- -p ${DB_DOWN_PORT}`,
      url: `http://localhost:${DB_DOWN_PORT}`,
      reuseExistingServer: !process.env.CI,
      env: { DATABASE_URL: 'mysql://nobody:wrong@127.0.0.1:1/unreachable' },
    },
  ],
})
