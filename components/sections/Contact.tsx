import Link from 'next/link'
import { ContactForm } from './ContactForm'

export function Contact() {
  return (
    <section id="contact" className="section-contact">
      <div className="container">
        <div className="section-header">
          <p className="supertitle"><span className="line"></span>Contact<span className="line"></span></p>
          <h2>Nous écrire</h2>
          <p className="section-subtitle">
            Une question, un repas de groupe, une privatisation ? Écrivez-nous. Pour réserver une table, passez
            plutôt par la <Link href="/#reservation">réservation en ligne</Link>.
          </p>
        </div>
        <div className="contact-card">
          <ContactForm />
        </div>
      </div>
    </section>
  )
}
