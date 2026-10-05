import { CalendarIcon } from '@/components/icons'

export function Famille() {
  return (
    <section className="section-famille">
      <div className="famille-bg">
        <img src="/images/famille.png" alt="Terrasse Trattoria Costantina" />
        <div className="famille-overlay"></div>
      </div>
      <div className="famille-content">
        <div className="divider-diamond">✦</div>
        <h2>Venez comme en famille</h2>
        <p>Réservez votre table à la Trattoria Costantina et laissez-nous vous accueillir dans un cadre chaleureux, comme Nonna le faisait dans les Pouilles.</p>
        <div className="famille-actions">
          <a href="#reservation" className="btn btn-primary">
            <CalendarIcon />
            Réserver une table
          </a>
          <a href="tel:+33142587321" className="btn btn-outline-light">Appelez-nous</a>
        </div>
      </div>
    </section>
  )
}
