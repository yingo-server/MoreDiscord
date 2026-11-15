-- Turso 建表脚本（规格 §4 全量 SQL）
-- 用 turso CLI 或 sqlite3 客户端执行：
--   turso db shell <db-name> < schema.sql
CREATE TABLE users (
  id           TEXT PRIMARY KEY,
  username     TEXT UNIQUE NOT NULL,
  display_name TEXT,
  email        TEXT,
  admin        INTEGER NOT NULL DEFAULT 0,   -- 1 = 管理员（/admin/* 门禁）
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
  -- 口径注意：此处 SQLite length() 按 Unicode 码点计数，与 JS 端 [...content].length 一致
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

-- B12: presence 读路径索引（sessions 按 revoked+user_id 过滤后 GROUP BY）
CREATE INDEX idx_sessions_revoked_user ON sessions(revoked, user_id);
-- B12: displayName tag 计算 / attachTags 走 COALESCE(display_name, username) 等值查询
CREATE INDEX idx_users_display_name ON users(display_name);
CREATE INDEX idx_users_username_created ON users(username, created_at, id);

-- 管理操作审计日志（/admin/* 端点写入）
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
CREATE INDEX idx_audit_log_time     ON audit_log(created_at, id);
