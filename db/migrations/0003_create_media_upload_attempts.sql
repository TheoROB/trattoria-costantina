-- One row per photo submitted to the image pipeline (valid or not), to limit uploads per admin.
-- Purged after 24 hours.
CREATE TABLE media_upload_attempts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  admin_user_id INT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_media_upload_attempts_user (admin_user_id, created_at),
  KEY idx_media_upload_attempts_created (created_at),
  CONSTRAINT fk_media_upload_attempts_user FOREIGN KEY (admin_user_id) REFERENCES admin_users (id) ON DELETE CASCADE
) ENGINE = InnoDB;
