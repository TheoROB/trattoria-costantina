// Closed list of menu categories, in the order of the restaurant's printed menu.
export const MENU_CATEGORIES = [
  { key: 'antipasti', label: 'Antipasti' },
  { key: 'pates_plats', label: 'Pasta' },
  { key: 'pizzas', label: 'Pizza Napoletana' },
  { key: 'desserts', label: 'Desserts' },
  { key: 'spritz', label: 'Spritz' },
  { key: 'aperitifs', label: 'Apéritifs' },
  { key: 'bieres_pression', label: 'Bières pression' },
  { key: 'bieres_bouteille', label: 'Bières bouteille' },
  { key: 'vins', label: 'Vins' },
  { key: 'digestifs', label: 'Digestifs' },
  { key: 'sans_alcool', label: 'Sans alcool' },
] as const

// Retired categories: still accepted by the database so that existing items survive, listed (after the others)
// only while they hold items, never offered for a new or edited item. `npm run menu:recategorize` moves them.
export const LEGACY_MENU_CATEGORIES = [{ key: 'boissons', label: 'Boissons' }] as const

export type MenuCategoryKey = (typeof MENU_CATEGORIES)[number]['key']
export type LegacyMenuCategoryKey = (typeof LEGACY_MENU_CATEGORIES)[number]['key']
export type StoredCategoryKey = MenuCategoryKey | LegacyMenuCategoryKey

export const STORED_CATEGORIES: readonly { key: StoredCategoryKey; label: string }[] = [...MENU_CATEGORIES, ...LEGACY_MENU_CATEGORIES]

const keys: readonly string[] = MENU_CATEGORIES.map((c) => c.key)
const storedKeys: readonly string[] = STORED_CATEGORIES.map((c) => c.key)

// A category that can be chosen for an item.
export function isMenuCategoryKey(value: string): value is MenuCategoryKey {
  return keys.includes(value)
}

// A category an existing item may still be in.
export function isStoredCategoryKey(value: string): value is StoredCategoryKey {
  return storedKeys.includes(value)
}

export function isLegacyCategoryKey(value: string): value is LegacyMenuCategoryKey {
  return isStoredCategoryKey(value) && !isMenuCategoryKey(value)
}
