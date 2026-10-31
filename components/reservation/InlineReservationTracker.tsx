'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { reportReservationRequest } from '@/lib/reservation-requests/beacon'

// The inline DISH widget (home #reservation, reached by every "Réserver" link and by scrolling) counts as opened
// once at least half of it (or half the screen when it is taller) has stayed on screen for a second, in a visible
// tab. A quick scroll past does not count. It counts again only after leaving the screen entirely, then coming back.
export const DWELL_MS = 1000
const SHARE = 0.5
const THRESHOLDS = Array.from({ length: 21 }, (_, i) => i / 20)

export function InlineReservationTracker({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const wrapper = ref.current
    const target = wrapper?.querySelector('iframe') ?? wrapper
    if (!target || !('IntersectionObserver' in window)) return
    // All state lives in this effect run: a re-render does not touch it and a remount starts afresh.
    let inView = false
    let counted = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const stop = () => {
      clearTimeout(timer)
      timer = undefined
    }
    const sync = () => {
      if (inView && !counted && document.visibilityState === 'visible') {
        timer ??= setTimeout(() => {
          timer = undefined
          counted = true
          reportReservationRequest()
        }, DWELL_MS)
      } else {
        stop()
      }
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) counted = false // gone from the screen: the next appearance is a new opening
      const viewport = entry.rootBounds?.height ?? window.innerHeight
      const needed = Math.min(entry.boundingClientRect.height, viewport) * SHARE
      inView = entry.isIntersecting && needed > 0 && entry.intersectionRect.height >= needed - 1
      sync()
    }, { threshold: THRESHOLDS })
    observer.observe(target)
    document.addEventListener('visibilitychange', sync)
    return () => {
      observer.disconnect()
      document.removeEventListener('visibilitychange', sync)
      stop()
    }
  }, [])

  return <div ref={ref}>{children}</div>
}
