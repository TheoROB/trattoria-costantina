import 'server-only'
import { isIP } from 'node:net'
import { cache } from 'react'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPool } from '@/lib/db'
import { createSession, deleteSession, findSession } from './session'

// `__Host-` requires Secure (HTTPS in production); plain name for `next dev` over http.
const secure = process.env.NODE_ENV === 'production'
export const SESSION_COOKIE = secure ? '__Host-tc_admin' : 'tc_admin'
const cookieOptions = { httpOnly: true, secure, sameSite: 'strict', path: '/' } as const

const dbErrorCode = (error: unknown) => (error as { code?: string }).code ?? 'unknown error'

// Validated against the database on every call: proxy.ts makes no authorization decision.
export const getCurrentAdmin = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (!token) return null
  try {
    return await findSession(getPool(), token)
  } catch (error) {
    console.error(`[auth] session lookup failed: ${dbErrorCode(error)}`)
    return null
  }
})

// Call at the top of every protected page and every admin Server Action.
export async function requireAdmin() {
  const admin = await getCurrentAdmin()
  if (!admin) redirect('/admin/login')
  return admin
}

export async function startSession(adminUserId: number) {
  await endSession() // never reuse a token presented before login
  const { token, expiresAt } = await createSession(getPool(), adminUserId)
  ;(await cookies()).set(SESSION_COOKIE, token, { ...cookieOptions, expires: expiresAt })
}

export async function endSession() {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (!token) return
  await deleteSession(getPool(), token)
  // Same attributes as when set: browsers ignore a `__Host-` cookie update without Secure/Path=/.
  store.set(SESSION_COOKIE, '', { ...cookieOptions, maxAge: 0 })
}

// Client IP for rate limiting, only from a proxy header explicitly trusted in the environment
// (AUTH_TRUSTED_IP_HEADER, e.g. x-real-ip). The last X-Forwarded-For hop is the one the proxy added.
export async function trustedClientIp() {
  const header = process.env.AUTH_TRUSTED_IP_HEADER?.toLowerCase()
  if (!header) return null
  const value = (await headers()).get(header)?.split(',').at(-1)?.trim() ?? ''
  return isIP(value) ? value : null
}

export { dbErrorCode }
