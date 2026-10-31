import { isTrackedPath } from './paths'

// The only accepted body is {"path":"<allowlisted path>"}: 28 bytes at most today.
export const MAX_BODY_BYTES = 128

export type Rejection = 'forbidden' | 'unsupported_media_type' | 'too_large' | 'bad_request'

const JSON_CONTENT_TYPE = /^application\/json\s*(;\s*charset=utf-8\s*)?$/i

// Same-origin only: the Origin must be exactly APP_ORIGIN (a missing one is refused) and, when the browser says
// where the request comes from, it must be this site.
export function checkHeaders(headers: Headers, appOrigin: string): Rejection | null {
  if (headers.get('origin') !== appOrigin) return 'forbidden'
  const site = headers.get('sec-fetch-site')
  if (site !== null && site !== 'same-origin') return 'forbidden'
  if (!JSON_CONTENT_TYPE.test(headers.get('content-type') ?? '')) return 'unsupported_media_type'
  const declared = headers.get('content-length')
  if (declared !== null && !(Number(declared) <= MAX_BODY_BYTES)) return 'too_large'
  return null
}

/** The allowlisted path, or null for anything else (extra keys, query string, hash, other pages…). */
export function parseBody(text: string) {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const keys = Object.keys(value)
  if (keys.length !== 1 || keys[0] !== 'path') return null
  const { path } = value as { path: unknown }
  return isTrackedPath(path) ? path : null
}

// Reads at most `limit` bytes, whatever Content-Length says (it may be absent or wrong).
export async function readBoundedText(request: Request, limit = MAX_BODY_BYTES) {
  const reader = request.body?.getReader()
  if (!reader) return ''
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    if (total > limit) {
      await reader.cancel().catch(() => {})
      return null
    }
    chunks.push(value)
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))
  } catch {
    return ''
  }
}
