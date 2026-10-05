// Public facts about the restaurant, as validated with the client (collection sheet of
// 29/09/2026 and the official signage cerfa). Never add a value that is not sourced.

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
  // The exact company name is not confirmed ("SARL Costantina" vs "Trattoria Constantina").
  legalForm: 'SARL',
  siret: '980 825 020 00012',
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
  'Raison sociale exacte',
  'Capital social',
  'Numéro RCS (ville du greffe)',
  'Numéro de TVA intracommunautaire',
  'Adresse du siège social (si différente de l’établissement)',
  'Directeur de la publication',
] as const
