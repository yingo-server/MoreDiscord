// L1 平台层：session_token 机制（哈希、签发、吊销、解析）
// 纯 Turso 自管，无 Identity。数据库只存 token 的 SHA-256，明文仅创建时返回一次。
import { get as dbGet, run as dbRun, getAndRun, transaction } from "./db.ts";
import { HttpError } from "../contracts/httpError.ts";
import { nowIso } from "./validate.ts";

export function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function createSession(userId: string): Promise<string> {
  const raw = "sess_" + b64url(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = await sha256Hex(raw);
  const ts = nowIso();
  await dbRun(
    `INSERT INTO sessions (token_hash,user_id,created_at,last_used_at,revoked)
     VALUES (?,?,?,?,0)`,
    [tokenHash, userId, ts, ts],
  );
  return raw;
}

export async function resolveUserId(req: Request): Promise<string | null> {
  const raw = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!raw || !raw.startsWith("sess_")) return null;
  const tokenHash = await sha256Hex(raw);
  const now = nowIso();
  const staleBefore = new Date(Date.now() - 60_000).toISOString();

  // 一次 Turso 往返：SELECT 鉴权 + 条件 UPDATE last_used_at（60s 节流，搭便车做 presence）
  const s = await getAndRun(
    "SELECT * FROM sessions WHERE token_hash=? AND revoked=0",
    [tokenHash],
    "UPDATE sessions SET last_used_at=? WHERE token_hash=? AND revoked=0 AND last_used_at < ?",
    [now, tokenHash, staleBefore],
  );
  return s ? (s.user_id as string) : null;
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

/** 事务版：密码重置等场景吊销用户全部会话 */
export async function revokeSessionsForUser(userId: string): Promise<void> {
  await transaction("write", async (tx) => {
    await tx.run("UPDATE sessions SET revoked=1 WHERE user_id=?", [userId]);
  });
}

export async function requireUser(req: Request): Promise<string> {
  const userId = await resolveUserId(req);
  if (!userId) throw new HttpError("UNAUTHORIZED", "missing or invalid session token");
  return userId;
}
