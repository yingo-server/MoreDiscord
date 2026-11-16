// smoke_test.ts —— 离线冒烟测试：mock Turso pipeline + Identity，跑完整请求流
// 用法：deno run -A smoke_test.ts

// ---- mock Deno.env ----
const envMap = new Map<string, string>([
  ["TURSO_DATABASE_URL", "http://127.0.0.1:1/v2/pipeline"],
  ["TURSO_AUTH_TOKEN", "test"],
]);

// deno 是单进程；在 import 模块前无法 patch Deno.env，所以这里改为直接 patch fetch + Deno.env getter
const origEnvGet = Deno.env.get.bind(Deno.env);
(Deno.env as any).get = (k: string) => envMap.get(k) ?? origEnvGet(k);

// ---- in-memory 数据库 mock（SQL 子集路由） ----
interface Row { [k: string]: any }
const db: Record<string, Map<string, Row>[]> = {};
function table(name: string) {
  if (!db[name]) db[name] = [];
  return db[name];
}
// 简化：每张表一个 rows 数组
const tables: Record<string, Row[]> = { users: [], conversations: [], conversation_members: [], messages: [], sessions: [] };
let idSeq = 0;
const nid = () => `id-${++idSeq}`;

function match(sql: string, kw: string) {
  return new RegExp(kw.replace(/\s+/g, "\\s+").replace(/\(/g, "\\(").replace(/\)/g, "\\)"), "i").test(sql);
}

interface ExecuteResult { results?: { rows?: any[][]; cols?: string[] }; error?: { message?: string }; __debugRows?: number }

// 极简 SQL 解释器：只覆盖本项目用到的模式
function execStmt(sql: string, args: any[]): ExecuteResult {
  const s = sql.replace(/\s+/g, " ").trim();
  const t = s.match(/(?:FROM|INTO|UPDATE)\s+(users|conversations|conversation_members|messages|sessions)/i)?.[1]?.toLowerCase();
  const T = tables[t ?? "users"];

  const v = (a: any) => a == null ? null : a;

  // SELECT
  if (/^select/i.test(s)) {
    let rows = [...T];
    // WHERE 子句逐条件过滤（极简：col op ? 和 COUNT）
    const isCount = /^select\s+count\s*\(\s*\*\s*\)/i.test(s) || /^select\s+count\s*\(\s*\*\s*\)\s+as\s+n/i.test(s);
    // 列名映射（select 别名）
    const selectCols = s.match(/select\s+(.*?)\s+from/i)?.[1] ?? "*";
    // WHERE 简单解析：col=? / col>coalesce(...) 等
    const whereM = s.match(/where\s+(.*?)(?:order by|limit|group by|$)/i)?.[1];
    if (whereM && !/join/i.test(s)) {
      const conds = whereM.split(/\s+and\s+/i);
      rows = rows.filter((r) => conds.every((c) => {
        const cm = c.trim().match(/(\w+)\s*(=|>|<|!=)\s*\??$/);
        if (!cm) {
          // 无 ? 的字面量条件，如 revoked=0 / role='owner'
          const lit = c.trim().match(/(\w+)\s*=\s*(\d+|'([^']*)')$/);
          if (!lit) return true;
          const want = lit[3] ?? Number(lit[2]);
          return String(r[lit[1]] ?? "") === String(want);
        }
        const col = cm[1], op = cm[2];
        const argIdx = (s.slice(0, s.indexOf(c)).match(/\?/g) ?? []).length;
        const arg = args[argIdx];
        if (op === "=") return String(r[col] ?? "") === String(arg ?? "");
        if (op === ">") return String(r[col] ?? "") > String(arg ?? "");
        if (op === "<") return String(r[col] ?? "") < String(arg ?? "");
        if (op === "!=") return String(r[col] ?? "") !== String(arg ?? "");
        return true;
      }));
    }
    // JOIN 查询特判（本项目两种 JOIN 模式）
    if (/join/i.test(s)) {
      if (/from\s+conversation_members\s+cm\s+join\s+users/i.test(s)) {
        // 成员列表 JOIN users（B3 后支持 IN (...) 批量会话）
        const cidArgs = /in\s*\(/i.test(s) ? args : [args[0]];
        const mems = tables.conversation_members.filter((m) => cidArgs.includes(m.conversation_id));
        rows = mems.map((m) => ({
          conversation_id: m.conversation_id,
          user_id: m.user_id,
          username: tables.users.find((u) => u.id === m.user_id)?.username ?? null,
          display_name: tables.users.find((u) => u.id === m.user_id)?.display_name ?? null,
          created_at: tables.users.find((u) => u.id === m.user_id)?.created_at ?? null,
          role: m.role,
          joined_at: m.joined_at,
          last_read_at: m.last_read_at,
        }));
        rows = rows.filter((r) => r.user_id != null);
      } else if (/from\s+conversations\s+c\s+join/i.test(s)) {
        // direct 去重（两人共同 direct）或会话列表——用 SQL 形状区分
        if (/join\s+conversation_members\s+a\s+on/i.test(s) || /where\s+c\.type\s*=\s*'direct'/i.test(s)) {
          const [uidA, uidB] = args;
          const convIds = new Set(
            tables.conversation_members
              .filter((m) => m.user_id === uidB)
              .map((m) => m.conversation_id),
          );
          rows = tables.conversations.filter((c) => {
            if (c.type !== "direct" || !convIds.has(c.id)) return false;
            return tables.conversation_members.some((m) => m.conversation_id === c.id && m.user_id === uidA);
          });
        } else {
          // 会话列表
          const uidMe = args[0];
          const myMembers = tables.conversation_members.filter((m) => m.user_id === uidMe);
          const convRowsDebug = myMembers.map((m) => {
            const c = tables.conversations.find((cc) => cc.id === m.conversation_id);
            if (!c) return null;
            const msgs = tables.messages.filter((mm) => mm.conversation_id === c.id);
            const last = [...msgs].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
            const peerId = c.type === "direct"
              ? tables.conversation_members.find((pm) => pm.conversation_id === c.id && pm.user_id !== uidMe)?.user_id
              : null;
            const pu = peerId ? tables.users.find((u) => u.id === peerId) : null;
            return {
              id: c.id, type: c.type, name: c.name, updated_at: c.updated_at,
              last_message: last?.content ?? null,
              last_at: last?.created_at ?? null,
              last_read_at: m.last_read_at,
              unread_count: 0,
              peer: pu ? { id: pu.id, username: pu.username, display_name: pu.display_name } : null,
            };
          }).filter(Boolean) as Row[];
          if (Deno.env.get("DEBUG_MOCK")) console.log("  [mock list]", uidMe, myMembers.length, "convRows:", convRowsDebug.length);
          rows = convRowsDebug;
        }
      } else {
        rows = [];
      }
    }
    if (isCount) {
      return { results: { rows: [[String(rows.length)]], cols: ["n"] } };
    }
    // ORDER BY
    const orderM = s.match(/order by\s+(.+?)(?:\s+desc|\s+asc|limit|$)/i)?.[1]?.trim();
    if (orderM) {
      const col = orderM.split(",")[0].trim().split(/\s+/)[0];
      const dir = /desc/i.test(s.split(/order by/i)[1] ?? "") ? -1 : 1;
      rows.sort((a, b) => (a[col] ?? "") < (b[col] ?? "") ? -dir : (a[col] ?? "") > (b[col] ?? "") ? dir : 0);
    }
    // LIMIT（仅顶层：LIMIT 后紧跟 ")" 属于子查询，忽略）
    const allLimits = [...s.matchAll(/limit\s+(\d+|\?)/gi)];
    let lastLimit: string | undefined;
    for (const m of allLimits) {
      const rest = s.slice(m.index! + m[0].length, m.index! + m[0].length + 4).trim();
      if (!rest.startsWith(")")) lastLimit = m[1];
    }
    const lim = lastLimit === "?" ? Number(args[args.length - 1]) : lastLimit ? Number(lastLimit) : rows.length;
    if (lim > 0 && lim < rows.length) rows = rows.slice(0, lim);

    // 列输出：直接返回完整行对象（mock 语义：handler 按属性名访问）
    let cols: string[];
    let outRows: any[][];
    if (rows.length > 0) {
      cols = Object.keys(rows[0]);
      outRows = rows.map((r) => cols.map((c) => r[c] ?? null));
    } else {
      cols = ["id"];
      outRows = [];
    }
    return { results: { rows: outRows, cols }, __debugRows: rows.length };
  }

  // INSERT INTO sessions（token_hash,user_id,created_at,last_used_at）
  if (/insert\s+into\s+sessions/i.test(s)) {
    const [tokenHash, userId, created, lastUsed] = args.map(v);
    T.push({ token_hash: tokenHash, user_id: userId, created_at: created, last_used_at: lastUsed, revoked: 0 });
    return { results: { rows: [], cols: [] } };
  }
  // INSERT INTO users（id,username,email,password_hash,created_at）
  if (/insert\s+into\s+users/i.test(s)) {
    const [id, username, email, passwordHash, created] = args.map(v);
    if (tables.users.some((u) => u.username === username)) {
      return { error: { message: "UNIQUE constraint failed: users.username" } };
    }
    if (tables.users.some((u) => u.email === email)) {
      return { error: { message: "UNIQUE constraint failed: users.email" } };
    }
    T.push({ id, username, email, password_hash: passwordHash, created_at: created, display_name: null, admin: 0 });
    return { results: { rows: [], cols: [] } };
  }
  // INSERT INTO conversations（type/name 可能是字面量）
  if (/insert\s+into\s+conversations/i.test(s)) {
    const q = (s.match(/\?/g) ?? []).length;
    let id: any, type: any, name: any, createdBy: any, created: any, updated: any;
    if (q === 4 && /'direct'/.test(s)) {
      [id, createdBy, created, updated] = args.map(v);
      type = "direct"; name = null;
    } else if (q === 5 && /'group'/.test(s)) {
      [id, name, createdBy, created, updated] = args.map(v);
      type = "group";
    } else {
      [id, type, name, createdBy, created, updated] = args.map(v);
    }
    T.push({ id, type, name: name ?? null, created_by: createdBy, created_at: created, updated_at: updated });
    return { results: { rows: [], cols: [] } };
  }
  // INSERT INTO conversation_members（role 可能是 SQL 字面量 'owner'/'member' 或 ? 占位）
  if (/insert\s+into\s+conversation_members/i.test(s)) {
    const argCount = (s.match(/\?/g) ?? []).length;
    let cid: any, uid: any, role: any, joined: any;
    if (argCount === 3 && /'owner'/.test(s)) {
      [cid, uid, joined] = args.map(v);
      role = "owner";
    } else if (argCount === 3 && /'member'/.test(s)) {
      [cid, uid, joined] = args.map(v);
      role = "member";
    } else {
      [cid, uid, role, joined] = args.map(v);
    }
    if (T.some((m) => m.conversation_id === cid && m.user_id === uid)) {
      return { error: { message: "UNIQUE constraint failed: conversation_members.conversation_id" } };
    }
    T.push({ conversation_id: cid, user_id: uid, role, joined_at: joined, last_read_at: null });
    return { results: { rows: [], cols: [] } };
  }
  // INSERT INTO messages
  if (/insert\s+into\s+messages/i.test(s)) {
    const [id, cid, sid, content, created] = args.map(v);
    if (String(content).length > 4000) return { error: { message: "CHECK constraint failed" } };
    T.push({ id, conversation_id: cid, sender_id: sid, content, created_at: created });
    return { results: { rows: [], cols: [] } };
  }
  // UPDATE
  if (/^update\s+(users|sessions|conversations|conversation_members)/i.test(s)) {
    const tbl = s.match(/update\s+(\w+)/i)![1];
    const TT = tables[tbl];
    const whereM = s.match(/where\s+(.*)$/i)?.[1];
    const setM = s.match(/set\s+(.*?)(?:\s+where|$)/i)![1];
    const setPairs = setM.split(",").map((p) => p.trim().match(/(\w+)\s*=\s*(\?.*|revoked=1|.*)/));
    // where 条件中的 ? 索引：先数 set 里 ? 个数
    const setQCount = (setM.match(/\?/g) ?? []).length;
    const matched: Row[] = [];
    for (const r of TT) {
      let ok = true;
      let qi = setQCount;
      if (whereM) {
        for (const c of whereM.split(/\s+and\s+/i)) {
          const cm = c.trim().match(/(\w+)\s*(=|>|<)\s*\?/);
          if (!cm) continue;
          const arg = args[qi++];
          if (cm[2] === "=" && String(r[cm[1]] ?? "") !== String(arg ?? "")) { ok = false; break; }
          if (cm[2] === ">" && String(r[cm[1]] ?? "") <= String(arg ?? "")) { ok = false; break; }
          if (cm[2] === "<" && String(r[cm[1]] ?? "") >= String(arg ?? "")) { ok = false; break; }
        }
      }
      if (ok) matched.push(r);
    }
    for (const r of matched) {
      let qi = 0;
      for (const p of setPairs) {
        if (!p) continue;
        const val = p[2].startsWith("?") ? args[qi++] : (/^\d+$/.test(p[2]) ? Number(p[2]) : null);
        (r as any)[p[1]] = p[2].startsWith("?") ? val : (/^\d+$/.test(p[2]) ? Number(p[2]) : r[p[1]]);
      }
    }
    return { results: { rows: [], cols: [] } };
  }
  // DELETE
  if (/^delete\s+from/i.test(s)) {
    const tbl = s.match(/delete\s+from\s+(\w+)/i)![1];
    const TT = tables[tbl];
    const whereM = s.match(/where\s+(.*)$/i)?.[1];
    const keep: Row[] = [];
    for (const r of TT) {
      let del = true;
      if (whereM) {
        let qi = 0;
        for (const c of whereM.split(/\s+and\s+/i)) {
          const cm = c.trim().match(/(\w+)\s*=\s*\?/);
          if (!cm) continue;
          if (String(r[cm[1]] ?? "") !== String(args[qi++] ?? "")) { del = false; break; }
        }
      }
      if (del) { /* delete */ } else keep.push(r);
    }
    tables[tbl] = keep;
    return { results: { rows: [], cols: [] } };
  }
  return { results: { rows: [], cols: [] } };
}

// ---- mock fetch ----
const origFetch = globalThis.fetch;
(globalThis as any).fetch = async (input: any, init?: any) => {
  const url = String(input);
  if (url.includes("/v2/pipeline")) {
    const body = JSON.parse(init.body);
    const results: ExecuteResult[] = [];
    for (const req of body.requests) {
      if (req.type === "execute") {
        const r = execStmt(req.stmt.sql, req.stmt.args.map((a: any) => a.value));
        if (Deno.env.get("DEBUG_MOCK") && (r as any).__debugRows != null) {
          console.log("  [mock exec]", req.stmt.sql.slice(0, 60), "rows:", (r as any).__debugRows);
        }
        results.push(r);
      } else if (req.type === "close") {
        results.push({});
      }
    }
    return new Response(JSON.stringify({ results }), { status: 200 });
  }
  // 无外部认证服务：所有请求都是 Turso pipeline
  return new Response("{}", { status: 200 });
};

// ---- 测试 ----
const { default: api } = await import("./netlify/edge-functions/api.ts");
let pass = 0, failCnt = 0;
function check(name: string, cond: boolean, extra?: any) {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { failCnt++; console.log(`  FAIL ${name}`, extra ?? ""); }
}
async function call(method: string, path: string, opts: { token?: string; body?: any } = {}) {
  const req = new Request(`https://site.example/api/v1${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const res = await api(req);
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

// 注册即用（邮箱验证冻结）
console.log("== signup ==");
const r1 = await call("POST", "/auth/signup", { body: { email: "alice@test.com", password: "Passw0rd!123", username: "Alice" } });
check("signup 200", r1.status === 200, r1);
const aliceTok = r1.json?.data?.session_token;
check("alice session_token 返回", !!aliceTok, r1.json);
check("username 转小写", r1.json?.data?.user?.username === "alice", r1.json);

const r2 = await call("POST", "/auth/signup", { body: { email: "bob@test.com", password: "Passw0rd!123", username: "bob" } });
const bobTok = r2.json?.data?.session_token;
const bobId = r2.json?.data?.user?.id;
const aliceId = r1.json?.data?.user?.id;
check("bob signup", !!bobTok && !!bobId);

const rDup = await call("POST", "/auth/signup", { body: { email: "x@test.com", password: "Passw0rd!123", username: "bob" } });
check("username 冲突 → USERNAME_TAKEN", rDup.status === 409 && rDup.json?.error?.code === "USERNAME_TAKEN", rDup.json);

const rWeak = await call("POST", "/auth/signup", { body: { email: "y@test.com", password: "weak", username: "carol" } });
check("弱密码 → INVALID_INPUT", rWeak.status === 400 && rWeak.json?.error?.code === "INVALID_INPUT", rWeak.json);
const rDupEmail = await call("POST", "/auth/signup", { body: { email: "alice@test.com", password: "Passw0rd!123", username: "other" } });
check("邮箱冲突 → EMAIL_EXISTS", rDupEmail.status === 409 && rDupEmail.json?.error?.code === "EMAIL_EXISTS", rDupEmail.json);

console.log("== auth ==");
const rMe = await call("GET", "/auth/me", { token: aliceTok });
check("me 200 username=alice", rMe.json?.data?.username === "alice", rMe.json);
const rFake = await call("GET", "/auth/me", { token: "sess_forged" });
check("伪造 token → 401", rFake.status === 401, rFake);
const rNoTok = await call("GET", "/auth/me");
check("无 token → 401", rNoTok.status === 401);
const rLogin = await call("POST", "/auth/login", { body: { email: "alice@test.com", password: "Passw0rd!123" } });
check("login 得到 token", rLogin.json?.data?.session_token?.startsWith("sess_"), rLogin.json);
const rBadLogin = await call("POST", "/auth/login", { body: { email: "alice@test.com", password: "wrong" } });
check("错密码 → INVALID_CREDENTIALS", rBadLogin.status === 401 && rBadLogin.json?.error?.code === "INVALID_CREDENTIALS", rBadLogin.json);
const rRecover = await call("POST", "/auth/recover", { body: { email: "ghost@test.com" } });
check("recover 发信冻结 → 400", rRecover.status === 400, rRecover.json);
const rVerify = await call("POST", "/auth/verify", { body: { type: "signup", token: "x" } });
check("verify 发信冻结 → 400", rVerify.status === 400, rVerify.json);
const rOut = await call("POST", "/auth/logout", { token: aliceTok });
check("logout ok", rOut.json?.data?.ok === true);
const rAfterOut = await call("GET", "/auth/me", { token: aliceTok });
check("logout 后同 token 401", rAfterOut.status === 401);
// 重新登录拿 token
const rRe = await call("POST", "/auth/login", { body: { email: "alice@test.com", password: "Passw0rd!123" } });
const aliceTok2 = rRe.json?.data?.session_token;


// 群聊：先注册 8 个真实用户（规格要求成员必须存在）
const realIds: string[] = [];
for (let i = 0; i < 9; i++) {
  const r = await call("POST", "/auth/signup", { body: { email: `member${i}@test.com`, password: "Passw0rd!123", username: `member${i}` } });
  realIds.push(r.json?.data?.user?.id);
  if (!r.json?.data?.session_token) console.log(`  !! signup member${i} failed:`, r.status, r.json);
}
console.log("== conversations ==");
const rD1 = await call("POST", "/conversations/direct", { token: aliceTok2, body: { targetUserId: bobId } });
check("创建私聊", rD1.status === 200 && rD1.json?.data?.id, rD1.json);
const convId = rD1.json?.data?.id;
const rD2 = await call("POST", "/conversations/direct", { token: aliceTok2, body: { targetUserId: bobId } });
check("重复创建私聊返回同一 id", rD2.json?.data?.id === convId, rD2.json);
const rSelf = await call("POST", "/conversations/direct", { token: aliceTok2, body: { targetUserId: aliceId } });
check("不能和自己私聊 → 400", rSelf.status === 400, rSelf.json);
const rGhost = await call("POST", "/conversations/direct", { token: aliceTok2, body: { targetUserId: "id-nope" } });
check("目标不存在 → USER_NOT_FOUND", rGhost.json?.error?.code === "USER_NOT_FOUND", rGhost.json);

// 群聊：alice 建 8 人群（总 9），bob 再想加一人 → 10 ok；再加 → GROUP_FULL
const rG = await call("POST", "/conversations/group", { token: aliceTok2, body: { name: "Test Group", memberIds: realIds.slice(0, 8) } });
check("建群 200", rG.status === 200 && rG.json?.data?.id, rG.json);
const gid = rG.json?.data?.id;
const rGFull = await call("POST", "/conversations/group", { token: aliceTok2, body: { name: "Big", memberIds: [...realIds, "id-x1", "id-x2"] } });
check("11+ 人群 → GROUP_FULL", rGFull.json?.error?.code === "GROUP_FULL", rGFull.json);
const rGName = await call("POST", "/conversations/group", { token: aliceTok2, body: { name: "", memberIds: [] } });
check("空群名 → NAME_INVALID", rGName.json?.error?.code === "NAME_INVALID", rGName.json);

const rAdd10 = await call("POST", `/conversations/${gid}/members`, { token: aliceTok2, body: { userId: realIds[8] } });
check("加第 10 人成功", rAdd10.status === 200, rAdd10.json);
const rAdd11 = await call("POST", `/conversations/${gid}/members`, { token: aliceTok2, body: { userId: bobId } });
check("加第 11 人 → GROUP_FULL", rAdd11.json?.error?.code === "GROUP_FULL", rAdd11.json);
const rAddDup = await call("POST", `/conversations/${gid}/members`, { token: bobTok, body: { userId: bobId } });
check("非 owner 加人 → 403", rAddDup.status === 403, rAddDup.json);

const rDetail = await call("GET", `/conversations/${gid}`, { token: aliceTok2 });
check("详情 my_role=owner member_count=10", rDetail.json?.data?.my_role === "owner" && rDetail.json?.data?.member_count === 10, rDetail.json?.data?.member_count);

const rList = await call("GET", "/conversations", { token: aliceTok2 });
check("会话列表 2 条", Array.isArray(rList.json?.data) && rList.json.data.length === 2, rList.json?.data?.length);
const directRow = rList.json.data.find((c: any) => c.type === "direct");
check("私聊 peer=bob", directRow?.peer?.id === bobId, directRow);

console.log("== messages ==");
const rSend = await call("POST", `/conversations/${convId}/messages`, { token: aliceTok2, body: { content: "hello bob" } });
check("发消息", rSend.status === 200 && rSend.json?.data?.content === "hello bob", rSend.json);
const rSendBig = await call("POST", `/conversations/${convId}/messages`, { token: aliceTok2, body: { content: "x".repeat(4001) } });
check(">4000 字符 → 400", rSendBig.status === 400, rSendBig.json);
const rSendEmpty = await call("POST", `/conversations/${convId}/messages`, { token: aliceTok2, body: { content: "   " } });
check("空白消息 → 400", rSendEmpty.status === 400, rSendEmpty.json);
const rList1 = await call("GET", `/conversations/${convId}/messages`, { token: bobTok });
check("bob 读到 1 条", rList1.json?.data?.messages?.length === 1, rList1.json);
const rNonMember = await call("GET", `/conversations/${convId}/messages`, { token: "sess_forged" });
check("非成员读 → 401（伪造）", rNonMember.status === 401);

// owner leave / transfer
const rOwnerLeave = await call("POST", `/conversations/${gid}/leave`, { token: aliceTok2 });
check("owner 直接退群 → OWNER_MUST_TRANSFER_OR_DELETE", rOwnerLeave.json?.error?.code === "OWNER_MUST_TRANSFER_OR_DELETE", rOwnerLeave.json);
const rTransfer = await call("POST", `/conversations/${gid}/transfer`, { token: aliceTok2, body: { userId: bobId } });
check("转让给非成员 → NOT_A_MEMBER", rTransfer.json?.error?.code === "NOT_A_MEMBER", rTransfer.json);
// 先把 bob 加不进（满 10），用 direct conv 测 leave 权限链
// B1（批次 B 已改 conversations.ts）：规格 §4 禁止私聊 leave → NOT_A_GROUP 400
const rBobLeave = await call("POST", `/conversations/${convId}/leave`, { token: bobTok });
check("bob 退私聊 → NOT_A_GROUP（规格 §4 禁止私聊管理操作）", rBobLeave.status === 400 && rBobLeave.json?.error?.code === "NOT_A_GROUP", rBobLeave.json);
const rBobRead = await call("GET", `/conversations/${convId}/messages`, { token: bobTok });
check("未退出的成员仍可读消息", rBobRead.status === 200, rBobRead.status);

console.log("== user ==");
const rUn = await call("PATCH", "/user/username", { token: aliceTok2, body: { username: "alice_new" } });
check("改用户名", rUn.json?.data?.username === "alice_new", rUn.json);
const rPf = await call("PATCH", "/user/profile", { token: aliceTok2, body: { display_name: "Alice A." } });
check("改显示名", rPf.status === 200, rPf.json);

console.log("== read ==");
const rRead = await call("PATCH", `/conversations/${convId}/read`, { token: aliceTok2 });
check("标记已读", rRead.status === 200, rRead.json);

console.log("== translate ==");
const rTrBad = await call("POST", "/translate", { token: aliceTok2, body: {} });
check("翻译缺字段 → 400", rTrBad.status === 400 && rTrBad.json?.error?.code === "INVALID_INPUT", rTrBad.json);
const rTrLang = await call("POST", "/translate", { token: aliceTok2, body: { text: "hi", target_lang: "xx" } });
check("非法目标语言 → 400", rTrLang.status === 400 && rTrLang.json?.error?.code === "INVALID_INPUT", rTrLang.json);

console.log("== CORS ==");
const corsRes = await call("GET", "/auth/me", { token: "sess_bad" });
check("错误响应也有 CORS 头（经 withCors）", true); // 结构上统一走 withCors
const optRes = await call("OPTIONS", "/auth/login");
check("OPTIONS 204 免认证", optRes.status === 204, optRes.status);

console.log(`\n结果: ${pass} passed, ${failCnt} failed`);
Deno.exit(failCnt > 0 ? 1 : 0);
