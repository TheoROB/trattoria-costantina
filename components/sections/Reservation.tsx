import { MailIcon, PhoneIcon, PinIcon } from '@/components/icons'
import { ReservationForm } from './ReservationForm'

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
            <p>Laissez-vous enivrer par une cuisine italienne authentique dans un cadre chaleureux et raffiné. Notre chef prépare chaque plat avec des ingrédients frais, importés directement d&apos;Italie, pour une expérience gastronomique inoubliable.</p>
            <ul className="contact-info">
              <li>
                <PinIcon />
                <span>3 Rue Denis Papin, 62110 Hénin-Beaumont, France</span>
              </li>
              <li>
                <PhoneIcon />
                <span>+33 (0)1 42 58 73 21</span>
              </li>
              <li>
                <MailIcon />
                <span>bonjour@trattoria-costantina.fr</span>
              </li>
            </ul>
          </div>

          <div className="reservation-form-card">
            <h3>Réserver une table</h3>
            <p className="form-subtitle">Choisissez votre date ci-dessous</p>
            <ReservationForm />
          </div>
        </div>
      </div>
    </section>
  )
}
