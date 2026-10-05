import { Picture } from '@/components/Picture'

export function Histoire() {
  return (
    <section id="histoire" className="section-histoire">
      <div className="container">
        <div className="histoire-grid">
          <div className="histoire-image">
            <Picture
              image="histoire"
              alt="Table dressée d'une nappe vichy rouge devant le mur de photos de famille en noir et blanc"
              sizes="(max-width: 1200px) calc(50vw - 72px), 528px"
              artDirection={[{ image: 'histoire-wide', media: '(max-width: 900px)', sizes: 'calc(100vw - 4rem)' }]}
            />
          </div>
          <div className="histoire-content">
            <p className="supertitle supertitle-left">
              <span className="line"></span>
              Notre Famille
            </p>
            <h2>Notre Histoire</h2>
            <div className="title-divider"></div>
            <p>La Trattoria Costantina est un endroit où l&apos;on vous propose une cuisine italienne faite maison, et avec amour.</p>
            <p>Tout a commencé dès mon plus jeune âge lorsque je rendais visite à ma Nonna Costantina, et qu&apos;elle me préparait ses bons petits plats directement inspirés de la région des Pouilles, dans le sud de l&apos;Italie.</p>
            <p>Aujourd&apos;hui, en hommage à ma Nonna, il me tient à cœur de partager avec vous ce qu&apos;elle m&apos;a transmis, le tout dans un cadre chaleureux et accueillant.</p>
            <p>Au plaisir de vous accueillir,</p>
            <blockquote>
              « Ci vediamo presto ! » — <em>Julien Panfilo</em>
            </blockquote>
          </div>
        </div>
      </div>
    </section>
  )
}
