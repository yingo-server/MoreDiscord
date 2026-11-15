// handlers/admin.ts —— 管理员端点（架构方案 §5.2 清单）
// 鉴权：session_token + is_admin 判定（users 表 admin 列，1 = 管理员）
import { ok, HttpError } from "../platform/response.ts";
import { newId, nowIso, strArray, encodeCursor, decodeCursor, validateDisplayName } from "../platform/validate.ts";
import { get as dbGet, all as dbAll, run as dbRun, transaction } from "../platform/db.ts";
import type { Ctx } from "./types.ts";

const MAX_LIMIT = 50;

async function requireAdmin(ctx: Ctx): Promise<string> {
  const userId = ctx.userId!;
  const u = await dbGet("SELECT admin FROM users WHERE id=?", [userId]);
  if (!u || Number(u.admin) !== 1) throw new HttpError("FORBIDDEN", "admin role required");
  return userId;
}

function limitOf(url: URL): number {
  const raw = url.searchParams.get("limit");
  if (raw == null) return MAX_LIMIT;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) throw new HttpError("INVALID_INPUT", "limit must be >= 1");
  return Math.min(Math.floor(n), MAX_LIMIT);
}

// GET /api/v1/admin/users?search=&cursor=<username>&limit=
export async function adminListUsers(ctx: Ctx): Promise<Response> {
  const adminId = await requireAdmin(ctx);
  void adminId;
  const limit = limitOf(ctx.url);
  const search = ctx.url.searchParams.get("search")?.toLowerCase() ?? "";
  // B7: 转义 LIKE 通配符 % 和 _，ESCAPE '\' 字面量
  const pattern = search
    ? `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
    : "%";
  // B8: 游标统一 Base64URL（与 messages.ts encodeCursor 一致）
  const decoded = decodeCursor(ctx.url.searchParams.get("cursor"));
  const cursor = decoded?.[0] ?? "\uffff";
  const cursorId = decoded?.[1] ?? "\uffff";
  const users = await dbAll(
    `SELECT id, username, display_name, email, created_at, admin FROM users
     WHERE (username, id) < (?, ?) AND username LIKE ? ESCAPE '\\' ORDER BY username ASC LIMIT ?`,
    [cursor, cursorId, pattern, limit + 1],
  );
  const hasMore = users.length > limit;
  const page = hasMore ? users.slice(0, limit) : users;
  const { attachTags } = await import("../domain/tags.ts");
  const tagged = await attachTags(dbAll as any, page.map((u: any) => ({ ...u, id: u.id })) as any);
  return ok({
    users: tagged,
    next_cursor: hasMore
      ? encodeCursor(page[page.length - 1].username, page[page.length - 1].id)
      : null,
  });
}

// GET /api/v1/admin/users/:id
export async function adminGetUser(ctx: Ctx, id: string): Promise<Response> {
  await requireAdmin(ctx);
  const u = await dbGet(
    "SELECT id, username, display_name, email, created_at, admin FROM users WHERE id=?",
    [id],
  );
  if (!u) throw new HttpError("USER_NOT_FOUND", "user does not exist");
  const convs = await dbAll(
    `SELECT c.id, c.type, c.name, cm.role, cm.joined_at
     FROM conversation_members cm JOIN conversations c ON c.id=cm.conversation_id
     WHERE cm.user_id=? ORDER BY cm.joined_at DESC LIMIT 50`,
    [id],
  );
  return ok({ ...u, conversations: convs });
}

// PATCH /api/v1/admin/users/:id —— {admin?: 0|1, display_name?: string|null}（封禁通过 admin 剥离与审计日志实现）
export async function adminPatchUser(ctx: Ctx, id: string): Promise<Response> {
  const adminId = await requireAdmin(ctx);
  const target = await dbGet("SELECT id, admin FROM users WHERE id=?", [id]);
  if (!target) throw new HttpError("USER_NOT_FOUND", "user does not exist");

  await transaction("write", async (tx) => {
    if (ctx.body.admin !== undefined) {
      const v = Number(ctx.body.admin);
      if (v !== 0 && v !== 1) throw new HttpError("INVALID_INPUT", "admin must be 0 or 1");
      if (id === adminId && v === 0) {
        throw new HttpError("INVALID_INPUT", "cannot demote self");
      }
      await tx.run("UPDATE users SET admin=? WHERE id=?", [v, id]);
    }
    if (ctx.body.display_name !== undefined) {
      // B6: 复用 B4 的统一校验（trim/非空/≤64，空串存 NULL）
      const dn = validateDisplayName(ctx.body.display_name);
      await tx.run("UPDATE users SET display_name=? WHERE id=?", [dn, id]);
    }
    // B5: audit_log.detail 只记录已处理的白名单字段，不持久化任意 body
    const detail = JSON.stringify({
      ...(ctx.body.admin !== undefined ? { admin: Number(ctx.body.admin) } : {}),
      ...(ctx.body.display_name !== undefined ? { display_name: validateDisplayName(ctx.body.display_name) } : {}),
    });
    await tx.run(
      "INSERT INTO audit_log (id, actor_id, action, target_type, target_id, detail, created_at) VALUES (?,?,?,?,?,?,?)",
      [newId(), adminId, "admin.patch_user", "user", id, detail, nowIso()],
    );
  });
  const u = await dbGet("SELECT id, username, display_name, admin FROM users WHERE id=?", [id]);
  return ok(u);
}

// GET /api/v1/admin/channels?cursor=<created_at|id>&limit=&type=
export async function adminListChannels(ctx: Ctx): Promise<Response> {
  await requireAdmin(ctx);
  const limit = limitOf(ctx.url);
  const type = ctx.url.searchParams.get("type");
  if (type && type !== "direct" && type !== "group") {
    throw new HttpError("INVALID_INPUT", "type must be direct or group");
  }
  const [cAt, cId] = decodeCursor(ctx.url.searchParams.get("cursor")) ?? ["9999-12-31T23:59:59.999Z", "\uffff"];
  let sql = `SELECT c.id, c.type, c.name, c.created_by, c.created_at, c.updated_at,
    (SELECT COUNT(*) FROM conversation_members m WHERE m.conversation_id=c.id) AS member_count
    FROM conversations c WHERE (c.created_at, c.id) < (?, ?)`;
  const args: any[] = [cAt, cId];
  if (type) { sql += " AND c.type=?"; args.push(type); }
  sql += " ORDER BY c.created_at DESC, c.id DESC LIMIT ?";
  args.push(limit + 1);
  const rows = await dbAll(sql, args);
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return ok({
    channels: page,
    next_cursor: hasMore ? encodeCursor(page[page.length - 1].created_at, page[page.length - 1].id) : null,
  });
}

// DELETE /api/v1/admin/channels/:id —— 强制解散（保留 messages，同用户解散语义）
export async function adminDeleteChannel(ctx: Ctx, id: string): Promise<Response> {
  const adminId = await requireAdmin(ctx);
  const conv = await dbGet("SELECT id FROM conversations WHERE id=?", [id]);
  if (!conv) throw new HttpError("NOT_A_MEMBER", "conversation not found");
  await transaction("write", async (tx) => {
    await tx.run("DELETE FROM conversation_members WHERE conversation_id=?", [id]);
    await tx.run("DELETE FROM conversations WHERE id=?", [id]);
    await tx.run(
      "INSERT INTO audit_log (id, actor_id, action, target_type, target_id, detail, created_at) VALUES (?,?,?,?,?,?,?)",
      [newId(), adminId, "admin.delete_channel", "channel", id, "", nowIso()],
    );
  });
  return ok({ id, deleted: true });
}

// GET /api/v1/admin/channels/:id/messages?cursor=&limit= —— 跨权限审计
export async function adminAuditMessages(ctx: Ctx, id: string): Promise<Response> {
  await requireAdmin(ctx);
  const limit = limitOf(ctx.url);
  const conv = await dbGet("SELECT id FROM conversations WHERE id=?", [id]);
  if (!conv) throw new HttpError("NOT_A_MEMBER", "conversation not found");
  const [cAt, cId] = decodeCursor(ctx.url.searchParams.get("cursor")) ?? ["9999-12-31T23:59:59.999Z", "\uffff"];
  const rows = await dbAll(
    `SELECT id, sender_id, content, created_at FROM messages
     WHERE conversation_id=? AND (created_at, id) < (?, ?)
     ORDER BY created_at DESC, id DESC LIMIT ?`,
    [id, cAt, cId, limit + 1],
  );
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return ok({
    messages: page,
    next_cursor: hasMore ? encodeCursor(page[page.length - 1].created_at, page[page.length - 1].id) : null,
  });
}

// GET /api/v1/admin/audit-log?cursor=<created_at|id>&limit=
export async function adminAuditLog(ctx: Ctx): Promise<Response> {
  await requireAdmin(ctx);
  const limit = limitOf(ctx.url);
  const [cAt, cId] = decodeCursor(ctx.url.searchParams.get("cursor")) ?? ["9999-12-31T23:59:59.999Z", "\uffff"];
  const rows = await dbAll(
    `SELECT a.id, a.actor_id, u.username AS actor_username, a.action, a.target_type, a.target_id, a.detail, a.created_at
     FROM audit_log a LEFT JOIN users u ON u.id=a.actor_id
     WHERE (a.created_at, a.id) < (?, ?)
     ORDER BY a.created_at DESC, a.id DESC LIMIT ?`,
    [cAt, cId, limit + 1],
  );
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return ok({
    entries: page,
    next_cursor: hasMore ? encodeCursor(page[page.length - 1].created_at, page[page.length - 1].id) : null,
  });
}

// GET /api/v1/admin/stats/overview
export async function adminStats(ctx: Ctx): Promise<Response> {
  await requireAdmin(ctx);
  const users = await dbGet("SELECT COUNT(*) AS n FROM users");
  const convs = await dbGet("SELECT COUNT(*) AS n FROM conversations");
  const groups = await dbGet("SELECT COUNT(*) AS n FROM conversations WHERE type='group'");
  const msgs = await dbGet("SELECT COUNT(*) AS n FROM messages");
  const admins = await dbGet("SELECT COUNT(*) AS n FROM users WHERE admin=1");
  return ok({
    users: Number(users?.n ?? 0),
    conversations: Number(convs?.n ?? 0),
    groups: Number(groups?.n ?? 0),
    messages: Number(msgs?.n ?? 0),
    admins: Number(admins?.n ?? 0),
  });
}
