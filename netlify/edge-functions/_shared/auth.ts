// _shared/auth.ts —— 唯一接触 Netlify Identity（GoTrue）的模块（规格 §5）
import { get as dbGet, run as dbRun, getAndRun, transaction } from "./db.ts";
import { HttpError } from "./response.ts";
import { nowIso, nowSec } from "./validate.ts";

const IDENTITY_ORIGIN = Deno.env.get("IDENTITY_ORIGIN")!;

// ---------- 基础工具 ----------

export function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = btoa(bin);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------- Identity HTTP 封装（仅本文件可调） ----------

interface IdentityTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

async function identityFetch(path: string, body: unknown): Promise<any> {
  // /token 端点要求 application/x-www-form-urlencoded（GoTrue 规范），其余端点用 JSON
  const isToken = path === "/token";
  const headers: Record<string, string> = isToken
    ? { "Content-Type": "application/x-www-form-urlencoded" }
    : { "Content-Type": "application/json" };
  const payload = isToken
    ? new URLSearchParams(body as Record<string, string>).toString()
    : JSON.stringify(body);
  let res: Response;
  try {
    res = await fetch(`${IDENTITY_ORIGIN}/.netlify/identity${path}`, {
      method: "POST",
      headers,
      body: payload,
    });
  } catch {
    throw new HttpError("INTERNAL_ERROR", "identity unreachable");
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw mapIdentityError(json, res.status);
  return json;
}

// GoTrue {"code":422,"msg":"..."} 或 {"error":"invalid_grant","error_description":"..."} → 网关错误码；禁止透传
function mapIdentityError(json: any, status: number): HttpError {
  const msg = String(json?.msg ?? json?.error_description ?? json?.error ?? json?.message ?? "").toLowerCase();
  if (msg.includes("unsupported_grant_type")) {
    // GoTrue /token 要求 application/x-www-form-urlencoded，JSON 会被拒——这是网关侧的错
    return new HttpError("INTERNAL_ERROR", "identity token encoding error");
  }
  // A4: GoTrue 登录未确认邮箱时同时携带 invalid_grant + "Email not confirmed"，
  // 必须排在纯 invalid_grant 分支之前，否则 EMAIL_NOT_CONFIRMED 不可达
  if ((msg.includes("invalid_grant") || msg.includes("invalid")) && (msg.includes("email not confirmed") || msg.includes("confirm"))) {
    return new HttpError("EMAIL_NOT_CONFIRMED", "email not confirmed");
  }
  // A3: EMAIL_EXISTS → 409（含 error_code=email_exists / "user already registered" 等变体）
  if (msg.includes("already registered") || msg.includes("email exists") || (json?.error_code ?? "").toLowerCase() === "email_exists" || (json?.code ?? "").toString() === "email_exists") {
    return new HttpError("EMAIL_EXISTS", "email already registered");
  }
  if (msg.includes("invalid_grant") || msg.includes("invalid email or password") || msg.includes("no user found") || msg.includes("invalid credentials")) {
    return new HttpError("INVALID_CREDENTIALS", "invalid email or password");
  }
  if (msg.includes("password") && (msg.includes("short") || msg.includes("weak") || msg.includes("at least"))) {
    return new HttpError("INVALID_INPUT", "password does not meet requirements");
  }
  if (msg.includes("confirm") || msg.includes("not confirmed")) {
    return new HttpError("EMAIL_NOT_CONFIRMED", "email not confirmed");
  }
  if (msg.includes("token") && (msg.includes("invalid") || msg.includes("expired"))) {
    return new HttpError("INVALID_INPUT", "invalid or expired token");
  }
  if (status === 400) return new HttpError("INVALID_INPUT", "invalid request");
  return new HttpError("INTERNAL_ERROR", "authentication failed");
}

export async function identitySignup(email: string, password: string): Promise<any> {
  return identityFetch("/signup", { email, password });
}

export async function identityPasswordToken(email: string, password: string): Promise<IdentityTokens> {
  return identityFetch("/token", { grant_type: "password", email, password });
}

// A5: 区分「明确失效」与「瞬时失败」。
// 返回 { ok: tokens, permanent: boolean }：
//  - 明确失效（HTTP 401 / invalid_grant / refresh token 过期吊销）→ permanent=true，可安全 revoke
//  - 网络抖动 / 5xx / 解析失败 → permanent=false，不 revoke（下个请求重试）
export async function refreshIdentityToken(refreshToken: string): Promise<IdentityTokens | null> {
  try {
    return await identityFetch("/token", { grant_type: "refresh_token", refresh_token: refreshToken });
  } catch (e) {
    if (e instanceof HttpError) {
      // 明确失效：身份服务器明确拒绝了这枚 refresh token
      if (e.status === 401) throw new RefreshPermanentError(e.message);
      if (e.code === "INVALID_CREDENTIALS" || e.code === "INVALID_INPUT") throw new RefreshPermanentError(e.message);
      // 其余（400/422/429/500 等）视为瞬时/可重试
    }
    return null; // 网络/5xx 瞬时失败
  }
}
export class RefreshPermanentError extends Error {}


export async function identityVerify(payload: { type: string; token: string; password?: string }): Promise<any> {
  const body: Record<string, unknown> = { type: payload.type, token: payload.token };
  if (payload.password != null) body.password = payload.password;
  return identityFetch("/verify", body);
}

export async function identityRecover(email: string): Promise<any> {
  return identityFetch("/recover", { email });
}

export async function identityGetUser(accessToken: string): Promise<any> {
  const res = await fetch(`${IDENTITY_ORIGIN}/.netlify/identity/user`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw mapIdentityError(json, res.status);
  return json;
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

// ---------- 认证守卫 ----------

export async function requireUser(req: Request): Promise<string> {
  const userId = await resolveUserId(req);
  if (!userId) throw new HttpError("UNAUTHORIZED", "missing or invalid session token");
  return userId;
}

// 注册用：预留 + 回填 + 补偿（规格 §7.1 逻辑）
export async function reserveUsername(tempId: string, username: string, email: string): Promise<void> {
  await dbRun(
    "INSERT INTO users (id, username, email, created_at) VALUES (?,?,?,?)",
    [tempId, username, email, nowIso()],
  );
}

export async function backfillUserId(tempId: string, username: string, identityId: string): Promise<void> {
  await dbRun("UPDATE users SET id=? WHERE username=? AND id=?", [identityId, username, tempId]);
}

export async function compensateUser(tempId: string, username: string): Promise<void> {
  await dbRun("DELETE FROM users WHERE username=? AND id=?", [username, tempId]);
}

// 密码重置成功后吊销旧会话（规格 §16.8）
export async function revokeSessionsForUser(userId: string): Promise<void> {
  await transaction("write", async (tx) => {
    await tx.run("UPDATE sessions SET revoked=1 WHERE user_id=?", [userId]);
  });
}
