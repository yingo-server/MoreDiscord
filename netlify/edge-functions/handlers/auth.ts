// handlers/auth.ts —— 注册/确认/登录/登出/找回/当前用户（规格 §7）
import { resolveUserId, revokeSessionByRequest, createSession, identitySignup, identityPasswordToken, identityVerify, identityRecover, revokeAllUserSessions, reserveUsername, backfillUserId, compensateUser } from "../_shared/auth.ts";
import { ok, fail, HttpError, readJson } from "../_shared/response.ts";
import { validateUsername, requireEmail, requireString, newId, nowIso } from "../_shared/validate.ts";
import { get as dbGet, isUniqueViolation } from "../_shared/db.ts";

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
  try {
    // 事务内预留用户名（规格 §16.1）
    await reserveUsername(tempId, username, email);
  } catch (e) {
    if (isUniqueViolation(e)) return fail("USERNAME_TAKEN", "username already taken", 409);
    throw e;
  }

  let tokens: any = null;
  let identityId: string | null = null;
  try {
    const r = await identitySignup(email, password);
    identityId = r?.id ?? null;
    tokens = r?.access_token ? r : null; // Autoconfirm 时返回 token
  } catch (e) {
    // Identity 失败：补偿删除预留行
    await compensateUser(tempId, username);
    if (e instanceof HttpError) return fail(e.code, e.message, e.status);
    throw e;
  }

  if (!identityId) {
    await compensateUser(tempId, username);
    return fail("INTERNAL_ERROR", "identity signup failed", 500);
  }

  try {
    await backfillUserId(tempId, username, identityId);
  } catch {
    await compensateUser(tempId, username);
    return fail("INTERNAL_ERROR", "signup failed during backfill", 500);
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

  const identityUser = tokens?.id ?? null;

  // type=recover 成功后吊销旧会话（规格 §7.2 / §16.8）
  if (type === "recover" && identityUser) {
    await revokeAllUserSessions(identityUser);
  }

  const userId = identityUser;
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

  // 从 access_token JWT payload 取 sub（Identity user.id）
  let userId: string | null = null;
  try {
    const payload = JSON.parse(atobUrl(tokens.access_token.split(".")[1]));
    userId = payload.sub ?? null;
  } catch {
    userId = null;
  }

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
  const { getTag } = await import("../_shared/displayName.ts");
  const tag = await getTag(dbGet, row as any);
  return ok({ ...row, tag });
  return ok(row);
}

export const handlers: Record<string, (ctx: Ctx) => Promise<Response>> = {
  signup, verify, login, logout, recover, me,
};
