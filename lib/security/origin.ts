// CSRF check for admin Route Handlers (Server Actions have Next's own). The allowed origin comes from
// server configuration (APP_ORIGIN, e.g. https://trattoriacostantina.fr), never from Host or
// X-Forwarded-Host, which a proxy may rewrite or forward from the client.

// Returns the normalised origin, or null when APP_ORIGIN is missing or not a bare http(s) origin.
export function resolveAppOrigin(value: string | undefined) {
  if (!value) return null
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  const bare = url.pathname === '/' && !url.search && !url.hash && !url.username && !url.password
  return bare && (url.protocol === 'https:' || url.protocol === 'http:') ? url.origin : null
}

export function isAllowedOrigin(origin: string | null, appOrigin: string | null) {
  return appOrigin !== null && origin === appOrigin
}
