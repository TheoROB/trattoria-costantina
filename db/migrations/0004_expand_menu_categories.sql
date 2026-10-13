-- Categories of the restaurant's printed menu. 'boissons' (retired) stays accepted so that existing rows survive
-- until they are moved with `npm run menu:recategorize`; a later migration drops it once no row uses it.
ALTER TABLE menu_items
  DROP CONSTRAINT chk_menu_items_category,
  ADD CONSTRAINT chk_menu_items_category CHECK (category_key IN (
    'antipasti', 'pates_plats', 'pizzas', 'desserts', 'spritz', 'aperitifs', 'bieres_pression', 'bieres_bouteille',
    'vins', 'digestifs', 'sans_alcool', 'boissons'
  ));
