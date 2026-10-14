import nodemailer from 'nodemailer'
import { describe, expect, it, vi } from 'vitest'
import { composeContactMail, readMailConfig, sendContactMail, type MailConfig } from './mail'

const env = {
  SMTP_HOST: 'smtp.hostinger.com',
  SMTP_PORT: '465',
  SMTP_USER: 'contact@example.fr',
  SMTP_PASSWORD: 'not-a-real-password',
  CONTACT_FROM: 'contact@example.fr',
  CONTACT_TO: 'restaurant@example.fr',
}

const config: MailConfig = {
  host: 'smtp.hostinger.com',
  port: 465,
  secure: true,
  user: 'contact@example.fr',
  password: 'not-a-real-password',
  from: 'contact@example.fr',
  to: 'restaurant@example.fr',
}

const message = {
  name: 'Marie <b>Dupont</b>',
  email: 'marie@example.fr',
  phone: null,
  message: 'Bonjour,\n<script>alert(1)</script>\nÀ bientôt',
}

// Renders the raw MIME message as it would be sent, without any network.
async function rawMessage(input = message) {
  const transport = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'unix' })
  const info = await transport.sendMail(composeContactMail(input, config))
  return info.message.toString()
}

describe('readMailConfig', () => {
  it('reads a complete Hostinger configuration, implicit TLS on port 465 by default', () => {
    expect(readMailConfig(env)).toEqual({ ok: true, config })
    expect(readMailConfig({ ...env, SMTP_PORT: undefined })).toEqual({ ok: true, config })
  })

  it('uses STARTTLS settings on another port unless told otherwise', () => {
    expect(readMailConfig({ ...env, SMTP_PORT: '587' })).toMatchObject({ ok: true, config: { port: 587, secure: false } })
    expect(readMailConfig({ ...env, SMTP_PORT: '587', SMTP_SECURE: 'true' })).toMatchObject({ ok: true, config: { secure: true } })
  })

  it('lists missing and invalid variables by name only, never their values', () => {
    const result = readMailConfig({ SMTP_PORT: 'abc', SMTP_SECURE: 'yes', CONTACT_FROM: 'not-an-email', SMTP_PASSWORD: '' })
    expect(result).toEqual({
      ok: false,
      problems: [
        'SMTP_HOST missing',
        'SMTP_USER missing',
        'SMTP_PASSWORD missing',
        'CONTACT_TO missing',
        'CONTACT_FROM invalid',
        'SMTP_PORT invalid',
        'SMTP_SECURE invalid',
      ],
    })
    expect(JSON.stringify(readMailConfig({ ...env, CONTACT_TO: '' }))).not.toContain(env.SMTP_PASSWORD)
  })

  it('reports an empty environment as unavailable', () => {
    expect(readMailConfig({}).ok).toBe(false)
  })
})

describe('composeContactMail', () => {
  it('sends from the authenticated mailbox to the restaurant, with the visitor in Reply-To', () => {
    expect(composeContactMail(message, config)).toMatchObject({
      from: { name: 'Site Trattoria Costantina', address: 'contact@example.fr' },
      to: 'restaurant@example.fr',
      replyTo: { name: message.name, address: 'marie@example.fr' },
      subject: `Message du site : ${message.name}`,
    })
  })

  it('produces a plain-text message only, with the visitor input left as inert text', async () => {
    const options = composeContactMail(message, config)
    expect(options.html).toBeUndefined()
    const raw = await rawMessage()
    expect(raw).toMatch(/^Content-Type: text\/plain; charset=utf-8$/m)
    expect(raw).not.toMatch(/text\/html/i)
    expect(options.text).toContain('Téléphone : non renseigné')
    expect(options.text).toContain('<script>alert(1)</script>')
  })

  it('puts the visitor address in Reply-To only, never in From, To, Cc or Bcc', async () => {
    const raw = await rawMessage()
    const headers = raw.split('\n\n')[0]
    expect(headers).toMatch(/^Reply-To: .*<marie@example\.fr>$/m)
    expect(headers).toMatch(/^From: Site Trattoria Costantina <contact@example\.fr>$/m)
    expect(headers).toMatch(/^To: restaurant@example\.fr$/m)
    expect(headers).not.toMatch(/^(Cc|Bcc):/im)
  })

  it('refuses file and URL content even if a field were ever added', () => {
    expect(composeContactMail(message, config)).toMatchObject({ disableFileAccess: true, disableUrlAccess: true })
  })
})

describe('sendContactMail', () => {
  it('hands the composed message to the injected transport', async () => {
    const sendMail = vi.fn().mockResolvedValue({})
    await expect(sendContactMail(message, { config, transport: { sendMail } })).resolves.toEqual({ ok: true })
    expect(sendMail).toHaveBeenCalledWith(composeContactMail(message, config))
  })

  it('returns only the error code on failure, never the server reply', async () => {
    const error = Object.assign(new Error('535 Authentication failed for contact@example.fr / not-a-real-password'), { code: 'EAUTH' })
    const sendMail = vi.fn().mockRejectedValue(error)
    await expect(sendContactMail(message, { config, transport: { sendMail } })).resolves.toEqual({ ok: false, code: 'EAUTH' })
    await expect(
      sendContactMail(message, { config, transport: { sendMail: vi.fn().mockRejectedValue(new Error('boom')) } }),
    ).resolves.toEqual({ ok: false, code: 'unknown error' })
  })
})
