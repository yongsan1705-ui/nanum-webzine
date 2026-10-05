-- 웹진 「나눔, 그리고 나음」 DB 구조 (MySQL / MariaDB)
-- config/config.php의 dsn을 MySQL로 바꾸는 경우, 먼저 이 파일로 테이블을 만들어 주세요.

CREATE TABLE IF NOT EXISTS consults (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(30)  NOT NULL,
  phone         VARCHAR(20)  NOT NULL,
  field         VARCHAR(20)  NOT NULL,
  contact_time  VARCHAR(20)  NOT NULL,
  article       VARCHAR(40),
  source        VARCHAR(60),
  agree_privacy TINYINT(1)   NOT NULL DEFAULT 0,
  agreed_at     DATETIME     NOT NULL,
  status        VARCHAR(10)  NOT NULL DEFAULT '접수',
  memo          VARCHAR(200),
  created_at    DATETIME     NOT NULL,
  updated_at    DATETIME,
  INDEX idx_consults_created (created_at)
) DEFAULT CHARSET = utf8mb4;

CREATE TABLE IF NOT EXISTS subscribers (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email            VARCHAR(100) NOT NULL UNIQUE,
  name             VARCHAR(30),
  article          VARCHAR(40),
  source           VARCHAR(60),
  agree_privacy    TINYINT(1)   NOT NULL DEFAULT 0,
  agree_marketing  TINYINT(1)   NOT NULL DEFAULT 0,
  agreed_at        DATETIME     NOT NULL,
  unsubscribed_at  DATETIME,
  created_at       DATETIME     NOT NULL
) DEFAULT CHARSET = utf8mb4;

CREATE TABLE IF NOT EXISTS events (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  type        VARCHAR(20) NOT NULL,
  article     VARCHAR(40),
  value       VARCHAR(20),
  source      VARCHAR(60),
  view_id     VARCHAR(30),
  created_at  DATETIME    NOT NULL,
  INDEX idx_events_type_article (type, article),
  INDEX idx_events_created (created_at)
) DEFAULT CHARSET = utf8mb4;

CREATE TABLE IF NOT EXISTS admins (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  username       VARCHAR(20)  NOT NULL UNIQUE,
  display_name   VARCHAR(30)  NOT NULL,
  password_hash  VARCHAR(255) NOT NULL,
  created_at     DATETIME     NOT NULL,
  last_login_at  DATETIME
) DEFAULT CHARSET = utf8mb4;

CREATE TABLE IF NOT EXISTS admin_logs (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  username    VARCHAR(20),
  action      VARCHAR(30) NOT NULL,
  detail      VARCHAR(200),
  ip_hash     VARCHAR(16),
  created_at  DATETIME    NOT NULL
) DEFAULT CHARSET = utf8mb4;

CREATE TABLE IF NOT EXISTS rate_hits (
  bucket    VARCHAR(20) NOT NULL,
  key_hash  VARCHAR(64) NOT NULL,
  ts        INT UNSIGNED NOT NULL,
  INDEX idx_rate (bucket, key_hash, ts)
) DEFAULT CHARSET = utf8mb4;
