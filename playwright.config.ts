import fs from 'node:fs'
import { defineConfig, devices } from '@playwright/test'

if (fs.existsSync('.env.local')) process.loadEnvFile('.env.local')

const PORT = Number(process.env.E2E_PORT ?? 3100)
// Second server wired to an unreachable database to check the degraded menu.
export const DB_DOWN_PORT = PORT + 1

export default defineConfig({
  testDir: './tests',
  testMatch: 'e2e/**/*.spec.ts',
  fullyParallel: true,
  reporter: 'list',
  globalSetup: './tests/e2e/global-setup.ts',
  use: { baseURL: `http://localhost:${PORT}` },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Runs against the production build: `npm run build` first.
  webServer: [
    {
      command: `npm run start -- -p ${PORT}`,
      url: `http://localhost:${PORT}`,
      reuseExistingServer: !process.env.CI,
      env: { DATABASE_URL: process.env.DATABASE_URL_TEST ?? '' },
    },
    {
      command: `npm run start -- -p ${DB_DOWN_PORT}`,
      url: `http://localhost:${DB_DOWN_PORT}`,
      reuseExistingServer: !process.env.CI,
      env: { DATABASE_URL: 'mysql://nobody:wrong@127.0.0.1:1/unreachable' },
    },
  ],
})
