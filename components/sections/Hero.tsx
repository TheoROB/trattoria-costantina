import { CalendarIcon } from '@/components/icons'
import { Picture } from '@/components/Picture'

export function Hero() {
  return (
    <section id="hero">
      <div className="hero-bg">
        <Picture
          image="hero"
          alt="Terrasse de la Trattoria Costantina : longue table en bois sous une arche et une treille de vigne"
          sizes="max(100vw, 178vh)"
          artDirection={[{ image: 'hero-portrait', media: '(max-width: 640px)', sizes: 'max(100vw, 80vh)' }]}
          priority
        />
        <div className="hero-overlay"></div>
      </div>
      <div className="hero-content">
        <p className="supertitle supertitle-light supertitle-left">
          <span className="line"></span>
          Découvrir Trattoria Costantina
        </p>
        <h1>Les recettes de Nonna<br />voyagent de la Puglia<br />jusqu&apos;à votre table</h1>
        <p className="hero-subtitle">Une cuisine italienne faite maison, inspirée des petits plats de Nonna Costantina et de la région des Pouilles, dans le sud de l&apos;Italie.</p>
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
