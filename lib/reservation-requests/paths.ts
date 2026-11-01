// Public pages that can show the DISH widget (floating button everywhere, inline section on the home page).
// The only values ever stored as `path`: never a query string, a hash or anything sent by the browser as is.
// Keep in sync with chk_reservation_request_events_path (db/migrations/0006_create_reservation_request_metrics.sql).
export const TRACKED_PATHS = ['/', '/carte', '/mentions-legales'] as const
export type TrackedPath = (typeof TRACKED_PATHS)[number]

export const isTrackedPath = (value: unknown): value is TrackedPath =>
  typeof value === 'string' && (TRACKED_PATHS as readonly string[]).includes(value)

export const RESERVATION_REQUESTS_ENDPOINT = '/api/reservation-requests'
