import { describe, expect, it } from 'vitest'
import { RECORD_ATTEMPTS, recordReservationRequest } from './store'

// The real behaviour (locks, quota across processes) is covered by tests/integration/reservation-requests.test.ts.
// These only pin down the retry and housekeeping rules with a scripted connection.
function fakePool({ hits = 1, failFirst = 0, code = 'ER_LOCK_DEADLOCK', purgeFails = false } = {}) {
  const log: string[] = []
  let failures = failFirst
  const conn = {
    beginTransaction: async () => { log.push('begin') },
    commit: async () => { log.push('commit') },
    rollback: async () => { log.push('rollback') },
    release: () => { log.push('release') },
    query: async (sql: string) => {
      const verb = sql.trim().split(/\s+/).slice(0, 3).join(' ')
      log.push(verb)
      if (sql.startsWith('SELECT UTC_TIMESTAMP')) return [[{ now: new Date('2026-10-31T12:34:56.789Z') }]]
      if (sql.startsWith('INSERT INTO reservation_request_quota') && failures > 0) {
        failures--
        throw Object.assign(new Error('lock'), { code })
      }
      if (sql.startsWith('SELECT hits')) return [[{ hits }]]
      if (sql.startsWith('DELETE') && purgeFails) throw Object.assign(new Error('purge'), { code: 'ER_LOCK_WAIT_TIMEOUT' })
      return [[]]
    },
  }
  const pool = { getConnection: async () => conn, query: async () => [[]] }
  return { pool: pool as never, log }
}

describe('recordReservationRequest', () => {
  it('tries again after a deadlock, then records once', async () => {
    const { pool, log } = fakePool({ failFirst: 2 })
    expect(await recordReservationRequest(pool, '/')).toBe('recorded')
    expect(log.filter((l) => l === 'begin')).toHaveLength(3)
    expect(log.filter((l) => l === 'commit')).toHaveLength(1)
    expect(log.filter((l) => l.startsWith('INSERT INTO reservation_request_events'))).toHaveLength(1)
    expect(log.filter((l) => l === 'release')).toHaveLength(3)
  })

  it(`gives up after ${RECORD_ATTEMPTS} attempts, and never retries other errors`, async () => {
    await expect(recordReservationRequest(fakePool({ failFirst: RECORD_ATTEMPTS }).pool, '/')).rejects.toThrow('lock')
    const other = fakePool({ failFirst: 1, code: 'ER_NO_SUCH_TABLE' })
    await expect(recordReservationRequest(other.pool, '/')).rejects.toThrow('lock')
    expect(other.log.filter((l) => l === 'begin')).toHaveLength(1)
  })

  it('purges old quota windows once per hour only, and a failed purge does not undo a recorded opening', async () => {
    const first = fakePool({ hits: 1, purgeFails: true })
    expect(await recordReservationRequest(first.pool, '/')).toBe('recorded')
    expect(first.log.indexOf('DELETE FROM reservation_request_quota')).toBeGreaterThan(first.log.indexOf('commit'))

    const later = fakePool({ hits: 7 })
    expect(await recordReservationRequest(later.pool, '/')).toBe('recorded')
    expect(later.log).not.toContain('DELETE FROM reservation_request_quota')
  })

  it('rolls back over the quota without recording', async () => {
    const { pool, log } = fakePool({ hits: 201 })
    expect(await recordReservationRequest(pool, '/')).toBe('over_quota')
    expect(log).toContain('rollback')
    expect(log).not.toContain('commit')
    expect(log.some((l) => l.startsWith('INSERT INTO reservation_request_events'))).toBe(false)
  })
})
