import Link from 'next/link'
import { Picture } from '@/components/Picture'
import { site } from '@/lib/site'

export function Footer() {
  const { instagram, facebook } = site.social

  return (
    <footer className="footer">
      <div className="footer-quote">
        « Une cuisine italienne faite maison, et avec amour »
      </div>
      <div className="footer-main container">
        <div className="footer-brand">
          <Picture image="logo" alt="Trattoria Costantina" sizes="80px" className="footer-logo-img" />
          <p>Cuisine italienne faite maison à Hénin-Beaumont, en hommage à Nonna Costantina et à la cuisine des Pouilles.</p>
          {(instagram || facebook) && (
            <div className="social-links">
              {instagram && (
                <a href={instagram} aria-label="Instagram" target="_blank" rel="noopener noreferrer">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="2" width="20" height="20" rx="5" /><path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37z" /><line x1="17.5" y1="6.5" x2="17.51" y2="6.5" /></svg>
                </a>
              )}
              {facebook && (
                <a href={facebook} aria-label="Facebook" target="_blank" rel="noopener noreferrer">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z" /></svg>
                </a>
              )}
            </div>
          )}
        </div>
        <div className="footer-nav-col">
          <h5>Navigation</h5>
          <ul>
            <li><Link href="/#histoire">Notre Histoire</Link></li>
            <li><Link href="/#specialites">La Carte</Link></li>
            <li><Link href="/#reservation">Réserver</Link></li>
            <li><Link href="/#trouver">Contact</Link></li>
          </ul>
        </div>
        <div className="footer-nav-col">
          <h5>Pratique</h5>
          <ul>
            <li><Link href="/#trouver">Accès &amp; stationnement</Link></li>
            <li><Link href="/#trouver">Groupes &amp; privatisation</Link></li>
            <li><Link href="/mentions-legales">Mentions légales</Link></li>
          </ul>
        </div>
      </div>
      <div className="footer-bottom container">
        <p>© {new Date().getFullYear()} {site.name}. Tous droits réservés.</p>
        <p>Fait avec amour — <em>Come Nonna</em></p>
      </div>
    </footer>
  )
}
