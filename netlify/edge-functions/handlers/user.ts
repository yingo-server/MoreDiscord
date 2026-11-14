// handlers/user.ts —— 账户管理（规格 §8）
import { requireUser } from "../_shared/auth.ts";
import { ok, HttpError } from "../_shared/response.ts";
import { validateUsername } from "../_shared/validate.ts";
import { run as dbRun, isUniqueViolation } from "../_shared/db.ts";
import type { Ctx } from "./types.ts";

// PATCH /api/v1/user/username
export async function updateUsername(ctx: Ctx): Promise<Response> {
  const userId = await requireUser(ctx.req);
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
  const userId = await requireUser(ctx.req);
  const dn = ctx.body.display_name;
  if (dn !== null && typeof dn !== "string") {
    throw new HttpError("INVALID_INPUT", "display_name must be a string or null");
  }
  if (typeof dn === "string" && dn.length > 64) {
    throw new HttpError("INVALID_INPUT", "display_name must be <= 64 chars");
  }
  await dbRun("UPDATE users SET display_name=? WHERE id=?", [dn, userId]);
  return ok({ id: userId, display_name: dn });
}
