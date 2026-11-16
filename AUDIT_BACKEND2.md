# AUDIT_BACKEND2.md — 后端全面只读审查（第二轮）

- 日期：2026-11-16
- 基线：`62ff9d6`（去 Identity 后）
- 方式：静态代码审查（只读），未改任何代码
- 已执行门禁：`deno check`（api.ts + contracts/platform/domain/handlers 全部）**PASS**；`deno run -A smoke_test.ts` **45 passed / 0 failed**（与任务书 45/45 一致）
- 未覆盖：线上真库实际表结构（本 shell 无 `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN`，无法查询）；线上部署版本与 API 探测（主线负责）

端点清单（routes.ts 实际 32 条声明）：认证 6 + 用户 2 + 会话 11 + 消息 3 + 翻译 1 + 管理 9。任务书「24 业务端点」= 6+2+11+3+1+1(重复计) 口径差异，不影响功能。

---

## 1. 认证（signup / login / logout / me）

| 检查项 | 结论 |
|---|---|
| PBKDF2 哈希（`platform/password.ts`） | ✅ PASS：`pbkdf2$<iter>$<salt_b64>$<hash_b64>`，SHA-256，16B 随机盐，256bit，`timingSafeEqual` 常量时间比较，格式/iter 校验 + try/catch。10000 次迭代偏低但为 Edge CPU 预算下的规格要求（`password.ts:4`），非缺陷。 |
| signup | ✅ PASS：重复检查（email/username）+ `BEGIN IMMEDIATE` 事务插入 + 唯一约束兜底映射 `EMAIL_EXISTS`/`USERNAME_TAKEN`；密码最低 8 字符；使用 `hashPassword`。 |
| login 枚举防护 | ✅ PASS：用户不存在与密码错误均返回同一 `INVALID_CREDENTIALS`（`auth.ts:75,77`），消息一致；使用 `verifyPassword`。 |
| logout | ✅ PASS：`revokeSessionByRequest` → `UPDATE sessions SET revoked=1`（`session.ts:57`、`auth.ts:89`）；幂等，无 token 也返回 200。 |
| me | ✅ PASS：`resolveUserId` 后查库并 `getTag` 附加 tag。 |
| 发信冻结 verify/recover | ✅ PASS：两者均 `fail("INVALID_INPUT", "email delivery is disabled", 400)`（`auth.ts:63,94`）。 |
| settings 开关读取与缓存 | ✅ PASS（含 LOW 问题）：DB 读取 + 30s 进程内缓存，默认 `"0"`（`settings.ts:5-25`）。 |

问题：
- **LOW** `platform/settings.ts:12,25`：`TTL_MS=30_000` 缓存无失效机制，`clearSettingsCache()` 全仓无调用点。若线上翻转 `email_verification_required`，最长 30s 陈旧；当前发信冻结恒 `0`，实际无影响。
- **LOW** `platform/session.ts:47,65`：`revokeAllUserSessions` / `revokeSessionsForUser` 为死代码（无调用点）；其中事务版注释称密码重置场景使用，但 recover 已冻结。
- **LOW** `session.ts:28-35`：session 无过期机制（只存 `created_at`，解析时从不检查）。若规格要求会话过期则为缺口；密码冻结模式下可接受。
- **LOW** `handlers/auth.ts:99-100`：`me` 在路由已 `auth:true`（api.ts 已解析一次）的情况下再次 `resolveUserId(ctx.req)`，造成同一请求内第二次 session 查询 + presence UPDATE。非功能错误，冗余往返。

## 2. 会话 11 端点

| 检查项 | 结论 |
|---|---|
| 私聊去重 | ✅ PASS：`createDirect` 事务内按 (A,B) + `type='direct'` 查重，命中直接返回既有 id（`conversations.ts:181-190`）。 |
| 10 人上限事务内校验 | ✅ PASS：`addMember` 在 `BEGIN IMMEDIATE` 事务内 `COUNT >= 10` → `GROUP_FULL`（`conversations.ts:255-258`）；`createGroup` 上限检查在事务外（`conversations.ts:214`），但新群无并发共享状态，安全。 |
| owner 规则 | ✅ PASS：`requireOwner` 校验 `role='owner'`，rename/add/remove/transfer/delete 均经此门禁。 |
| 移除失权 | ✅ PASS：`removeMember` 删除成员行，`requireMember` 后续即拒绝（`conversations.ts:273-288`）。 |
| 解散保留消息 | ✅ PASS：`deleteConversation` 只删 members + conversations，`messages` 物理行保留（`conversations.ts:313-322`）。 |
| #tag 附加 | ✅ PASS：列表批量算 tag；详情 `attachTags` 前把 `user_id` 映射为 `id`（B2 已修）；`me` 用 `getTag`。 |

问题：
- **MEDIUM** `conversations.ts:313-322` 与 `admin.ts:153-166`：解散/删除会话后 `messages.conversation_id` 成为孤儿（FK 指向已删 conversations）。设计上「保留消息」要求如此，但无 tombstone/归档表，`adminAuditMessages` 对已解散会话返回 NOT_A_MEMBER，消息实际不可再审计。
- **LOW** `conversations.ts:320-335`：`transferOwnership` 允许 `targetUserId === userId`（先降 member 再升 owner，净效果不变，但会写 `created_by` 并产生无意义更新）。未禁止自转让。

## 3. 消息 3 端点

| 检查项 | 结论 |
|---|---|
| 4000 字符码点 | ✅ PASS：`validateMessageContent` 用 `[...content].length` 按码点计，与 `schema.sql` 的 `length(content)<=4000` CHECK 同口径（`validate.ts:22-30`）；translate 端点同口径。 |
| 游标 before/after | ✅ PASS：`listMessages` 用 `(created_at,id)<(?,?)` DESC、哨兵 `9999.../\uffff`；`syncMessages` 用 `(created_at,id)>(?,?)` ASC、哨兵 `1970.../""`（`messages.ts:47-79`）。`decodeCursor` 非法值一律 `INVALID_INPUT`，不静默退化。 |
| next_cursor 语义 | ✅ PASS：`next_before` 在取满 limit 时给出、否则 null（「已到最早」）；`next_cursor` 始终返回（末条 / 入参 after / epoch 哨兵），符合 api.md「客户端写入成功后才推进」约定。 |

问题：无功能性问题。
- **LOW** `frontend/src/stores/useMessageStore.ts:23-27`（契约侧，供参考）：前端 `cursorOf` 用裸 `btoa`（保留 `+/=`），后端 `decodeCursor` 兼容标准 base64 与 base64url，两边可用，但编码口径不统一。

## 4. 翻译（`platform/indexTranslate.ts`）

| 检查项 | 结论 |
|---|---|
| 强制参数 | ✅ PASS：`temperature:0` + `chat_template_kwargs:{enable_thinking:false}`（`indexTranslate.ts:36-37`）。 |
| instTrans | ✅ PASS：中文指令含源文包裹与 4 条约束（保留换行/占位符/@提及/#标签/表情、不增删事实、口语短句、只输出译文）；`LANG_NAME` 映射 zh/en，handler 限制 target_lang ∈ {zh,en}。 |
| 清洗 clean() | ✅ PASS：截取 `</think>` 之后并 trim；无该标记则保留全文。 |
| 降级链 | ✅ PASS：2B → 9B → 35B，首个非空成功即返回；429/5xx/非 ok/空文本 → null → 下一档（`indexTranslate.ts:28-64`）。 |
| UA | ✅ PASS：`User-Agent: curl/8.5.0`（`indexTranslate.ts:33`）。 |
| 墙钟 | ✅ PASS：`WALL_CLOCK_MS=30000` 每轮检查，单次 `TIMEOUT_MS=9000`，3×9s=27s<30s，留足 Edge 40s 上限。 |

问题：无功能性问题。
- **LOW** `platform/response.ts:33-49` 与 `contracts/errors.ts:2`：`response.ts` 内存在第二份过时的 `STATUS_BY_CODE` 副本，**缺少** `TRANSLATION_UNAVAILABLE`、`EMAIL_TAKEN`、`INTERNAL_ERROR`。当前 `HttpError` 用 contracts 版本、`failErr` 用 `e.status`，副本未被引用故无实际影响，属维护陷阱。

## 5. 管理 9 端点

| 检查项 | 结论 |
|---|---|
| 9 端点齐全 | ✅ PASS：stats/overview、users 列表/详情/PATCH/DELETE、channels 列表/DELETE/messages、audit-log 共 9 条（`routes.ts:45-53`）。 |
| requireAdmin 门禁 | ✅ PASS（含 MEDIUM 问题）：9 个 handler 逐个调用 `requireAdmin`（查 `users.admin=1`）。 |
| DELETE /admin/users/:id 审计与自删保护 | ✅ PASS + MEDIUM：自删 `INVALID_INPUT`（`admin.ts:113`）；事务内写 `audit_log(action=admin.delete_user, detail=username)`；先删成员关系、吊销 session、再删用户（`admin.ts:108-132`）。 |
| 各分页响应 | ✅ PASS：users/channels/messages/audit-log 均 `limit+1` 判 hasMore + Base64URL 游标 + `next_cursor`；`adminListUsers` 转义 LIKE 通配符（B7）；`adminGetUser` 附 50 条会话摘要。 |

问题：
- **MEDIUM** `netlify/edge-functions/api.ts:25`：路由表声明了 `admin:true`（`routes.ts:45-53`），但路由器**只检查 `match.route.auth`，从不检查 `admin` 标志**。管理员门禁完全依赖各 handler 自行调用 `requireAdmin`。当前 9 个都调用了（无实际绕过），但无纵深防御：新增管理路由若漏写 `requireAdmin` 即成为越权漏洞。
- **MEDIUM** `handlers/admin.ts:108-132`（及 `conversations.ts:313`）：删除用户只删成员关系 + 吊销会话 + 删用户行，未处理 `messages.sender_id`→users 与 `audit_log.actor_id`→users 的外键。若 FK 开启则删除被删用户会失败；若 FK 关闭（本仓他处依赖孤儿消息推断为关闭）则留下孤儿消息/审计条目，且被删用户的历史消息无 username 墓碑。`adminDeleteUser` 对该用户作为 actor 的审计日志亦未清理/匿名化。

## 6. 分层（L4→L3→L2→L1→L0）

| 检查项 | 结论 |
|---|---|
| 下层不 import 上层 | ✅ PASS：domain/（L2）零 import；platform/（L1）无 domain/handlers import；contracts/（L0）无上层 import（routes.ts 仅注释提及 handlers）；handlers（L3）只 import platform/domain/contracts；api（L4）import L0/L1/L3。 |
| handlers 无 fetch | ✅ PASS：全 handlers 目录零 `fetch(`；fetch 仅在 `db.ts` 与 `indexTranslate.ts`（L1）。 |
| handlers 无 requireUser 重复 | ✅ PASS：仅 api.ts 解析鉴权并注入 `ctx.userId`；handlers 不重复实现。（例外见认证区 LOW：`me` 二次 `resolveUserId`。） |

问题：无功能性问题；`me` 的二次解析见 §1 LOW。

## 7. schema.sql 与线上库一致性

| 检查项 | 结论 |
|---|---|
| schema 内部一致性 | ✅ PASS：`users.password_hash TEXT NOT NULL`、`email UNIQUE`、`sessions` 为 5 列新结构（无 `identity_*`）、`settings`/`email_tokens`/`audit_log` 表与索引齐全；与代码所有 SQL 字段吻合。 |
| CI live-db INSERT 带 password_hash | ✅ PASS：`.github/workflows/deploy.yml` live-db 三处 `INSERT INTO users` 均含 `password_hash`（值 `pbkdf2$10000$x$y`）。 |

问题：
- **未覆盖**：线上真实库表结构无法核对（本 shell 无 Turso 凭据）。静态 schema 与代码一致；真库部分由主线「真库 9/9」与线上探测覆盖。
- **LOW** `.github/workflows/deploy.yml:56`：注释「mock Turso/Identity，41 断言」过时——实际 smoke 为 **45** 断言且已无 Identity mock（详见 §8）。

## 8. 错误码映射与 Identity 残留

| 检查项 | 结论 |
|---|---|
| 错误码→HTTP 完整 | ✅ PASS：代码中使用的 17 个码全部在 `contracts/errors.ts` 定义且状态码正确（400/401/403/404/409/502）；`INTERNAL_ERROR` 由 `failErr` 直接返回 500。 |
| Identity 残留（功能代码） | ✅ PASS：无任何运行时代码 import/调用 Identity/GoTrue；`session.ts` 注释明确「无 Identity」。 |

问题（均为注释/文档，非功能）：
- **LOW** `smoke_test.ts:1`：注释「mock Turso pipeline + Identity」过时（测试已无 Identity）。
- **LOW** `.github/workflows/deploy.yml:56`：注释「mock Turso/Identity，41 断言」过时且计数错误（实际 45）。
- **LOW** `frontend/src/i18n/index.ts:362`：注释「GoTrue reports unconfirmed users...」为去 Identity 前的遗留说明。
- **LOW** `LAYER_PLAN.md:7,36`：仍把 `identity.ts` 列为 L1 组件（历史设计文档；非审计文档，严格意义上属残留）。
- **LOW** `contracts/errors.ts`：定义了未使用的 `EMAIL_NOT_CONFIRMED`、`EMAIL_TAKEN`（发信冻结遗留，无害）。
- 说明：`README.md`、`PASSWORDLESS_TASK.md`、`FULLCHECK_TASK.md` 中的 identity 字样为「无外部身份提供方」否定式或历史任务说明，不算残留；`vite.config.ts:5` "Product release identity" 为无关构建变量。

---

## 8 项统计

| # | 领域 | 结论 | 问题数（严重度） |
|---|---|---|---|
| 1 | 认证 | PASS | 4 LOW |
| 2 | 会话 11 端点 | PASS | 1 MEDIUM, 1 LOW |
| 3 | 消息 3 端点 | PASS | 1 LOW（前端编码口径，契约侧） |
| 4 | 翻译 | PASS | 1 LOW（重复映射副本） |
| 5 | 管理 9 端点 | PASS | 2 MEDIUM |
| 6 | 分层 | PASS | 0（me 冗余见 §1） |
| 7 | schema / CI | PASS | 1 LOW + 1 未覆盖（真库） |
| 8 | 错误码 / Identity | PASS | 6 LOW（注释文档） |

合计：**0 阻塞 / 3 MEDIUM / 13 LOW / 1 未覆盖**。8 项功能层面全部 PASS；未发现认证绕过、越权读取或错误映射缺失。

## TOP5 最严重问题

1. **MEDIUM** — `api.ts:25` 不校验路由表 `admin:true` 标志，管理员门禁全靠 handler 自调用 `requireAdmin`，无纵深防御（`routes.ts:45-53`）。
2. **MEDIUM** — `admin.ts:108-132` 删除用户未处理 `messages.sender_id` / `audit_log.actor_id` 外键，留下孤儿消息与审计（FK 开启则可能删除失败）；与 `conversations.ts:313` 的「保留消息」叠加使已删用户/会话的消息无法按用户名审计。
3. **MEDIUM** — `conversations.ts:313-322` 解散会话后消息成孤儿且无 tombstone，`adminAuditMessages` 对已解散会话返回 NOT_A_MEMBER，物理保留的消息实际不可审计。
4. **LOW** — `settings.ts:12,25` 功能开关缓存 30s 无失效（`clearSettingsCache` 无调用点）；`auth.ts:99` `me` 二次解析 session 造成冗余往返。
5. **LOW** — 错误码映射重复源：`response.ts:33` 的第二份 `STATUS_BY_CODE` 缺 `TRANSLATION_UNAVAILABLE` 等；多处 Identity/GoTrue 过时注释（`smoke_test.ts:1`、`deploy.yml:56`、`i18n/index.ts:362`、`LAYER_PLAN.md`）与错误断言语录数（deploy 写 41、实测 45）。

> 说明：本轮未发现 HIGH/CRITICAL 级问题；以上 TOP5 按潜在影响排序。真库结构与线上版本属未覆盖，由主线门禁核实。
