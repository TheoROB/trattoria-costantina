import 'server-only'
import { createRateLimiter } from './rate-limit'

const HOUR = 60 * 60 * 1000

// Per visitor when the proxy gives a trusted IP (AUTH_TRUSTED_IP_HEADER), plus a global cap that protects
// the restaurant's mailbox even when it does not.
const perIp = createRateLimiter({ limit: 5, windowMs: HOUR })
const overall = createRateLimiter({ limit: 30, windowMs: HOUR })

export const contactRateLimits = {
  allow(ip: string | null) {
    if (ip && !perIp.take(ip)) return false
    return overall.take('all')
  },
}
