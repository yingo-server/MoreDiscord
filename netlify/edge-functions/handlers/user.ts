// handlers/user.ts —— 账户管理（规格 §8）
import { ok, HttpError } from "../platform/response.ts";
import { validateUsername, validateDisplayName } from "../platform/validate.ts";
import { run as dbRun, isUniqueViolation } from "../platform/db.ts";
import type { Ctx } from "./types.ts";

// PATCH /api/v1/user/username
export async function updateUsername(ctx: Ctx): Promise<Response> {
  const userId = ctx.userId!;
  const username = validateUsername(ctx.body.username);
  try {
    await dbRun("UPDATE users SET username=? WHERE id=?", [username, userId]);
  } catch (e) {
    if (isUniqueViolation(e)) throw new HttpError("USERNAME_TAKEN", "username already taken");
    throw e;
  }
  return ok({ id: userId, username });
}

// PATCH /api/v1/user/profile
export async function updateProfile(ctx: Ctx): Promise<Response> {
  const userId = ctx.userId!;
  // B4: 统一校验 trim/非空/≤64，空串存 NULL（与 SQL COALESCE 口径一致）
  const dn = validateDisplayName(ctx.body.display_name);
  await dbRun("UPDATE users SET display_name=? WHERE id=?", [dn, userId]);
  return ok({ id: userId, display_name: dn });
}
