import { MailIcon, PhoneIcon, PinIcon } from '@/components/icons'
import { site } from '@/lib/site'
import { DishWidget } from './DishWidget'

export function Reservation() {
  return (
    <section id="reservation" className="section-reservation">
      <div className="container">
        <div className="reservation-grid">
          <div className="reservation-info">
            <p className="supertitle supertitle-left">
              <span className="line"></span>
              Réservation
            </p>
            <h2>Réservez<br />Votre Table</h2>
            {/* TODO(client): neutral text built from sourced facts (replaces unsourced mockup claims); swap for the client's own wording if provided. */}
            <p>Réservez en ligne ou par téléphone pour partager un moment autour de notre cuisine italienne faite maison, en salle ou en terrasse.</p>
            <ul className="contact-info">
              <li>
                <PinIcon />
                <span>{site.address.street}, {site.address.postalCode} {site.address.city}, {site.address.country}</span>
              </li>
              <li>
                <PhoneIcon />
                <a href={site.phone.href}>{site.phone.display}</a>
              </li>
              <li>
                <MailIcon />
                <a href={site.email.href}>{site.email.display}</a>
              </li>
            </ul>
          </div>

          <div className="reservation-form-card">
            <h3>Réserver une table</h3>
            <DishWidget />
          </div>
        </div>
      </div>
    </section>
  )
}
