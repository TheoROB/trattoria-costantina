'use client'

import Link from 'next/link'
import Script from 'next/script'
import { useActionState, useRef, useState, type FormEvent } from 'react'
import { sendContact } from '@/app/contact-actions'
import {
  CONTACT_LIMITS,
  CONTACT_RECAPTCHA_ACTION,
  HONEYPOT_FIELD,
  INITIAL_CONTACT_STATE,
  RECAPTCHA_TOKEN_FIELD,
  type ContactField,
  type ContactState,
} from '@/lib/contact/fields'
import { getRecaptchaToken, RECAPTCHA_SITE_KEY, recaptchaScriptUrl } from '@/lib/contact/recaptcha-client'
import { site } from '@/lib/site'
import './contact.css'

type FieldProps = {
  field: ContactField
  label: string
  state: ContactState
  optional?: boolean
  children: (props: {
    id: string
    name: ContactField
    defaultValue: string
    'aria-invalid': true | undefined
    'aria-describedby': string | undefined
  }) => React.ReactNode
}

function Field({ field, label, state, optional, children }: FieldProps) {
  const id = `contact-${field}`
  const error = state.fieldErrors[field]
  return (
    <div className="contact-field">
      <label htmlFor={id}>
        {label}
        {optional && <span className="contact-optional"> (facultatif)</span>}
      </label>
      {children({
        id,
        name: field,
        defaultValue: state.values[field],
        'aria-invalid': error ? true : undefined,
        'aria-describedby': error ? `${id}-error` : undefined,
      })}
      {error && <p id={`${id}-error`} className="contact-field-error">{error}</p>}
    </div>
  )
}

// Works without JavaScript too: the Server Action then re-renders the page with the returned state (with reCAPTCHA
// configured, such a submission has no token and is refused with a "call us" message after field validation).
export function ContactForm({ nonce }: { nonce?: string }) {
  const [state, action, pending] = useActionState<ContactState, FormData>(sendContact, INITIAL_CONTACT_STATE)
  const [verifying, setVerifying] = useState(false)
  const tokenReady = useRef(false)

  // With reCAPTCHA, the first submit event is held while a fresh token is fetched, then the form is submitted again
  // with the token in its hidden field: React still runs the action natively (pending state, form reset).
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    const siteKey = RECAPTCHA_SITE_KEY
    if (!siteKey) return
    if (tokenReady.current) {
      tokenReady.current = false
      return
    }
    event.preventDefault()
    if (verifying) return
    const form = event.currentTarget
    setVerifying(true)
    void getRecaptchaToken(siteKey, CONTACT_RECAPTCHA_ACTION).then((token) => {
      const field = form.elements.namedItem(RECAPTCHA_TOKEN_FIELD)
      if (field instanceof HTMLInputElement) field.value = token
      tokenReady.current = true
      // Dispatches the submit event synchronously; reset afterwards in case the browser validation stopped it.
      form.requestSubmit()
      tokenReady.current = false
      setVerifying(false)
    })
  }

  const busy = pending || verifying
  return (
    <form action={action} onSubmit={onSubmit} className="contact-form" aria-describedby="contact-privacy">
      <div className="contact-row">
        <Field field="name" label="Nom" state={state}>
          {(props) => <input {...props} type="text" autoComplete="name" required maxLength={CONTACT_LIMITS.name} />}
        </Field>
        <Field field="email" label="E-mail" state={state}>
          {(props) => <input {...props} type="email" autoComplete="email" required maxLength={CONTACT_LIMITS.email} />}
        </Field>
      </div>
      <Field field="phone" label="Téléphone" state={state} optional>
        {(props) => <input {...props} type="tel" autoComplete="tel" maxLength={CONTACT_LIMITS.phone} />}
      </Field>
      <Field field="message" label="Message" state={state}>
        {(props) => (
          <textarea {...props} rows={6} required minLength={CONTACT_LIMITS.messageMin} maxLength={CONTACT_LIMITS.message} />
        )}
      </Field>

      {/* Spam trap: invisible, unreachable with the keyboard and ignored by screen readers. */}
      <div className="contact-hp" aria-hidden="true">
        <label htmlFor={`contact-${HONEYPOT_FIELD}`}>Ne pas remplir ce champ</label>
        <input id={`contact-${HONEYPOT_FIELD}`} type="text" name={HONEYPOT_FIELD} tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>

      {RECAPTCHA_SITE_KEY && (
        <>
          <input type="hidden" name={RECAPTCHA_TOKEN_FIELD} defaultValue="" />
          {/* Only on pages with this form; loaded once the page is idle, the token is requested at submit time. */}
          <Script src={recaptchaScriptUrl(RECAPTCHA_SITE_KEY)} strategy="lazyOnload" nonce={nonce} />
        </>
      )}

      <p id="contact-privacy" className="contact-privacy">
        Vos coordonnées et votre message sont transmis par e-mail à la {site.name}, uniquement pour répondre à votre
        demande. Ils ne sont pas enregistrés sur ce site ni utilisés à d’autres fins. Pour accéder à vos données, les
        rectifier ou les faire effacer, écrivez-nous à <a href={site.email.href}>{site.email.display}</a> (
        <Link href="/mentions-legales#donnees-personnelles">données personnelles</Link>).
      </p>
      {/* Required by Google when the reCAPTCHA badge is hidden (contact.css). */}
      {RECAPTCHA_SITE_KEY && (
        <p className="contact-privacy contact-recaptcha">
          Ce site est protégé par reCAPTCHA et les{' '}
          <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Règles de confidentialité</a> et{' '}
          <a href="https://policies.google.com/terms" target="_blank" rel="noopener noreferrer">Conditions d’utilisation</a> de
          Google s’appliquent.
        </p>
      )}

      <div role="status" aria-live="polite" className={`contact-status contact-status-${state.status}`}>
        {state.message}
      </div>

      <button type="submit" className="btn btn-primary contact-submit" disabled={busy}>
        {busy ? 'Envoi en cours…' : 'Envoyer le message'}
      </button>
    </form>
  )
}
