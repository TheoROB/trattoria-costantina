import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { INITIAL_CONTACT_STATE } from './fields'
import { CONTACT_MESSAGES } from './messages'

const clientIp = vi.hoisted(() => ({ value: null as string | null }))

vi.mock('@/lib/auth/dal', () => ({ trustedClientIp: async () => clientIp.value }))

// Placeholder only: deliberately not shaped like a real Resend key.
const API_KEY = 'test-only-resend-key-0123456789'

const MAIL_ENV = {
  RESEND_API_KEY: API_KEY,
  CONTACT_FROM: 'Trattoria Costantina <site@trattoriacostantina.fr>',
  CONTACT_TO: 'trattoria.costantina@gmail.com',
  RESEND_BASE_URL: '',
  // reCAPTCHA off unless a test turns it on.
  NEXT_PUBLIC_RECAPTCHA_SITE_KEY: '',
  RECAPTCHA_PROJECT_ID: '',
  RECAPTCHA_API_KEY: '',
  RECAPTCHA_MIN_SCORE: '',
  RECAPTCHA_API_BASE_URL: '',
  APP_ORIGIN: 'https://trattoriacostantina.fr',
}

// Placeholders only: deliberately not shaped like real Google keys.
const RECAPTCHA_API_KEY = 'test-only-recaptcha-api-key'
const RECAPTCHA_ENV = {
  NEXT_PUBLIC_RECAPTCHA_SITE_KEY: 'test-only-site-key',
  RECAPTCHA_PROJECT_ID: 'trattoria-test',
  RECAPTCHA_API_KEY,
}
const ASSESSMENTS = 'https://recaptchaenterprise.googleapis.com/v1/projects/trattoria-test/assessments'
const RESEND = 'https://api.resend.com/emails'

const assessment = (score: number, action = 'contact') =>
  new Response(JSON.stringify({ tokenProperties: { valid: true, action, hostname: 'trattoriacostantina.fr' }, riskAnalysis: { score, reasons: [] } }), {
    status: 200,
  })

const fetchMock = vi.fn<typeof fetch>()
const sentMail = (call = 0) => JSON.parse(fetchMock.mock.calls[call][1]!.body as string)

const SECRET_TEXT = 'Message confidentiel de Marie'

function form(fields: Record<string, string> = {}) {
  const data = new FormData()
  const all = { name: 'Marie', email: 'marie@example.fr', phone: '', message: SECRET_TEXT, website: '', 'recaptcha-token': 'test-token', ...fields }
  for (const [k, v] of Object.entries(all)) data.append(k, v)
  return data
}

// Fresh module state (rate limiters) for every test.
async function loadAction() {
  vi.resetModules()
  return (await import('@/app/contact-actions')).sendContact
}

let logs: string[]

beforeEach(() => {
  logs = []
  for (const method of ['log', 'info', 'warn', 'error'] as const) {
    vi.spyOn(console, method).mockImplementation((...args) => void logs.push(args.join(' ')))
  }
  fetchMock.mockReset().mockImplementation(async () => new Response('{"id":"test"}', { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  clientIp.value = null
  for (const [k, v] of Object.entries(MAIL_ENV)) vi.stubEnv(k, v)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('sendContact', () => {
  it('sends a valid message and resets the form', async () => {
    const sendContact = await loadAction()
    const state = await sendContact(INITIAL_CONTACT_STATE, form())
    expect(state).toEqual({ status: 'success', message: CONTACT_MESSAGES.sent, fieldErrors: {}, values: INITIAL_CONTACT_STATE.values })
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.resend.com/emails')
    expect(sentMail()).toMatchObject({
      from: 'Trattoria Costantina <site@trattoriacostantina.fr>',
      to: ['trattoria.costantina@gmail.com'],
      reply_to: 'marie@example.fr',
    })
    expect(sentMail().text).toContain(SECRET_TEXT)
    expect(logs).toEqual([])
  })

  it('fakes a success without sending when the honeypot is filled', async () => {
    const sendContact = await loadAction()
    const state = await sendContact(INITIAL_CONTACT_STATE, form({ website: 'https://spam.example' }))
    expect(state).toEqual({ status: 'success', message: CONTACT_MESSAGES.sent, fieldErrors: {}, values: INITIAL_CONTACT_STATE.values })
    expect(fetchMock).not.toHaveBeenCalled()
    // A short line without anything the bot typed.
    expect(logs).toEqual(['[contact] spam trap filled, message dropped'])
  })

  it('refuses a message with a link, without sending, and keeps the typed text', async () => {
    const sendContact = await loadAction()
    const text = 'Découvrez votre fiche : https://onpartage.online/fr/med/trattoriacostantina'
    const state = await sendContact(INITIAL_CONTACT_STATE, form({ message: text }))
    expect(state).toMatchObject({
      status: 'error',
      message: CONTACT_MESSAGES.invalid,
      fieldErrors: { message: CONTACT_MESSAGES.linkInMessage },
      values: { message: text },
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns field errors and keeps the typed values', async () => {
    const sendContact = await loadAction()
    const state = await sendContact(INITIAL_CONTACT_STATE, form({ email: 'marie@' }))
    expect(state).toMatchObject({ status: 'error', message: CONTACT_MESSAGES.invalid, values: { email: 'marie@', message: SECRET_TEXT } })
    expect(state.fieldErrors.email).toBeDefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reports the form as unavailable when the mail configuration is missing, without sending', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    vi.stubEnv('CONTACT_TO', '')
    const sendContact = await loadAction()
    const state = await sendContact(INITIAL_CONTACT_STATE, form())
    expect(state).toMatchObject({ status: 'error', message: CONTACT_MESSAGES.unavailable, values: { message: SECRET_TEXT } })
    expect(state.message).toContain('09 78 81 32 95')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(logs).toEqual(['[contact] form disabled, mail configuration incomplete: RESEND_API_KEY missing, CONTACT_TO missing'])
  })

  it('reports an invalid sender as a configuration problem, without sending', async () => {
    vi.stubEnv('CONTACT_FROM', 'Trattoria Costantina')
    const sendContact = await loadAction()
    expect(await sendContact(INITIAL_CONTACT_STATE, form())).toMatchObject({ status: 'error', message: CONTACT_MESSAGES.unavailable })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(logs).toEqual(['[contact] form disabled, mail configuration incomplete: CONTACT_FROM invalid'])
  })

  it('hides Resend failures from the visitor and logs only the status and error name', async () => {
    const body = { statusCode: 401, name: 'validation_error', message: `API key ${API_KEY} is invalid for marie@example.fr` }
    fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status: 401 }))
    const sendContact = await loadAction()
    const state = await sendContact(INITIAL_CONTACT_STATE, form())
    expect(state).toMatchObject({ status: 'error', message: CONTACT_MESSAGES.sendFailed, values: { message: SECRET_TEXT } })
    expect(JSON.stringify(state)).not.toContain('invalid for')
    expect(logs).toEqual(['[contact] send failed: HTTP 401 validation_error'])
  })

  it('handles a Resend server error, a network error and a timeout the same way', async () => {
    const sendContact = await loadAction()
    fetchMock.mockResolvedValueOnce(new Response('upstream error', { status: 503 }))
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'))
    fetchMock.mockRejectedValueOnce(new DOMException('The operation was aborted due to timeout', 'TimeoutError'))
    for (let i = 0; i < 3; i++) {
      expect(await sendContact(INITIAL_CONTACT_STATE, form())).toMatchObject({ status: 'error', message: CONTACT_MESSAGES.sendFailed })
    }
    expect(logs).toEqual(['[contact] send failed: HTTP 503', '[contact] send failed: network error', '[contact] send failed: timeout'])
  })

  it('sends a single mail per submission, never retrying on its own', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 500 }))
    const sendContact = await loadAction()
    await sendContact(INITIAL_CONTACT_STATE, form())
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('limits each trusted IP to 5 messages per hour', async () => {
    clientIp.value = '203.0.113.7'
    const sendContact = await loadAction()
    for (let i = 0; i < 5; i++) expect((await sendContact(INITIAL_CONTACT_STATE, form())).status).toBe('success')
    expect(await sendContact(INITIAL_CONTACT_STATE, form())).toMatchObject({ status: 'error', message: CONTACT_MESSAGES.rateLimited })
    clientIp.value = '203.0.113.8'
    expect((await sendContact(INITIAL_CONTACT_STATE, form())).status).toBe('success')
    expect(fetchMock).toHaveBeenCalledTimes(6)
  })

  it('caps all messages at 30 per hour, also when the client IP is unknown', async () => {
    const sendContact = await loadAction()
    for (let i = 0; i < 30; i++) await sendContact(INITIAL_CONTACT_STATE, form())
    expect(await sendContact(INITIAL_CONTACT_STATE, form())).toMatchObject({ status: 'error', message: CONTACT_MESSAGES.rateLimited })
    expect(fetchMock).toHaveBeenCalledTimes(30)
  })

  it('never logs nor returns the visitor message, address or the API key', async () => {
    const sendContact = await loadAction()
    const states = []
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ name: 'validation_error', message: `${API_KEY} marie@example.fr` }), { status: 403 }))
    states.push(await sendContact(INITIAL_CONTACT_STATE, form()))
    fetchMock.mockRejectedValueOnce(new TypeError(`fetch failed with Bearer ${API_KEY}`))
    states.push(await sendContact(INITIAL_CONTACT_STATE, form()))
    states.push(await sendContact(INITIAL_CONTACT_STATE, form({ email: 'bad' })))
    vi.stubEnv('CONTACT_TO', '')
    states.push(await (await loadAction())(INITIAL_CONTACT_STATE, form()))
    expect(logs.length).toBeGreaterThan(0)
    for (const line of logs) {
      expect(line).not.toContain(SECRET_TEXT)
      expect(line).not.toContain('marie@example.fr')
      expect(line).not.toContain(API_KEY)
    }
    expect(JSON.stringify(states)).not.toContain(API_KEY)
  })
})

describe('sendContact with reCAPTCHA Enterprise', () => {
  beforeEach(() => {
    for (const [k, v] of Object.entries(RECAPTCHA_ENV)) vi.stubEnv(k, v)
  })

  const mockGoogle = (answer: () => Promise<Response>) =>
    fetchMock.mockImplementation(async (url) => (String(url) === ASSESSMENTS ? answer() : new Response('{"id":"test"}', { status: 200 })))
  const calledUrls = () => fetchMock.mock.calls.map(([url]) => String(url))

  it('creates an assessment, then sends the message when the score is good', async () => {
    mockGoogle(async () => assessment(0.9))
    const sendContact = await loadAction()
    expect(await sendContact(INITIAL_CONTACT_STATE, form())).toMatchObject({ status: 'success', message: CONTACT_MESSAGES.sent })
    expect(calledUrls()).toEqual([ASSESSMENTS, RESEND])
    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).toEqual({
      event: { token: 'test-token', expectedAction: 'contact', siteKey: 'test-only-site-key' },
    })
    expect(logs).toEqual([])
  })

  it('refuses a low score without sending nor using the rate limit quota', async () => {
    mockGoogle(async () => assessment(0.1))
    const sendContact = await loadAction()
    for (let i = 0; i < 31; i++) {
      expect(await sendContact(INITIAL_CONTACT_STATE, form())).toMatchObject({
        status: 'error',
        message: CONTACT_MESSAGES.spamCheckFailed,
        values: { message: SECRET_TEXT },
      })
    }
    expect(calledUrls()).not.toContain(RESEND)
    expect(logs[0]).toBe('[contact] reCAPTCHA rejected: low score 0.1')
    // Bots did not use up the hourly quota of real visitors.
    mockGoogle(async () => assessment(0.9))
    expect((await sendContact(INITIAL_CONTACT_STATE, form())).status).toBe('success')
  })

  it('refuses a token made for another action', async () => {
    mockGoogle(async () => assessment(0.9, 'login'))
    const sendContact = await loadAction()
    expect(await sendContact(INITIAL_CONTACT_STATE, form())).toMatchObject({ status: 'error', message: CONTACT_MESSAGES.spamCheckFailed })
    expect(calledUrls()).toEqual([ASSESSMENTS])
  })

  it('refuses a submission without token (no JavaScript) without asking Google', async () => {
    const sendContact = await loadAction()
    expect(await sendContact(INITIAL_CONTACT_STATE, form({ 'recaptcha-token': '' }))).toMatchObject({
      status: 'error',
      message: CONTACT_MESSAGES.spamCheckFailed,
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('still validates fields and the honeypot before asking Google', async () => {
    const sendContact = await loadAction()
    expect((await sendContact(INITIAL_CONTACT_STATE, form({ email: 'bad' }))).message).toBe(CONTACT_MESSAGES.invalid)
    expect((await sendContact(INITIAL_CONTACT_STATE, form({ website: 'x' }))).message).toBe(CONTACT_MESSAGES.sent)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fails closed with a "call us" message when Google cannot be reached', async () => {
    mockGoogle(async () => {
      throw new TypeError(`fetch failed ${RECAPTCHA_API_KEY}`)
    })
    const sendContact = await loadAction()
    const state = await sendContact(INITIAL_CONTACT_STATE, form())
    expect(state).toMatchObject({ status: 'error', message: CONTACT_MESSAGES.spamCheckUnavailable, values: { message: SECRET_TEXT } })
    expect(state.message).toContain('09 78 81 32 95')
    expect(calledUrls()).toEqual([ASSESSMENTS])
    expect(logs).toEqual(['[contact] reCAPTCHA unavailable: network error'])
  })

  it('disables the form when reCAPTCHA is only partly configured', async () => {
    vi.stubEnv('RECAPTCHA_API_KEY', '')
    const sendContact = await loadAction()
    expect(await sendContact(INITIAL_CONTACT_STATE, form())).toMatchObject({ status: 'error', message: CONTACT_MESSAGES.unavailable })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(logs).toEqual(['[contact] form disabled, reCAPTCHA configuration incomplete: RECAPTCHA_API_KEY missing'])
  })

  it('never logs nor returns the API key or the token', async () => {
    mockGoogle(async () => new Response(JSON.stringify({ error: { status: 'PERMISSION_DENIED', message: RECAPTCHA_API_KEY } }), { status: 403 }))
    const sendContact = await loadAction()
    const state = await sendContact(INITIAL_CONTACT_STATE, form())
    expect(logs).toEqual(['[contact] reCAPTCHA unavailable: HTTP 403 PERMISSION_DENIED'])
    for (const text of [...logs, JSON.stringify(state)]) {
      expect(text).not.toContain(RECAPTCHA_API_KEY)
      expect(text).not.toContain('test-token')
    }
  })
})

describe('sendContact without reCAPTCHA keys', () => {
  it('keeps working and says so in production logs', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const sendContact = await loadAction()
    expect((await sendContact(INITIAL_CONTACT_STATE, form())).status).toBe('success')
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([RESEND])
    expect(logs).toEqual(['[contact] reCAPTCHA disabled: no reCAPTCHA key configured'])
  })
})
