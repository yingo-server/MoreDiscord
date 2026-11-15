// handlers/conversations.ts —— 会话管理（规格 §9）
import { ok, HttpError } from "../platform/response.ts";
import { validateGroupName, strArray, newId, nowIso } from "../platform/validate.ts";
import { attachTags } from "../domain/tags.ts";
import { lastSeenMap, isOnline } from "../domain/presence.ts";
import { get as dbGet, all as dbAll, run as dbRun, transaction } from "../platform/db.ts";
import type { Ctx } from "./types.ts";

const MAX_GROUP_SIZE = 10;

async function requireMember(userId: string, conversationId: string) {
  const row = await dbGet(
    "SELECT role FROM conversation_members WHERE conversation_id=? AND user_id=?",
    [conversationId, userId],
  );
  if (!row) throw new HttpError("FORBIDDEN", "not a member of this conversation");
  return row;
}

async function requireOwner(userId: string, conversationId: string) {
  const conv = await dbGet("SELECT * FROM conversations WHERE id=?", [conversationId]);
  if (!conv) throw new HttpError("NOT_A_MEMBER", "conversation not found");
  const m = await requireMember(userId, conversationId);
  if (m.role !== "owner") throw new HttpError("FORBIDDEN", "owner role required");
  return conv;
}

function computePeer(members: Record<string, any>[], me: string) {
  const peer = members.find((m) => m.user_id !== me);
  if (!peer) return null;
  return { id: peer.user_id, username: peer.username, display_name: peer.display_name };
}

// GET /api/v1/conversations
export async function listConversations(ctx: Ctx): Promise<Response> {
  const userId = ctx.userId!;
  const rows = await dbAll(
    `SELECT c.id,c.type,c.name,c.updated_at,
      (SELECT content FROM messages m WHERE m.conversation_id=c.id ORDER BY m.created_at DESC,m.id DESC LIMIT 1) last_message,
      (SELECT created_at FROM messages m WHERE m.conversation_id=c.id ORDER BY m.created_at DESC,m.id DESC LIMIT 1) last_at,
      cm.last_read_at,
      (SELECT COUNT(*) FROM messages m WHERE m.conversation_id=c.id
        AND m.created_at>COALESCE(cm.last_read_at,'1970-01-01T00:00:00Z')
        AND m.sender_id!=cm.user_id) unread_count
    FROM conversations c JOIN conversation_members cm ON cm.conversation_id=c.id
    WHERE cm.user_id=? ORDER BY last_at DESC NULLS LAST`,
    [userId],
  );

  // B3: 两次批量查询替代每会话一次的 N+1（成员 + 用户信息均 IN 批量取回，JS 端关联）
  const convIds = rows.map((r) => r.id as string);
  const membersByConv = new Map<string, Record<string, any>[]>();
  if (convIds.length > 0) {
    const ph = convIds.map(() => "?").join(",");
    const mem = await dbAll(
      `SELECT cm.conversation_id, cm.user_id, u.username, u.display_name, u.created_at
       FROM conversation_members cm JOIN users u ON u.id=cm.user_id
       WHERE cm.conversation_id IN (${ph})`,
      convIds,
    );
    for (const m of mem) {
      const key = m.conversation_id as string;
      if (!membersByConv.has(key)) membersByConv.set(key, []);
      membersByConv.get(key)!.push(m);
    }
  }
  const allMemberIds = [...membersByConv.values()].flat().map((m) => m.user_id as string);
  const seen = await lastSeenMap(dbAll as any, allMemberIds);

  // 批量 tag：一次 SQL 取回相关显示名组内全部用户按序排列，JS 内算序号
  const tagMap = new Map<string, number>();
  {
    const names = [...new Set(
      [...membersByConv.values()].flat().map((m) => (m.display_name || m.username) as string),
    )];
    if (names.length > 0) {
      const nph = names.map(() => "?").join(",");
      const ordered = await dbAll(
        `SELECT id, COALESCE(display_name, username) AS name FROM users
         WHERE COALESCE(display_name, username) IN (${nph})
         ORDER BY name ASC, created_at ASC, id ASC`,
        names,
      );
      const counters = new Map<string, number>();
      for (const r of ordered) {
        const name = r.name as string;
        const n = (counters.get(name) ?? 0) + 1;
        counters.set(name, n);
        tagMap.set(r.id as string, n);
      }
    }
  }

  const out = [];
  for (const r of rows) {
    const members = membersByConv.get(r.id as string) ?? [];
    let peer: Record<string, any> | null = r.type === "direct" ? computePeer(members, userId) : null;
    if (peer) {
      peer = {
        ...peer,
        tag: tagMap.get(peer.id as string) ?? 1,
        last_seen_at: seen.get(peer.id as string) ?? null,
        online: isOnline(seen.get(peer.id as string)),
      };
    }
    out.push({
      id: r.id,
      type: r.type,
      name: r.name,
      updated_at: r.updated_at,
      last_message: r.last_message,
      last_at: r.last_at,
      last_read_at: r.last_read_at,
      unread_count: Number(r.unread_count ?? 0),
      peer,
    });
  }
  return ok(out);
}

// GET /api/v1/conversations/:id
export async function getConversation(ctx: Ctx, id: string): Promise<Response> {
  const userId = ctx.userId!;
  const conv = await dbGet("SELECT * FROM conversations WHERE id=?", [id]);
  if (!conv) throw new HttpError("NOT_A_MEMBER", "conversation not found");
  await requireMember(userId, id);

  const members = await dbAll(
    `SELECT cm.user_id, u.username, u.display_name, cm.role, cm.joined_at, cm.last_read_at
     FROM conversation_members cm JOIN users u ON u.id=cm.user_id
     WHERE cm.conversation_id=? ORDER BY cm.joined_at ASC`,
    [id],
  );
  const my = members.find((m) => m.user_id === userId);
  const seen = await lastSeenMap(dbAll as any, members.map((m) => m.user_id as string));
  // B2: 详情查询返回的是 user_id 字段，attachTags 按 id 匹配 → 统一映射 id
  const tagged = await attachTags(dbAll as any, members.map((m: any) => ({ ...m, id: m.user_id })) as any);
  return ok({
    id: conv.id,
    type: conv.type,
    name: conv.name,
    created_by: conv.created_by,
    created_at: conv.created_at,
    updated_at: conv.updated_at,
    my_role: my?.role ?? "member",
    member_count: members.length,
    members: tagged.map((m: any) => ({
      ...m,
      last_seen_at: seen.get(m.user_id as string) ?? null,
      online: isOnline(seen.get(m.user_id as string)),
    })),
  });
}

// POST /api/v1/conversations/direct
export async function createDirect(ctx: Ctx): Promise<Response> {
  const userId = ctx.userId!;
  const targetUserId = ctx.body.targetUserId;
  if (typeof targetUserId !== "string" || !targetUserId) {
    throw new HttpError("INVALID_INPUT", "missing field: targetUserId");
  }
  if (targetUserId === userId) {
    throw new HttpError("INVALID_INPUT", "cannot create direct conversation with yourself");
  }
  const target = await dbGet("SELECT id FROM users WHERE id=?", [targetUserId]);
  if (!target) throw new HttpError("USER_NOT_FOUND", "target user does not exist");

  const id = await transaction("write", async (tx) => {
    // 事务内去重（规格 §16.1）
    const existing = await tx.get(
      `SELECT c.id FROM conversations c
       JOIN conversation_members a ON a.conversation_id=c.id AND a.user_id=?
       JOIN conversation_members b ON b.conversation_id=c.id AND b.user_id=?
       WHERE c.type='direct' LIMIT 1`,
      [userId, targetUserId],
    );
    if (existing) return existing.id as string;
    const convId = newId();
    const ts = nowIso();
    await tx.run(
      "INSERT INTO conversations (id,type,name,created_by,created_at,updated_at) VALUES (?, 'direct', NULL, ?, ?, ?)",
      [convId, userId, ts, ts],
    );
    await tx.run(
      "INSERT INTO conversation_members (conversation_id,user_id,role,joined_at) VALUES (?,?,'member',?)",
      [convId, userId, ts],
    );
    await tx.run(
      "INSERT INTO conversation_members (conversation_id,user_id,role,joined_at) VALUES (?,?,'member',?)",
      [convId, targetUserId, ts],
    );
    return convId;
  });
  return ok({ id });
}

// POST /api/v1/conversations/group
export async function createGroup(ctx: Ctx): Promise<Response> {
  const userId = ctx.userId!;
  const name = validateGroupName(ctx.body.name);
  // B11: 去重前先限长（strArray 内），再过滤自己
  const memberIds = [...new Set(strArray(ctx.body.memberIds ?? []))].filter((m) => m !== userId);

  const total = memberIds.length + 1;
  if (total > MAX_GROUP_SIZE) throw new HttpError("GROUP_FULL", `group size exceeds ${MAX_GROUP_SIZE}`);

  for (const m of memberIds) {
    const u = await dbGet("SELECT id FROM users WHERE id=?", [m]);
    if (!u) throw new HttpError("USER_NOT_FOUND", `user ${m} does not exist`);
  }

  const id = await transaction("write", async (tx) => {
    const convId = newId();
    const ts = nowIso();
    await tx.run(
      "INSERT INTO conversations (id,type,name,created_by,created_at,updated_at) VALUES (?, 'group', ?, ?, ?, ?)",
      [convId, name, userId, ts, ts],
    );
    await tx.run(
      "INSERT INTO conversation_members (conversation_id,user_id,role,joined_at) VALUES (?,?,'owner',?)",
      [convId, userId, ts],
    );
    for (const m of memberIds) {
      await tx.run(
        "INSERT INTO conversation_members (conversation_id,user_id,role,joined_at) VALUES (?,?,'member',?)",
        [convId, m, ts],
      );
    }
    return convId;
  });
  return ok({ id });
}

// PATCH /api/v1/conversations/:id —— 改群名
export async function renameConversation(ctx: Ctx, id: string): Promise<Response> {
  const userId = ctx.userId!;
  const conv = await requireOwner(userId, id);
  if (conv.type !== "group") throw new HttpError("NOT_A_GROUP", "cannot rename a direct conversation");
  const name = validateGroupName(ctx.body.name);
  await dbRun("UPDATE conversations SET name=?, updated_at=? WHERE id=?", [name, nowIso(), id]);
  return ok({ id, name });
}

// POST /api/v1/conversations/:id/members —— 加成员
export async function addMember(ctx: Ctx, id: string): Promise<Response> {
  const userId = ctx.userId!;
  await requireOwner(userId, id);
  const targetUserId = ctx.body.userId;
  if (typeof targetUserId !== "string" || !targetUserId) {
    throw new HttpError("INVALID_INPUT", "missing field: userId");
  }
  const target = await dbGet("SELECT id FROM users WHERE id=?", [targetUserId]);
  if (!target) throw new HttpError("USER_NOT_FOUND", "target user does not exist");

  await transaction("write", async (tx) => {
    // 事务内 COUNT+INSERT（规格 §16.2）
    const cnt = await tx.get("SELECT COUNT(*) AS n FROM conversation_members WHERE conversation_id=?", [id]);
    if (Number(cnt?.n ?? 0) >= MAX_GROUP_SIZE) {
      throw new HttpError("GROUP_FULL", `group size reaches ${MAX_GROUP_SIZE}`);
    }
    const existing = await tx.get(
      "SELECT user_id FROM conversation_members WHERE conversation_id=? AND user_id=?",
      [id, targetUserId],
    );
    if (existing) throw new HttpError("ALREADY_MEMBER", "target is already a member");
    await tx.run(
      "INSERT INTO conversation_members (conversation_id,user_id,role,joined_at) VALUES (?,?,'member',?)",
      [id, targetUserId, nowIso()],
    );
    await tx.run("UPDATE conversations SET updated_at=? WHERE id=?", [nowIso(), id]);
  });
  return ok({ id, added: targetUserId });
}

// DELETE /api/v1/conversations/:id/members/:userId —— 移除成员
export async function removeMember(ctx: Ctx, id: string, targetUserId: string): Promise<Response> {
  const userId = ctx.userId!;
  await requireOwner(userId, id);
  if (targetUserId === userId) {
    throw new HttpError("CANNOT_REMOVE_OWNER", "owner cannot remove self; transfer or delete the group");
  }
  await transaction("write", async (tx) => {
    const existing = await tx.get(
      "SELECT user_id FROM conversation_members WHERE conversation_id=? AND user_id=?",
      [id, targetUserId],
    );
    if (!existing) throw new HttpError("NOT_A_MEMBER", "target is not a member");
    await tx.run("DELETE FROM conversation_members WHERE conversation_id=? AND user_id=?", [id, targetUserId]);
    await tx.run("UPDATE conversations SET updated_at=? WHERE id=?", [nowIso(), id]);
  });
  return ok({ id, removed: targetUserId });
}

// POST /api/v1/conversations/:id/leave
export async function leaveConversation(ctx: Ctx, id: string): Promise<Response> {
  const userId = ctx.userId!;
  const conv = await dbGet("SELECT type FROM conversations WHERE id=?", [id]);
  if (!conv) throw new HttpError("NOT_A_MEMBER", "conversation not found");
  // 规格 §4：私聊无管理操作（含 leave），拒绝以避免历史消息分裂（B1）
  if (conv.type === "direct") {
    throw new HttpError("NOT_A_GROUP", "cannot leave a direct conversation");
  }
  const m = await requireMember(userId, id);
  if (conv.type === "group" && m.role === "owner") {
    throw new HttpError("OWNER_MUST_TRANSFER_OR_DELETE", "owner must transfer or delete the group before leaving");
  }
  await dbRun("DELETE FROM conversation_members WHERE conversation_id=? AND user_id=?", [id, userId]);
  await dbRun("UPDATE conversations SET updated_at=? WHERE id=?", [nowIso(), id]);
  return ok({ id, left: true });
}

// DELETE /api/v1/conversations/:id —— 解散群聊（保留 messages）
export async function deleteConversation(ctx: Ctx, id: string): Promise<Response> {
  const userId = ctx.userId!;
  await requireOwner(userId, id);
  await transaction("write", async (tx) => {
    await tx.run("DELETE FROM conversation_members WHERE conversation_id=?", [id]);
    await tx.run("DELETE FROM conversations WHERE id=?", [id]);
    // messages 物理行保留（规格 §16.5）
  });
  return ok({ id, deleted: true });
}

// POST /api/v1/conversations/:id/transfer
export async function transferOwnership(ctx: Ctx, id: string): Promise<Response> {
  const userId = ctx.userId!;
  await requireOwner(userId, id);
  const targetUserId = ctx.body.userId;
  if (typeof targetUserId !== "string" || !targetUserId) {
    throw new HttpError("INVALID_INPUT", "missing field: userId");
  }
  await transaction("write", async (tx) => {
    const target = await tx.get(
      "SELECT role FROM conversation_members WHERE conversation_id=? AND user_id=?",
      [id, targetUserId],
    );
    if (!target) throw new HttpError("NOT_A_MEMBER", "target is not a member");
    await tx.run("UPDATE conversation_members SET role='member' WHERE conversation_id=? AND user_id=?", [id, userId]);
    await tx.run("UPDATE conversation_members SET role='owner' WHERE conversation_id=? AND user_id=?", [id, targetUserId]);
    await tx.run("UPDATE conversations SET created_by=?, updated_at=? WHERE id=?", [targetUserId, nowIso(), id]);
  });
  return ok({ id, new_owner: targetUserId });
}

// PATCH /api/v1/conversations/:id/read
export async function markRead(ctx: Ctx, id: string): Promise<Response> {
  const userId = ctx.userId!;
  await requireMember(userId, id);
  const lastReadAt = typeof ctx.body.last_read_at === "string" && ctx.body.last_read_at
    ? ctx.body.last_read_at
    : nowIso();
  await dbRun(
    "UPDATE conversation_members SET last_read_at=? WHERE conversation_id=? AND user_id=?",
    [lastReadAt, id, userId],
  );
  return ok({ id, last_read_at: lastReadAt });
}
