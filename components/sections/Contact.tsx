import { headers } from 'next/headers'
import Link from 'next/link'
import { ContactForm } from './ContactForm'

export async function Contact() {
  // Per-request CSP nonce set by proxy.ts, for the reCAPTCHA script of the form.
  const nonce = (await headers()).get('x-nonce') ?? undefined
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
          <ContactForm nonce={nonce} />
        </div>
      </div>
    </section>
  )
}
