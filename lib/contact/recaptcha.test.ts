import { describe, expect, it, vi } from 'vitest'
import { readRecaptchaConfig, verifyRecaptcha, type RecaptchaConfig } from './recaptcha'

// Placeholders only: deliberately not shaped like real Google keys.
const API_KEY = 'test-only-recaptcha-api-key'
const SITE_KEY = 'test-only-site-key'
const TOKEN = 'test-only-token'

const env = {
  NEXT_PUBLIC_RECAPTCHA_SITE_KEY: SITE_KEY,
  RECAPTCHA_PROJECT_ID: 'trattoria-test',
  RECAPTCHA_API_KEY: API_KEY,
  APP_ORIGIN: 'https://trattoriacostantina.fr',
}

const config: RecaptchaConfig = {
  siteKey: SITE_KEY,
  projectId: 'trattoria-test',
  apiKey: API_KEY,
  minScore: 0.5,
  endpoint: 'https://recaptchaenterprise.googleapis.com/v1/projects/trattoria-test/assessments',
  hostnames: ['trattoriacostantina.fr', 'www.trattoriacostantina.fr'],
}

function assessment({
  valid = true,
  action = 'contact',
  hostname = 'trattoriacostantina.fr',
  score = 0.9 as number | null,
  invalidReason = undefined as string | undefined,
  reasons = [] as string[],
} = {}) {
  return new Response(
    JSON.stringify({
      name: 'projects/123/assessments/abc',
      tokenProperties: { valid, action, hostname, invalidReason, createTime: '2026-11-12T10:00:00Z' },
      riskAnalysis: { score: score ?? undefined, reasons },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}

const verify = (response: Response | Error, token: unknown = TOKEN, overrides: Partial<RecaptchaConfig> = {}) => {
  const fetch = vi.fn<typeof globalThis.fetch>()
  if (response instanceof Error) fetch.mockRejectedValue(response)
  else fetch.mockResolvedValue(response)
  return { fetch, verdict: verifyRecaptcha(token, { config: { ...config, ...overrides }, action: 'contact', fetch }) }
}

describe('readRecaptchaConfig', () => {
  it('is explicitly disabled when no key is set', () => {
    expect(readRecaptchaConfig({})).toEqual({ status: 'disabled' })
    expect(readRecaptchaConfig({ NEXT_PUBLIC_RECAPTCHA_SITE_KEY: ' ', RECAPTCHA_PROJECT_ID: '', APP_ORIGIN: env.APP_ORIGIN })).toEqual({
      status: 'disabled',
    })
  })

  it('reads a complete configuration with the default threshold', () => {
    expect(readRecaptchaConfig(env)).toEqual({ status: 'enabled', config })
  })

  it('accepts a custom threshold and skips the hostname check without APP_ORIGIN', () => {
    const result = readRecaptchaConfig({ ...env, RECAPTCHA_MIN_SCORE: '0.7', APP_ORIGIN: '' })
    expect(result).toMatchObject({ status: 'enabled', config: { minScore: 0.7, hostnames: null } })
  })

  it('reports a partial configuration by variable name only', () => {
    const result = readRecaptchaConfig({ RECAPTCHA_API_KEY: API_KEY })
    expect(result).toEqual({ status: 'invalid', problems: ['NEXT_PUBLIC_RECAPTCHA_SITE_KEY missing', 'RECAPTCHA_PROJECT_ID missing'] })
    expect(JSON.stringify(result)).not.toContain(API_KEY)
  })

  it('refuses an invalid project ID or threshold', () => {
    expect(readRecaptchaConfig({ ...env, RECAPTCHA_PROJECT_ID: '../other' })).toEqual({
      status: 'invalid',
      problems: ['RECAPTCHA_PROJECT_ID invalid'],
    })
    for (const value of ['1.5', '-0.1', 'abc']) {
      expect(readRecaptchaConfig({ ...env, RECAPTCHA_MIN_SCORE: value })).toEqual({
        status: 'invalid',
        problems: ['RECAPTCHA_MIN_SCORE invalid'],
      })
    }
  })

  it('only lets the API base URL point at this machine', () => {
    expect(readRecaptchaConfig({ ...env, RECAPTCHA_API_BASE_URL: 'http://127.0.0.1:3791' })).toMatchObject({
      status: 'enabled',
      config: { endpoint: 'http://127.0.0.1:3791/v1/projects/trattoria-test/assessments' },
    })
    for (const base of ['https://evil.example', 'http://127.0.0.1.evil.example', 'not a url']) {
      expect(readRecaptchaConfig({ ...env, RECAPTCHA_API_BASE_URL: base })).toEqual({
        status: 'invalid',
        problems: ['RECAPTCHA_API_BASE_URL invalid'],
      })
    }
  })
})

describe('verifyRecaptcha', () => {
  it('accepts a valid token for the expected action with a good score', async () => {
    const { fetch, verdict } = verify(assessment())
    expect(await verdict).toEqual({ ok: true })
    expect(fetch).toHaveBeenCalledOnce()
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe(config.endpoint)
    // The API key is sent in a header, never in the URL.
    expect(String(url)).not.toContain(API_KEY)
    expect(init!.method).toBe('POST')
    expect((init!.headers as Record<string, string>)['X-Goog-Api-Key']).toBe(API_KEY)
    expect(JSON.parse(init!.body as string)).toEqual({ event: { token: TOKEN, expectedAction: 'contact', siteKey: SITE_KEY } })
    expect(init!.signal).toBeInstanceOf(AbortSignal)
  })

  it('accepts the www. hostname and the exact threshold', async () => {
    expect(await verify(assessment({ hostname: 'www.trattoriacostantina.fr', score: 0.5 })).verdict).toEqual({ ok: true })
  })

  it('rejects a low score and logs Google reasons', async () => {
    expect(await verify(assessment({ score: 0.1, reasons: ['AUTOMATION', 'not an <enum>'] })).verdict).toEqual({
      ok: false,
      outcome: 'rejected',
      code: 'low score 0.1 (AUTOMATION)',
    })
  })

  it('rejects a token made for another action', async () => {
    expect(await verify(assessment({ action: 'login' })).verdict).toEqual({ ok: false, outcome: 'rejected', code: 'unexpected action' })
  })

  it('rejects a token from another site', async () => {
    expect(await verify(assessment({ hostname: 'spam.example' })).verdict).toEqual({
      ok: false,
      outcome: 'rejected',
      code: 'unexpected hostname',
    })
    expect(await verify(assessment({ hostname: 'spam.example' }), TOKEN, { hostnames: null }).verdict).toEqual({ ok: true })
  })

  it('rejects an invalid, expired or reused token with its reason', async () => {
    expect(await verify(assessment({ valid: false, score: 0, invalidReason: 'EXPIRED' })).verdict).toEqual({
      ok: false,
      outcome: 'rejected',
      code: 'invalid token (EXPIRED)',
    })
  })

  it('rejects a missing token without asking Google', async () => {
    for (const token of [null, '', 42, 'x'.repeat(10_001)]) {
      const { fetch, verdict } = verify(assessment(), token)
      expect(await verdict).toEqual({ ok: false, outcome: 'rejected', code: 'missing token' })
      expect(fetch).not.toHaveBeenCalled()
    }
  })

  it('fails closed as unavailable on a network error or a timeout, without the error message', async () => {
    expect(await verify(new TypeError(`fetch failed ${API_KEY}`)).verdict).toEqual({
      ok: false,
      outcome: 'unavailable',
      code: 'network error',
    })
    expect(await verify(new DOMException('aborted', 'TimeoutError')).verdict).toEqual({
      ok: false,
      outcome: 'unavailable',
      code: 'timeout',
    })
  })

  it('fails closed as unavailable on an HTTP error, keeping only the status', async () => {
    const body = { error: { code: 403, message: `API key ${API_KEY} not valid`, status: 'PERMISSION_DENIED' } }
    const verdict = await verify(new Response(JSON.stringify(body), { status: 403 })).verdict
    expect(verdict).toEqual({ ok: false, outcome: 'unavailable', code: 'HTTP 403 PERMISSION_DENIED' })
    expect(await verify(new Response('<html>', { status: 503 })).verdict).toEqual({ ok: false, outcome: 'unavailable', code: 'HTTP 503' })
  })

  it('fails closed as unavailable on an unexpected answer', async () => {
    for (const body of ['not json', '{}', JSON.stringify({ tokenProperties: { valid: 'yes' } })]) {
      expect(await verify(new Response(body, { status: 200 })).verdict).toEqual({
        ok: false,
        outcome: 'unavailable',
        code: 'unexpected response',
      })
    }
    expect(await verify(assessment({ score: null })).verdict).toEqual({
      ok: false,
      outcome: 'unavailable',
      code: 'unexpected response',
    })
  })
})
