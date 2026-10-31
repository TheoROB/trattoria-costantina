'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { reportReservationRequest } from '@/lib/reservation-requests/beacon'
import { createInlineDwell, isOccluded, loadedBeforeMount } from '@/lib/reservation-requests/opening'

// The inline DISH widget (home #reservation, reached by every "Réserver" link and by scrolling) counts as opened
// once its iframe has loaded and at least half of it (or half the screen when it is taller) has stayed on screen,
// uncovered (no open mobile menu, no modal), for a second in a visible tab. Before `load`, it is never counted.
// A quick scroll past does not count. It counts again only after leaving the screen entirely, then coming back.
export const DWELL_MS = 1000
const SHARE = 0.5
const THRESHOLDS = Array.from({ length: 21 }, (_, i) => i / 20)

export function InlineReservationTracker({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const iframe = ref.current?.querySelector('iframe')
    if (!iframe || !('IntersectionObserver' in window)) return
    // All state lives in this effect run: a re-render does not touch it and a remount starts afresh.
    const dwell = createInlineDwell(reportReservationRequest, DWELL_MS, {
      set: (fn, ms) => setTimeout(fn, ms),
      clear: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
    })

    const onLoad = () => dwell.update({ loaded: true })
    iframe.addEventListener('load', onLoad)
    const toggle = document.querySelector<HTMLElement>('#navbar .nav-toggle')
    // Read from the DOM the page already exposes: open <dialog>s and the menu toggle's aria-expanded.
    const overlay = () =>
      dwell.update({
        tabVisible: document.visibilityState === 'visible',
        occluded: isOccluded({
          openModal: document.querySelector('dialog[open]') !== null,
          menuExpanded: toggle?.getAttribute('aria-expanded') === 'true',
          menuToggleDisplayed: (toggle?.getClientRects().length ?? 0) > 0,
        }),
      })
    overlay()
    // Hydration can come after a fast load: the `load` event is gone, Resource Timing still has it.
    if (loadedBeforeMount(iframe.src, performance.getEntriesByType('resource') as PerformanceResourceTiming[])) onLoad()

    const observer = new IntersectionObserver(([entry]) => {
      const viewport = entry.rootBounds?.height ?? window.innerHeight
      const needed = Math.min(entry.boundingClientRect.height, viewport) * SHARE
      dwell.update({
        offScreen: !entry.isIntersecting,
        inView: entry.isIntersecting && needed > 0 && entry.intersectionRect.height >= needed - 1,
      })
    }, { threshold: THRESHOLDS })
    observer.observe(iframe)
    const mutations = new MutationObserver(overlay)
    mutations.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open', 'aria-expanded'] })
    document.addEventListener('visibilitychange', overlay)
    window.addEventListener('resize', overlay)
    return () => {
      iframe.removeEventListener('load', onLoad)
      observer.disconnect()
      mutations.disconnect()
      document.removeEventListener('visibilitychange', overlay)
      window.removeEventListener('resize', overlay)
      dwell.dispose()
    }
  }, [])

  return <div ref={ref}>{children}</div>
}
