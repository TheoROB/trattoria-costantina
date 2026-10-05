export function Footer() {
  return (
    <footer className="footer">
      <div className="footer-quote">
        « La cucina è l&apos;arte di trasformare gli ingredienti in amore »
      </div>
      <div className="footer-main container">
        <div className="footer-brand">
          <img src="/images/logo.png" alt="Trattoria Costantina" className="footer-logo-img" />
          <p>Une cuisine italienne faite maison, inspirée des recettes de Nonna Costantina en provenance des Pouilles. Chaque plat est un voyage.</p>
          <div className="social-links">
            <a href="#" aria-label="Instagram">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="2" width="20" height="20" rx="5" /><path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37z" /><line x1="17.5" y1="6.5" x2="17.51" y2="6.5" /></svg>
            </a>
            <a href="#" aria-label="Facebook">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z" /></svg>
            </a>
            <a href="#" aria-label="TikTok">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 12a4 4 0 104 4V4a5 5 0 005 5" /></svg>
            </a>
          </div>
        </div>
        <div className="footer-nav-col">
          <h5>Navigation</h5>
          <ul>
            <li><a href="#histoire">Notre Histoire</a></li>
            <li><a href="#specialites">La Carte</a></li>
            <li><a href="#reservation">Réserver</a></li>
            <li><a href="#trouver">Contact</a></li>
          </ul>
        </div>
        <div className="footer-nav-col">
          <h5>Pratique</h5>
          <ul>
            <li><a href="#">Accès &amp; Parking</a></li>
            <li><a href="#">Groupes &amp; Évènements</a></li>
            <li><a href="#">Allergies &amp; Régimes</a></li>
            <li><a href="#">Mentions légales</a></li>
          </ul>
        </div>
      </div>
      <div className="footer-bottom container">
        <p>© 2024 Trattoria Costantina. Tous droits réservés.</p>
        <p>Fait avec amour — <em>Come Nonna</em></p>
      </div>
    </footer>
  )
}
