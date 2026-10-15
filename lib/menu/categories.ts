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

export type MenuCategoryKey = (typeof MENU_CATEGORIES)[number]['key']

const keys: readonly string[] = MENU_CATEGORIES.map((c) => c.key)

// A category that can be chosen for an item.
export function isMenuCategoryKey(value: string): value is MenuCategoryKey {
  return keys.includes(value)
}
