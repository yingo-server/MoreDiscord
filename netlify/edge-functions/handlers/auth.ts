// L3 应用层：认证端点（纯 Turso 自管账号，邮箱验证冻结）
import {
  resolveUserId,
  revokeSessionByRequest,
  createSession,
} from "../platform/session.ts";
import { hashPassword, verifyPassword } from "../platform/password.ts";
import { emailVerificationRequired } from "../platform/settings.ts";
import { ok, fail, HttpError } from "../platform/response.ts";
import { validateUsername, requireEmail, requireString, newId } from "../platform/validate.ts";
import { get as dbGet, transaction } from "../platform/db.ts";
import type { Ctx } from "./types.ts";

const MIN_PASSWORD_LEN = 8;

/** POST /auth/signup */
export async function signup(ctx: Ctx): Promise<Response> {
  const email = requireEmail(ctx.body).toLowerCase();
  const password = requireString(ctx.body, "password");
  const username = validateUsername(ctx.body.username);
  if (password.length < MIN_PASSWORD_LEN) {
    throw new HttpError("INVALID_INPUT", `password must be at least ${MIN_PASSWORD_LEN} characters`);
  }

  const dup = await dbGet("SELECT email, username FROM users WHERE email=? OR username=?", [email, username]);
  if (dup) {
    if ((dup.email as string)?.toLowerCase() === email) {
      throw new HttpError("EMAIL_EXISTS", "email already registered");
    }
    throw new HttpError("USERNAME_TAKEN", "username already taken");
  }

  const passwordHash = await hashPassword(password);
  const userId = newId();
  const createdAt = new Date().toISOString();

  try {
    await transaction("write", async (tx) => {
      await tx.run(
        "INSERT INTO users (id, username, email, password_hash, created_at) VALUES (?,?,?,?,?)",
        [userId, username, email, passwordHash, createdAt],
      );
    });
  } catch (e) {
    // 并发下唯一约束兜底 → 映射到对应错误码
    const msg = String((e as Error)?.message ?? e);
    if (msg.includes("users.email")) throw new HttpError("EMAIL_EXISTS", "email already registered");
    if (msg.includes("users.username")) throw new HttpError("USERNAME_TAKEN", "username already taken");
    throw e;
  }

  const needVerify = await emailVerificationRequired();
  const sessionToken = needVerify ? null : await createSession(userId);

  return ok({
    session_token: sessionToken,
    confirmation_required: needVerify,
    user: { id: userId, username, email, admin: 0 },
  });
}

/** POST /auth/verify —— 发信冻结 */
export async function verify(ctx: Ctx): Promise<Response> {
  void ctx;
  return fail("INVALID_INPUT", "email delivery is disabled", 400);
}

/** POST /auth/login */
export async function login(ctx: Ctx): Promise<Response> {
  const email = requireEmail(ctx.body).toLowerCase();
  const password = requireString(ctx.body, "password");

  const row = await dbGet("SELECT id, username, email, password_hash, admin FROM users WHERE email=?", [email]);
  // 用户不存在与密码错误返回同一错误，避免账号枚举
  if (!row) throw new HttpError("INVALID_CREDENTIALS", "invalid email or password");
  if (!(await verifyPassword(password, row.password_hash as string))) {
    throw new HttpError("INVALID_CREDENTIALS", "invalid email or password");
  }

  const sessionToken = await createSession(row.id as string);
  return ok({
    session_token: sessionToken,
    user: { id: row.id, username: row.username, email: row.email, admin: Number(row.admin) === 1 ? 1 : 0 },
  });
}

/** POST /auth/logout */
export async function logout(ctx: Ctx): Promise<Response> {
  await revokeSessionByRequest(ctx.req);
  return ok({ ok: true });
}

/** POST /auth/recover —— 发信冻结 */
export async function recover(ctx: Ctx): Promise<Response> {
  requireEmail(ctx.body);
  return fail("INVALID_INPUT", "email delivery is disabled", 400);
}

/** GET /auth/me */
export async function me(ctx: Ctx): Promise<Response> {
  const userId = await resolveUserId(ctx.req);
  if (!userId) throw new HttpError("UNAUTHORIZED", "missing or invalid session token");
  const row = await dbGet("SELECT id, username, display_name, email, admin, created_at FROM users WHERE id=?", [userId]);
  if (!row) throw new HttpError("UNAUTHORIZED", "user not found");
  const { getTag } = await import("../domain/tags.ts");
  const tag = await getTag(dbGet, row as any);
  return ok({ ...row, tag });
}
