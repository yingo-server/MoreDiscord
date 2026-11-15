// handlers/auth.ts —— 注册/确认/登录/登出/找回/当前用户（规格 §7）
import { resolveUserId, revokeSessionByRequest, createSession, revokeSessionsForUser, compensateUser } from "../platform/session.ts";
import { identitySignup, identityPasswordToken, identityVerify, identityRecover } from "../platform/identity.ts";
import { reserveUsername, backfillUserId } from "../platform/session.ts";
import { ok, fail, HttpError, readJson } from "../platform/response.ts";
import { validateUsername, requireEmail, requireString, newId, nowIso } from "../platform/validate.ts";
import { get as dbGet, transaction, isUniqueViolation } from "../platform/db.ts";

interface Ctx {
  req: Request;
  body: Record<string, any>;
}

// POST /api/v1/auth/signup
export async function signup({ req, body }: Ctx): Promise<Response> {
  const email = requireEmail(body);
  const password = requireString(body, "password");
  const username = validateUsername(body.username);

  const tempId = newId();
  // A10: 预留/回填/补偿纳入 write 事务（BEGIN IMMEDIATE），保证用户名预留到回填的原子性。
  // 跨 Identity HTTP 调用不能放进 DB 事务——保留补偿 + 日志路径。
  try {
    await transaction("write", async (tx) => {
      await tx.run(
        "INSERT INTO users (id, username, email, created_at) VALUES (?,?,?,?)",
        [tempId, username, email, nowIso()],
      );
    });
  } catch (e) {
    if (isUniqueViolation(e)) return fail("USERNAME_TAKEN", "username already taken", 409);
    throw e;
  }

  let tokens: any = null;
  let identityId: string | null = null;
  try {
    const r = await identitySignup(email, password);
    identityId = r?.user?.id ?? r?.id ?? null;
    tokens = r?.access_token ? r : null; // Autoconfirm 时返回 token
  } catch (e) {
    // Identity 失败：补偿删除预留行（HTTP 调用不在 DB 事务内，用补偿保证一致性）
    console.error("signup compensate: identity signup failed, deleting reserved row", { tempId, username });
    await compensateUser(tempId, username);
    if (e instanceof HttpError) return fail(e.code, e.message, e.status);
    throw e;
  }

  if (!identityId) {
    console.error("signup compensate: identity returned no user id", { tempId, username });
    await compensateUser(tempId, username);
    return fail("INTERNAL_ERROR", "identity signup failed", 500);
  }

  // 回填改主键：若临时行已被 FK 引用则 UPDATE 会失败，此时删除临时行并按 identityId 重新插入完整行，
  // 再补偿删除任何残留（FK 未启用时 UPDATE 亦可成功——两种路径收敛到同一终态）
  let backfilled = false;
  try {
    await transaction("write", async (tx) => {
      await tx.run("UPDATE users SET id=? WHERE username=? AND id=?", [identityId, username, tempId]);
      const row = await tx.get("SELECT id FROM users WHERE id=?", [identityId]);
      backfilled = !!row;
    });
  } catch (e) {
    console.error("signup backfill error, falling back to re-insert", { tempId, username, identityId, err: String(e) });
  }
  if (!backfilled) {
    try {
      await transaction("write", async (tx) => {
        await tx.run("DELETE FROM users WHERE id=?", [tempId]);
        const row = await tx.get("SELECT id FROM users WHERE id=?", [identityId]);
        if (!row) {
          await tx.run("INSERT INTO users (id, username, email, created_at) VALUES (?,?,?,?)", [identityId, username, email, nowIso()]);
        }
      });
    } catch (e) {
      console.error("signup re-insert failed, compensating", { tempId, username, identityId, err: String(e) });
      await compensateUser(tempId, username);
      return fail("INTERNAL_ERROR", "signup failed during backfill", 500);
    }
  }

  if (tokens) {
    const sessionToken = await createSession(tokens, identityId);
    return ok({
      session_token: sessionToken,
      confirmation_required: false,
      user: { id: identityId, username, email },
    });
  }

  return ok({
    session_token: null,
    confirmation_required: true,
    user: { id: identityId, username, email },
  });
}

// A2: GoTrue /verify 返回 AccessTokenResponse：{access_token, refresh_token, expires_in, token_type, user:{id,...}}
// 顶层无 id。user.id 优先，否则从 access_token JWT payload 的 sub 解析（login 同样使用）。
export function userIdFromTokens(tokens: any): string | null {
  const id = tokens?.user?.id ?? tokens?.id ?? null;
  if (id) return String(id);
  try {
    const payload = JSON.parse(atobUrl(String(tokens?.access_token ?? "").split(".")[1]));
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

// POST /api/v1/auth/verify
export async function verify({ body }: Ctx): Promise<Response> {
  const type = requireString(body, "type");
  if (type !== "signup" && type !== "recover") {
    throw new HttpError("INVALID_INPUT", "type must be signup or recover");
  }
  const token = requireString(body, "token");
  const password = typeof body.password === "string" && body.password.length > 0 ? body.password : undefined;

  let tokens: any;
  try {
    tokens = await identityVerify({ type, token, password });
  } catch (e) {
    if (e instanceof HttpError) return fail(e.code, e.message, e.status);
    throw e;
  }

  const userId = userIdFromTokens(tokens);

  // type=recover 成功后吊销旧会话（规格 §7.2 / §16.8）—— A2: 走事务版 revokeSessionsForUser
  if (type === "recover" && userId) {
    await revokeSessionsForUser(userId);
  }
  if (!userId || !tokens?.access_token) {
    return fail("INTERNAL_ERROR", "verification did not return a session", 500);
  }

  const sessionToken = await createSession(tokens, userId);
  const row = await dbGet("SELECT username, email FROM users WHERE id=?", [userId]);
  return ok({
    session_token: sessionToken,
    user: {
      id: userId,
      username: row?.username ?? null,
      email: row?.email ?? null,
    },
  });
}

// POST /api/v1/auth/login
export async function login({ body }: Ctx): Promise<Response> {
  const email = requireEmail(body);
  const password = requireString(body, "password");

  let tokens: any;
  try {
    tokens = await identityPasswordToken(email, password);
  } catch (e) {
    if (e instanceof HttpError) return fail(e.code, e.message, e.status);
    throw e;
  }

  // 从 access_token JWT payload 取 sub（Identity user.id）—— A2: 统一走 userIdFromTokens
  const userId = userIdFromTokens(tokens);

  if (!userId) return fail("INTERNAL_ERROR", "login failed to resolve user", 500);

  const sessionToken = await createSession(tokens, userId);
  const row = await dbGet("SELECT username, email FROM users WHERE id=?", [userId]);
  return ok({
    session_token: sessionToken,
    user: {
      id: userId,
      username: row?.username ?? null,
      email: row?.email ?? email,
    },
  });
}

function atobUrl(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  return atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
}

// POST /api/v1/auth/logout
export async function logout({ req }: Ctx): Promise<Response> {
  await revokeSessionByRequest(req);
  return ok({ ok: true });
}

// POST /api/v1/auth/recover —— 无论邮箱是否存在均 200（防枚举）
export async function recover({ body }: Ctx): Promise<Response> {
  const email = requireEmail(body);
  try {
    await identityRecover(email);
  } catch {
    // 忽略具体错误，统一响应
  }
  return ok({ ok: true });
}

// GET /api/v1/auth/me
export async function me({ req }: Ctx): Promise<Response> {
  const userId = await resolveUserId(req);
  if (!userId) throw new HttpError("UNAUTHORIZED", "missing or invalid session token");
  const row = await dbGet("SELECT id, username, display_name, email, created_at FROM users WHERE id=?", [userId]);
  if (!row) throw new HttpError("UNAUTHORIZED", "user not found");
  const { getTag } = await import("../domain/tags.ts");
  const tag = await getTag(dbGet, row as any);
  return ok({ ...row, tag });
}

export const handlers: Record<string, (ctx: Ctx) => Promise<Response>> = {
  signup, verify, login, logout, recover, me,
};
