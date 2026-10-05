import { MailIcon, PhoneIcon, PinIcon } from '@/components/icons'
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
            <p>Laissez-vous enivrer par une cuisine italienne authentique dans un cadre chaleureux et raffiné. Notre chef prépare chaque plat avec des ingrédients frais, importés directement d&apos;Italie, pour une expérience gastronomique inoubliable.</p>
            <ul className="contact-info">
              <li>
                <PinIcon />
                <span>3 Rue Denis Papin, 62110 Hénin-Beaumont, France</span>
              </li>
              <li>
                <PhoneIcon />
                <a href="tel:+33978813295">09 78 81 32 95</a>
              </li>
              <li>
                <MailIcon />
                <a href="mailto:trattoria.costantina@gmail.com">trattoria.costantina@gmail.com</a>
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
