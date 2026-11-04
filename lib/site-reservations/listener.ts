import { DISH_ORIGIN } from '@/lib/security/headers'
import { parseDishMessage, SITE_RESERVATIONS_ENDPOINT } from './signal'

const isDishIframe = (source: MessageEventSource | null) =>
  source !== null &&
  Array.from(document.querySelectorAll<HTMLIFrameElement>(`iframe[src^="${DISH_ORIGIN}/"]`)).some((iframe) => iframe.contentWindow === source)

// Forwards reservations reported by a DISH iframe of this page. Fire and forget: never blocks or breaks the booking.
// Returns the cleanup function.
export function listenForSiteReservations() {
  const onMessage = (event: MessageEvent) => {
    if (event.origin !== DISH_ORIGIN || !isDishIframe(event.source)) return
    const reservation = parseDishMessage(event.data)
    if (!reservation) return
    fetch(SITE_RESERVATIONS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reservation),
      credentials: 'omit',
      cache: 'no-store',
      keepalive: true,
    }).catch(() => {})
  }
  window.addEventListener('message', onMessage)
  return () => window.removeEventListener('message', onMessage)
}
