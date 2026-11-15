# AUDIT_BACKEND.md — 后端静态审查报告（只读，未修改任何代码）

基线 commit `4efb006`（工作区干净）。参照：规格 `Pasted_20261114-235855-d7423426.txt` §1–§16、本仓库 `api.md`、`schema.sql`、`git log`、GoTrue/Supabase auth 上游源码（网络核实响应结构）。

严重度：**致命 / 高 / 中 / 低**。所有结论均为静态审查；未执行 `deno check`、`smoke_test.ts`、真实 Turso v2 pipeline、线上库查询，相关子项明确标注「未覆盖」。

## 汇总（8 项 PASS 数 / 问题数）

| # | 审查项 | PASS | 问题 | 结论 |
|---|---|---|---|---|
| 1 | 路由 | 2 | 3 | 有问题 |
| 2 | 认证 | 4 | 7 | 有问题 |
| 3 | 事务 | 6 | 5 | 有问题 |
| 4 | 权限 | 2 | 5 | 有问题 |
| 5 | 数据 | 2 | 6 | 有问题 |
| 6 | CORS/响应 | 2 | 3 | 有问题 |
| 7 | 并发与边界 | 4 | 6 | 有问题 |
| 8 | 已知遗留 | 0 | 1 | 代码缺陷为主 |
| | **合计** | **22** | **36** | |

### 未覆盖子项（按委托方效率指令不补齐）
- `deno check api.ts` 类型检查、`deno run -A smoke_test.ts` 实跑 —— **未覆盖**（环境 `deno 2.0.6` 已确认可用，未执行）。
- 真实 Turso `/v2/pipeline` 响应结构实测 —— **未覆盖**；仓库无 `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN`（已确认 not set），无法连真库；`smoke_test.ts` mock 的是旧形状 `{results:{rows,cols}}`。
- 线上库 `PRAGMA foreign_keys`、`users.admin` / `audit_log` 是否曾手工迁移 —— **未覆盖**（只能依据仓库唯一建表脚本 `schema.sql` 判断）。
- `frontend/` 业务逻辑、`assets/*` 构建产物 —— **未覆盖**（仅用其调用点交叉验证后端字段）。
- 全部 31 条路径×方法的逐行自动比对脚本 —— **未覆盖**（已人工逐条核对，见第 1 项）。

---

## 1. 路由 — PASS 2 / 问题 3

**PASS-1.1（低）· 31 端点与 api.md 路径集一致（文档层）**
依据：`api.ts:23–33,37,61–68,73–80,87–120` 共 22 个业务方法+路径，与规格 §6 总表 22 条逐条一致；加 `GET /`（`:20`）、`OPTIONS *`（`:14`）为 24 业务侧。`api.ts:50–55` 的 admin 白名单覆盖 `api.md:219–270` 的 7 条路径 / 8 个方法组合（`/admin/stats/overview`、`/admin/users`、`/admin/users/:id` GET+PATCH、`/admin/channels`、`/admin/channels/:id` DELETE、`/admin/channels/:id/messages`、`/admin/audit-log`）。背景「24+7=31」按路径计成立，按方法计为 32，属计数口径差异非缺陷。

**PASS-1.2（低）· `methodAllowed` 覆盖全部动态路由，404-before-auth 未误杀合法路径**
依据：`api.ts:138–147` 逐一覆盖 `""`、`/members`、`/members/:userId`、`/leave`、`/transfer`、`/read`、`/messages`、`/messages/sync`，与 `:83–120` dispatch 方法完全一致；`/messages/sync`（`:145`）与 `/admin/*`（`:51–55`）均在预检内。预检 `convPreMatch`（`:42`）与分发 `convMatch`（`:71`）使用同一正则 `^/conversations/([A-Za-z0-9-]+)(\/.*)?$`，不会产生「预检通过却分发不到」或反之的合法路径误杀。`git show 4d87111` 确认该预检是本次修复新增。

**问题-1.A（致命）· 7 个 admin 端点全部不可达：`api.ts` 无 `import * as admin`、无任何 `admin.*` dispatch**
依据：`rg -n 'admin\.|handlers/admin|adminList|adminStats|adminAudit|adminGet|adminPatch|adminDelete' netlify/edge-functions/api.ts` → 仅 `:50–55` 白名单，零 dispatch。请求穿过 `:59 requireUser` 后落到 `:123 fail(...,404)`；`handlers/admin.ts` 整文件为死代码，`requireAdmin`（`admin.ts:11–16`）永不执行。`git log -S'adminListUsers' -- netlify/edge-functions/api.ts` + `git show 5809a6f:.../api.ts | rg -n admin` 证实：`5809a6f` 曾有 `import * as admin`（第 10 行）与 `:106–135` 的 8 条完整 dispatch；`0b4228f`（前端重写）整体删除；`4d87111`「404-before-auth 修复」只把 admin 路径加进 `known` 放行鉴权，**未补回 dispatch**，属修复引入的回归。附带后果：未认证访问 `/admin/*` 先被 `:59` 鉴权返回 401 而非 404，预检目的落空。

**问题-1.B（中）· 预检白名单过宽 + 错误码/状态自相矛盾**
依据：`api.ts:44` 把 `PATCH /`、`DELETE /` 判为 known，但 `:20` 仅处理 `GET /` → 二者穿过鉴权后仍由 `:123` 返回 404（未认证时变 401）。`:57` 与 `:123` 使用 `fail("INVALID_INPUT", ..., 404)`，而 `response.ts:25` 定义 `INVALID_INPUT=400` → 同一 code 出现 400/404 两种状态，破坏 §11 契约。

**问题-1.C（高）· 双重/三重鉴权，违反 §2「50ms CPU / 一次查询写入」**
依据：`api.ts:59` 已 `requireUser(req)`；`conversations.ts` 12 处、`messages.ts` 3 处（`rg -n requireUser` 实测）、`user.ts` 2 处再调 `requireUser(ctx.req)`；`handlers/auth.ts:169` 的 `me` 又 `resolveUserId` → 单请求 2–3 次 `getAndRun`（每次 1 次 Turso pipeline + 1 次条件 UPDATE），并放大续期竞态（见 2.F）。

---

## 2. 认证 — PASS 4 / 问题 7

**PASS-2.1 · `getAndRun` 合并 SELECT+UPDATE 正确**
依据：`db.ts:95–110` 一条 `/v2/pipeline` 带 2 条 `execute`，`:103–106` 逐 entry 检查 error，`:107–109` 取 `results[0]` 解码返回。SELECT 只读、UPDATE 只改节流字段，二者无原子性依赖，`:92` 注释「无 baton 可接受」自洽。

**PASS-2.2 · 透明续期分支未遗漏 `last_used_at`**
依据：`auth.ts:149–152` UPDATE 明确含 `last_used_at=?`（`nowIso()`）。次要语义偏差：该 UPDATE 无条件覆盖，绕过 `getAndRun`（`:137`）的 60s 节流口径，非「遗漏」。

**PASS-2.3 · token 哈希 / revoked / 401 处理正确**
依据：`sha256Hex`（`auth.ts:17–20`）→ 十六进制入库（`createSession:116–120`）；`:135` `WHERE token_hash=? AND revoked=0`；`requireUser:171–175` 抛 `UNAUTHORIZED` → `response.ts:32` = 401；`logout`（`handlers/auth.ts:151–154`）→ `revokeSessionByRequest`（`auth.ts:164–167`）；`smoke_test.ts:377–390` 有伪造 token / 登出后 401 断言（未实跑）。低风险：`:126` 用 `.replace("Bearer ","")` 而非严格 scheme 解析。

**PASS-2.4 · signup 预留/回填/补偿三条分支齐备**
依据：`handlers/auth.ts:19–25`（预留，UNIQUE→`USERNAME_TAKEN`）、`:33–38`（Identity 失败补偿）、`:40–43`（无 id 补偿）、`:45–50`（回填失败补偿）；`auth.ts:189–191` 删除带 `username + tempId` 双条件，不会误删他人行。事务缺陷另计 2.B。

**问题-2.A（致命）· `verify()` 恒返回 500，密码重置吊销旧会话永不执行**
依据：`handlers/auth.ts:85` `const identityUser = tokens?.id ?? null`；GoTrue `/verify` 成功返回 `AccessTokenResponse`（上游 `supabase/auth/internal/api/verify.go:310` `sendJSON(w,200,token)`，形状 `{access_token,refresh_token,expires_in,token_type,user:{id,...}}`），**顶层无 `id`** → `:92–95` 必然 `INTERNAL_ERROR 500`；`:88–90` 的 `type=recover` 分支因同一判空永不触发。`smoke_test.ts:324–326` 的 mock 伪造 `{id:"id-bob",...}` 掩盖此 bug。可用修复线索已存在：`handlers/auth.ts:125` 的 `atobUrl(access_token.split(".")[1]).sub`，或 `tokens.user.id`，或调用已导出却从未被引用的 `identityGetUser`（`auth.ts:103–110`，死码）。

**问题-2.B（高）· signup 预留/回填/补偿不在事务内，违反 §7.1 / §16.1**
依据：`auth.ts:178–191` 的 `reserveUsername`/`backfillUserId`/`compensateUser` 均为单条 `dbRun` autocommit；`handlers/auth.ts:19–50` 全程无 `transaction`。跨 3+ 次 HTTP 的窗口内进程中断/补偿失败 → 遗留临时 ID 的 `users` 行（username 被永久占用、`users.id` 与 Identity 不符）。`:186` `UPDATE users SET id=?` 改动主键：SQLite 未开 `foreign_keys` 时不校验，开启且已有引用时失败，无级联 → 孤儿/不一致风险。

**问题-2.C（高）· `EMAIL_EXISTS` 完全未映射，邮箱冲突返回 500**
依据：`mapIdentityError`（`auth.ts:55–75`）不识别 GoTrue 422 `{"msg":"User already registered"}`（`smoke_test.ts:317` 正是此真实串）→ 落到 `:74` `INTERNAL_ERROR 500`。`response.ts:39` 定义 `EMAIL_EXISTS:409` 但全代码无抛出点（`rg -n EMAIL_EXISTS` 仅该行 + 文档）；`api.md:38` 明确声明 signup 错误含 `EMAIL_EXISTS`。

**问题-2.D（中）· 未确认邮箱登录误判（详见第 8 项）**
依据：`mapIdentityError:61` 的 `invalid_grant` 分支排在 `:67` 的 `confirm` 分支之前；`netlify/gotrue` 旧版 `api/token.go:80–82` 返回 `{"error":"invalid_grant","error_description":"Email not confirmed"}` → 恒判 `INVALID_CREDENTIALS 401`，`EMAIL_NOT_CONFIRMED 403`（`api.md:99`）不可达。

**问题-2.E（中）· 密码重置吊销旧会话不在事务内；事务版实现是死码**
依据：`handlers/auth.ts:89` 调 `revokeAllUserSessions`（`auth.ts:160–162`，单条 `dbRun`），违反 §16.1/§16.8「必须在 db.transaction 内」；`auth.ts:194–198` 的 `revokeSessionsForUser`（BEGIN+UPDATE）写好后**从未被调用**（`rg` 全量确认）。单条 UPDATE 原子性可用，属规格违背。

**问题-2.F（高）· 续期失败即永久吊销 + refresh token rotation 竞态**
依据：`refreshIdentityToken`（`auth.ts:85–91`）吞掉所有异常（含网络抖动 / Identity 5xx）返回 null → `:145–147` 无条件 `UPDATE sessions SET revoked=1` 永久废掉会话。GoTrue 刷新会轮换 refresh_token，两个并发请求（1.C 让单请求内就有 2–3 次 resolve）用同一旧 token，第二个失败会**把刚成功续期的同一会话也吊销**。规格 §5.2 仅接受「偶发 401」，实际为「瞬时故障 → 强制登出」。

**问题-2.G（低）· 弱密码映射与规格字面冲突**
依据：`auth.ts:64–66` 把 `Password should be at least 8 characters` → `INVALID_INPUT 400`，与 §11 表、`api.md:38` 一致，但与 §7.1 步骤 5「映射 `EMAIL_EXISTS/WEAK_PASSWORD`」字面冲突。§16.12 禁止发明错误码，按表实现可接受，判为规格自身矛盾。

---

## 3. 事务 — PASS 6 / 问题 5

**PASS-3.1** 显式 `BEGIN`/`COMMIT`/`ROLLBACK`（`db.ts:183,185,191`）✓
**PASS-3.2** baton 维护：每次 `execRaw` 后 `baton = json.baton`（`:163`），请求体携带（`:155`）；成功 `:186`、异常 `:193` 两条路径均 `closeTx`（`:198–205`，`{type:"close"}`）✓
**PASS-3.3 · `toArg` 编码** `:112–118`：null→`{type:"null",value:null}`、integer/float→`{type,value:String(v)}`（Hrana 要求 integer 为字符串）、text→`String(v)`；`decodeVal`（`:30–45`）兼容 `{type,value}` 与 `{integer|float|text|blob|null}` 两种值编码。缺 blob/boolean 显式分支，本项目不传 → 低风险。
**PASS-3.4 · `extractResult` 兼容真实 v2（但测试未覆盖）** `:58–60` 覆盖 `entry.response.result`（生产形状）、`entry.results`（mock 形状）、`entry.result`，错误取 `entry.error ?? r.error`；`decodeRows`（`:47–54`）兼容 `cols:[{name}]` 与字符串数组。**反面证据**：`interface TursoResult`（`:7–10`）声明的形状与真实 v2 不符；`smoke_test.ts:31,129,165,171,206,214` 全程 mock 成旧形状 → 真实 v2 包装的兼容路径**未覆盖**。
**PASS-3.5 · 10 人上限在事务内 COUNT+INSERT** `conversations.ts:232–248` 在 `transaction` 内先 `SELECT COUNT(*)`（`:234`）≥10 抛 `GROUP_FULL`（`:236`）再 INSERT（`:243`）；`createGroup:181–182` 的上限校验在事务外，但 `memberIds` 为本请求内固定去重数组（`:179`），无并发可改变待插行数，等价安全。串行化缺陷另计 3.A。
**PASS-3.6 · 私聊去重 JOIN 在事务内** `conversations.ts:146–171` 事务内双 JOIN 查既有 `direct`（`:148–154`）→ 命中返回同 id，否则建 conversation + 2 条 member（`:158–169`）。

**问题-3.A（高）· `mode` 参数从未使用，一律 `BEGIN`（deferred）而非 `BEGIN IMMEDIATE`**
依据：`transactionRun(mode, fn)`（`db.ts:138–141`）内 `mode` 未被读取，`:183` 恒 `BEGIN`。deferred 事务首条为 `SELECT COUNT(*)`（3.5）时不加写锁 → 两个并发 `addMember` 都读到 9 再 INSERT，**可产生 11 人群**（违反 §15 验收「并发加第 10 人不会变 11」）；`createDirect` 两并发都查不到 → **重复私聊**（§15「创建私聊两次返回同一 id」仅串行成立）。§1 最高原则第 5 条未真正兑现。

**问题-3.B（高）· 事务内每条语句一次独立 HTTP 往返**
依据：`execRaw`（`:153–172`）每次 `fetch /v2/pipeline` 只带 1 条语句。一次建群 = BEGIN + 1 conv + 1 owner + N members + COMMIT + close ≈ 7–15 次往返；叠加 1.C 的 2–3 次鉴权与 5.E 的 N+1 查询，远超 §2 的 50ms 预算，Edge 下极易超时。

**问题-3.C（中）· COMMIT 异常把已提交事务报成失败**
依据：`:185` COMMIT 抛错即进 `:188` catch，再尝试 ROLLBACK（事务已提交，异常被 `:192` 吞掉）后 `throw e` → 客户端 500 但写入已生效，重试产生重复数据。

**问题-3.D（中）· ROLLBACK 不保证生效**
依据：`:190–192` 吞掉 ROLLBACK 异常；若原错误发生在 `res.ok=false`（`:161`，baton 未更新），ROLLBACK 发到旧 baton 可能失败，最终靠 `closeTx` 关闭连接时隐式回滚兜底，而非规格要求的显式回滚。

**问题-3.E（低）· `close()` 非 `finally` 结构**
依据：规格 §16.1 要求 finally；实现靠 try/catch 双路径各写一次（`:186,193`），当前覆盖完整但未来在两处之间插入语句即泄漏 baton。

---

## 4. 权限 — PASS 2 / 问题 5

**PASS-4.1 · owner 规则（代码层）全部正确**
依据：唯一 owner（`createGroup:197` 仅 1 条 owner；`transferOwnership:311–312` 先降旧再升目标；`addMember:244` 只插 member）；不能自移除（`removeMember:256–258` → `CANNOT_REMOVE_OWNER`）；owner 退群拒绝（`leaveConversation:277–279` → `OWNER_MUST_TRANSFER_OR_DELETE`）；转让同步 `created_by`（`:313`，§9.10）；私聊改名 → `NOT_A_GROUP`（`renameConversation:215`）；`requireOwner`（`conversations.ts:21–27`）先查会话再验 role。缺 DB 层 partial unique index 保证唯一 owner（低风险，无其他并发写 role 路径）。

**PASS-4.2 · 移除后立即失权**
依据：`messages.ts:10–18 requireMemberRead` 与 `conversations.ts:12–19 requireMember` 每次实时查 `conversation_members`，无缓存 → 移除后下一次读即 403（§16.4）。

**问题-4.A（致命）· `requireAdmin` 门禁全部不可达**（与 1.A 同源，权限维度独立计）：`admin.ts:11–16` 实现正确且 8 个 handler 首行均调用，但 `api.ts` 无 dispatch，任何请求到不了此处。

**问题-4.B（高）· admin 依赖的库对象不存在**
依据：`admin.ts:13,35,50,76,83,90,186` 依赖 `users.admin`（schema 无列）；`:86,129` `INSERT INTO audit_log`、`:166` `FROM audit_log`（schema 无表，全库 `rg -i 'create table audit_log|alter table'` 零命中）。即使接通路由，8/8 admin 端点仍 500，且 `adminPatchUser`/`adminDeleteChannel` 会因 INSERT 失败**回滚整个事务**（权限变更/解散被连带撤销）。线上是否手工迁移 → **未覆盖**。

**问题-4.C（中）· 私聊允许 `leave`，违反 §4「私聊双方均 member，无私聊管理操作」**
依据：`leaveConversation:277` 仅拒绝 `type==="group" && role==="owner"` → 私聊 member 可删自己那行，会话变单成员、peer 消失；再调 `createDirect` 因去重 JOIN 要求双方都在而新建会话，历史消息分裂为两个不可达会话。

**问题-4.D（中）· 审计日志 detail 未白名单**
依据：`admin.ts:87` `JSON.stringify(ctx.body)` 原样落库；`adminPatchUser`（`:64–92`）只处理 `admin`/`display_name`，其余字段静默忽略但仍写入 detail → 客户端附加任意字段（含密码类字符串）会持久化。

**问题-4.E（中，线上配置未覆盖）· 解散保留 messages 与 FK 冲突**
依据：`schema.sql:39` `FOREIGN KEY (conversation_id) REFERENCES conversations(id)` 无 `ON DELETE CASCADE`；若线上 `PRAGMA foreign_keys=ON`，`deleteConversation:291` / `adminDeleteChannel:127` 删除 conversations 行会被 FK 阻止 → 解散恒 500，与 §16.5 冲突。Deno 端无法设置该 PRAGMA；线上值 **未覆盖**。

---

## 5. 数据 — PASS 2 / 问题 6

**PASS-5.1 · 规格 §4 的 3 条索引齐全**：`schema.sql:56–58` `idx_messages_conv_time`、`idx_members_user`、`idx_sessions_user` ✓
**PASS-5.2 · `presence.ts lastSeenMap` 批量查询正确**：`:25–29` `WHERE revoked=0 AND user_id IN (?,...) GROUP BY user_id MAX(last_used_at)`；`:24` 只拼 `?` 个数、值全参数化；`:31` 过滤 `r.user_id && r.last_seen_at` 处理 NULL；调用方 `conversations.ts:80,127` 用 `?? null` 兜底缺失用户；`isOnline`（`:6–11`）对非法日期 `Number.isNaN` → false；`displayName.ts:19,33,50` 排序口径 `ORDER BY created_at ASC, id ASC` 与 `getTagByUser`（`:31–35`）复合比较一致 ✓

**问题-5.A（致命）· `schema.sql` 缺 `users.admin` 列**
依据：`schema.sql:5–11` 无 admin；`admin.ts` 7 处引用 → `no such column: admin`，全部 admin 端点 SQL 失败。

**问题-5.B（致命）· `schema.sql` 缺 `audit_log` 表**
依据：全库 `rg` 仅 `admin.ts:86,129,166` 引用，无 `CREATE TABLE audit_log`、无 `ALTER TABLE`、无迁移脚本；README:9 仍称 schema.sql 为「Turso 全量建表 SQL」，与代码严重脱节。

**问题-5.C（致命）· `schema.sql` 用 `#` 作注释，SQLite 不认**
依据：`schema.sql:1–3` 以 `#` 开头；已实测 `python3 -c "sqlite3.connect(':memory:').executescript('# comment\nCREATE TABLE t(a);')"` → `unrecognized token: "#"`。README:32 指示 `turso db shell chat < schema.sql` → **按文档部署第一行即失败**（SQLite 只认 `--` / `/* */`）。

**问题-5.D（中）· 缺「3+1」中的第 4 组索引**
依据：admin/presence/tag 功能引入后 schema 未同步。`displayName.ts:19,31,50` 的 `WHERE COALESCE(display_name,username)=? ORDER BY created_at,id`（表达式，全表扫）、`presence.ts:26` `revoked=0 AND user_id IN ... GROUP BY`（`idx_sessions_user` 需回表过滤）、`admin.ts:106,146,167` 的 `(created_at,id)<(?,?)` 排序、`audit_log(created_at,id)`（表都不存在）均无索引，§2 预算下性能风险。

**问题-5.E（高）· `getTag`/`attachTags` 的 N+1 与大量额外往返**
依据：`attachTags`（`displayName.ts:48`）按 distinct 显示名**每组一条 SQL**，最坏组数=用户数 → 仍是 N+1（`:39` 注释「一次查询…避免 N+1」不成立）；`getTag`（`:18–22`）单用户 2 条；`listConversations:54–63` **每个会话一次** `dbAll` 成员（`:51` 注释「不额外增加往返」不实）、`:71–83` **每个 direct 再 1 次 dbGet + 2 次 getTag** → `GET /conversations` 往返数 ≈ 1 + N_conv + 1 + 3×N_direct，50 会话即 150+ 次 Turso HTTP。

**问题-5.F（中）· `attachTags` 会话详情 tag 恒为 1；空串口径不一致**
依据：`getConversation:107–115` 的 members 字段名为 `user_id`（无 `id`），而 `attachTags:55` 用 `out.get(u.id)` → 恒 undefined → 全部 `?? 1`，**会话详情 #序号消歧完全失效**（`adminListUsers:35` SELECT 含 id，那侧正常）。另 `user.ts:28–30` 允许 `display_name=""`，JS `user.display_name || user.username`（`displayName.ts:17`）把空串 fallback 到 username，SQL `COALESCE(display_name, username)`（`:19,32,50`）不 fallback → 同一用户被算进两个组，tag 错乱。

---

## 6. CORS/响应 — PASS 2 / 问题 3

**PASS-6.1 · 所有响应（含错误、OPTIONS、204）带 CORS**
依据：`ok()`/`fail()` 经 `withCors`（`response.ts:10,17`）；`preflight()`（`cors.ts:9–11`）；根 204（`api.ts:20` 直接 `headers: CORS`）；`failErr`（`response.ts:53–57` → `fail`）；`OPTIONS` 在 `:14` 认证前返回 204 免 token；`withCors`（`cors.ts:13–17`）重建保留 status/statusText/headers；CORS 常量（`:2–7`）与 §12 逐字段一致。§16.9 满足。

**PASS-6.2 · 错误码→HTTP 映射表完整（表本身）**
依据：`response.ts:24–41` 覆盖 §11 全部 16 个码，与 `api.md:7–24` 一致；`HttpError:49` 未知 code 兜底 500；`INTERNAL_ERROR` 未入表但 4 处均硬编码 500，口径一致；统一响应体 `{data,error}` ✓。

**问题-6.A（高）· Identity 错误未「全部翻译」为规格错误码**
依据：`mapIdentityError:74` 对未识别 422（`User already registered`）返回 `INTERNAL_ERROR 500` 而非 `EMAIL_EXISTS 409`；`identityFetch:49` 未取 `error_code` 字段。正面：所有对外 message 均为网关自造串，**未透传 `{"msg":...}`**（§16.10 此点 PASS）。但「全部翻译」未达成。

**问题-6.B（中）· 映射表含 2 个不可达死码 + `INVALID_INPUT`/404 混用**
依据：`EMAIL_EXISTS`（`response.ts:39`）、`EMAIL_NOT_CONFIRMED`（`:35`）全代码无可达抛出点（`rg` 全量确认，分别见 2.C/2.D）；`api.ts:57,123` 用 `fail("INVALID_INPUT",...,404)` 违背映射表；§11 未提供路由不存在专用码，属契约缺口。

**问题-6.C（低）· `ok(data, 204)` 会抛 TypeError**
依据：`response.ts:9–13` 允许传 status=204 却带 JSON body，Web API 构造 204+body 直接抛错 → `failErr` 返回 500。当前无调用点，API 面隐患。另 `failErr:55 console.error(e)` 把原始错误写入服务端日志（**不下发客户端**，不算透传，低）。

---

## 7. 并发与边界 — PASS 4 / 问题 6

**PASS-7.1 · 50 条分页**：`parseLimit`（`messages.ts:52–58`）与 `limitOf`（`admin.ts:18–24`）默认/上限 50，`<1`/NaN/Infinity → `INVALID_INPUT`，小数 floor ✓
**PASS-7.2 · 复合游标**：`messages.ts:69` `(created_at,id)<(?,?)` / `:89` `>(?,?)`，ORDER BY 分别 DESC/ASC，命中 `idx_messages_conv_time`；首页哨兵 `9999-12-31T23:59:59.999Z` + `\uffff`（`:71`）、同步起点 `1970-01-01T00:00:00Z` + `""`（`:91`）与比较方向匹配 ✓
**PASS-7.3 · `next_cursor` 语义**：`syncMessages:94–97` 有数据取末条游标、无数据返回传入的 `after`（或等价起点），**游标不倒退**，满足 §10.3「失败不推进」；`listMessages:74–76` 满页才给 `next_before`，`null` 表示到最早 ✓
**PASS-7.4 · 注入防护（全参数化）**：全库 SQL 模板插值仅 2 处 —— `presence.ts:24,27` 只拼 `?` 占位符个数、`admin.ts:33` 拼 LIKE 值但值走参数数组；`admin.ts:108` 的 `AND c.type=?` 亦参数化。`rg -n '\$\{' netlify/edge-functions/*.ts` 全量确认无 SQL 字符串拼接用户输入 → **无 SQL 注入**。`admin.ts:33` 的 `%`/`_` 未转义属通配符注入（见 7.D），非 SQL 注入。

**问题-7.A（低）· 4000 字符口径不一致**
依据：`validate.ts:28` 用 JS `.length`（UTF-16 code units），`schema.sql:41` 用 SQLite `length()`（Unicode 字符数）→ 2000 个 emoji 的合法消息被误拒 `INVALID_INPUT`；不会放行超长，无安全绕过。

**问题-7.B（中）· 非法游标被静默吞掉**
依据：`decodeCursor`（`messages.ts:39–49`）仅 `atob` 抛错才 `INVALID_INPUT`；base64 合法但缺 `|`（`idx<0`，`:45`）→ 返回 `null` → 静默退化为首页/全量同步，客户端可能重复拉全量且不自知。

**问题-7.C（中）· admin 游标明文未编码**
依据：`admin.ts:102,116,142,154,162,175` 直接输出/解析 `created_at|id` 明文，而 `api.md:250` 写「`created_at|id 编码`」、业务消息游标用 Base64URL（`messages.ts:35–37`）→ 契约不一致；`cursor.split("|")` 对多余 `|` 静默截断。`adminListUsers:32` 的 username 明文游标与 `api.md:230` 一致（PASS）。

**问题-7.D（中）· `LIKE` 通配符未转义**
依据：`admin.ts:33` `pattern = search ? '%'+search+'%' : '%'`，用户传 `%`/`_` 即改变搜索语义（参数化有效，非注入），`search` 仅 `.toLowerCase()`（`:31`）。

**问题-7.E（中）· `display_name` 校验不统一；username/email 校验基本正确**
依据：`user.ts:25–30` 只查 typeof/≤64，未 trim、未禁空串（触发 5.F）；`adminPatchUser:78–84` **完全无长度/空串校验**，可写任意超长值。`validateUsername`（`validate.ts:6–13`）3–32 `[a-z0-9_-]`+小写 ✓；`requireEmail`（`:40–46`）正则基本合规但未 trim/小写（GoTrue 侧规范化，users.email 快照存原值，同邮箱大小写变体可走到 2.C 的 500 分支）。`verify` 未本地校验 `type=recover` 时 password 必填（§7.2），依赖 GoTrue 兜底（低）。

**问题-7.F（低）· 无输入体量上限**
依据：`strArray`（`validate.ts:48–53`）不限制数组长度，`createGroup:179` 先 `[...new Set(strArray(...))]` 再在 `:181` 判 >10 → 超大 memberIds 已先消耗 CPU/内存；`readJson`（`response.ts:59–66`）无 Content-Length 校验（平台 6MB 兜底）。

---

## 8. 已知遗留 — PASS 0 / 问题 1 · **结论：以代码缺陷为主，不是「平台无法区分」**

**问题-8.A（中）· 未确认邮箱登录恒 `INVALID_CREDENTIALS` 是可修复的代码缺陷**
依据：`mapIdentityError`（`auth.ts:55–75`）把 `invalid_grant` 判定（`:61`）放在 `confirm`/`not confirmed` 判定（`:67`）之前。Netlify GoTrue 旧版 `api/token.go:80–82` 对未确认邮箱返回 `oauthError("invalid_grant","Email not confirmed")`，响应体 `{"error":"invalid_grant","error_description":"Email not confirmed"}` —— `error_description` 明确含 "Email not confirmed"，**信息存在且可区分**；`:56` 确实取到该串，只是先命中 `invalid_grant` 分支。修复：调整分支优先级，或对 `invalid_grant` + `not confirmed` 组合特判 → `EMAIL_NOT_CONFIRMED 403`。

补充证据：Supabase/新版 GoTrue `internal/api/token.go:212–213` 已改为 `ErrorCodeEmailNotConfirmed` / `msg "Email not confirmed"`（不含 `invalid_grant`），该形态会正确落到 `:67`。因此是否触发取决于线上 GoTrue 版本 + 分支顺序；当前 `EMAIL_NOT_CONFIRMED`（`response.ts:35`）在旧版部署下为不可达死码。防枚举角度无冲突（二者都只在邮箱+密码正确后才可能暴露确认状态，与 `recover` 防枚举是两回事）。

结论：**把该现象归因为「GoTrue 平台行为，无法区分」不成立**；§11 / `api.md:99` 定义的 `EMAIL_NOT_CONFIRMED` 应当可达。

---

## TOP 5 最严重问题（一句话每条）

1. **致命** — `api.ts` 完全没有 import/dispatch `handlers/admin.ts`（`0b4228f` 删接线、`4d87111` 只补 `known` 白名单未补 dispatch），7 个 admin 端点恒 404、`requireAdmin` 永不执行。
2. **致命** — `verify()` 用 `tokens.id` 取用户，而 GoTrue `/verify` 返回 `AccessTokenResponse`（顶层无 id），导致邮箱确认/密码重置恒 500、recover 吊销旧会话永不执行，且被不真实的 `smoke_test.ts:325` mock 掩盖。
3. **致命** — `schema.sql` 缺 `users.admin` 列与 `audit_log` 表，且首行用 SQLite 不识别的 `#` 注释（已实测 `unrecognized token: "#"`），按 README 部署即建表失败、admin SQL 恒报错。
4. **高** — `transaction()` 的 `mode` 参数从未使用、一律 deferred `BEGIN` 而非 `BEGIN IMMEDIATE`，10 人 COUNT+INSERT 与私聊去重 JOIN 无串行化保证，并发可出现 11 人群 / 重复私聊。
5. **高** — 双重/三重鉴权（`api.ts:59` + 各 handler 再 `requireUser`，`me` 三次）叠加「续期失败即 `revoked=1` 永久吊销」，每请求多一轮 Turso 往返、续期竞态翻倍，Identity 瞬时抖动即强制登出。

## 修复建议（按优先级）

1. **恢复 admin 接线**：在 `api.ts` 补 `import * as admin from "./handlers/admin.ts"` 与 `5809a6f` 中 `:106–135` 的 8 条 dispatch（`adminListUsers`/`adminGetUser`/`adminPatchUser`/`adminListChannels`/`adminDeleteChannel`/`adminAuditMessages`/`adminAuditLog`/`adminStats`），置于 `requireUser` 之后、`known` 预检放行之内。
2. **修 verify**：`identityUser = tokens?.user?.id ?? parseJwtSub(tokens?.access_token)`（复用 `handlers/auth.ts:145–148` 的 `atobUrl`），或调用已存在的 `identityGetUser(access_token)`；`type=recover` 吊销改走事务版 `revokeSessionsForUser`；把 `smoke_test.ts:324–326` 的 mock 改成真实 `AccessTokenResponse` 形状并加断言。
3. **同步 schema**：`schema.sql` 首行注释改 `--`；补 `ALTER TABLE users ADD COLUMN admin INTEGER NOT NULL DEFAULT 0`（或建表内加列）、`CREATE TABLE audit_log(...)` 与 `idx_audit_created`、`idx_sessions_user_revoked`、`idx_admin_*`、`(COALESCE(display_name,username),created_at,id)` 表达式索引；把 README 部署步骤与 §16 清单同步。
4. **事务串行化与预算**：`transaction("write", ...)` 改发 `BEGIN IMMEDIATE`（`read` 用 `BEGIN`），消除 `mode` 死参；把事务内语句合并进单个 pipeline 请求（携带 baton）减少往返；COMMIT 失败单独分支避免误报；`closeTx` 挪进 `finally`。
5. **鉴权去重**：`api.ts:59` 只保留一次 `resolveUserId`，把 userId 通过 `makeCtx` 的 `Ctx.userId` 传给各 handler，删除 handler 内重复 `requireUser`；`me` 不再二次解析。
6. **错误映射**：`mapIdentityError` 增加 `User already registered` / `already registered` / `error_code=email_exists` → `EMAIL_EXISTS 409`；把 `confirm`/`not confirmed` 分支提到 `invalid_grant` 之前（或组合特判）→ `EMAIL_NOT_CONFIRMED 403`；未知 code 统一 `INVALID_INPUT 400`，避免裸 500。
7. **续期韧性**：区分「refresh 明确失效（invalid_grant / 401）」与「网络/5xx 瞬时失败」，后者返回 401 但**不** `revoked=1`；对 refresh_token rotation 用条件 UPDATE（`WHERE identity_refresh_token=?`）避免覆盖并发成功结果。
8. **signup 事务化**：预留（UNIQUE 查重 + INSERT）放入 `transaction("write")`，回填与补偿亦纳入；失败补偿加日志与重试，避免孤儿临时 users 行。
9. **权限与数据细节**：`leaveConversation` 对 `type==='direct'` 拒绝；`audit_log.detail` 字段白名单；解散前确认线上 `PRAGMA foreign_keys`（若为 ON 需改为不删 conversations 行或加 `ON DELETE` 策略以保留 messages）；`attachTags` 接收 `id` 字段或在 `getConversation` 映射 `id: m.user_id`；`display_name` 统一 trim/非空/≤64；`attachTags` 改单条窗口函数 SQL 消除 N+1；`listConversations` 成员与 peer 用一次批量查询。
10. **契约细节**：`decodeCursor` 缺 `|` 抛 `INVALID_INPUT`；admin 游标改 Base64URL 与业务一致；`LIKE` 转义 `%_\`；`ok()` 禁止 204 带 body；路由不存在改用专用码或统一 `INVALID_INPUT 400` + 404 文档化；`strArray` 限制长度；4000 字符校验统一用 Unicode 码点数。

## 审查方法与证据

- 逐文件读取（全部带行号）：`api.ts`、`_shared/{auth,db,cors,response,validate,displayName,presence}.ts`、`handlers/{auth,user,conversations,messages,admin,types}.ts`、`schema.sql`、`netlify.toml`、`_redirects`、`README.md`、`api.md`、规格全文 518 行、`smoke_test.ts` 关键段。
- `rg` 全量扫描：admin 引用、`EMAIL_EXISTS`/`WEAK_PASSWORD`/`INTERNAL_ERROR` 抛出点、`${` 模板插值、`requireUser`/`resolveUserId` 调用点、`CREATE/ALTER/INDEX/PRAGMA`。
- `git log`/`git show` 追溯 `5809a6f`（admin 接入）、`0b4228f`（删除）、`4d87111`（404-before-auth 修复 diff 全文）。
- 运行时实测：`python3 sqlite3` 验证 `#` 注释被拒；GoTrue 上游源码（`netlify/gotrue api/token.go:80–82`、`supabase/auth internal/api/verify.go:310`、`token.go:212–213`）核实响应/错误形状。
- 环境：`deno 2.0.6` 可用但 `deno check`/`smoke` **未运行**；`TURSO_*`/`IDENTITY_ORIGIN` 均未设置 → 真库查询 **未覆盖**；`sqlite3` CLI 缺失（用 python3 sqlite3 替代）。

> 本报告为只读静态审查，**未修改任何代码文件**。
