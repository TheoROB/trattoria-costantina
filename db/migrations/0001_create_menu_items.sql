CREATE TABLE menu_items (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  category_key VARCHAR(32) NOT NULL,
  name VARCHAR(80) NOT NULL,
  description VARCHAR(400) NULL,
  price_cents INT UNSIGNED NOT NULL,
  -- Server-generated media reference (never a path, URL or user file name). Used from Lot D.
  image_key VARCHAR(64) NULL,
  image_alt VARCHAR(160) NULL,
  is_available TINYINT(1) NOT NULL DEFAULT 1,
  is_visible TINYINT(1) NOT NULL DEFAULT 1,
  position INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_menu_items_public (is_visible, category_key, position, id),
  CONSTRAINT chk_menu_items_category CHECK (category_key IN ('antipasti', 'pates_plats', 'pizzas', 'desserts', 'boissons')),
  CONSTRAINT chk_menu_items_name CHECK (CHAR_LENGTH(TRIM(name)) > 0),
  CONSTRAINT chk_menu_items_price CHECK (price_cents BETWEEN 1 AND 100000),
  CONSTRAINT chk_menu_items_image_key CHECK (image_key IS NULL OR image_key REGEXP '^[a-z0-9]{16,64}$')
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
