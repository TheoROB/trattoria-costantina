-- Anonymous "demandes de réservation" metrics: one row per effective opening of the DISH widget.
-- Additive only. Deliberately no IP, cookie, session, user agent, identifier or DISH data: a server UTC time and an
-- allowlisted page path, nothing else. IF NOT EXISTS keeps the file re-runnable if a previous run stopped half-way
-- (MySQL DDL is not transactional).
CREATE TABLE IF NOT EXISTS reservation_request_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  occurred_at DATETIME(3) NOT NULL,
  path VARCHAR(32) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_reservation_request_events_occurred (occurred_at),
  CONSTRAINT chk_reservation_request_events_path CHECK (path IN ('/', '/carte', '/mentions-legales'))
) ENGINE = InnoDB DEFAULT CHARSET = ascii COLLATE = ascii_bin;

-- Single row: when the counting code first ran in this database (UTC). Earlier days are reported as unavailable,
-- never as zero.
CREATE TABLE IF NOT EXISTS reservation_request_tracking (
  id TINYINT UNSIGNED NOT NULL,
  activated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT chk_reservation_request_tracking_single CHECK (id = 1)
) ENGINE = InnoDB;

-- Global (site-wide) quota per UTC hour, shared by every Node process. No per-visitor key. Purged after 2 days.
CREATE TABLE IF NOT EXISTS reservation_request_quota (
  window_start DATETIME NOT NULL,
  hits INT UNSIGNED NOT NULL,
  PRIMARY KEY (window_start)
) ENGINE = InnoDB;
