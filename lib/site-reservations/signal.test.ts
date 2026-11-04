import { describe, expect, it } from 'vitest'
import { parseDishMessage, parseReservation } from './signal'

const message = (params: object, event = 'submit_reservation') => ({
  type: 'iFrameTrackingMessage',
  payload: JSON.stringify({ event, params }),
})
// Recorded from the real widget.
const REAL = message({ people: '2', date: '06/11/2026', timeslot: '12:00', days: 2, duration: 'not available' })

describe('parseDishMessage', () => {
  it('keeps only the date, time and covers of the real message', () => {
    expect(parseDishMessage(REAL)).toEqual({ date: '2026-11-06', time: '12:00', covers: 2 })
  })

  it.each([
    ['nothing', undefined],
    ['a string', 'submit_reservation'],
    ['another type', { type: 'other', payload: REAL.payload }],
    ['a non-string payload', { type: 'iFrameTrackingMessage', payload: {} }],
    ['invalid JSON', { type: 'iFrameTrackingMessage', payload: '{' }],
    ['a null payload', { type: 'iFrameTrackingMessage', payload: 'null' }],
    ['another event', message({ people: '2', date: '06/11/2026', timeslot: '12:00' }, 'open')],
    ['no params', { type: 'iFrameTrackingMessage', payload: '{"event":"submit_reservation"}' }],
    ['numeric people', message({ people: 2, date: '06/11/2026', timeslot: '12:00' })],
    ['zero covers', message({ people: '0', date: '06/11/2026', timeslot: '12:00' })],
    ['too many covers', message({ people: '101', date: '06/11/2026', timeslot: '12:00' })],
    ['an impossible date', message({ people: '2', date: '31/02/2026', timeslot: '12:00' })],
    ['another date format', message({ people: '2', date: '2026-11-06', timeslot: '12:00' })],
    ['a 12-hour time', message({ people: '2', date: '06/11/2026', timeslot: '12:00 pm' })],
    ['an impossible time', message({ people: '2', date: '06/11/2026', timeslot: '24:00' })],
  ])('ignores %s', (_, data) => {
    expect(parseDishMessage(data)).toBeNull()
  })
})

describe('parseReservation', () => {
  const valid = { date: '2026-11-06', time: '19:45', covers: 4 }

  it('accepts exactly date, time and covers', () => {
    expect(parseReservation(valid)).toEqual(valid)
  })

  it.each([
    ['an extra key', { ...valid, email: 'a@b.c' }],
    ['a missing key', { date: valid.date, time: valid.time }],
    ['an array', [valid]],
    ['null', null],
    ['fractional covers', { ...valid, covers: 1.5 }],
    ['covers as text', { ...valid, covers: '4' }],
    ['an impossible date', { ...valid, date: '2026-13-01' }],
    ['a time with seconds', { ...valid, time: '19:45:00' }],
  ])('refuses %s', (_, value) => {
    expect(parseReservation(value)).toBeNull()
  })
})
