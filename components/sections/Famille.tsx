import { CalendarIcon } from '@/components/icons'
import { Picture } from '@/components/Picture'
import { site } from '@/lib/site'

export function Famille() {
  return (
    <section className="section-famille">
      <div className="famille-bg">
        <Picture
          image="famille"
          alt="Table pour deux sur la terrasse, devant un mur ocre et une fenêtre ornée de petits vases colorés"
          sizes="100vw"
          artDirection={[{ image: 'famille-portrait', media: '(max-width: 640px)', sizes: 'max(100vw, 384px)' }]}
        />
        <div className="famille-overlay"></div>
      </div>
      <div className="famille-content">
        <div className="divider-diamond">✦</div>
        <h2>Venez comme en famille</h2>
        <p>Réservez votre table à la Trattoria Costantina et laissez-nous vous accueillir dans un cadre chaleureux et accueillant, en salle ou en terrasse.</p>
        <div className="famille-actions">
          <a href="#reservation" className="btn btn-primary">
            <CalendarIcon />
            Réserver une table
          </a>
          <a href={site.phone.href} className="btn btn-outline-light">Appelez-nous</a>
        </div>
      </div>
    </section>
  )
}
