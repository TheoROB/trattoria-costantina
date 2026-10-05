'use client'

import { useEffect, useState } from 'react'

export function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const close = () => setOpen(false)

  return (
    <nav id="navbar" className={scrolled ? 'scrolled' : undefined}>
      <div className="nav-container">
        <a href="#" className="nav-logo">
          <img src="/images/logo.png" alt="Trattoria Costantina" className="nav-logo-img" />
        </a>
        <ul className={open ? 'nav-links open' : 'nav-links'}>
          <li><a href="#histoire" onClick={close}>Notre Histoire</a></li>
          <li><a href="#specialites" onClick={close}>La Carte</a></li>
          <li><a href="#reservation" onClick={close}>Réserver</a></li>
          <li><a href="#trouver" onClick={close}>Contact</a></li>
        </ul>
        <a href="#reservation" className="btn btn-primary nav-cta">Réserver</a>
        <button className="nav-toggle" aria-label="Menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <span></span><span></span><span></span>
        </button>
      </div>
    </nav>
  )
}
