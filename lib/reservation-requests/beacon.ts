import { isTrackedPath, RESERVATION_REQUESTS_ENDPOINT } from './paths'

// Reports one effective opening of the DISH widget. Fire and forget: never blocks or breaks the reservation.
// Only the page path (no query, no hash) is sent, without cookies.
export function reportReservationRequest() {
  const path = window.location.pathname
  if (!isTrackedPath(path)) return
  fetch(RESERVATION_REQUESTS_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
    credentials: 'omit',
    cache: 'no-store',
    keepalive: true,
  }).catch(() => {})
}
