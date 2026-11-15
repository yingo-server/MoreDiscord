# Turso 建表脚本（规格 §4 全量 SQL）
# 用 turso CLI 或 sqlite3 客户端执行：
#   turso db shell <db-name> < schema.sql

CREATE TABLE users (
  id           TEXT PRIMARY KEY,
  username     TEXT UNIQUE NOT NULL,
  display_name TEXT,
  email        TEXT,
  created_at   TEXT NOT NULL
);

CREATE TABLE conversations (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL CHECK (type IN ('direct','group')),
  name        TEXT,
  created_by  TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE conversation_members (
  conversation_id TEXT NOT NULL,
  user_id         TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','member')),
  joined_at       TEXT NOT NULL,
  last_read_at    TEXT,
  PRIMARY KEY (conversation_id, user_id),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id),
  FOREIGN KEY (user_id)         REFERENCES users(id)
);

CREATE TABLE messages (
  id               TEXT PRIMARY KEY,
  conversation_id  TEXT NOT NULL,
  sender_id        TEXT NOT NULL,
  content          TEXT NOT NULL,
  created_at       TEXT NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id),
  FOREIGN KEY (sender_id)       REFERENCES users(id),
  CHECK (length(content) <= 4000)
);

CREATE TABLE sessions (
  token_hash             TEXT PRIMARY KEY,
  user_id                TEXT NOT NULL,
  identity_access_token  TEXT NOT NULL,
  identity_refresh_token TEXT NOT NULL,
  identity_expires_at    INTEGER NOT NULL,
  created_at             TEXT NOT NULL,
  last_used_at           TEXT NOT NULL,
  revoked                INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_messages_conv_time ON messages(conversation_id, created_at, id);
CREATE INDEX idx_members_user       ON conversation_members(user_id);
CREATE INDEX idx_sessions_user      ON sessions(user_id);
CREATE INDEX idx_audit_log_time     ON audit_log(created_at, id);

CREATE TABLE audit_log (
  id          TEXT PRIMARY KEY,
  actor_id    TEXT NOT NULL,
  action      TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id   TEXT NOT NULL,
  detail      TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL,
  FOREIGN KEY (actor_id) REFERENCES users(id)
);
