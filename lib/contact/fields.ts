// Shared by the form (HTML limits) and the server validation (lib/contact/schema.ts).
export const CONTACT_LIMITS = {
  name: 100,
  email: 254,
  phone: 25,
  messageMin: 10,
  message: 4000,
} as const

export type ContactField = 'name' | 'email' | 'phone' | 'message'

export type ContactValues = Record<ContactField, string>

// Spam trap: hidden from humans and assistive technologies, filled by naive bots.
export const HONEYPOT_FIELD = 'website'

export type ContactState = {
  status: 'idle' | 'success' | 'error'
  message: string | null
  fieldErrors: Partial<Record<ContactField, string>>
  // Echoed back so that the form keeps what the visitor typed after an error (also without JavaScript).
  values: ContactValues
}

export const EMPTY_CONTACT_VALUES: ContactValues = { name: '', email: '', phone: '', message: '' }

export const INITIAL_CONTACT_STATE: ContactState = { status: 'idle', message: null, fieldErrors: {}, values: EMPTY_CONTACT_VALUES }
