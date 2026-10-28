'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

// Native lazy loading fetches this background several screens early. Keep its
// fixed-size container, but mount the picture only near the viewport.
export function FamilleImage({ children }: { children: ReactNode }) {
  const container = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!('IntersectionObserver' in window)) {
      const timer = setTimeout(() => setReady(true), 0)
      return () => clearTimeout(timer)
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setReady(true)
        observer.disconnect()
      }
    }, { rootMargin: '400px' })
    if (container.current) observer.observe(container.current)
    return () => observer.disconnect()
  }, [])

  return (
    <div className="famille-bg" ref={container}>
      {ready && children}
      <noscript>{children}</noscript>
      <div className="famille-overlay"></div>
    </div>
  )
}
