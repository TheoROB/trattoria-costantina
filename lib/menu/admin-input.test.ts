import { describe, expect, it } from 'vitest'
import { parseItemId, parseMenuItemForm } from './admin-input'

function form(fields: Record<string, string>) {
  const data = new FormData()
  for (const [k, v] of Object.entries(fields)) data.append(k, v)
  return data
}

const valid = { category: 'pizzas', name: '  Margherita ', description: 'Tomate, mozzarella', price: '11,50' }

describe('parseMenuItemForm', () => {
  it('parses a valid form into a clean item', () => {
    expect(parseMenuItemForm(form({ ...valid, isAvailable: 'on', isVisible: 'on' }))).toEqual({
      ok: true,
      data: { categoryKey: 'pizzas', name: 'Margherita', description: 'Tomate, mozzarella', priceCents: 1150, isAvailable: true, isVisible: true },
    })
  })

  it('reads missing checkboxes as false and an empty description as null', () => {
    const result = parseMenuItemForm(form({ ...valid, description: '   ' }))
    expect(result).toMatchObject({ ok: true, data: { description: null, isAvailable: false, isVisible: false } })
  })

  it('ignores the Next.js progressive-enhancement action fields', () => {
    expect(parseMenuItemForm(form({ ...valid, $ACTION_ID_abc: '', $ACTION_KEY: 'k1' })).ok).toBe(true)
  })

  it.each([
    ['unknown field', { ...valid, price_cents: '1' }],
    ['mass assignment of id', { ...valid, id: '3' }],
    ['image key', { ...valid, image_key: 'abcdefabcdefabcdef' }],
    ['position', { ...valid, position: '0' }],
    ['unknown category', { ...valid, category: 'secret' }],
    ['empty name', { ...valid, name: '   ' }],
    ['name too long', { ...valid, name: 'x'.repeat(81) }],
    ['description too long', { ...valid, description: 'x'.repeat(401) }],
    ['control character', { ...valid, name: 'Pizza\u0000' }],
    ['invalid price', { ...valid, price: '1e3' }],
    ['missing price', { category: 'pizzas', name: 'X' }],
    ['checkbox with odd value', { ...valid, isVisible: 'true' }],
    ['duplicated field', { ...valid }],
  ])('rejects %s', (label, fields) => {
    const data = form(fields)
    if (label === 'duplicated field') data.append('name', 'Other')
    expect(parseMenuItemForm(data).ok).toBe(false)
  })

  it('accepts line breaks in the description', () => {
    expect(parseMenuItemForm(form({ ...valid, description: 'Ligne 1\r\nLigne 2' }))).toMatchObject({ ok: true })
  })

  it('rejects file uploads', () => {
    const data = form(valid)
    data.append('photo', new Blob(['x']), 'x.png')
    expect(parseMenuItemForm(data).ok).toBe(false)
  })
})

describe('parseItemId', () => {
  it.each([['1', 1], ['42', 42], ['4294967295', 4294967295]])('accepts %j', (input, id) => {
    expect(parseItemId(input)).toBe(id)
  })
  it.each(['', '0', '-1', '01', '1.5', 'abc', '4294967296', '1e3', null])('rejects %j', (input) => {
    expect(parseItemId(input)).toBeNull()
  })
})
