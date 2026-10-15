import { variantUrl } from '@/lib/media/storage'
import { formatPrice } from '@/lib/menu/format'
import type { MenuCategoryKey } from '@/lib/menu/categories'
import type { MenuCategoryGroup, PublicMenuItem } from '@/lib/menu/menu'
import { CarteBrowser } from './CarteBrowser'
import './carte.css'

// Full menu (/carte). Every category is rendered here (all of it stays in the page for search engines and
// assistive technologies); CarteBrowser shows one at a time. Dishes are compact cards with their photo when
// there is one, drinks a one-line-per-item list. The home page preview keeps MenuCategories.
const DISH_CATEGORIES: ReadonlySet<MenuCategoryKey> = new Set(['antipasti', 'pates_plats', 'pizzas', 'desserts'])

export function CarteMenu({ categories }: { categories: MenuCategoryGroup[] }) {
  return (
    <CarteBrowser
      categories={categories.map(({ key, label, items }) => ({
        key,
        label,
        content: DISH_CATEGORIES.has(key) ? (
          <ul className="menu-items carte-dishes">{items.map((item) => <Dish key={item.id} item={item} />)}</ul>
        ) : (
          <ul className="menu-items carte-drinks">{items.map((item) => <Drink key={item.id} item={item} />)}</ul>
        ),
      }))}
    />
  )
}

function Name({ item }: { item: PublicMenuItem }) {
  return (
    <span className="menu-name">
      {item.name}
      {!item.isAvailable && <span className="menu-badge">Indisponible</span>}
    </span>
  )
}

function Dish({ item }: { item: PublicMenuItem }) {
  return (
    <li className={item.isAvailable ? 'carte-dish' : 'carte-dish is-unavailable'}>
      {item.imageKey && (
        // Decorative: the dish name is right next to it.
        <img
          className="menu-thumb"
          src={variantUrl(item.imageKey, 160)}
          srcSet={`${variantUrl(item.imageKey, 160)} 160w, ${variantUrl(item.imageKey, 320)} 320w`}
          sizes="56px"
          width={56}
          height={56}
          alt=""
          loading="lazy"
          decoding="async"
        />
      )}
      <div className="carte-dish-body">
        <div className="carte-dish-head">
          <Name item={item} />
          <span className="menu-price">{formatPrice(item.priceCents)}</span>
        </div>
        {item.description && <p className="menu-desc">{item.description}</p>}
      </div>
    </li>
  )
}

// The description (often a volume: "4 cl", "Verre 12 cl") follows the name on the same line.
function Drink({ item }: { item: PublicMenuItem }) {
  return (
    <li className={item.isAvailable ? 'carte-drink' : 'carte-drink is-unavailable'}>
      <span className="carte-drink-text">
        <Name item={item} />
        {item.description && <span className="menu-desc">{item.description}</span>}
      </span>
      <span className="carte-drink-dots" aria-hidden="true" />
      <span className="menu-price">{formatPrice(item.priceCents)}</span>
    </li>
  )
}
