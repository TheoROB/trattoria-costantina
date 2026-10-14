import { describe, expect, it } from 'vitest'
import { createRateLimiter } from './rate-limit'

function clock(start = 0) {
  let time = start
  return { now: () => time, advance: (ms: number) => (time += ms) }
}

describe('createRateLimiter', () => {
  it('allows up to the limit within the window, then refuses', () => {
    const c = clock()
    const limiter = createRateLimiter({ limit: 3, windowMs: 1000, now: c.now })
    expect([limiter.take('a'), limiter.take('a'), limiter.take('a'), limiter.take('a')]).toEqual([true, true, true, false])
  })

  it('counts each key separately', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now: clock().now })
    expect(limiter.take('a')).toBe(true)
    expect(limiter.take('b')).toBe(true)
    expect(limiter.take('a')).toBe(false)
  })

  it('allows again once the oldest attempts leave the window', () => {
    const c = clock()
    const limiter = createRateLimiter({ limit: 2, windowMs: 1000, now: c.now })
    limiter.take('a')
    c.advance(600)
    limiter.take('a')
    expect(limiter.take('a')).toBe(false)
    c.advance(401)
    expect(limiter.take('a')).toBe(true)
    expect(limiter.take('a')).toBe(false)
  })

  it('refused attempts do not extend the block', () => {
    const c = clock()
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now: c.now })
    limiter.take('a')
    c.advance(900)
    expect(limiter.take('a')).toBe(false)
    c.advance(101)
    expect(limiter.take('a')).toBe(true)
  })

  it('keeps memory bounded by forgetting the least recently used keys', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000, maxKeys: 2, now: clock().now })
    limiter.take('a')
    limiter.take('b')
    limiter.take('c')
    // "a" was evicted, so it is allowed again; "c" is still tracked.
    expect(limiter.take('a')).toBe(true)
    expect(limiter.take('c')).toBe(false)
  })
})
