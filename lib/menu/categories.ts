// Closed list of menu categories, in the order validated with the client.
export const MENU_CATEGORIES = [
  { key: 'antipasti', label: 'Antipasti' },
  { key: 'pates_plats', label: 'Pâtes & Plats' },
  { key: 'pizzas', label: 'Pizzas' },
  { key: 'desserts', label: 'Desserts' },
  { key: 'boissons', label: 'Boissons' },
] as const

export type MenuCategoryKey = (typeof MENU_CATEGORIES)[number]['key']

const keys: readonly string[] = MENU_CATEGORIES.map((c) => c.key)

export function isMenuCategoryKey(value: string): value is MenuCategoryKey {
  return keys.includes(value)
}
