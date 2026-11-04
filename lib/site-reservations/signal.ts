// The DISH widget tells its parent page about a request its server took (2xx). The same message is sent whether the
// reservation is confirmed or waits for the restaurant, so the admin calls them requests (a real one was pending on
// 2026-11-04). This is what widget.body.mod.min.js sends:
//   { type: 'iFrameTrackingMessage',
//     payload: '{"event":"submit_reservation","params":{"people":"2","date":"06/11/2026","timeslot":"12:00",…}}' }
// Undocumented by DISH: anything that does not match exactly is ignored. Only these three fields are ever kept.
export type SiteReservation = { date: string; time: string; covers: number }

export const MAX_COVERS = 100
export const SITE_RESERVATIONS_ENDPOINT = '/api/site-reservations'

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const DISH_DATE = /^(\d{2})\/(\d{2})\/(\d{4})$/

function isRealDate(date: string) {
  const match = ISO_DATE.exec(date)
  if (!match) return false
  const [year, month, day] = match.slice(1).map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
}

const isCovers = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_COVERS

/** The reservation carried by a message from the widget, or null for any other message. */
export function parseDishMessage(data: unknown): SiteReservation | null {
  if (typeof data !== 'object' || data === null) return null
  const { type, payload } = data as { type?: unknown; payload?: unknown }
  if (type !== 'iFrameTrackingMessage' || typeof payload !== 'string') return null
  let parsed: { event?: unknown; params?: { people?: unknown; date?: unknown; timeslot?: unknown } } | null
  try {
    parsed = JSON.parse(payload)
  } catch {
    return null
  }
  if (parsed?.event !== 'submit_reservation' || !parsed.params) return null
  const { people, date, timeslot } = parsed.params
  if (typeof people !== 'string' || !/^\d{1,3}$/.test(people) || typeof date !== 'string' || typeof timeslot !== 'string') return null
  const dishDate = DISH_DATE.exec(date)
  if (!dishDate) return null
  return parseReservation({ date: `${dishDate[3]}-${dishDate[2]}-${dishDate[1]}`, time: timeslot, covers: Number(people) })
}

/** Strict shape of what the browser sends to the endpoint: exactly {date, time, covers}. */
export function parseReservation(value: unknown): SiteReservation | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  if (Object.keys(value).sort().join() !== 'covers,date,time') return null
  const { date, time, covers } = value as Record<string, unknown>
  if (typeof date !== 'string' || !isRealDate(date) || typeof time !== 'string' || !TIME.test(time) || !isCovers(covers)) return null
  return { date, time, covers }
}
