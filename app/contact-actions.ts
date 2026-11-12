'use server'

import { trustedClientIp } from '@/lib/auth/dal'
import { CONTACT_RECAPTCHA_ACTION, EMPTY_CONTACT_VALUES, RECAPTCHA_TOKEN_FIELD, type ContactState } from '@/lib/contact/fields'
import { readMailConfig, sendContactMail } from '@/lib/contact/mail'
import { CONTACT_MESSAGES } from '@/lib/contact/messages'
import { contactRateLimits } from '@/lib/contact/limiters'
import { readRecaptchaConfig, verifyRecaptcha } from '@/lib/contact/recaptcha'
import { parseContactForm } from '@/lib/contact/schema'

const success: ContactState = { status: 'success', message: CONTACT_MESSAGES.sent, fieldErrors: {}, values: EMPTY_CONTACT_VALUES }

// The message itself is never stored nor logged; log lines carry no personal data.
export async function sendContact(_previous: ContactState, formData: FormData): Promise<ContactState> {
  const parsed = parseContactForm(formData)
  // Same answer as a real success, so that bots learn nothing; nothing is sent nor stored.
  if (parsed.kind === 'spam') {
    console.info('[contact] spam trap filled, message dropped')
    return success
  }
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
  // Before the rate limits: rejected bots must not use up the hourly quota of real visitors.
  const recaptcha = readRecaptchaConfig()
  if (recaptcha.status === 'invalid') {
    console.error(`[contact] form disabled, reCAPTCHA configuration incomplete: ${recaptcha.problems.join(', ')}`)
    return failure(CONTACT_MESSAGES.unavailable)
  }
  if (recaptcha.status === 'disabled') {
    // Explicitly allowed (development, tests, deployments made before the keys exist): only the honeypot and the
    // rate limits protect the form. Said in production logs so that it is not forgotten.
    if (process.env.NODE_ENV === 'production') console.warn('[contact] reCAPTCHA disabled: no reCAPTCHA key configured')
  } else {
    const verdict = await verifyRecaptcha(formData.get(RECAPTCHA_TOKEN_FIELD), {
      config: recaptcha.config,
      action: CONTACT_RECAPTCHA_ACTION,
    })
    if (!verdict.ok) {
      if (verdict.outcome === 'rejected') {
        console.warn(`[contact] reCAPTCHA rejected: ${verdict.code}`)
        return failure(CONTACT_MESSAGES.spamCheckFailed)
      }
      console.error(`[contact] reCAPTCHA unavailable: ${verdict.code}`)
      return failure(CONTACT_MESSAGES.spamCheckUnavailable)
    }
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
