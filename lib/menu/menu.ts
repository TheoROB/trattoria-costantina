import { MENU_CATEGORIES, type MenuCategoryKey } from './categories'

export type PublicMenuItem = {
  id: number
  categoryKey: MenuCategoryKey
  name: string
  description: string | null
  priceCents: number
  isAvailable: boolean
}

export type MenuCategoryGroup = {
  key: MenuCategoryKey
  label: string
  items: PublicMenuItem[]
}

const PREVIEW_CATEGORY_COUNT = 3
const PREVIEW_ITEMS_PER_CATEGORY = 4

export function groupByCategory(items: PublicMenuItem[]): MenuCategoryGroup[] {
  return MENU_CATEGORIES.map(({ key, label }) => ({
    key,
    label,
    items: items.filter((item) => item.categoryKey === key),
  })).filter((group) => group.items.length > 0)
}

// Home page preview: pizzas are the house speciality, so they are always shown when present.
export function selectPreview(groups: MenuCategoryGroup[]): MenuCategoryGroup[] {
  const pizzas = groups.find((g) => g.key === 'pizzas')
  const others = groups.filter((g) => g.key !== 'pizzas')
  const picked = pizzas
    ? [pizzas, ...others.slice(0, PREVIEW_CATEGORY_COUNT - 1)]
    : others.slice(0, PREVIEW_CATEGORY_COUNT)
  return groups
    .filter((g) => picked.includes(g))
    .map((g) => ({ ...g, items: g.items.slice(0, PREVIEW_ITEMS_PER_CATEGORY) }))
}
