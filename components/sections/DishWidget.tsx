import { buildDishWidgetUrl } from '@/lib/dish'
import { site } from '@/lib/site'

/** `onLoad`: the iframe's `load` event (see lib/reservation-requests/opening.ts for what it does and does not prove). */
export function DishWidget({ onLoad }: { onLoad?: () => void } = {}) {
  return (
    <div className="dish-widget-container">
      <iframe
        className="dish-widget"
        src={buildDishWidgetUrl()}
        title="Réservation en ligne DISH"
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        onLoad={onLoad}
      />
      <p className="dish-widget-fallback">
        Vous pouvez aussi réserver par téléphone au{' '}
        <a href={site.phone.href}>{site.phone.display}</a>
      </p>
    </div>
  )
}
