import 'server-only'
import { z } from 'zod'
import { resolveAppOrigin } from '@/lib/security/origin'

// reCAPTCHA Enterprise (score-based key, Google Cloud > Fraud Defense). The browser gets a token from enterprise.js
// at submit time (lib/contact/recaptcha-client.ts); the server turns it into an assessment and checks validity, action
// and score before anything else is done with the message.

export type RecaptchaConfig = {
  siteKey: string
  projectId: string
  apiKey: string
  minScore: number
  endpoint: string
  // Hostnames a token may come from (APP_ORIGIN, with or without www.), or null when APP_ORIGIN is not set.
  hostnames: string[] | null
}

// `disabled`: none of the three keys is set (development, tests, or a deployment that predates the keys): the form
// works without reCAPTCHA. `invalid`: partly configured, the form is disabled rather than left unprotected.
export type RecaptchaConfigResult =
  | { status: 'disabled' }
  | { status: 'enabled'; config: RecaptchaConfig }
  | { status: 'invalid'; problems: string[] }

export type RecaptchaVerdict =
  | { ok: true }
  // `rejected`: the token is invalid, for another action or scored too low. `unavailable`: Google could not be asked
  // (network, timeout, HTTP error, unexpected answer). Both fail closed.
  | { ok: false; outcome: 'rejected' | 'unavailable'; code: string }

const RECAPTCHA_API = 'https://recaptchaenterprise.googleapis.com'
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])
const VERIFY_TIMEOUT_MS = 5_000
export const DEFAULT_MIN_SCORE = 0.5
// Google Cloud project IDs: 6 to 30 lowercase letters, digits or hyphens, starting with a letter.
const PROJECT_ID = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/
// Real tokens are a few thousand characters long.
const MAX_TOKEN_LENGTH = 10_000

// The base URL can only be overridden towards this machine (local double of the e2e tests), so that a stray variable
// can never hand the API key to another host.
function assessmentEndpoint(base: string | undefined, projectId: string) {
  const path = `/v1/projects/${encodeURIComponent(projectId)}/assessments`
  if (!base) return `${RECAPTCHA_API}${path}`
  try {
    const url = new URL(base)
    if ((url.protocol === 'http:' || url.protocol === 'https:') && LOOPBACK_HOSTS.has(url.hostname)) {
      return new URL(path, url).href
    }
  } catch {}
  return null
}

function allowedHostnames(appOrigin: string | undefined) {
  const origin = resolveAppOrigin(appOrigin)
  if (!origin) return null
  const host = new URL(origin).hostname
  return host.startsWith('www.') ? [host, host.slice(4)] : [host, `www.${host}`]
}

// The site key is read through its literal name so that Next.js inlines the value embedded at build time, the one
// the browser uses. `problems` only names variables, never their values.
export function readRecaptchaConfig(
  env: Record<string, string | undefined> = { ...process.env, NEXT_PUBLIC_RECAPTCHA_SITE_KEY: process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY },
): RecaptchaConfigResult {
  const siteKey = env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY?.trim() ?? ''
  const projectId = env.RECAPTCHA_PROJECT_ID?.trim() ?? ''
  const apiKey = env.RECAPTCHA_API_KEY?.trim() ?? ''
  if (!siteKey && !projectId && !apiKey) return { status: 'disabled' }

  const problems: string[] = []
  if (!siteKey) problems.push('NEXT_PUBLIC_RECAPTCHA_SITE_KEY missing')
  if (!projectId) problems.push('RECAPTCHA_PROJECT_ID missing')
  else if (!PROJECT_ID.test(projectId)) problems.push('RECAPTCHA_PROJECT_ID invalid')
  if (!apiKey) problems.push('RECAPTCHA_API_KEY missing')

  const rawScore = env.RECAPTCHA_MIN_SCORE?.trim()
  const minScore = rawScore ? Number(rawScore) : DEFAULT_MIN_SCORE
  if (!Number.isFinite(minScore) || minScore < 0 || minScore > 1) problems.push('RECAPTCHA_MIN_SCORE invalid')

  const endpoint = assessmentEndpoint(env.RECAPTCHA_API_BASE_URL?.trim(), projectId)
  if (!endpoint) problems.push('RECAPTCHA_API_BASE_URL invalid')

  if (problems.length > 0 || !endpoint) return { status: 'invalid', problems }
  return {
    status: 'enabled',
    config: { siteKey, projectId, apiKey, minScore, endpoint, hostnames: allowedHostnames(env.APP_ORIGIN?.trim()) },
  }
}

// Only the fields that are checked; anything else in the assessment is ignored.
const assessmentSchema = z.object({
  tokenProperties: z.object({
    valid: z.boolean(),
    invalidReason: z.string().optional(),
    hostname: z.string().optional(),
    action: z.string().optional(),
  }),
  riskAnalysis: z
    .object({
      score: z.number().min(0).max(1).optional(),
      reasons: z.array(z.string()).optional(),
    })
    .optional(),
})

// Google enum values (e.g. EXPIRED, AUTOMATION, PERMISSION_DENIED) are logged; anything else is dropped.
const enumValue = (value: unknown) => (typeof value === 'string' && /^[A-Z_]{1,64}$/.test(value) ? value : null)

async function googleErrorStatus(response: Response) {
  try {
    return enumValue((await response.json())?.error?.status)
  } catch {
    return null
  }
}

export async function verifyRecaptcha(
  token: unknown,
  {
    config,
    action,
    fetch = globalThis.fetch,
    timeoutMs = VERIFY_TIMEOUT_MS,
  }: { config: RecaptchaConfig; action: string; fetch?: typeof globalThis.fetch; timeoutMs?: number },
): Promise<RecaptchaVerdict> {
  // No token: JavaScript disabled, enterprise.js blocked or failed. Google is not asked.
  if (typeof token !== 'string' || !token || token.length > MAX_TOKEN_LENGTH) {
    return { ok: false, outcome: 'rejected', code: 'missing token' }
  }

  let response: Response
  try {
    response = await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Header rather than ?key=: the API key never appears in a URL that a proxy or an error could log.
        'X-Goog-Api-Key': config.apiKey,
      },
      body: JSON.stringify({ event: { token, expectedAction: action, siteKey: config.siteKey } }),
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store',
    })
  } catch (error) {
    // Never the error message: it is not ours and could quote the request.
    const name = (error as { name?: unknown }).name
    return { ok: false, outcome: 'unavailable', code: name === 'TimeoutError' ? 'timeout' : 'network error' }
  }
  if (!response.ok) {
    const status = await googleErrorStatus(response)
    return { ok: false, outcome: 'unavailable', code: status ? `HTTP ${response.status} ${status}` : `HTTP ${response.status}` }
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    return { ok: false, outcome: 'unavailable', code: 'unexpected response' }
  }
  const parsed = assessmentSchema.safeParse(body)
  if (!parsed.success) return { ok: false, outcome: 'unavailable', code: 'unexpected response' }
  const { tokenProperties, riskAnalysis } = parsed.data

  if (!tokenProperties.valid) {
    return { ok: false, outcome: 'rejected', code: `invalid token (${enumValue(tokenProperties.invalidReason) ?? 'unknown'})` }
  }
  if (tokenProperties.action !== action) return { ok: false, outcome: 'rejected', code: 'unexpected action' }
  if (config.hostnames && !config.hostnames.includes(tokenProperties.hostname ?? '')) {
    return { ok: false, outcome: 'rejected', code: 'unexpected hostname' }
  }
  const score = riskAnalysis?.score
  if (score === undefined) return { ok: false, outcome: 'unavailable', code: 'unexpected response' }
  if (score < config.minScore) {
    const reasons = (riskAnalysis?.reasons ?? []).map(enumValue).filter(Boolean).join(', ')
    return { ok: false, outcome: 'rejected', code: `low score ${score}${reasons ? ` (${reasons})` : ''}` }
  }
  return { ok: true }
}
