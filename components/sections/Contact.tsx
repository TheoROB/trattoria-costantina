import Link from 'next/link'
import { PhoneIcon } from '@/components/icons'
import { site } from '@/lib/site'
import './contact.css'

// No form: every request goes to the restaurant by phone.
export function Contact() {
  return (
    <section id="contact" className="section-contact">
      <div className="container">
        <div className="section-header">
          <p className="supertitle"><span className="line"></span>Contact<span className="line"></span></p>
          <h2>Nous contacter</h2>
        </div>
        <div className="contact-card">
          <p className="contact-lead">
            Pour toute demande (réservation, question, repas de groupe, privatisation…), contactez-nous directement
            par téléphone.
          </p>
          <ul className="contact-info-large contact-channels">
            <li>
              <div className="contact-icon"><PhoneIcon /></div>
              <div>
                <strong>Téléphone</strong>
                <span><a href={site.phone.href}>{site.phone.display}</a></span>
              </div>
            </li>
          </ul>
          <p className="contact-note">
            Vous pouvez aussi réserver une table avec la <Link href="/#reservation">réservation en ligne</Link>.
          </p>
        </div>
      </div>
    </section>
  )
}
