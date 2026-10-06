import { buildDishWidgetUrl } from '@/lib/dish'
import { site } from '@/lib/site'

export function DishWidget() {
  return (
    <div className="dish-widget-container">
      <iframe
        className="dish-widget"
        src={buildDishWidgetUrl()}
        title="Réservation en ligne DISH"
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
      />
      <p className="dish-widget-fallback">
        Vous pouvez aussi réserver par téléphone au{' '}
        <a href={site.phone.href}>{site.phone.display}</a>
      </p>
    </div>
  )
}
