// presence.ts —— 「最后一次在线」推导（零额外轮询、零新增表）
// 数据源：sessions.last_used_at（由 resolveUserId 在鉴权时同一次 pipeline 内节流更新）
// 读取：搭在现有 conversations / conversation 查询上，一次批量子查询带出

/** 窗口内算在线；前端主要展示 last_seen_at 文本，此布尔仅作便利字段 */
export function isOnline(lastSeenAt: string | null | undefined, windowSec = 120): boolean {
  if (!lastSeenAt) return false;
  const t = Date.parse(lastSeenAt);
  if (Number.isNaN(t)) return false;
  return Date.now() - t < windowSec * 1000;
}

/**
 * 批量取用户最后在线时间：一次 SQL，GROUP BY user_id。
 * 只统计未吊销的 session；登出/重置密码后 revoked=1 立即停止贡献在线时间。
 */
export async function lastSeenMap(
  all: (sql: string, params: any[]) => Promise<Record<string, any>[]>,
  userIds: string[],
): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  const placeholders = ids.map(() => "?").join(",");
  const rows = await all(
    `SELECT user_id, MAX(last_used_at) AS last_seen_at FROM sessions
     WHERE revoked=0 AND user_id IN (${placeholders}) GROUP BY user_id`,
    ids,
  );
  for (const r of rows) {
    if (r.user_id && r.last_seen_at) map.set(r.user_id as string, r.last_seen_at as string);
  }
  return map;
}
