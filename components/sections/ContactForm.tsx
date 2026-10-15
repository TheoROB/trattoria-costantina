'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { sendContact } from '@/app/contact-actions'
import { CONTACT_LIMITS, HONEYPOT_FIELD, INITIAL_CONTACT_STATE, type ContactField, type ContactState } from '@/lib/contact/fields'
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

// Works without JavaScript too: the Server Action then re-renders the page with the returned state.
export function ContactForm() {
  const [state, action, pending] = useActionState<ContactState, FormData>(sendContact, INITIAL_CONTACT_STATE)
  return (
    <form action={action} className="contact-form" aria-describedby="contact-privacy">
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

      <p id="contact-privacy" className="contact-privacy">
        Vos coordonnées et votre message sont transmis par e-mail à la {site.name}, uniquement pour répondre à votre
        demande. Ils ne sont pas enregistrés sur ce site ni utilisés à d’autres fins. Pour accéder à vos données, les
        rectifier ou les faire effacer, écrivez-nous à <a href={site.email.href}>{site.email.display}</a> (
        <Link href="/mentions-legales#donnees-personnelles">données personnelles</Link>).
      </p>

      <div role="status" aria-live="polite" className={`contact-status contact-status-${state.status}`}>
        {state.message}
      </div>

      <button type="submit" className="btn btn-primary contact-submit" disabled={pending}>
        {pending ? 'Envoi en cours…' : 'Envoyer le message'}
      </button>
    </form>
  )
}
