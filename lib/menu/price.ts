// Euros typed by the owner ("12", "12,5", "12.50") to integer cents. ASCII digits only, no exponent,
// at most 2 decimals, between 0,01 € and 1 000 € (same bounds as the menu_items CHECK constraint).
const EURO_PRICE = /^(\d{1,4})(?:[.,](\d{1,2}))?$/
export const MAX_PRICE_CENTS = 100000

export function parseEuroPrice(input: string): number | null {
  const match = EURO_PRICE.exec(input.trim())
  if (!match) return null
  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'))
  return cents >= 1 && cents <= MAX_PRICE_CENTS ? cents : null
}

// "12,50" for form inputs.
export function centsToInput(priceCents: number) {
  return `${Math.floor(priceCents / 100)},${String(priceCents % 100).padStart(2, '0')}`
}
