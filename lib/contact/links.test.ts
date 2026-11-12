import { describe, expect, it } from 'vitest'
import { containsLink } from './links'

describe('containsLink', () => {
  it.each([
    // The phishing message received through the live site.
    'Découvrez votre fiche : https://onpartage.online/fr/med/trattoriacostantina',
    'onpartage.online/fr/med/trattoriacostantina',
    'Voir onpartage.online',
    'http://203.0.113.7/promo',
    'HTTPS://EXAMPLE.COM',
    'www.exemple-site.fr',
    'rendez-vous sur WWW.promo.io pour en savoir plus',
    'example.com',
    'sub.domain.example.net.',
    'bit.ly/abc123',
    'notre avis sur (google.com)',
    'Lien : tinyurl.com/xyz',
    'mon-site.shop, merci',
  ])('flags %j', (text) => {
    expect(containsLink(text)).toBe(true)
  })

  it.each([
    'Bonjour, une table pour 6 pers. samedi à 18h30 ?',
    'Le menu à 12.50 est-il servi le soir ? Et celui à 24,90 € ?',
    'Rappelez-moi au 06.12.34.56.78 ou au +33 6 12 34 56 78.',
    'Nous serons env. 20, avec poussettes, chaises hautes, etc. Merci !',
    'Écrivez-moi à marie.dupont@exemple.fr si besoin.',
    'Vers 19h, M. et Mme Dupont, cf. notre échange, p.ex. le 12/12.',
    'Est-ce possible.De plus, avez-vous une terrasse ?',
    'Pour la table.Ca serait parfait.',
    'Un repas de groupe (20-25 pers.) en déc. ou janv. 2027.',
    'Marie-Hélène O.',
    'Restaurant top.',
    'La pizza 4 fromages, v.o. sans gluten ?',
  ])('accepts %j', (text) => {
    expect(containsLink(text)).toBe(false)
  })
})
