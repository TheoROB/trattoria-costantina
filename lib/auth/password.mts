// Argon2id password hashing with @node-rs/argon2 (prebuilt binaries; Hostinger runs Node 24.6, which
// lacks node:crypto.argon2), PHC string format.
// Plain .mts without `server-only` so that scripts/admin-user.mts can import it.
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { hashRaw } from '@node-rs/argon2'

// OWASP Password Storage Cheat Sheet, Argon2id minimum configuration.
const PARAMS = { memory: 19456, passes: 2, parallelism: 1, tagLength: 32 }
const SALT_BYTES = 16
const PHC = /^\$argon2id\$v=19\$m=(\d{1,6}),t=(\d{1,2}),p=(\d{1,2})\$([A-Za-z0-9+/]{22})\$([A-Za-z0-9+/]{43})$/

// Upper bounds on parameters read back from the database, so a tampered hash cannot exhaust memory/CPU.
const MAX = { memory: 65536, passes: 10, parallelism: 4 }

// Algorithm.Argon2id is a const enum (not usable with isolatedModules): its value is 2.
const ARGON2ID = 2

function derive(password: string, salt: Buffer, params: typeof PARAMS) {
  return hashRaw(password.normalize('NFC'), {
    algorithm: ARGON2ID,
    salt,
    memoryCost: params.memory,
    timeCost: params.passes,
    parallelism: params.parallelism,
    outputLen: params.tagLength,
  })
}

const b64 = (buffer: Buffer) => buffer.toString('base64').replace(/=+$/, '')

export async function hashPassword(password: string) {
  const salt = randomBytes(SALT_BYTES)
  const key = await derive(password, salt, PARAMS)
  const { memory, passes, parallelism } = PARAMS
  return `$argon2id$v=19$m=${memory},t=${passes},p=${parallelism}$${b64(salt)}$${b64(key)}`
}

export async function verifyPassword(password: string, phc: string) {
  const match = PHC.exec(phc)
  if (!match) return false
  const [memory, passes, parallelism] = match.slice(1, 4).map(Number)
  if (memory > MAX.memory || passes > MAX.passes || parallelism > MAX.parallelism) return false
  const expected = Buffer.from(match[5], 'base64')
  try {
    const key = await derive(password, Buffer.from(match[4], 'base64'), { memory, passes, parallelism, tagLength: expected.length })
    return timingSafeEqual(key, expected)
  } catch {
    return false
  }
}
