import { describe, expect, it } from 'vitest'
import { parseContactForm } from './schema'

function form(fields: Record<string, string>) {
  const data = new FormData()
  for (const [k, v] of Object.entries(fields)) data.append(k, v)
  return data
}

const valid = {
  name: '  Marie Dupont ',
  email: ' marie@example.fr ',
  phone: '06 12 34 56 78',
  message: 'Bonjour,\r\nAvez-vous une salle pour 20 personnes ?\r\n',
  website: '',
}

describe('parseContactForm', () => {
  it('returns trimmed data with normalised line breaks', () => {
    expect(parseContactForm(form(valid))).toEqual({
      kind: 'valid',
      data: {
        name: 'Marie Dupont',
        email: 'marie@example.fr',
        phone: '06 12 34 56 78',
        message: 'Bonjour,\nAvez-vous une salle pour 20 personnes ?',
      },
    })
  })

  it('accepts a missing or empty phone number as null', () => {
    const withoutPhone: Record<string, string> = { ...valid }
    delete withoutPhone.phone
    expect(parseContactForm(form(withoutPhone))).toMatchObject({ kind: 'valid', data: { phone: null } })
    expect(parseContactForm(form({ ...valid, phone: '  ' }))).toMatchObject({ kind: 'valid', data: { phone: null } })
  })

  it('ignores the Next.js progressive-enhancement action fields', () => {
    expect(parseContactForm(form({ ...valid, $ACTION_ID_abc: '' })).kind).toBe('valid')
  })

  it('treats a filled honeypot as spam, whatever the other fields', () => {
    expect(parseContactForm(form({ ...valid, website: 'http://spam.example' }))).toEqual({ kind: 'spam' })
    expect(parseContactForm(form({ website: 'x' }))).toEqual({ kind: 'spam' })
  })

  it.each([
    ['empty name', { name: '  ' }, 'name', 'Indiquez votre nom.'],
    ['name too long', { name: 'x'.repeat(101) }, 'name', 'Le nom ne doit pas dépasser 100 caractères.'],
    ['missing email', { email: '' }, 'email', 'Indiquez votre adresse e-mail.'],
    ['malformed email', { email: 'marie@' }, 'email', 'Adresse e-mail invalide, par exemple : nom@exemple.fr'],
    ['email too long', { email: `${'a'.repeat(250)}@x.fr` }, 'email', 'Adresse e-mail trop longue.'],
    ['letters in phone', { phone: 'appelez-moi' }, 'phone', 'Numéro de téléphone invalide, par exemple : 06 12 34 56 78'],
    ['phone too long', { phone: '0'.repeat(26) }, 'phone', 'Numéro de téléphone invalide.'],
    ['empty message', { message: ' \n ' }, 'message', 'Écrivez votre message.'],
    ['short message', { message: 'Salut' }, 'message', 'Votre message est trop court (10 caractères minimum).'],
    ['message too long', { message: 'x'.repeat(4001) }, 'message', 'Votre message ne doit pas dépasser 4000 caractères.'],
    ['control character in message', { message: 'Bonjour\u0000 tout le monde' }, 'message', 'Le message contient des caractères non autorisés.'],
  ])('rejects %s with a French field error', (_label, override, field, error) => {
    expect(parseContactForm(form({ ...valid, ...override }))).toMatchObject({ kind: 'invalid', fieldErrors: { [field]: error } })
  })

  it.each([
    ['CRLF in name', { name: 'Marie\r\nBcc: victim@example.com' }, 'name'],
    ['LF in name', { name: 'Marie\nSubject: spam' }, 'name'],
    ['Unicode line separator in name', { name: 'Marie Bcc: x@example.com' }, 'name'],
    ['CRLF in email', { email: 'marie@example.fr\r\nBcc: victim@example.com' }, 'email'],
    ['several addresses in email', { email: 'marie@example.fr, victim@example.com' }, 'email'],
    ['display name in email', { email: 'Marie <marie@example.fr>' }, 'email'],
  ])('rejects header injection: %s', (_label, override, field) => {
    const result = parseContactForm(form({ ...valid, ...override }))
    expect(result.kind).toBe('invalid')
    expect(result).toHaveProperty(['fieldErrors', field])
  })

  it('keeps the typed values (cut to their limits) so that the form can show them again', () => {
    const result = parseContactForm(form({ ...valid, email: 'marie@', message: 'x'.repeat(5000) }))
    expect(result).toMatchObject({ kind: 'invalid', values: { name: valid.name, email: 'marie@', phone: valid.phone } })
    expect(result.kind === 'invalid' && result.values.message.length).toBe(4000)
  })

  it.each([
    ['unknown field', { ...valid, subject: 'x' }],
    ['missing fields', { website: '' }],
  ])('rejects %s', (_label, fields) => {
    expect(parseContactForm(form(fields)).kind).toBe('invalid')
  })

  it('rejects duplicated fields and files', () => {
    const duplicated = form(valid)
    duplicated.append('email', 'other@example.fr')
    expect(parseContactForm(duplicated)).toEqual({ kind: 'invalid', fieldErrors: {}, values: { name: '', email: '', phone: '', message: '' } })
    const withFile = form(valid)
    withFile.append('attachment', new Blob(['x']), 'x.txt')
    expect(parseContactForm(withFile).kind).toBe('invalid')
  })
})
