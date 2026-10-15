// Public facts about the restaurant, as validated with the client (collection sheet of
// 29/09/2026, the official signage cerfa, then the company's legal details and opening hours).
// Never add a value that is not sourced.

export const site = {
  name: 'Trattoria Costantina',
  address: {
    street: '3 rue Denis Papin',
    postalCode: '62110',
    city: 'Hénin-Beaumont',
    country: 'France',
  },
  phone: { display: '09 78 81 32 95', href: 'tel:+33978813295' },
  email: { display: 'trattoria.costantina@gmail.com', href: 'mailto:trattoria.costantina@gmail.com' },
  manager: 'Julien Panfilo',
  // Publisher of the site; "Trattoria Costantina" is its trade name. The registered office is the
  // restaurant address above.
  company: {
    name: 'COSTANTINA',
    legalForm: 'SARL',
    capital: '2 000 €',
    siren: '980 825 020',
    siret: '980 825 020 00012',
    vatNumber: 'FR54980825020',
    rcs: '980 825 020 R.C.S. Arras',
  },
  openingDate: '2024-02-05',
  social: {
    // Facebook page exists but its URL is unknown; Instagram is pending; no TikTok.
    instagram: null as string | null,
    facebook: null as string | null,
  },
  host: {
    name: 'Hostinger',
    // Contracting entity for EU customers, per hostinger.com/legal/universal-terms-of-service-agreement.
    company: 'Hostinger International Limited',
    address: '61 Lordou Vironos str., 6023 Larnaca, Chypre',
  },
} as const

// Opening hours from Monday, in the 24-hour "HH:MM" format of schema.org. No slot means closed.
export const openingHours = [
  { day: 'Lundi', dayOfWeek: 'Monday', slots: [{ opens: '12:00', closes: '13:30' }] },
  { day: 'Mardi', dayOfWeek: 'Tuesday', slots: [{ opens: '12:00', closes: '13:30' }] },
  { day: 'Mercredi', dayOfWeek: 'Wednesday', slots: [{ opens: '12:00', closes: '13:30' }] },
  { day: 'Jeudi', dayOfWeek: 'Thursday', slots: [{ opens: '12:00', closes: '13:30' }, { opens: '19:00', closes: '21:30' }] },
  { day: 'Vendredi', dayOfWeek: 'Friday', slots: [{ opens: '12:00', closes: '13:30' }, { opens: '19:00', closes: '21:30' }] },
  { day: 'Samedi', dayOfWeek: 'Saturday', slots: [{ opens: '19:00', closes: '21:30' }] },
  { day: 'Dimanche', dayOfWeek: 'Sunday', slots: [] },
] as const satisfies readonly { day: string; dayOfWeek: string; slots: readonly { opens: string; closes: string }[] }[]

export const practicalInfo = [
  { label: 'Service', value: 'Sur place uniquement' },
  { label: 'Capacité', value: '35 places en salle, 20 en terrasse' },
  { label: 'Accès PMR', value: 'Oui' },
  { label: 'Stationnement', value: 'Oui' },
  { label: 'Groupes & privatisation', value: 'Sur demande' },
  { label: 'Animaux', value: 'Acceptés' },
] as const

// Legal notice fields still to be provided by the client (not displayed until confirmed).
export const missingLegalInfo = [
  'Directeur de la publication',
] as const
