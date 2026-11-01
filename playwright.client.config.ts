import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig, devices } from '@playwright/test'

// Browser tests of the real local client only, without any database: no globalSetup, no .env file loaded here,
// the server gets an explicitly empty DATABASE_URL. Every spec stubs the DISH iframe and the ingestion endpoint
// (page.route), so nothing is persisted and nothing reaches DISH. Build first (`npm run build`), never concurrently.
const PORT = 3190
const ORIGIN = `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: './tests/client',
  outputDir: join(tmpdir(), 'trattoria-client-tests'),
  workers: 1,
  fullyParallel: false,
  reporter: 'list',
  use: { baseURL: ORIGIN, ...devices['Desktop Chrome'] },
  webServer: {
    command: `npm run start -- -H 127.0.0.1 -p ${PORT}`,
    url: ORIGIN,
    reuseExistingServer: false,
    env: { DATABASE_URL: '', APP_ORIGIN: ORIGIN },
  },
})
