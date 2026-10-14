import { MenuCategories, MenuStatus } from '@/components/menu/MenuCategories'
import { selectPreview } from '@/lib/menu/menu'
import { getPublicMenu } from '@/lib/menu/queries'

export async function Carte() {
  const menu = await getPublicMenu()
  const preview = menu.status === 'ok' ? selectPreview(menu.categories) : []

  return (
    <section id="specialites" className="section-specialites">
      <div className="container">
        <div className="section-header">
          <p className="supertitle"><span className="line"></span>La Carte<span className="line"></span></p>
          <h2>Nos Spécialités</h2>
          <p className="section-subtitle">Un aperçu de notre cuisine italienne faite maison</p>
        </div>

        {preview.length > 0 ? (
          <MenuCategories categories={preview} headingLevel="h3" />
        ) : (
          <MenuStatus unavailable={menu.status === 'unavailable'} />
        )}

        <div className="section-cta">
          <a href="/carte" className="btn btn-primary">Voir la carte complète</a>
        </div>
      </div>
    </section>
  )
}
