export const ADMIN_USERS = {
  julien: {
    email: 'julien@admin.test',
    password: 'julien-test-passphrase-2026',
  },
  theo: {
    email: 'theo@admin.test',
    password: 'theo-test-passphrase-2026',
  },
} as const

export const GENERIC_LOGIN_ERROR =
  'Connexion impossible. Vérifiez vos identifiants ou réessayez dans quelques minutes.'

export const SESSION_COOKIE = '__Host-tc_admin'
