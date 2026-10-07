import { describe, expect, it } from 'vitest'
import { MENU_CATEGORIES, isMenuCategoryKey } from './categories'
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
  it('is the closed list in the client order', () => {
    expect(MENU_CATEGORIES.map((c) => c.key)).toEqual(['antipasti', 'pates_plats', 'pizzas', 'desserts', 'boissons'])
  })

  it('recognises only known keys', () => {
    expect(isMenuCategoryKey('pizzas')).toBe(true)
    expect(isMenuCategoryKey('Pizzas')).toBe(false)
    expect(isMenuCategoryKey('../pizzas')).toBe(false)
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
    expect(groups[1].label).toBe('Pizzas')
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
