import { ClockIcon, MailIcon, PhoneIcon, PinIcon } from '@/components/icons'

const horaires = [
  { jour: 'Mardi — Vendredi', heures: '12h – 14h30 / 19h – 23h' },
  { jour: 'Samedi', heures: '12h – 15h / 19h – 23h30' },
  { jour: 'Dimanche', heures: '12h – 14h30 / 19h – 22h30' },
]

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
                  <span>3 Rue Denis Papin<br />62110 Hénin-Beaumont, France</span>
                </div>
              </li>
              <li>
                <div className="contact-icon"><PhoneIcon /></div>
                <div>
                  <strong>Téléphone</strong>
                  <span>+33 (0)1 42 58 73 21</span>
                </div>
              </li>
              <li>
                <div className="contact-icon"><MailIcon /></div>
                <div>
                  <strong>Email</strong>
                  <span>bonjour@trattoria-costantina.fr</span>
                </div>
              </li>
            </ul>
            <div className="trouver-photos">
              <img src="/images/terrasse-1.png" alt="Notre terrasse" />
              <img src="/images/terrasse-2.png" alt="Ambiance" />
            </div>
          </div>

          <div className="horaires-card">
            <h3>
              <ClockIcon size={20} strokeWidth={1.5} />
              Horaires d&apos;ouverture
            </h3>
            <ul className="horaires">
              {horaires.map((h) => (
                <li key={h.jour}>
                  <span className="jour">{h.jour}</span>
                  <span className="heures">{h.heures}</span>
                </li>
              ))}
              <li className="ferme-row">
                <span className="jour">Lundi</span>
                <span className="heures ferme-text">Fermé</span>
              </li>
            </ul>
            <div className="horaires-note">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
              <p>Tous les plats sont préparés avec des ingrédients frais sélectionnés chaque matin au marché. Certains plats peuvent être indisponibles selon les arrivages.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
