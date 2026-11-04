-- Reservations made through the DISH widget embedded in this site (lib/site-reservations): one row per
-- `submit_reservation` message from the widget. Additive only. Deliberately no name, e-mail, phone, note, IP, cookie
-- or DISH identifier. IF NOT EXISTS keeps the file re-runnable if a previous run stopped half-way (MySQL DDL is not
-- transactional).
CREATE TABLE IF NOT EXISTS site_reservations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  received_at DATETIME(3) NOT NULL,
  meal_date DATE NOT NULL,
  meal_time TIME NOT NULL,
  covers SMALLINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  KEY idx_site_reservations_meal (meal_date, meal_time),
  CONSTRAINT chk_site_reservations_covers CHECK (covers BETWEEN 1 AND 100)
) ENGINE = InnoDB;

-- Global (site-wide) quota per UTC hour, shared by every Node process. No per-visitor key. Purged after 2 days.
CREATE TABLE IF NOT EXISTS site_reservation_quota (
  window_start DATETIME NOT NULL,
  hits INT UNSIGNED NOT NULL,
  PRIMARY KEY (window_start)
) ENGINE = InnoDB;
