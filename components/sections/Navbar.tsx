'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Picture } from '@/components/Picture'

/** `solid` keeps the scrolled (opaque) style on pages without a dark hero, e.g. /mentions-legales. */
export function Navbar({ solid = false }: { solid?: boolean }) {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const close = () => setOpen(false)

  return (
    <nav id="navbar" className={solid || scrolled ? 'scrolled' : undefined}>
      <div className="nav-container">
        <Link href="/" className="nav-logo">
          <Picture image="logo" alt="Trattoria Costantina" sizes="156px" className="nav-logo-img" loading="eager" />
        </Link>
        <ul className={open ? 'nav-links open' : 'nav-links'}>
          <li><Link href="/#histoire" onClick={close}>Notre Histoire</Link></li>
          <li><Link href="/#specialites" onClick={close}>La Carte</Link></li>
          <li><Link href="/#reservation" onClick={close}>Réserver</Link></li>
          <li><Link href="/#trouver" onClick={close}>Contact</Link></li>
        </ul>
        <Link href="/#reservation" className="btn btn-primary nav-cta">Réserver</Link>
        <button className="nav-toggle" aria-label="Menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <span></span><span></span><span></span>
        </button>
      </div>
    </nav>
  )
}
