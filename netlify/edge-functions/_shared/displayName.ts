// _shared/displayName.ts —— 显示名 tag 序号计算（Discord 风格消歧）
// 规则：同 display_name 的用户按 created_at 升序，第一个 tag=1（前端不显示），其后 2、3……
// tag 不持久化，实时计算。username（登录名）始终唯一，不参与此逻辑。

export interface UserLike {
  id: string;
  username: string;
  display_name: string | null;
  created_at?: string;
}

/** 为单个用户计算 tag：返回 { tag }，1 表示唯一/最早 */
export async function getTag(
  get: (sql: string, params: any[]) => Promise<Record<string, any> | null>,
  user: UserLike,
): Promise<number> {
  const name = user.display_name || user.username;
  const first = await get(
    `SELECT id FROM users WHERE COALESCE(display_name, username)=? ORDER BY created_at ASC, id ASC LIMIT 1`,
    [name],
  );
  return first?.id === user.id ? 1 : await getTagByUser(get, user);
}

async function getTagByUser(
  get: (sql: string, params: any[]) => Promise<Record<string, any> | null>,
  user: UserLike,
): Promise<number> {
  const name = user.display_name || user.username;
  const row = await get(
    `SELECT COUNT(*) AS n FROM users
     WHERE COALESCE(display_name, username)=?
       AND (created_at < ? OR (created_at = ? AND id < ?))`,
    [name, user.created_at ?? "9999", user.created_at ?? "9999", user.id],
  );
  return Number(row?.n ?? 0) + 1;
}

/** 批量为用户列表附加 tag（一次查询同组用户，避免 N+1） */
export async function attachTags<T extends UserLike>(
  all: (sql: string, params: any[]) => Promise<Record<string, any>[]>,
  users: T[],
): Promise<(T & { tag: number })[]> {
  if (users.length === 0) return [];
  // 按显示名分组查询各组内排序
  const names = [...new Set(users.map((u) => u.display_name || u.username))];
  const out = new Map<string, number>();
  for (const name of names) {
    const rows = await all(
      `SELECT id FROM users WHERE COALESCE(display_name, username)=? ORDER BY created_at ASC, id ASC`,
      [name],
    );
    rows.forEach((r, i) => out.set(r.id as string, i + 1));
  }
  return users.map((u) => ({ ...u, tag: out.get(u.id) ?? 1 }));
}
