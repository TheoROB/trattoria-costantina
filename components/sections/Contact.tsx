import Link from 'next/link'
import { MailIcon, PhoneIcon } from '@/components/icons'
import { site } from '@/lib/site'
import './contact.css'

// No form: every request goes to the restaurant by phone or by e-mail.
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
            par téléphone ou par e-mail.
          </p>
          <ul className="contact-info-large contact-channels">
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
                <strong>E-mail</strong>
                <span><a href={site.email.href}>{site.email.display}</a></span>
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
