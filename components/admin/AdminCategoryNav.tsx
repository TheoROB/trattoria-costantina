'use client'

import Link from 'next/link'
import { useEffect, useRef } from 'react'

type Category = { key: string; label: string; count: number }

// Category tabs of the admin menu, one row that scrolls sideways when it does not fit; the current one is
// kept in view.
export function AdminCategoryNav({ categories, active }: { categories: Category[]; active: string }) {
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    const list = listRef.current
    const link = list?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!list || !link || list.scrollWidth <= list.clientWidth) return
    list.scrollLeft = link.offsetLeft - (list.clientWidth - link.offsetWidth) / 2
  }, [active])

  return (
    <nav className="admin-tabs" aria-label="Sections de la carte">
      <ul ref={listRef}>
        {categories.map(({ key, label, count }) => (
          <li key={key}>
            <Link href={`/admin?categorie=${key}`} className="admin-tab" aria-current={key === active ? 'page' : undefined}>
              {label} <span className="admin-tab-count">· {count}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
