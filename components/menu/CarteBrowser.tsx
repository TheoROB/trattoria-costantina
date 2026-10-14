'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

type Category = { key: string; label: string; content: ReactNode }

const sectionId = (key: string) => `carte-${key}`

// When the reader has scrolled down, a new category starts at the top of the menu, not mid-page.
function revealMenu(root: HTMLElement | null) {
  if (!root) return
  const navHeight = parseFloat(getComputedStyle(root).getPropertyValue('--nav-height')) || 0
  const top = root.getBoundingClientRect().top + scrollY - navHeight
  if (scrollY > top) scrollTo({ top, behavior: 'instant' })
}

// One category of /carte at a time, chosen with the sticky category bar. The choice lives in the URL hash
// (/carte#pizzas): chips are plain links, so the browser history (back/forward) and shared links just work.
// Every category stays in the page, the others are only hidden.
export function CarteBrowser({ categories }: { categories: Category[] }) {
  const [active, setActive] = useState(categories[0].key)
  const [showAll, setShowAll] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    const fromHash = () => {
      const key = decodeURIComponent(location.hash.slice(1))
      const match = categories.find((c) => c.key === key)
      setActive(match ? match.key : categories[0].key)
      return match
    }
    fromHash()
    // Clicks on chips and history navigation (back/forward).
    const onHashChange = () => {
      if (!fromHash()) return
      setShowAll(false)
      revealMenu(rootRef.current)
    }
    addEventListener('hashchange', onHashChange)
    return () => removeEventListener('hashchange', onHashChange)
  }, [categories])

  // Keeps the current chip visible when the bar scrolls sideways (phones).
  useEffect(() => {
    const list = listRef.current
    const link = list?.querySelector<HTMLElement>(`a[href="#${active}"]`)
    if (!list || !link || list.scrollWidth <= list.clientWidth) return
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
    list.scrollTo({ left: link.offsetLeft - (list.clientWidth - link.offsetWidth) / 2, behavior: reduceMotion ? 'auto' : 'smooth' })
  }, [active])

  // Also covers a click on the category already in the URL, which fires no hashchange.
  const choose = (key: string) => {
    setActive(key)
    setShowAll(false)
    revealMenu(rootRef.current)
  }

  const index = categories.findIndex((c) => c.key === active)
  const next = categories[index + 1]

  return (
    <div ref={rootRef} className={showAll ? 'carte is-all' : 'carte'}>
      <nav className="carte-nav" aria-label="Catégories de la carte">
        <ul ref={listRef} className="carte-nav-list">
          {categories.map(({ key, label }) => (
            <li key={key}>
              <a
                href={`#${key}`}
                className="carte-chip"
                aria-current={!showAll && key === active ? 'true' : undefined}
                onClick={() => choose(key)}
              >
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {categories.map(({ key, label, content }) => (
        <section
          key={key}
          id={sectionId(key)}
          className="menu-category carte-section"
          aria-labelledby={`${sectionId(key)}-title`}
          hidden={!showAll && key !== active}
        >
          <h2 id={`${sectionId(key)}-title`} className="carte-section-title">{label}</h2>
          {content}
        </section>
      ))}

      <div className="carte-footer">
        {!showAll && next && (
          <a
            href={`#${next.key}`}
            className="carte-next"
            onClick={(event) => {
              // Set the hash explicitly: once the next category is shown, this same link points one further
              // before the browser would follow it.
              event.preventDefault()
              location.hash = next.key
            }}
          >
            Catégorie suivante : {next.label} <span aria-hidden="true">→</span>
          </a>
        )}
        <button
          type="button"
          className="carte-toggle"
          onClick={() => {
            setShowAll(!showAll)
            revealMenu(rootRef.current)
          }}
        >
          {showAll ? 'Afficher une catégorie à la fois' : 'Voir toute la carte'}
        </button>
      </div>
    </div>
  )
}
