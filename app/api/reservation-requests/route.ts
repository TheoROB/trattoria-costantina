import { dbErrorCode } from '@/lib/auth/dal'
import { getPool } from '@/lib/db'
import { checkHeaders, parseBody, readBoundedText, type Rejection } from '@/lib/reservation-requests/request'
import { recordReservationRequest } from '@/lib/reservation-requests/store'
import { resolveAppOrigin } from '@/lib/security/origin'

// Anonymous "demandes de réservation" counter (components/reservation/*). Only POST is exported: other methods get
// 405 from Next.js. Nothing about the visitor is read or logged: no cookie, no IP, no user agent, no body in logs.

const STATUS: Record<Rejection | 'rate_limited' | 'unavailable' | 'failed', number> = {
  forbidden: 403,
  unsupported_media_type: 415,
  too_large: 413,
  bad_request: 400,
  rate_limited: 429,
  unavailable: 503,
  failed: 500,
}

const noStore = { 'Cache-Control': 'no-store' }
const reply = (error: keyof typeof STATUS) => Response.json({ error }, { status: STATUS[error], headers: noStore })

export async function POST(request: Request) {
  const appOrigin = resolveAppOrigin(process.env.APP_ORIGIN)
  if (!appOrigin) {
    console.error('[reservation-requests] refused: APP_ORIGIN is missing or invalid')
    return reply('failed')
  }
  const rejected = checkHeaders(request.headers, appOrigin)
  if (rejected) return reply(rejected)
  const text = await readBoundedText(request)
  if (text === null) return reply('too_large')
  const path = parseBody(text)
  if (!path) return reply('bad_request')

  try {
    if ((await recordReservationRequest(getPool(), path)) === 'over_quota') return reply('rate_limited')
  } catch (error) {
    console.error(`[reservation-requests] record failed: ${dbErrorCode(error)}`)
    return reply('unavailable')
  }
  return new Response(null, { status: 204, headers: noStore })
}
