// handlers/messages.ts —— 消息发送 / 分页读取 / 增量同步（规格 §10）
import { ok, HttpError } from "../platform/response.ts";
import { validateMessageContent, newId, nowIso, encodeCursor, decodeCursor } from "../platform/validate.ts";
import { get as dbGet, all as dbAll, run as dbRun } from "../platform/db.ts";
import type { Ctx } from "./types.ts";

const MAX_LIMIT = 50;

async function requireMemberRead(userId: string, conversationId: string) {
  const conv = await dbGet("SELECT id FROM conversations WHERE id=?", [conversationId]);
  if (!conv) throw new HttpError("NOT_A_MEMBER", "conversation not found");
  const m = await dbGet(
    "SELECT user_id FROM conversation_members WHERE conversation_id=? AND user_id=?",
    [conversationId, userId],
  );
  if (!m) throw new HttpError("FORBIDDEN", "not a member of this conversation");
}

// POST /api/v1/conversations/:id/messages
export async function sendMessage(ctx: Ctx, id: string): Promise<Response> {
  const userId = ctx.userId!;
  await requireMemberRead(userId, id);
  const content = validateMessageContent(ctx.body.content);
  const msgId = newId();
  const ts = nowIso();
  await dbRun(
    "INSERT INTO messages (id, conversation_id, sender_id, content, created_at) VALUES (?,?,?,?,?)",
    [msgId, id, userId, content, ts],
  );
  await dbRun("UPDATE conversations SET updated_at=? WHERE id=?", [ts, id]);
  return ok({ id: msgId, conversation_id: id, sender_id: userId, content, created_at: ts });
}

function parseLimit(ctx: Ctx): number {
  const raw = ctx.url.searchParams.get("limit");
  if (raw == null) return MAX_LIMIT;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) throw new HttpError("INVALID_INPUT", "limit must be >= 1");
  return Math.min(Math.floor(n), MAX_LIMIT);
}

// GET /api/v1/conversations/:id/messages?before=&limit= —— 复合游标倒序分页
export async function listMessages(ctx: Ctx, id: string): Promise<Response> {
  const userId = ctx.userId!;
  await requireMemberRead(userId, id);
  const limit = parseLimit(ctx);
  const cursor = decodeCursor(ctx.url.searchParams.get("before"));

  const rows = await dbAll(
    `SELECT id,sender_id,content,created_at FROM messages
     WHERE conversation_id=? AND (created_at,id)<(?,?)
     ORDER BY created_at DESC,id DESC LIMIT ?`,
    [id, cursor?.[0] ?? "9999-12-31T23:59:59.999Z", cursor?.[1] ?? "\uffff", limit],
  );

  const next_before = rows.length === limit && rows.length > 0
    ? encodeCursor(rows[rows.length - 1].created_at, rows[rows.length - 1].id)
    : null;
  return ok({ messages: rows, next_before });
}

// GET /api/v1/conversations/:id/messages/sync?after=&limit= —— 增量同步
export async function syncMessages(ctx: Ctx, id: string): Promise<Response> {
  const userId = ctx.userId!;
  await requireMemberRead(userId, id);
  const limit = parseLimit(ctx);
  const cursor = decodeCursor(ctx.url.searchParams.get("after"));

  const rows = await dbAll(
    `SELECT id,sender_id,content,created_at FROM messages
     WHERE conversation_id=? AND (created_at,id)>(?,?)
     ORDER BY created_at ASC,id ASC LIMIT ?`,
    [id, cursor?.[0] ?? "1970-01-01T00:00:00Z", cursor?.[1] ?? "", limit],
  );

  const next_cursor = rows.length > 0
    ? encodeCursor(rows[rows.length - 1].created_at, rows[rows.length - 1].id)
    : ctx.url.searchParams.get("after") ?? encodeCursor("1970-01-01T00:00:00Z", "");
  return ok({ messages: rows, next_cursor });
}
