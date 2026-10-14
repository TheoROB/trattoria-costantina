import 'server-only'
import nodemailer, { type SendMailOptions, type Transporter } from 'nodemailer'
import { z } from 'zod'
import type { ContactMessage } from './schema'

export type MailConfig = {
  host: string
  port: number
  secure: boolean
  user: string
  password: string
  from: string
  to: string
}

export type MailConfigResult = { ok: true; config: MailConfig } | { ok: false; problems: string[] }

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])
const isEmail = (value: string) => z.email().safeParse(value).success

// Reads the SMTP settings from the environment. `problems` only names variables, never their values.
export function readMailConfig(env: Record<string, string | undefined> = process.env): MailConfigResult {
  const problems: string[] = []
  const value = (name: string) => {
    const v = env[name]?.trim() ?? ''
    if (!v) problems.push(`${name} missing`)
    return v
  }
  const host = value('SMTP_HOST')
  const user = value('SMTP_USER')
  const password = env.SMTP_PASSWORD ?? ''
  if (!password) problems.push('SMTP_PASSWORD missing')
  const from = value('CONTACT_FROM')
  const to = value('CONTACT_TO')
  if (from && !isEmail(from)) problems.push('CONTACT_FROM invalid')
  if (to && !isEmail(to)) problems.push('CONTACT_TO invalid')

  const port = Number(env.SMTP_PORT?.trim() || 465)
  if (!Number.isInteger(port) || port < 1 || port > 65535) problems.push('SMTP_PORT invalid')
  const secureSetting = env.SMTP_SECURE?.trim().toLowerCase() || (port === 465 ? 'true' : 'false')
  if (secureSetting !== 'true' && secureSetting !== 'false') problems.push('SMTP_SECURE invalid')

  if (problems.length > 0) return { ok: false, problems }
  return { ok: true, config: { host, port, secure: secureSetting === 'true', user, password, from, to } }
}

function createSmtpTransport(config: MailConfig) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    // Without implicit TLS, STARTTLS is mandatory except for a local relay (tests).
    requireTLS: !config.secure && !LOOPBACK_HOSTS.has(config.host),
    auth: { user: config.user, pass: config.password },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    logger: false,
  })
}

// Plain text only: the visitor's input is never interpreted as HTML by the mail client.
export function composeContactMail(message: ContactMessage, config: Pick<MailConfig, 'from' | 'to'>): SendMailOptions {
  const text = [
    'Nouveau message envoyé depuis le formulaire de contact du site.',
    '',
    `Nom : ${message.name}`,
    `E-mail : ${message.email}`,
    `Téléphone : ${message.phone ?? 'non renseigné'}`,
    '',
    'Message :',
    message.message,
    '',
    '--',
    `Répondez directement à cet e-mail pour écrire à ${message.name}.`,
  ].join('\n')
  return {
    // The sender is the authenticated mailbox (SPF/DKIM aligned); the visitor is only in Reply-To.
    from: { name: 'Site Trattoria Costantina', address: config.from },
    to: config.to,
    replyTo: { name: message.name, address: message.email },
    subject: `Message du site : ${message.name}`,
    text,
    disableFileAccess: true,
    disableUrlAccess: true,
  }
}

export type SendResult = { ok: true } | { ok: false; code: string }

export async function sendContactMail(
  message: ContactMessage,
  { config, transport }: { config: MailConfig; transport?: Pick<Transporter, 'sendMail'> },
): Promise<SendResult> {
  try {
    await (transport ?? createSmtpTransport(config)).sendMail(composeContactMail(message, config))
    return { ok: true }
  } catch (error) {
    // Only nodemailer's error code (e.g. EAUTH, ECONNECTION): its message may quote addresses or server replies.
    const code = (error as { code?: unknown }).code
    return { ok: false, code: typeof code === 'string' ? code : 'unknown error' }
  }
}
