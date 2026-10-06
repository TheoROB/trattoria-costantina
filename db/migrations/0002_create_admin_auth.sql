-- Exactly two admin accounts, created with scripts/admin-user.mts (no signup). See docs/adr/0001-admin-authentication.md.
CREATE TABLE admin_users (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  email VARCHAR(254) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_admin_users_email (email),
  CONSTRAINT chk_admin_users_email CHECK (email = LOWER(TRIM(email)) AND email LIKE '_%@_%')
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Only the SHA-256 of the session token is stored. Times are UTC.
CREATE TABLE admin_sessions (
  token_hash BINARY(32) NOT NULL,
  admin_user_id INT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  PRIMARY KEY (token_hash),
  KEY idx_admin_sessions_user (admin_user_id),
  KEY idx_admin_sessions_expires (expires_at),
  CONSTRAINT fk_admin_sessions_user FOREIGN KEY (admin_user_id) REFERENCES admin_users (id) ON DELETE CASCADE
) ENGINE = InnoDB;

-- Pseudonymised (HMAC-SHA256) identifiers only: never the raw email or IP. Purged after 24 hours.
CREATE TABLE login_attempts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email_hmac BINARY(32) NOT NULL,
  ip_hmac BINARY(32) NULL,
  succeeded TINYINT(1) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_login_attempts_email (email_hmac, created_at),
  KEY idx_login_attempts_ip (ip_hmac, created_at),
  KEY idx_login_attempts_created (created_at)
) ENGINE = InnoDB;

-- Who changed what on the menu. menu_item_id has no foreign key so entries survive deletions.
CREATE TABLE admin_audit_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  admin_user_id INT UNSIGNED NULL,
  action VARCHAR(48) NOT NULL,
  menu_item_id INT UNSIGNED NULL,
  menu_item_name VARCHAR(80) NULL,
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_admin_audit_log_created (created_at),
  CONSTRAINT fk_admin_audit_log_user FOREIGN KEY (admin_user_id) REFERENCES admin_users (id) ON DELETE SET NULL
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
