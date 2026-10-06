// Test-only accounts, created in the *_test database by tests/e2e/global-setup.ts. Never used in production.
export const ADMINS = {
  julien: { email: 'julien@admin.test', password: 'julien-test-passphrase-2026' },
  theo: { email: 'theo@admin.test', password: 'theo-test-passphrase-2026' },
} as const
