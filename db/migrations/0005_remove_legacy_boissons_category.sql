-- Drops the retired 'boissons' category (production checked empty with `npm run menu:recategorize -- list`).
-- A single ALTER: the database rechecks every row against the new constraint, so if any item is still in 'boissons'
-- the statement fails, the table and the 0004 constraint stay as they were and the migration is not recorded.
-- No row is changed: move the remaining items first (admin or menu:recategorize), then run db:migrate again.
ALTER TABLE menu_items
  DROP CONSTRAINT chk_menu_items_category,
  ADD CONSTRAINT chk_menu_items_category CHECK (category_key IN (
    'antipasti', 'pates_plats', 'pizzas', 'desserts', 'spritz', 'aperitifs', 'bieres_pression', 'bieres_bouteille',
    'vins', 'digestifs', 'sans_alcool'
  ));
