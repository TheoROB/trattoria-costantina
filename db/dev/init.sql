-- Separate database for automated tests (wiped by the integration suite).
CREATE DATABASE IF NOT EXISTS trattoria_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON trattoria_test.* TO 'trattoria'@'%';
