'use server'

import { trustedClientIp } from '@/lib/auth/dal'
import { EMPTY_CONTACT_VALUES, type ContactState } from '@/lib/contact/fields'
import { readMailConfig, sendContactMail } from '@/lib/contact/mail'
import { CONTACT_MESSAGES } from '@/lib/contact/messages'
import { contactRateLimits } from '@/lib/contact/limiters'
import { parseContactForm } from '@/lib/contact/schema'

const success: ContactState = { status: 'success', message: CONTACT_MESSAGES.sent, fieldErrors: {}, values: EMPTY_CONTACT_VALUES }

// The message itself is never stored nor logged; log lines carry no personal data.
export async function sendContact(_previous: ContactState, formData: FormData): Promise<ContactState> {
  const parsed = parseContactForm(formData)
  // Same answer as a real success, so that bots learn nothing.
  if (parsed.kind === 'spam') return success
  if (parsed.kind === 'invalid') {
    return { status: 'error', message: CONTACT_MESSAGES.invalid, fieldErrors: parsed.fieldErrors, values: parsed.values }
  }
  const { name, email, phone, message } = parsed.data
  const failure = (text: string): ContactState => ({
    status: 'error',
    message: text,
    fieldErrors: {},
    values: { name, email, phone: phone ?? '', message },
  })

  const mailConfig = readMailConfig()
  if (!mailConfig.ok) {
    console.error(`[contact] form disabled, mail configuration incomplete: ${mailConfig.problems.join(', ')}`)
    return failure(CONTACT_MESSAGES.unavailable)
  }
  if (!contactRateLimits.allow(await trustedClientIp())) {
    console.warn('[contact] rate limit reached')
    return failure(CONTACT_MESSAGES.rateLimited)
  }
  const result = await sendContactMail(parsed.data, { config: mailConfig.config })
  if (!result.ok) {
    console.error(`[contact] send failed: ${result.code}`)
    return failure(CONTACT_MESSAGES.sendFailed)
  }
  return success
}
