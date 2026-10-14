import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { INITIAL_CONTACT_STATE } from './fields'
import { CONTACT_MESSAGES } from './messages'

const sendMail = vi.hoisted(() => vi.fn())
const clientIp = vi.hoisted(() => ({ value: null as string | null }))

vi.mock('@/lib/auth/dal', () => ({ trustedClientIp: async () => clientIp.value }))
vi.mock('nodemailer', () => ({ default: { createTransport: () => ({ sendMail }) } }))

const SMTP_ENV = {
  SMTP_HOST: 'smtp.hostinger.com',
  SMTP_USER: 'contact@example.fr',
  SMTP_PASSWORD: 'not-a-real-password',
  CONTACT_FROM: 'contact@example.fr',
  CONTACT_TO: 'restaurant@example.fr',
}

const SECRET_TEXT = 'Message confidentiel de Marie'

function form(fields: Record<string, string> = {}) {
  const data = new FormData()
  const all = { name: 'Marie', email: 'marie@example.fr', phone: '', message: SECRET_TEXT, website: '', ...fields }
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
  sendMail.mockReset().mockResolvedValue({})
  clientIp.value = null
  for (const [k, v] of Object.entries(SMTP_ENV)) vi.stubEnv(k, v)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('sendContact', () => {
  it('sends a valid message and resets the form', async () => {
    const sendContact = await loadAction()
    const state = await sendContact(INITIAL_CONTACT_STATE, form())
    expect(state).toEqual({ status: 'success', message: CONTACT_MESSAGES.sent, fieldErrors: {}, values: INITIAL_CONTACT_STATE.values })
    expect(sendMail).toHaveBeenCalledOnce()
    expect(sendMail.mock.calls[0][0]).toMatchObject({ to: 'restaurant@example.fr', replyTo: { address: 'marie@example.fr' } })
  })

  it('fakes a success without sending when the honeypot is filled', async () => {
    const sendContact = await loadAction()
    const state = await sendContact(INITIAL_CONTACT_STATE, form({ website: 'https://spam.example' }))
    expect(state.status).toBe('success')
    expect(state.message).toBe(CONTACT_MESSAGES.sent)
    expect(sendMail).not.toHaveBeenCalled()
  })

  it('returns field errors and keeps the typed values', async () => {
    const sendContact = await loadAction()
    const state = await sendContact(INITIAL_CONTACT_STATE, form({ email: 'marie@' }))
    expect(state).toMatchObject({ status: 'error', message: CONTACT_MESSAGES.invalid, values: { email: 'marie@', message: SECRET_TEXT } })
    expect(state.fieldErrors.email).toBeDefined()
    expect(sendMail).not.toHaveBeenCalled()
  })

  it('reports the form as unavailable when the mail configuration is missing, without sending', async () => {
    vi.stubEnv('SMTP_PASSWORD', '')
    vi.stubEnv('CONTACT_TO', '')
    const sendContact = await loadAction()
    const state = await sendContact(INITIAL_CONTACT_STATE, form())
    expect(state).toMatchObject({ status: 'error', message: CONTACT_MESSAGES.unavailable, values: { message: SECRET_TEXT } })
    expect(state.message).toContain('09 78 81 32 95')
    expect(sendMail).not.toHaveBeenCalled()
    expect(logs).toEqual(['[contact] form disabled, mail configuration incomplete: SMTP_PASSWORD missing, CONTACT_TO missing'])
  })

  it('hides SMTP failures from the visitor and logs only the error code', async () => {
    sendMail.mockRejectedValue(Object.assign(new Error('535 auth failed for contact@example.fr'), { code: 'EAUTH' }))
    const sendContact = await loadAction()
    const state = await sendContact(INITIAL_CONTACT_STATE, form())
    expect(state).toMatchObject({ status: 'error', message: CONTACT_MESSAGES.sendFailed })
    expect(JSON.stringify(state)).not.toContain('535')
    expect(logs).toEqual(['[contact] send failed: EAUTH'])
  })

  it('limits each trusted IP to 5 messages per hour', async () => {
    clientIp.value = '203.0.113.7'
    const sendContact = await loadAction()
    for (let i = 0; i < 5; i++) expect((await sendContact(INITIAL_CONTACT_STATE, form())).status).toBe('success')
    expect(await sendContact(INITIAL_CONTACT_STATE, form())).toMatchObject({ status: 'error', message: CONTACT_MESSAGES.rateLimited })
    clientIp.value = '203.0.113.8'
    expect((await sendContact(INITIAL_CONTACT_STATE, form())).status).toBe('success')
    expect(sendMail).toHaveBeenCalledTimes(6)
  })

  it('caps all messages at 30 per hour, also when the client IP is unknown', async () => {
    const sendContact = await loadAction()
    for (let i = 0; i < 30; i++) await sendContact(INITIAL_CONTACT_STATE, form())
    expect(await sendContact(INITIAL_CONTACT_STATE, form())).toMatchObject({ status: 'error', message: CONTACT_MESSAGES.rateLimited })
    expect(sendMail).toHaveBeenCalledTimes(30)
  })

  it('never logs the visitor message, name or address', async () => {
    sendMail.mockRejectedValue(Object.assign(new Error('fail'), { code: 'ECONNECTION' }))
    const sendContact = await loadAction()
    await sendContact(INITIAL_CONTACT_STATE, form())
    await sendContact(INITIAL_CONTACT_STATE, form({ email: 'bad' }))
    for (const line of logs) {
      expect(line).not.toContain(SECRET_TEXT)
      expect(line).not.toContain('marie@example.fr')
      expect(line).not.toContain('not-a-real-password')
    }
  })
})
