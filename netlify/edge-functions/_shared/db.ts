// _shared/db.ts —— 唯一接触 Turso 的模块
// 换数据库只改此文件。

const TURSO_DATABASE_URL = Deno.env.get("TURSO_DATABASE_URL")!;
const TURSO_AUTH_TOKEN = Deno.env.get("TURSO_AUTH_TOKEN")!;

interface TursoResult {
  results?: { rows?: any[][]; cols?: string[] };
  error?: { message?: string };
}

async function execute(statements: any[]): Promise<TursoResult[]> {
  const res = await fetch(`${TURSO_DATABASE_URL}/v2/pipeline`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${TURSO_AUTH_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ requests: statements }),
  });
  if (!res.ok) {
    throw new Error(`Turso HTTP ${res.status}: ${await res.text()}`);
  }
  const json = await res.json();
  return json.results ?? [];
}

// Turso v2 pipeline 响应结构：results[i].response.result.{cols,rows}
// 值编码：{type:"text"|"integer"|"float"|"blob"|"null", value}
function decodeVal(v: any): any {
  if (v == null) return null;
  if (typeof v === "object") {
    if ("value" in v) {
      if (v.type === "integer" || v.type === "float") return Number(v.value);
      if (v.type === "null") return null;
      return v.value; // text / blob(base64)
    }
    if ("integer" in v) return Number(v.integer);
    if ("float" in v) return Number(v.float);
    if ("text" in v) return v.text;
    if ("blob" in v) return v.blob;
    if ("null" in v) return null;
  }
  return v;
}

function decodeRows(rows: any[][] | undefined, cols?: any[]): Record<string, any>[] {
  if (!rows) return [];
  const names = (cols ?? []).map((c: any, i: number) => (typeof c === "string" ? c : c?.name ?? `c${i}`));
  return rows.map((r) => {
    const o: Record<string, any> = {};
    (names.length ? names : r.map((_, i) => `c${i}`)).forEach((c: string, i: number) => (o[c] = decodeVal(r[i])));
    return o;
  });
}

// 从 v2 响应取第一个 statement 的结果（兼容新旧两种包装）
function extractResult(entry: any): { rows?: any[][]; cols?: any[]; error?: { message?: string } } {
  const r = entry?.response?.result ?? entry?.results ?? entry?.result ?? {};
  return { rows: r.rows, cols: r.cols, error: entry?.error ?? r.error };
}

export async function get(sql: string, params: any[] = []): Promise<Record<string, any> | null> {
  const [result] = await execute([
    { type: "execute", stmt: { sql, args: params.map(toArg) } },
  ]);
  const r = extractResult(result);
  if (r.error) throw new Error(r.error.message);
  const rows = decodeRows(r.rows, r.cols);
  return rows[0] ?? null;
}

export async function all(sql: string, params: any[] = []): Promise<Record<string, any>[]> {
  const [result] = await execute([
    { type: "execute", stmt: { sql, args: params.map(toArg) } },
  ]);
  const r = extractResult(result);
  if (r.error) throw new Error(r.error.message);
  return decodeRows(r.rows, r.cols);
}

export async function run(sql: string, params: any[] = []): Promise<void> {
  const [result] = await execute([
    { type: "execute", stmt: { sql, args: params.map(toArg) } },
  ]);
  const r = extractResult(result);
  if (r.error) throw new Error(r.error.message);
}

/**
 * 一次 pipeline 往返内先 SELECT 再 UPDATE（合并鉴权查询与「最后在线」节流写入）。
 * 无 baton：两条语句各自 autocommit 即可，不需要事务。
 * 用于 resolveUserId —— 不新增任何 HTTP 请求。
 */
export async function getAndRun(
  selectSql: string, selectParams: any[],
  writeSql: string, writeParams: any[],
): Promise<Record<string, any> | null> {
  const results = await execute([
    { type: "execute", stmt: { sql: selectSql, args: selectParams.map(toArg) } },
    { type: "execute", stmt: { sql: writeSql, args: writeParams.map(toArg) } },
  ]);
  for (const entry of results) {
    const e = extractResult(entry);
    if (e.error) throw new Error(e.error.message);
  }
  const r = extractResult(results[0]);
  const rows = decodeRows(r.rows, r.cols);
  return rows[0] ?? null;
}

function toArg(v: any): any {
  if (v == null) return { type: "null", value: null };
  if (typeof v === "number") {
    return Number.isInteger(v) ? { type: "integer", value: String(v) } : { type: "float", value: String(v) };
  }
  return { type: "text", value: String(v) };
}

export function isUniqueViolation(err: unknown): boolean {
  const msg = String((err as Error)?.message ?? err).toLowerCase();
  return msg.includes("unique constraint") || msg.includes("constraint failed") || msg.includes("unique");
}

// 事务：Turso pipeline 中 baton 串行执行，出错则 close 回滚
export async function transaction<T>(
  mode: "write" | "read",
  fn: (tx: {
    get: typeof get;
    all: typeof all;
    run: typeof run;
  }) => Promise<T>,
): Promise<T> {
  return await transactionRun(mode, fn);
}

// 带 baton 的事务执行器：每条语句单独请求并携带 baton，保证事务性
async function transactionRun<T>(
  mode: "write" | "read",
  fn: (tx: any) => Promise<T>,
): Promise<T> {
  let baton: string | undefined;
  const authHeaders = {
    "Authorization": `Bearer ${TURSO_AUTH_TOKEN}`,
    "Content-Type": "application/json",
  };

  const exec = async (stmt: { sql: string; args: any[] }) => {
    return await execRaw({ type: "execute", stmt }) as Record<string, any>[];
  };

  // 发送单个 pipeline 请求并维护 baton
  async function execRaw(req: any): Promise<any> {
    const body: any = { requests: [req] };
    if (baton) body.baton = baton;
    const res = await fetch(`${TURSO_DATABASE_URL}/v2/pipeline`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Turso HTTP ${res.status}: ${await res.text()}`);
    const json = await res.json();
    baton = json.baton;
    const result = json.results?.[0];
    const r = extractResult(result);
    if (r.error) {
      const e = new Error(r.error.message);
      (e as any).code = (r.error as any).code;
      throw e;
    }
    return decodeRows(r.rows, r.cols);
  };

  let committed = false;
  try {
    const tx = {
      get: async (sql: string, params: any[] = []) => (await exec({ sql, args: params.map(toArg) }))[0] ?? null,
      all: async (sql: string, params: any[] = []) => await exec({ sql, args: params.map(toArg) }),
      run: async (sql: string, params: any[] = []) => {
        await exec({ sql, args: params.map(toArg) });
      },
    };
    // 显式开启事务（baton 串行下语句默认 autocommit，必须 BEGIN）
    // write → BEGIN IMMEDIATE：立刻拿写锁，避免并发下 deferred 升级导致的 SQLITE_BUSY/重复写入
    // read  → BEGIN：默认 deferred 读事务
    await exec({ sql: mode === "write" ? "BEGIN IMMEDIATE" : "BEGIN", args: [] });
    const returnValue = await fn(tx);
    // COMMIT 单独分支：COMMIT 失败时事务状态不确定（可能已在服务端生效），
    // 不能像普通语句失败那样盲目重试/回滚——交由上层感知错误
    try {
      await exec({ sql: "COMMIT", args: [] });
      committed = true;
    } catch (commitErr) {
      throw commitErr;
    }
    return returnValue;
  } catch (e) {
    // 仅未提交时回滚；已提交（或 COMMIT 后状态未知）不回滚，避免误删已生效写入（规格 §16.1）
    if (!committed) {
      try {
        await exec({ sql: "ROLLBACK", args: [] });
      } catch { /* 忽略 */ }
    }
    throw e;
  } finally {
    // close 必须执行，否则 baton 泄漏到连接池
    await closeTx(baton, authHeaders);
  }
}

async function closeTx(baton: string | undefined, headers: Record<string, string>): Promise<void> {
  if (!baton) return;
  await fetch(`${TURSO_DATABASE_URL}/v2/pipeline`, {
    method: "POST",
    headers,
    body: JSON.stringify({ baton, requests: [{ type: "close" }] }),
  }).catch(() => {});
}
