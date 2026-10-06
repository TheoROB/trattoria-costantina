// Mockup style: "10€", "12,50€".
export function formatPrice(priceCents: number) {
  const euros = Math.floor(priceCents / 100)
  const cents = priceCents % 100
  return cents === 0 ? `${euros}€` : `${euros},${String(cents).padStart(2, '0')}€`
}
