import { variantUrl } from '@/lib/media/storage'
import { formatPrice } from '@/lib/menu/format'
import type { MenuCategoryGroup } from '@/lib/menu/menu'
import './menu.css'

export function MenuCategories({ categories, headingLevel }: { categories: MenuCategoryGroup[]; headingLevel: 'h2' | 'h3' }) {
  const Heading = headingLevel
  return (
    <div className="menu-grid">
      {categories.map((category) => (
        <div className="menu-category" key={category.key}>
          <Heading>{category.label}</Heading>
          <ul className="menu-items">
            {category.items.map((item) => (
              <li key={item.id} className={item.isAvailable ? undefined : 'is-unavailable'}>
                {item.imageKey && (
                  // Decorative: the dish name is right next to it.
                  <img
                    className="menu-thumb"
                    src={variantUrl(item.imageKey, 160)}
                    srcSet={`${variantUrl(item.imageKey, 160)} 160w, ${variantUrl(item.imageKey, 320)} 320w`}
                    sizes="64px"
                    width={64}
                    height={64}
                    alt=""
                    loading="lazy"
                    decoding="async"
                  />
                )}
                <div className="menu-item-info">
                  <span className="menu-name">
                    {item.name}
                    {!item.isAvailable && <span className="menu-badge">Indisponible</span>}
                  </span>
                  {item.description && <span className="menu-desc">{item.description}</span>}
                </div>
                <span className="menu-price">{formatPrice(item.priceCents)}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

export function MenuStatus({ unavailable }: { unavailable: boolean }) {
  return (
    <p className="section-subtitle menu-status">
      {unavailable
        ? 'Notre carte est momentanément indisponible en ligne.'
        : 'Notre carte sera très bientôt disponible en ligne.'}
    </p>
  )
}
