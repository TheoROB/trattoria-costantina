import { describe, expect, it, vi } from 'vitest'
import { composeContactMail, readMailConfig, sendContactMail, type MailConfig } from './mail'

// Placeholder only: deliberately not shaped like a real Resend key.
const API_KEY = 'test-only-resend-key-0123456789'

const env = {
  RESEND_API_KEY: API_KEY,
  CONTACT_FROM: 'Trattoria Costantina <site@trattoriacostantina.fr>',
  CONTACT_TO: 'trattoria.costantina@gmail.com',
}

const config: MailConfig = {
  apiKey: API_KEY,
  from: 'Trattoria Costantina <site@trattoriacostantina.fr>',
  to: 'trattoria.costantina@gmail.com',
  endpoint: 'https://api.resend.com/emails',
}

const message = {
  name: 'Marie <b>Dupont</b>',
  email: 'marie@example.fr',
  phone: null,
  message: 'Bonjour,\n<script>alert(1)</script>\nÀ bientôt',
}

const ok = () => new Response(JSON.stringify({ id: '49a3999c-0ce1-4ea6-ab68-afcd6dc2e794' }), { status: 200 })

describe('readMailConfig', () => {
  it('reads the Resend key, the sender and the recipient', () => {
    expect(readMailConfig(env)).toEqual({ ok: true, config })
  })

  it('accepts a bare sender address', () => {
    expect(readMailConfig({ ...env, CONTACT_FROM: ' site@trattoriacostantina.fr ' })).toMatchObject({
      ok: true,
      config: { from: 'site@trattoriacostantina.fr' },
    })
  })

  it('lists missing variables by name only', () => {
    expect(readMailConfig({})).toEqual({
      ok: false,
      problems: ['RESEND_API_KEY missing', 'CONTACT_FROM missing', 'CONTACT_TO missing'],
    })
    expect(readMailConfig({ ...env, RESEND_API_KEY: '  ' })).toEqual({ ok: false, problems: ['RESEND_API_KEY missing'] })
  })

  it('rejects malformed sender and recipient addresses', () => {
    for (const from of ['not-an-email', 'Trattoria <not-an-email>', 'Trattoria site@trattoriacostantina.fr', 'A "B" <site@trattoriacostantina.fr>', 'Tratto\nria <site@trattoriacostantina.fr>']) {
      expect(readMailConfig({ ...env, CONTACT_FROM: from })).toEqual({ ok: false, problems: ['CONTACT_FROM invalid'] })
    }
    for (const to of ['nobody', 'Trattoria <trattoria.costantina@gmail.com>', 'a@example.fr, b@example.fr']) {
      expect(readMailConfig({ ...env, CONTACT_TO: to })).toEqual({ ok: false, problems: ['CONTACT_TO invalid'] })
    }
  })

  it('accepts a loopback API base URL only, for the local test double', () => {
    expect(readMailConfig({ ...env, RESEND_BASE_URL: 'http://127.0.0.1:3790' })).toMatchObject({
      ok: true,
      config: { endpoint: 'http://127.0.0.1:3790/emails' },
    })
    expect(readMailConfig({ ...env, RESEND_BASE_URL: 'http://localhost:3790/' })).toMatchObject({
      ok: true,
      config: { endpoint: 'http://localhost:3790/emails' },
    })
    // Anything else would hand the API key to another host: the form is disabled instead.
    for (const url of ['https://evil.example', 'http://127.0.0.1.evil.example', 'file:///etc/passwd', 'not a url']) {
      expect(readMailConfig({ ...env, RESEND_BASE_URL: url })).toEqual({ ok: false, problems: ['RESEND_BASE_URL invalid'] })
    }
  })

  it('never puts the API key in the problems', () => {
    expect(JSON.stringify(readMailConfig({ ...env, CONTACT_TO: '' }))).not.toContain(API_KEY)
    expect(JSON.stringify(readMailConfig({ ...env, CONTACT_FROM: API_KEY }))).not.toContain(API_KEY)
  })
})

describe('composeContactMail', () => {
  it('sends from the configured sender to the restaurant only, with the visitor in reply_to', () => {
    expect(composeContactMail(message, config)).toEqual({
      from: 'Trattoria Costantina <site@trattoriacostantina.fr>',
      to: ['trattoria.costantina@gmail.com'],
      reply_to: 'marie@example.fr',
      subject: `Message du site : ${message.name}`,
      text: expect.any(String),
    })
  })

  it('produces a plain-text body only, with the visitor input left as inert text', () => {
    const mail = composeContactMail(message, config)
    expect(mail).not.toHaveProperty('html')
    expect(mail.text).toContain('Nom : Marie <b>Dupont</b>')
    expect(mail.text).toContain('E-mail : marie@example.fr')
    expect(mail.text).toContain('Téléphone : non renseigné')
    expect(mail.text).toContain('<script>alert(1)</script>')
    expect(composeContactMail({ ...message, phone: '06 12 34 56 78' }, config).text).toContain('Téléphone : 06 12 34 56 78')
  })
})

describe('sendContactMail', () => {
  it('posts the composed mail to Resend with the bearer key', async () => {
    const fetch = vi.fn().mockResolvedValue(ok())
    await expect(sendContactMail(message, { config, fetch })).resolves.toEqual({ ok: true })
    expect(fetch).toHaveBeenCalledOnce()
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('https://api.resend.com/emails')
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      'User-Agent': expect.any(String),
    })
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(JSON.parse(init.body)).toEqual(composeContactMail(message, config))
  })

  it('reports an HTTP failure by status and Resend error name only, never the response text', async () => {
    const body = { statusCode: 403, name: 'validation_error', message: 'The trattoriacostantina.fr domain is not verified for marie@example.fr' }
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 403 }))
    const result = await sendContactMail(message, { config, fetch })
    expect(result).toEqual({ ok: false, code: 'HTTP 403 validation_error' })
    expect(JSON.stringify(result)).not.toContain('marie@example.fr')
  })

  it('keeps only the status when the error body is not a plain Resend error name', async () => {
    for (const [status, body] of [
      [500, 'Internal error for marie@example.fr'],
      [502, JSON.stringify({ name: 'marie@example.fr' })],
      [429, ''],
    ] as const) {
      const fetch = vi.fn().mockResolvedValue(new Response(body, { status }))
      await expect(sendContactMail(message, { config, fetch })).resolves.toEqual({ ok: false, code: `HTTP ${status}` })
    }
  })

  it('reports network errors and timeouts without their message', async () => {
    const network = vi.fn().mockRejectedValue(new TypeError(`fetch failed: Bearer ${API_KEY}`))
    await expect(sendContactMail(message, { config, fetch: network })).resolves.toEqual({ ok: false, code: 'network error' })
    const timeout = vi.fn().mockRejectedValue(new DOMException('The operation was aborted due to timeout', 'TimeoutError'))
    await expect(sendContactMail(message, { config, fetch: timeout })).resolves.toEqual({ ok: false, code: 'timeout' })
  })

  it('aborts a request that does not answer in time', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>((_url, init) => {
      return new Promise<Response>((_resolve, reject) => {
        init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason))
      })
    })
    await expect(sendContactMail(message, { config, fetch, timeoutMs: 20 })).resolves.toEqual({ ok: false, code: 'timeout' })
  })
})
