// L3 应用层：公开用户搜索（需登录，最小字段）
import { ok, HttpError } from "../platform/response.ts";
import { get as dbGet, all as dbAll } from "../platform/db.ts";
import type { Ctx } from "./types.ts";
import { attachTags } from "../domain/tags.ts";

/** GET /api/v1/users?search=xxx&limit=20 */
export async function searchUsers(ctx: Ctx): Promise<Response> {
  const q = (ctx.url.searchParams.get("search") ?? "").trim().toLowerCase();
  const limitRaw = ctx.url.searchParams.get("limit");
  let limit = 20;
  if (limitRaw !== null) {
    limit = Number(limitRaw);
    if (!Number.isFinite(limit) || limit < 1) throw new HttpError("INVALID_INPUT", "invalid limit");
    limit = Math.min(Math.floor(limit), 50);
  }
  // 只按用户名前缀匹配，避免全表扫描 LIKE '%x%'
  const like = q ? `${q}%` : "%";
  const rows = await dbAll(
    `SELECT id, username, display_name, created_at FROM users
     WHERE lower(username) LIKE ? ORDER BY username ASC LIMIT ?`,
    [like, limit],
  );
  const tagged = await attachTags(dbAll as any, rows as any);
  // 不返回 email / admin / password_hash
  return ok({
    users: tagged.map((u: any) => ({
      id: u.id,
      username: u.username,
      display_name: u.display_name ?? null,
      tag: u.tag,
    })),
  });
}
