// _shared/auth.ts —— 唯一接触 Netlify Identity（GoTrue）的模块（规格 §5）
import { get as dbGet, run as dbRun, transaction } from "./db.ts";
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
  if (msg.includes("invalid_grant") || msg.includes("invalid email or password") || msg.includes("no user found") || msg.includes("invalid credentials")) {
    return new HttpError("INVALID_CREDENTIALS", "invalid email or password");
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

export async function refreshIdentityToken(refreshToken: string): Promise<IdentityTokens | null> {
  try {
    return await identityFetch("/token", { grant_type: "refresh_token", refresh_token: refreshToken });
  } catch {
    return null;
  }
}

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
  const s = await dbGet("SELECT * FROM sessions WHERE token_hash=? AND revoked=0", [tokenHash]);
  if (!s) return null;
  if (Number(s.identity_expires_at) > nowSec()) return s.user_id as string;

  // 透明续期：客户端无 refresh 端点
  const r = await refreshIdentityToken(s.identity_refresh_token as string);
  if (!r) {
    await dbRun("UPDATE sessions SET revoked=1 WHERE token_hash=?", [tokenHash]);
    return null;
  }
  await dbRun(
    `UPDATE sessions SET identity_access_token=?, identity_refresh_token=?, identity_expires_at=?, last_used_at=? WHERE token_hash=?`,
    [r.access_token, r.refresh_token, nowSec() + r.expires_in, nowIso(), tokenHash],
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
