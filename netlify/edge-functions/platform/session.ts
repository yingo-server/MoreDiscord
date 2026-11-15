// L1 平台层：session_token 机制（哈希、签发、吊销、续期）
import { get as dbGet, run as dbRun, getAndRun } from "./db.ts";
import { HttpError } from "./response.ts";
import { nowIso, nowSec } from "./validate.ts";
import { refreshIdentityToken, RefreshPermanentError } from "./identity.ts";
import type { IdentityTokens } from "./identity.ts";

export function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------- Session 管理 ----------

export async function createSession(tokens: IdentityTokens, userId: string): Promise<string> {
  const raw = "sess_" + b64url(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = await sha256Hex(raw);
  await dbRun(
    `INSERT INTO sessions (token_hash,user_id,identity_access_token,identity_refresh_token,identity_expires_at,created_at,last_used_at,revoked)
     VALUES (?,?,?,?,?,?,?,0)`,
    [tokenHash, userId, tokens.access_token, tokens.refresh_token, nowSec() + tokens.expires_in, nowIso(), nowIso()],
  );
  return raw; // 仅此一次返回明文
}

export async function resolveUserId(req: Request): Promise<string | null> {
  const raw = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!raw || !raw.startsWith("sess_")) return null;
  const tokenHash = await sha256Hex(raw);
  const now = nowIso();
  const staleBefore = new Date(Date.now() - 60_000).toISOString();

  // 一次 Turso pipeline 往返：SELECT 鉴权 + 条件 UPDATE 最后在线（60s 节流）。
  // 不新增请求、不新增定时器；每个已认证请求（含收消息轮询）顺带写一次。
  const s = await getAndRun(
    "SELECT * FROM sessions WHERE token_hash=? AND revoked=0",
    [tokenHash],
    "UPDATE sessions SET last_used_at=? WHERE token_hash=? AND revoked=0 AND last_used_at < ?",
    [now, tokenHash, staleBefore],
  );
  if (!s) return null;
  if (Number(s.identity_expires_at) > nowSec()) return s.user_id as string;

  // 透明续期：客户端无 refresh 端点
  let r: IdentityTokens | null = null;
  try {
    r = await refreshIdentityToken(s.identity_refresh_token as string);
  } catch (e) {
    if (e instanceof RefreshPermanentError) {
      await dbRun("UPDATE sessions SET revoked=1 WHERE token_hash=? AND identity_refresh_token=?", [tokenHash, s.identity_refresh_token]);
      return null;
    }
    throw e;
  }
  if (!r) return null; // 瞬时失败：不 revoke（会话仍有效，下次请求重试），本次请求按未认证处理
  // A5: 条件 UPDATE 带 identity_refresh_token=? —— rotation 竞态保护：
  // 并发请求已用更新后的 refresh_token 写回时，本请求不再覆盖其成功结果
  await dbRun(
    `UPDATE sessions SET identity_access_token=?, identity_refresh_token=?, identity_expires_at=?, last_used_at=? WHERE token_hash=? AND identity_refresh_token=?`,
    [r.access_token, r.refresh_token, nowSec() + r.expires_in, nowIso(), tokenHash, s.identity_refresh_token],
  );
  return s.user_id as string;
}

export async function revokeSession(tokenHash: string): Promise<void> {
  await dbRun("UPDATE sessions SET revoked=1 WHERE token_hash=?", [tokenHash]);
}

export async function revokeAllUserSessions(userId: string): Promise<void> {
  await dbRun("UPDATE sessions SET revoked=1 WHERE user_id=?", [userId]);
}

export async function revokeSessionByRequest(req: Request): Promise<void> {
  const raw = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (raw) await revokeSession(await sha256Hex(raw));
}


// 认证守卫（L1 平台层：基于 session 解析）
export async function requireUser(req: Request): Promise<string> {
  const userId = await resolveUserId(req);
  if (!userId) throw new HttpError("UNAUTHORIZED", "missing or invalid session token");
  return userId;
}

export async function reserveUsername(tempId: string, username: string, email: string): Promise<void> {
  await dbRun("INSERT INTO users (id, username, email, created_at) VALUES (?,?,?,?)", [tempId, username, email, nowIso()]);
}
export async function backfillUserId(tempId: string, username: string, identityId: string): Promise<void> {
  await dbRun("UPDATE users SET id=? WHERE username=? AND id=?", [identityId, username, tempId]);
}
export async function compensateUser(tempId: string, username: string): Promise<void> {
  await dbRun("DELETE FROM users WHERE username=? AND id=?", [username, tempId]);
}
export async function revokeSessionsForUser(userId: string): Promise<void> {
  const { transaction } = await import("./db.ts");
  await transaction("write", async (tx) => {
    await tx.run("UPDATE sessions SET revoked=1 WHERE user_id=?", [userId]);
  });
}
