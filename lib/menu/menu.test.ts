import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { MENU_CATEGORIES, isLegacyCategoryKey, isMenuCategoryKey, isStoredCategoryKey } from './categories'
import { formatPrice } from './format'
import { groupByCategory, selectPreview, type PublicMenuItem } from './menu'

const item = (over: Partial<PublicMenuItem> & Pick<PublicMenuItem, 'categoryKey'>): PublicMenuItem => ({
  id: 1,
  name: 'Item',
  description: null,
  priceCents: 1000,
  imageKey: null,
  isAvailable: true,
  ...over,
})

describe('menu categories', () => {
  it('is the closed list in the order of the printed menu', () => {
    expect(MENU_CATEGORIES.map((c) => [c.key, c.label])).toEqual([
      ['antipasti', 'Antipasti'],
      ['pates_plats', 'Pasta'],
      ['pizzas', 'Pizza Napoletana'],
      ['desserts', 'Desserts'],
      ['spritz', 'Spritz'],
      ['aperitifs', 'Apéritifs'],
      ['bieres_pression', 'Bières pression'],
      ['bieres_bouteille', 'Bières bouteille'],
      ['vins', 'Vins'],
      ['digestifs', 'Digestifs'],
      ['sans_alcool', 'Sans alcool'],
    ])
  })

  it('recognises only known keys', () => {
    expect(isMenuCategoryKey('pizzas')).toBe(true)
    expect(isMenuCategoryKey('sans_alcool')).toBe(true)
    expect(isMenuCategoryKey('Pizzas')).toBe(false)
    expect(isMenuCategoryKey('../pizzas')).toBe(false)
  })

  it('no longer offers the retired "boissons" category, but still recognises items stored in it', () => {
    expect(isMenuCategoryKey('boissons')).toBe(false)
    expect(isStoredCategoryKey('boissons')).toBe(true)
    expect(isLegacyCategoryKey('boissons')).toBe(true)
    expect(isLegacyCategoryKey('vins')).toBe(false)
    expect(isStoredCategoryKey('sushis')).toBe(false)
    expect(isLegacyCategoryKey('sushis')).toBe(false)
  })

  it('matches the database constraint of migration 0004', () => {
    const sql = fs.readFileSync('db/migrations/0004_expand_menu_categories.sql', 'utf8')
    const allowed = [...sql.matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
    expect(new Set(allowed)).toEqual(new Set([...MENU_CATEGORIES.map((c) => c.key), 'boissons']))
  })
})

describe('formatPrice', () => {
  it('formats whole euros like the mockup', () => {
    expect(formatPrice(1000)).toBe('10€')
    expect(formatPrice(600)).toBe('6€')
  })

  it('formats cents with a French decimal comma', () => {
    expect(formatPrice(1250)).toBe('12,50€')
    expect(formatPrice(1205)).toBe('12,05€')
    expect(formatPrice(50)).toBe('0,50€')
  })
})

describe('groupByCategory', () => {
  it('keeps the canonical category order and drops empty categories', () => {
    const groups = groupByCategory([
      item({ id: 1, categoryKey: 'desserts' }),
      item({ id: 2, categoryKey: 'antipasti' }),
      item({ id: 3, categoryKey: 'pizzas' }),
    ])
    expect(groups.map((g) => g.key)).toEqual(['antipasti', 'pizzas', 'desserts'])
    expect(groups[1].label).toBe('Pizza Napoletana')
  })

  it('lists items still in the retired "boissons" category after all the others', () => {
    const groups = groupByCategory([
      item({ id: 1, categoryKey: 'boissons' }),
      item({ id: 2, categoryKey: 'sans_alcool' }),
      item({ id: 3, categoryKey: 'spritz' }),
    ])
    expect(groups.map((g) => [g.key, g.label])).toEqual([['spritz', 'Spritz'], ['sans_alcool', 'Sans alcool'], ['boissons', 'Boissons']])
  })

  it('preserves the item order received from the query', () => {
    const groups = groupByCategory([
      item({ id: 5, categoryKey: 'pizzas' }),
      item({ id: 2, categoryKey: 'pizzas' }),
    ])
    expect(groups[0].items.map((i) => i.id)).toEqual([5, 2])
  })
})

describe('selectPreview', () => {
  const groups = groupByCategory([
    ...[1, 2, 3, 4, 5].map((id) => item({ id, categoryKey: 'antipasti' })),
    item({ id: 10, categoryKey: 'pates_plats' }),
    item({ id: 20, categoryKey: 'pizzas' }),
    item({ id: 30, categoryKey: 'desserts' }),
  ])

  it('always includes pizzas and keeps three categories in canonical order', () => {
    expect(selectPreview(groups).map((g) => g.key)).toEqual(['antipasti', 'pates_plats', 'pizzas'])
    const withoutPates = groups.filter((g) => g.key !== 'pates_plats')
    expect(selectPreview(withoutPates).map((g) => g.key)).toEqual(['antipasti', 'pizzas', 'desserts'])
  })

  it('limits each previewed category to four items', () => {
    expect(selectPreview(groups)[0].items.map((i) => i.id)).toEqual([1, 2, 3, 4])
  })

  it('works when there are no pizzas or no items at all', () => {
    const noPizza = groups.filter((g) => g.key !== 'pizzas')
    expect(selectPreview(noPizza).map((g) => g.key)).toEqual(['antipasti', 'pates_plats', 'desserts'])
    expect(selectPreview([])).toEqual([])
  })
})
