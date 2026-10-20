import 'server-only'
import { z } from 'zod'
import type { ContactMessage } from './schema'

export type MailConfig = {
  apiKey: string
  // "Name <address>" or a bare address, passed to Resend as is.
  from: string
  to: string
  endpoint: string
}

export type MailConfigResult = { ok: true; config: MailConfig } | { ok: false; problems: string[] }

const RESEND_API = 'https://api.resend.com'
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])
const SEND_TIMEOUT_MS = 10_000

const isEmail = (value: string) => z.email().safeParse(value).success
// Display name without quotes, angle brackets or control characters, so it needs no escaping.
const NAMED_ADDRESS = /^([^"<>\u0000-\u001F\u007F]+?)\s*<([^<>\s]+)>$/

function isSender(value: string) {
  const named = NAMED_ADDRESS.exec(value)
  return isEmail(named ? named[2] : value)
}

// The base URL can only be overridden towards this machine (local Resend double of the e2e tests),
// so that a stray variable can never hand the API key to another host.
function resendEndpoint(base: string | undefined) {
  if (!base) return `${RESEND_API}/emails`
  try {
    const url = new URL(base)
    if ((url.protocol === 'http:' || url.protocol === 'https:') && LOOPBACK_HOSTS.has(url.hostname)) {
      return new URL('/emails', url).href
    }
  } catch {}
  return null
}

// Reads the Resend settings from the environment. `problems` only names variables, never their values.
// The sender domain is not checked here: Resend refuses any domain it has not verified (logged as HTTP 403).
export function readMailConfig(env: Record<string, string | undefined> = process.env): MailConfigResult {
  const problems: string[] = []
  const value = (name: string) => {
    const v = env[name]?.trim() ?? ''
    if (!v) problems.push(`${name} missing`)
    return v
  }
  const apiKey = value('RESEND_API_KEY')
  const from = value('CONTACT_FROM')
  // No fallback to site.email: a forgotten CONTACT_TO disables the form instead of letting a test or
  // staging server mail the restaurant.
  const to = value('CONTACT_TO')
  if (from && !isSender(from)) problems.push('CONTACT_FROM invalid')
  if (to && !isEmail(to)) problems.push('CONTACT_TO invalid')
  const endpoint = resendEndpoint(env.RESEND_BASE_URL?.trim())
  if (!endpoint) problems.push('RESEND_BASE_URL invalid')

  if (problems.length > 0 || !endpoint) return { ok: false, problems }
  return { ok: true, config: { apiKey, from, to, endpoint } }
}

// Plain text only: the visitor's input is never interpreted as HTML by the mail client.
export function composeContactMail(message: ContactMessage, config: Pick<MailConfig, 'from' | 'to'>) {
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
    // The sender is on the domain verified at Resend (SPF/DKIM aligned); the visitor is only in Reply-To.
    from: config.from,
    to: [config.to],
    reply_to: message.email,
    subject: `Message du site : ${message.name}`,
    text,
  }
}

export type SendResult = { ok: true } | { ok: false; code: string }

// Resend error names are plain identifiers (e.g. validation_error); anything else is dropped.
async function resendErrorName(response: Response) {
  try {
    const name = (await response.json())?.name
    return typeof name === 'string' && /^[a-z_]{1,64}$/.test(name) ? name : null
  } catch {
    return null
  }
}

export async function sendContactMail(
  message: ContactMessage,
  { config, fetch = globalThis.fetch, timeoutMs = SEND_TIMEOUT_MS }: { config: MailConfig; fetch?: typeof globalThis.fetch; timeoutMs?: number },
): Promise<SendResult> {
  try {
    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        // Required by Resend (requests without it are refused).
        'User-Agent': 'trattoria-costantina-site',
      },
      body: JSON.stringify(composeContactMail(message, config)),
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store',
    })
    if (response.ok) return { ok: true }
    // Only the status and the error name: the error message may quote addresses.
    const name = await resendErrorName(response)
    return { ok: false, code: name ? `HTTP ${response.status} ${name}` : `HTTP ${response.status}` }
  } catch (error) {
    // Never the error message: it is not ours and could quote the request.
    const name = (error as { name?: unknown }).name
    return { ok: false, code: name === 'TimeoutError' ? 'timeout' : 'network error' }
  }
}
