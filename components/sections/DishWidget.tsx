import { buildDishWidgetUrl } from '@/lib/dish'

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
        <a href="tel:+33978813295">09 78 81 32 95</a>
      </p>
    </div>
  )
}
