import { MailIcon, PhoneIcon, PinIcon } from '@/components/icons'
import { Picture } from '@/components/Picture'
import { practicalInfo, site } from '@/lib/site'

// Mirrors .trouver-grid / .trouver-photos: 2 columns of a 2-column grid inside the 1200px container.
const photoSizes = '(max-width: 640px) calc(100vw - 64px), (max-width: 900px) calc(50vw - 38px), (max-width: 1200px) calc(25vw - 34px), 266px'

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
            <div className="trouver-photos">
              <Picture
                image="trouver-facade"
                alt="Façade de la Trattoria Costantina, 3 rue Denis Papin à Hénin-Beaumont"
                sizes={photoSizes}
              />
              <Picture
                image="trouver-terrasse"
                alt="Terrasse ensoleillée avec oliviers en pot et bancs en bois"
                sizes={photoSizes}
              />
            </div>
          </div>

          <div className="horaires-card">
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
              <p>Pour connaître nos horaires ou organiser un repas de groupe, appelez-nous au <a href={site.phone.href}>{site.phone.display}</a>.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
