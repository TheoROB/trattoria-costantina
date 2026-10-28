import { defineConfig, devices } from '@playwright/test'

// Deliberately independent of the DB-backed e2e config and global setup.
// Start an env-free production build separately; no DB or mutation fixtures.
export default defineConfig({
  testDir: './tests/images',
  outputDir: '/tmp/trattoria-image-tests',
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:3187' },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } },
    { name: 'mobile', use: { ...devices['iPhone 12'], browserName: 'chromium', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 } },
  ],
})
