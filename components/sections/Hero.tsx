import { CalendarIcon } from '@/components/icons'

export function Hero() {
  return (
    <section id="hero">
      <div className="hero-bg">
        <img src="/images/hero.jpeg" alt="Trattoria Costantina" />
        <div className="hero-overlay"></div>
      </div>
      <div className="hero-content">
        <p className="supertitle supertitle-light supertitle-left">
          <span className="line"></span>
          Découvrir Trattoria Costantina
        </p>
        <h1>Les recettes de Nonna<br />voyagent de la Puglia<br />jusqu&apos;à votre table</h1>
        <p className="hero-subtitle">Une cuisine italienne faite maison, inspirée par Nonna Costantina et ses recettes authentiques des Pouilles. Chaque plat est une lettre d&apos;amour.</p>
        <div className="hero-actions">
          <a href="#specialites" className="btn btn-primary">Découvrir la carte</a>
          <a href="#reservation" className="btn btn-outline-light">
            <CalendarIcon />
            Réserver une table
          </a>
        </div>
      </div>
    </section>
  )
}
