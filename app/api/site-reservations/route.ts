import { dbErrorCode } from '@/lib/auth/dal'
import { getPool } from '@/lib/db'
import { resolveAppOrigin } from '@/lib/security/origin'
import { isPlausibleMealDate } from '@/lib/site-reservations/report'
import { parseReservation } from '@/lib/site-reservations/signal'
import { recordSiteReservation } from '@/lib/site-reservations/store'

// Receives what the public pages forward from the DISH widget (lib/site-reservations/listener.ts). Only POST is
// exported: other methods get 405 from Next.js. Nothing about the visitor is read or logged. Same-origin checks stop
// other sites' browsers, not a forged request: the hourly quota and the strict body bound what that can add.

// {"date":"2026-11-06","time":"19:45","covers":100}: 49 bytes.
const MAX_BODY_BYTES = 128
const JSON_CONTENT_TYPE = /^application\/json\s*(;\s*charset=utf-8\s*)?$/i
const noStore = { 'Cache-Control': 'no-store' }
const reply = (error: string, status: number) => Response.json({ error }, { status, headers: noStore })

export async function POST(request: Request) {
  const appOrigin = resolveAppOrigin(process.env.APP_ORIGIN)
  if (!appOrigin) {
    console.error('[site-reservations] refused: APP_ORIGIN is missing or invalid')
    return reply('failed', 500)
  }
  const site = request.headers.get('sec-fetch-site')
  if (request.headers.get('origin') !== appOrigin || (site !== null && site !== 'same-origin')) return reply('forbidden', 403)
  if (!JSON_CONTENT_TYPE.test(request.headers.get('content-type') ?? '')) return reply('unsupported_media_type', 415)

  const body = await readBounded(request)
  if (body === null) return reply('too_large', 413)
  let value: unknown
  try {
    value = JSON.parse(body)
  } catch {
    return reply('bad_request', 400)
  }
  const reservation = parseReservation(value)
  if (!reservation || !isPlausibleMealDate(reservation.date, new Date())) return reply('bad_request', 400)

  try {
    if ((await recordSiteReservation(getPool(), reservation)) === 'over_quota') return reply('rate_limited', 429)
  } catch (error) {
    console.error(`[site-reservations] record failed: ${dbErrorCode(error)}`)
    return reply('unavailable', 503)
  }
  return new Response(null, { status: 204, headers: noStore })
}

// Reads at most MAX_BODY_BYTES, whatever Content-Length says (it may be absent or wrong).
async function readBounded(request: Request) {
  const reader = request.body?.getReader()
  if (!reader) return ''
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    if (total > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => {})
      return null
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString('utf8')
}
