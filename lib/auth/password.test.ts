import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from './password.mts'

describe('password hashing (Argon2id)', () => {
  it('produces a PHC string with the OWASP parameters and a random salt', async () => {
    const a = await hashPassword('correct horse battery staple')
    const b = await hashPassword('correct horse battery staple')
    expect(a).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$/)
    expect(a).not.toBe(b)
  })

  it('verifies the right password and rejects a wrong one', async () => {
    const hash = await hashPassword('correct horse battery staple')
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true)
    expect(await verifyPassword('correct horse battery stapl', hash)).toBe(false)
    expect(await verifyPassword('', hash)).toBe(false)
  })

  it('treats canonically equivalent Unicode passwords as equal', async () => {
    const hash = await hashPassword('café-pass-phrase')
    expect(await verifyPassword('café-pass-phrase', hash)).toBe(true)
  })

  it('returns false (never throws) for malformed or unsupported hashes', async () => {
    const hash = await hashPassword('pass-phrase-123')
    for (const bad of [
      '',
      'plaintext',
      hash.replace('argon2id', 'argon2i'),
      hash.replace('v=19', 'v=16'),
      hash.replace('m=19456', 'm=99999999'),
      hash.replace('t=2', 't=1000'),
      hash.slice(0, -5),
    ]) {
      expect(await verifyPassword('pass-phrase-123', bad), bad).toBe(false)
    }
  })
})
