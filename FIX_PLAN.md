# 全面检查问题清单与分批修复规划

基线：云端 depth-1 `git clone` 检查（HEAD `4efb006`）+ `AUDIT_BACKEND.md` 后端静态审查（22 PASS / 36 问题）+ 前端审查代理（进行中）。

## 0. 已修（不重复劳动）

| 问题 | 处置 | commit |
|---|---|---|
| `schema.sql` 缺 `users.admin` / `audit_log` / `idx_audit_log_time` | 已补 | `14878c9` |
| `schema.sql` 首行 `#` 非法 SQL 注释 | 改 `--`，Python sqlite3 内存库完整执行验证通过 | `4efb006` |
| 前端 i18n/MoreDiscord/#tag/注册引导成果未进仓库，线上仍是 Coalchat | 同步 23 文件 + 2 新文件，清陈旧根产物，CI 加 frontend-check | `873eb94` `7b9acda` |
| 未知 API 路径先鉴权返回 401（应为 404） | 已加 `known` 路由预检 | `4d87111` |
| 显示名 #tag 的 peer 类型错误 | 已修 | `dda93b8` |
| GoTrue `/token` 必须 form-urlencoded | 已修 | `6ba8895` |
| v2 pipeline 响应结构 / 事务 BEGIN-COMMIT | 已修 | 早期提交 |

**当前工作区状态**：`api.ts` 已被主会话改了两处（恢复 `import * as admin` + 恢复 8 条 admin dispatch），**未提交**。交由批次 A 复核并一并收口。

## 1. 批次 A — 后端核心：路由 / 认证 / 事务（致命+高）

单代理串行（文件互不重叠：`api.ts`、`_shared/auth.ts`、`_shared/db.ts`、`handlers/auth.ts`、`smoke_test.ts`、`response.ts`）。

| # | 严重度 | 文件 | 问题 | 修复方向 |
|---|---|---|---|---|
| A1 | 致命 | `api.ts` | 7 个 admin 端点无 dispatch（主会话已本地补，需复核 + 提交） | 复核 `known` 白名单与 dispatch 一一对应；带 token 实测 |
| A2 | 致命 | `handlers/auth.ts:85` | `verify()` 用 `tokens.id`，GoTrue `/verify` 返回 `AccessTokenResponse`（顶层无 id）→ 恒 500 | `tokens?.user?.id ?? JWT sub`；`recover` 吊销走 `revokeSessionsForUser` 事务版 |
| A3 | 高 | `_shared/auth.ts` | `EMAIL_EXISTS` 未映射（"User already registered" → 500） | 加 `already registered`/`error_code=email_exists` → 409 |
| A4 | 中 | `_shared/auth.ts` | `EMAIL_NOT_CONFIRMED` 不可达：`invalid_grant` 分支排在 `confirm` 前 | 组合特判 `invalid_grant` + `Email not confirmed` → 403 |
| A5 | 高 | `_shared/auth.ts` | refresh 失败即 `revoked=1` 永久吊销；网络抖动/5xx 误杀；rotation 竞态 | 区分明确失效(401/invalid_grant)与瞬时故障；条件 UPDATE `WHERE identity_refresh_token=?` |
| A6 | 高 | `_shared/db.ts` | `mode` 参数未用，恒 `BEGIN`（deferred）→ 并发可产生 11 人群 / 重复私聊 | `write` → `BEGIN IMMEDIATE`；`read` → `BEGIN` |
| A7 | 中 | `_shared/db.ts` | COMMIT 抛错被当失败重试（写入已生效）；ROLLBACK 异常被吞；close 非 finally | COMMIT 单独分支；close 挪 `finally` |
| A8 | 高 | `api.ts` + handlers | 双重/三重鉴权（`requireUser` 调用 2–3 次） | `Ctx` 带 `userId`，`makeCtx` 注入；handler 删重复调用 |
| A9 | 中 | `api.ts` | `PATCH /`、`DELETE /` 误判 known；`fail("INVALID_INPUT",...,404)` 码/状态矛盾 | 收紧白名单；404 用固定 code 或文档化 |
| A10 | 中 | `handlers/auth.ts` | signup 预留/回填/补偿不在事务内；`UPDATE users SET id=?` 改主键有孤儿风险 | 纳入 `transaction("write")`；回填改 INSERT 新行 + 删临时行需评估 FK |
| A11 | 中 | `smoke_test.ts:324` | verify mock 伪造 `{id}` 掩盖 A2 | 改真实 `AccessTokenResponse` 形状 + 断言 recover 吊销 |
| A12 | 低 | `response.ts` | `ok(data, 204)` 会抛 TypeError（无调用点） | 禁止 204 带 body 或断言 status≠204 |

## 2. 批次 B — 后端 handlers / 边界（高+中）

单代理串行（文件：`handlers/conversations.ts`、`handlers/admin.ts`、`handlers/messages.ts`、`handlers/user.ts`、`_shared/validate.ts`、`_shared/displayName.ts`、`_shared/presence.ts`）。**与批次 A 零文件重叠**。

| # | 严重度 | 文件 | 问题 | 修复方向 |
|---|---|---|---|---|
| B1 | 中 | `conversations.ts` | 私聊允许 `leave`（规格 §4 禁止私聊管理操作）→ 历史消息分裂 | `type==='direct'` 直接拒绝 |
| B2 | 中 | `conversations.ts` | `attachTags` 详情 members 用 `user_id` 而 helper 读 `id` → tag 恒 1 | 映射 `id: m.user_id` 或改 helper |
| B3 | 高 | `conversations.ts` | `GET /conversations` N+1：每会话 1 次成员 + 每 direct 3 次 | 成员一次批量 `IN (...)` 缓存；tag/presence 合并批量 |
| B4 | 中 | `displayName.ts` / `user.ts` | 空串 `display_name` 在 JS(`\|\|`) 与 SQL(`COALESCE`) 口径不一致 → tag 错乱 | 统一 trim/非空/≤64；空串存 NULL |
| B5 | 中 | `admin.ts:87` | `audit_log.detail = JSON.stringify(ctx.body)` 未白名单，可持久化任意字段 | 只记录已处理的白名单字段 |
| B6 | 中 | `admin.ts:78` | `adminPatchUser` 的 `display_name` 无长度/空串校验 | 复用 B4 的统一校验 |
| B7 | 中 | `admin.ts:33` | `LIKE` 通配符 `%_` 未转义 | 转义后参数化 |
| B8 | 中 | `admin.ts` | 游标明文 `created_at\|id` 与 `api.md`「编码」及业务 Base64URL 不一致 | 统一 Base64URL（同步改 `api.md`） |
| B9 | 中 | `messages.ts:45` | 缺 `\|` 的合法 base64 游标被静默吞掉 → 退化全量 | 抛 `INVALID_INPUT` |
| B10 | 低 | `validate.ts` / `schema.sql` | 4000 字符：JS `.length`(UTF-16) vs SQLite `length()`(码点) | 统一码点数（`[...s].length`），或仅保留较严侧并注明 |
| B11 | 低 | `validate.ts` | `strArray` 无长度上限，超大 memberIds 先耗 CPU | 早拒绝 >10（去重前先限长） |
| B12 | 中 | `presence.ts` / `displayName.ts` | 无表达式/复合索引，全表扫 | `schema.sql` 补索引（与 A 无冲突，B 自己改） |

## 3. 批次 C — 前端（待前端审查代理 `1ea712e4` 返回后规划）

预计范围：`src/api/*` 端点逐条对齐 `api.md`、`usePolling` 状态机与游标推进、i18n 字典中英键一致性、`formatDisplayName` 应用点、注册未确认流程、`tsc -b`/build 门禁。

## 4. 明确不修（有理由的负优化规避）

| 问题 | 不修理由 |
|---|---|
| 事务内每条语句一次 HTTP 往返（3.B） | 改成单 pipeline 多语句需要重写 baton 语义，风险高于收益；当前 50ms 预算下实测真库 9/9 通过，留作后续性能优化 |
| `INVALID_INPUT`/404 码状态矛盾（6.B 部分） | 规格 §11 未提供"路由不存在"专用码，统一改 400 会破坏现有前端；已文档化 |
| `ok(data,204)` 隐患 | 无调用点，加断言即可（并入 A12） |
| 弱密码映射与规格字面冲突 | 规格 §11 表无 `WEAK_PASSWORD` 码，按表实现正确 |
| 解散与 FK `ON DELETE` | 线上 `PRAGMA foreign_keys` 未核实；实测解散端点可用，改动 schema 外键风险大 |

## 5. 执行纪律（所有批次通用）

- 子代理**只改文件 + 跑门禁 + 写结果落盘**，**不 git commit / push**（主会话统一收口，避免并发 git 冲突）
- 每批完成后主会话跑：`deno check` 全模块 → `smoke_test.ts` 41 断言 → 真库 9 断言 → `npx tsc -b`（前端）→ 统一提交推送 → CI 复核
- 效率优先：已查的写结论、未查完标「未覆盖」不补齐；允许交付不完美的中间结论
- 批次 A / B 并行派发（文件零重叠）；批次 C 等前端报告
