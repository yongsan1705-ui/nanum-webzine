-- 웹진 「나눔, 그리고 나음」 DB 구조 (SQLite)
-- lib/bootstrap.php가 처음 연결할 때 자동으로 실행합니다.

CREATE TABLE IF NOT EXISTS consults (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  phone         TEXT    NOT NULL,
  field         TEXT    NOT NULL,
  message       TEXT,
  article       TEXT,
  source        TEXT,
  agree_privacy INTEGER NOT NULL DEFAULT 0,
  agreed_at     TEXT    NOT NULL,
  status        TEXT    NOT NULL DEFAULT '접수',
  memo          TEXT,
  created_at    TEXT    NOT NULL,
  updated_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_consults_created ON consults (created_at);

CREATE TABLE IF NOT EXISTS subscribers (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  email            TEXT    NOT NULL UNIQUE,
  name             TEXT,
  article          TEXT,
  source           TEXT,
  agree_privacy    INTEGER NOT NULL DEFAULT 0,
  agree_marketing  INTEGER NOT NULL DEFAULT 0,
  agreed_at        TEXT    NOT NULL,
  unsubscribed_at  TEXT,
  created_at       TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  type        TEXT NOT NULL,
  article     TEXT,
  value       TEXT,
  source      TEXT,
  view_id     TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_type_article ON events (type, article);
CREATE INDEX IF NOT EXISTS idx_events_created ON events (created_at);

CREATE TABLE IF NOT EXISTS admins (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  username       TEXT NOT NULL UNIQUE,
  display_name   TEXT NOT NULL,
  password_hash  TEXT NOT NULL,
  created_at     TEXT NOT NULL,
  last_login_at  TEXT
);

CREATE TABLE IF NOT EXISTS admin_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  username    TEXT,
  action      TEXT NOT NULL,
  detail      TEXT,
  ip_hash     TEXT,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rate_hits (
  bucket    TEXT    NOT NULL,
  key_hash  TEXT    NOT NULL,
  ts        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rate ON rate_hits (bucket, key_hash, ts);
