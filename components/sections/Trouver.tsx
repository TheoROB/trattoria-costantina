import { MailIcon, PhoneIcon, PinIcon } from '@/components/icons'
import { openingHours, practicalInfo, site } from '@/lib/site'
import { type GalleryPhoto, TrouverGallery } from './TrouverGallery'

const photos: GalleryPhoto[] = [
  {
    image: 'galerie-facade',
    alt: 'Façade de la Trattoria Costantina et son enseigne, 3 rue Denis Papin à Hénin-Beaumont',
    large: true,
    className: 'thumb-facade',
  },
  {
    image: 'galerie-terrasse',
    alt: 'Table pour deux sur la terrasse en bois, sous une treille de vigne, devant un mur jaune',
    large: true,
    className: 'thumb-terrasse',
  },
  { image: 'galerie-salle', alt: "Salle du restaurant : tables aux nappes vichy rouges, suspensions dorées et mur terracotta orné d'assiettes décoratives" },
  { image: 'galerie-table', alt: "Table pour deux dressée d'une nappe vichy rouge, avec corbeille de pain et huile d'olive, sur un sol en carreaux de ciment" },
  { image: 'galerie-bar', alt: 'Étagères du bar garnies de bouteilles et de verres' },
  { image: 'galerie-treille', alt: "Grappes de raisin de la treille au-dessus d'une table en bois et de jardinières de géraniums" },
  { image: 'galerie-livre', alt: 'Livre ouvert sur une voiture de sport rouge, devant des affiches italiennes encadrées' },
]

// "12:00" -> "12h", "13:30" -> "13h30"
function formatTime(time: string) {
  const [hours, minutes] = time.split(':')
  return `${Number(hours)}h${minutes === '00' ? '' : minutes}`
}

export function Trouver() {
  return (
    <section id="trouver" className="section-trouver">
      <div className="container">
        <div className="section-header">
          <p className="supertitle"><span className="line"></span>Adresse<span className="line"></span></p>
          <h2>Nous trouver</h2>
          <p className="section-subtitle">Nous partageons le sentiment de convivialité autour de notre cuisine italienne à Hénin-Beaumont</p>
        </div>
        <div className="trouver-grid">
          <div className="trouver-left">
            <ul className="contact-info-large">
              <li>
                <div className="contact-icon"><PinIcon /></div>
                <div>
                  <strong>Adresse</strong>
                  <span>{site.address.street}<br />{site.address.postalCode} {site.address.city}, {site.address.country}</span>
                </div>
              </li>
              <li>
                <div className="contact-icon"><PhoneIcon /></div>
                <div>
                  <strong>Téléphone</strong>
                  <span><a href={site.phone.href}>{site.phone.display}</a></span>
                </div>
              </li>
              <li>
                <div className="contact-icon"><MailIcon /></div>
                <div>
                  <strong>Email</strong>
                  <span><a href={site.email.href}>{site.email.display}</a></span>
                </div>
              </li>
            </ul>
            <TrouverGallery photos={photos} />
          </div>

          <div className="horaires-card">
            <h3>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
              Horaires d&apos;ouverture
            </h3>
            <ul className="horaires">
              {openingHours.map(({ day, slots }) => (
                <li key={day}>
                  <span className="jour">{day}</span>
                  {slots.length > 0 ? (
                    <span className="heures">
                      {slots.map((slot) => `${formatTime(slot.opens)} – ${formatTime(slot.closes)}`).join(' / ')}
                    </span>
                  ) : (
                    <span className="heures ferme-text">Fermé</span>
                  )}
                </li>
              ))}
            </ul>

            <h3>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
              Infos pratiques
            </h3>
            <ul className="horaires">
              {practicalInfo.map((info) => (
                <li key={info.label}>
                  <span className="jour">{info.label}</span>
                  <span className="heures">{info.value}</span>
                </li>
              ))}
            </ul>
            <div className="horaires-note">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
              <p>Pour organiser un repas de groupe ou une privatisation, appelez-nous au <a href={site.phone.href}>{site.phone.display}</a>.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
