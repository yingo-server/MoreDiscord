# AUDIT_CONTRACT — 前后端契约一致性专项审查（2026-11-16）

范围：`api.md` / `contracts/routes.ts` / handlers 实际响应 ↔ `frontend/src/api/*.ts` 每个调用。只读审查，未改任何代码。

基线判断：请求路径/方法/请求体字段、分页 key（normalize）、next_before/next_cursor、翻译字段在 happy path 上基本对齐；**问题集中在类型声明谎言、presence 死链路、错误文案契约被违反、文档漂移**四类。

---

## 1. 认证 6

| 端点 | 前端调用 | 后端响应 | 一致? | 问题 |
|---|---|---|---|---|
| POST /auth/signup | `auth.ts signup` → `api.post(data={email,password,username})`；store 读 `confirmation_required`→`confirmationRequired`、`session_token`、`user` | `{session_token,confirmation_required,user:{id,username,email}}` | ✅ 部分 | 请求/解包一致；但 `SignupRes.user: User` 要求 `display_name:string`，后端 signup 不含该字段（类型谎，运行靠 `formatDisplayName` 回退 username）。登录同理 |
| POST /auth/login | `auth.ts login` → `{email,password}` | `{session_token,user:{id,username,email}}`；错误 INVALID_CREDENTIALS | ✅ 部分 | LoginForm 处理 `INVALID_CREDENTIALS`/`EMAIL_NOT_CONFIRMED`，映射存在；但 handler 实际**从不抛** `EMAIL_NOT_CONFIRMED`（邮箱验证冻结），api.md 仍列为可能错误。同 signup 的 `display_name` 类型谎 |
| POST /auth/verify | `auth.ts verify` → `{type,token,password?}`（RegisterForm 传 `password: verifyPassword‖password`） | 冻结：恒 `fail("INVALID_INPUT")` | ✅ | 形状匹配；功能冻结属既定行为 |
| POST /auth/recover | `auth.ts recover(email)` → `{email}` | 冻结：恒 `fail("INVALID_INPUT")` | ✅ 部分 | 请求一致；但 RegisterForm「重新发送」必走 catch→`resendFailed`，永远看不到 `resendSent`（冻结态 UI 与文案不符） |
| POST /auth/logout | `auth.ts logout` → `api.post()` 无 body | `{ok:true}` | ✅ | 一致 |
| GET /auth/me | `auth.ts getMe` → `User` | `{id,username,display_name,email,created_at,tag}` | ✅ | 字段兼容（多余 created_at 无害），tag 在 `User` 中已声明 |

## 2. 用户 2

| 端点 | 前端调用 | 后端响应 | 一致? | 问题 |
|---|---|---|---|---|
| PATCH /user/username | `user.ts updateUsername` → `{username}`，返回 `Promise<void>` | `{id,username}` | ⚠️ 部分 | 请求一致；前端丢弃响应且**不刷新本地 store 的 user**，改用户名后 UI 直到 `fetchMe` 才更新 |
| PATCH /user/profile | `user.ts updateProfile(display_name:string)` → `{display_name}` | `{id,display_name}` | ⚠️ 部分 | api.md 请求允许 `null`，前端签名只收 `string`（传空串由后端转 NULL，可绕开但类型不符）；同样不刷新本地 user |

## 3. 会话 11

| 端点 | 前端调用 | 后端响应 | 一致? | 问题 |
|---|---|---|---|---|
| GET /conversations | `chat.ts getConversations(): Conversation[]` | peer 带 `tag,last_seen_at,online` | ❌ | `ConversationPeer` 类型**缺 `last_seen_at`/`online`**；且 `useOnlineStatus` 只监听 `yingo:online`，全项目**无任何 dispatch**，presence 数据到前端即死，在线状态功能完全不可用（见 TOP2） |
| GET /conversations/:id | `chat.ts getConversation(): ConversationDetail` | members[] 每项带 `user_id,username,display_name,role,joined_at,last_read_at,tag,last_seen_at,online` | ⚠️ 部分 | `ConversationMember` 类型缺 `last_read_at/last_seen_at/online`；`user_id` 键名一致 ✓，但 presence 同样未消费 |
| POST /conversations/direct | `chat.ts createDirect(): Promise<Conversation>` | `{id}` | ❌ | **返回 `{id}` 却声明 `Promise<Conversation>`**：运行仅靠 `conv.id` 侥幸可用；`useRoomStore.createDirect` 亦被标注为 `Promise<Conversation>`。类型契约不实（见 TOP5） |
| POST /conversations/group | `chat.ts createGroup(): Promise<Conversation>` | `{id}` | ❌ | 同上，`{id}` vs `Promise<Conversation>`（见 TOP5） |
| PATCH /conversations/:id（改名） | `api.patch` void | `{id,name}` | ✅ | 一致 |
| POST /conversations/:id/members（加人） | `api.post {userId}` void | `{id,added}` | ✅ | 一致 |
| DELETE /conversations/:id/members/:userId（移除） | `api.delete` void | `{id,removed}` | ✅ | routes.ts `arg:"id"` 仅一处但 matchRoute 返回全部捕获组、dispatch 传两参，handler `(ctx,id,targetUserId)` 正常 |
| POST /conversations/:id/leave | `api.post` void | `{id,left}`；含 `NOT_A_GROUP/NOT_A_MEMBER` 错误 | ⚠️ 部分 | 请求/响应一致；api.md 仅列 `OWNER_MUST_TRANSFER_OR_DELETE`，漏 `NOT_A_GROUP`/`NOT_A_MEMBER`（文档不全） |
| DELETE /conversations/:id（解散） | `api.delete` void | `{id,deleted}` | ✅ | 一致 |
| POST /conversations/:id/transfer | `api.post {userId}` void | `{id,new_owner}` | ✅ | 一致 |
| PATCH /conversations/:id/read | `markRead(id,lastReadAt?)` → `{}` 或 `{last_read_at}` | `{id,last_read_at}` | ✅ | 一致 |

## 4. 消息 3

| 端点 | 前端调用 | 后端响应 | 一致? | 问题 |
|---|---|---|---|---|
| POST /conversations/:id/messages | `sendMessage` → `{content}` | `{id,conversation_id,sender_id,content,created_at}` | ✅ 部分 | 运行一致；但 `api.post(...)` **未传泛型 `<Message>`**，返回类型靠声明硬套，类型链不严谨 |
| GET /conversations/:id/messages | `getMessages(id,before?,limit)` → query `before/limit` | `{messages,next_before}` | ✅ | `useMessageStore` 正确使用 `page.next_before` 判 hasMore，游标透传一致 |
| GET /conversations/:id/messages/sync | `syncMessages(id,after?,limit)` → query `after/limit` | `{messages,next_cursor}` | ✅ | 正确消费 `next_cursor`，写入本地后推进，一致 |

## 5. 翻译

| 端点 | 前端调用 | 后端响应 | 一致? | 问题 |
|---|---|---|---|---|
| POST /translate | `translateMessage(text,target_lang:string)` → `{text,target_lang}` | `{translation,target_lang}` | ✅ | 字段与 `TranslateResult` 完全对齐；前端 `target_lang` 未用 `"zh"‖"en"` 联合类型，由后端校验 |

## 6. 管理 9

| 端点 | 前端调用 | 后端响应 | 一致? | 问题 |
|---|---|---|---|---|
| GET /admin/stats/overview | `getStatsOverview(): AdminStatsOverview` | `{users,conversations,groups,messages,admins}` | ✅ | 字段一一对应；OverviewTab 用 Object.entries 直接显示原始 key（如 `admins`），未本地化，仅观感 |
| GET /admin/users | `getAdminUsers` → `normalize(raw,"users")` | `{users:[...],next_cursor}` | ✅ | key `users` 与后端一致 |
| GET /admin/users/:id | **前端无调用**（api/admin.ts 未定义） | `{...user,conversations:[...]}` | 未覆盖 | 端点存在但前端未用，信息项 |
| PATCH /admin/users/:id | `patchAdminUser(id,patch)` 仅定义、**无 UI 调用** | `{id,username,display_name,admin}` | 未覆盖 | 返回缺 `email` 与 `User` 类型不符（未被消费故未暴露） |
| DELETE /admin/users/:id | `deleteAdminUser(id)` → UsersTab 使用 | `{id,deleted:true}` | ❌ 文档 | **BE 已实现（routes.ts + handler），FE 已调用，但 api.md 完全无此端点章节**（README 却声称含它）。文档与代码脱节（见 TOP4） |
| GET /admin/channels | `getAdminChannels` → `normalize(raw,"channels")` | `{channels:[...],next_cursor}` | ✅ | key 一致；`AdminChannel` 含 created_at/member_count |
| DELETE /admin/channels/:id | `deleteAdminChannel(id)` | `{id,deleted:true}` | ✅ | 一致 |
| GET /admin/channels/:id/messages | `getAdminChannelMessages` → `normalize(raw,"messages")` | `{messages:[...],next_cursor}` | ✅ | key 一致 |
| GET /admin/audit-log | `getAuditLog` → `normalize(raw,"entries")` | `{entries:[...],next_cursor}` | ✅ | key `entries` 正确；`AdminAuditEntry` 缺 `actor_username/target_type/target_id`，且 AuditTab 用 `e.detail ?? e.target`，`target` 后端并不返回（因 detail 存在故未暴露） |

> normalize() 的 4 个 key（users / channels / messages / entries）均与后端实际响应字段**逐一匹配**，无 key 错配。

## 7. 错误码全集

- `contracts/errors.ts` 的 **18 个 code 在前端 `i18n/errors.ts` 均有映射** ✅（`EMAIL_TAKEN`→`err.EMAIL_EXISTS`，该 key 双语字典均存在）。`NETWORK`/`TIMEOUT` 为客户端专用，额外映射无害。
- ❌ **`INTERNAL_ERROR`**：`platform/response.ts failErr()` 对未捕获异常返回 `code="INTERNAL_ERROR"`(500)，该 code 既不在 contracts/errors.ts、也不在前端映射 → 落到错误文案兜底（见下条）。
- ❌ **`errorText()` 兜底 key 写错**：`errors.ts` 用 `t("err.generic")`，但字典里的真实 key 是 `error.generic`（EN/ZH 均如此）。未知 code 或无 fallback 时，用户看到字面量 `err.generic`；叠加 `INTERNAL_ERROR` 未映射，500 错误即显示该字面串（见 TOP3）。
- ❌ **服务端 message 被直接展示，违反既定契约**：README 双语与 `errors.ts` 注释均声明「服务端只回 code，前端不直接展示服务端 message」，实际 `ApiError.message = envelope.error.message`，下列组件直接渲染 `(err as Error).message`：
  `CreateRoom`（创建私聊/群）、`RegisterForm`（注册/验证/重发）、`RoomDialogs`（两处）、`ChannelsTab`、`UsersTab`、`AuditTab`、`ErrorBoundary`。
  结果是用户（尤其中文界面）会看到后端英文内部串（如 `email already registered`、`group size exceeds 10`、`email delivery is disabled`）。仅 LoginForm/ProfilePage/OverviewTab/MessageInput/AdminPage 走 `errorText()` 本地化（见 TOP1）。

## 8. 分层与文档

- `api.md` ↔ `routes.ts`：**功能端点基本一一对应，唯一实质缺口是 `DELETE /admin/users/:id`**（api.md 无章节）。次要：`/auth/verify`、`/auth/recover` 文档描述「发信/重置」语义，实际恒 400 冻结；错误码表未列 `INTERNAL_ERROR`、却列了 handler 从不抛的 `EMAIL_NOT_CONFIRMED`/`EMAIL_TAKEN`。
- `README.md` / `README.zh-CN.md` 双语**过时/失真**：
  - 均称「9 个管理端点含 `DELETE /admin/users/:id`」——代码属实但 api.md 缺文档（内部不自洽）。
  - 均称「服务端只回 code，前端不展示 message」——被第 7 节证伪。
  - 均称「会话列表/详情返回 last_seen_at（在线状态）」——后端属实，但前端类型缺失、`yingo:online` 无发射源，UI 实际无在线状态。
  - EN 版 Layout 列出 `AUDIT_FRONTEND.md`，仓库中并不存在（仅 `AUDIT_BACKEND.md`）。

---

## 不一致总数：**15**

（按独立问题计数；happy-path 的请求路径/方法/字段、分页 key、游标字段、翻译字段均一致，未计入。）

1. `POST /conversations/direct`：`{id}` vs `Promise<Conversation>`（类型谎）
2. `POST /conversations/group`：`{id}` vs `Promise<Conversation>`（类型谎）
3. `GET /conversations`：peer `last_seen_at`/`online` 前端类型缺失 + presence 未消费
4. `GET /conversations/:id`：member `last_read_at`/`last_seen_at`/`online` 前端类型缺失
5. `useOnlineStatus` 监听 `yingo:online` 但全项目无 dispatch → presence 死链路
6. `PATCH /user/username`/`profile`：响应丢弃、本地 user 不刷新
7. `PATCH /user/profile`：前端签名 `string` 不含 api.md 允许的 `null`
8. `sendMessage`：`api.post` 缺 `<Message>` 泛型，类型链不严谨
9. `DELETE /admin/users/:id`：api.md 无文档（BE+FE 均已实现）
10. `errorText()` 兜底 key `err.generic` 不存在（应为 `error.generic`）
11. `INTERNAL_ERROR`(500) 前端错误码映射缺失
12. 服务端 message 被 7 处组件直接渲染，违反「不展示服务端 message」契约
13. signup/login 的 `user` 无 `display_name`，与前端 `User` 必填类型不符
14. api.md 错误码表缺 `INTERNAL_ERROR`、含未抛出的 `EMAIL_NOT_CONFIRMED`/`EMAIL_TAKEN`；leave 错误码不全
15. README 双语过时（message 声明、presence 声明、EN 版幽灵文件 `AUDIT_FRONTEND.md`）

## TOP 5 最严重

1. **服务端错误 message 被直接渲染（#12）**——违反双语 README 与 errors.ts 明示的核心契约，中文用户大量看到英文内部错误串（email already registered / email delivery is disabled / group size exceeds 10…）。影响面最广、确定发生。
2. **Presence 全链路死亡（#3+#4+#5）**——后端专门在 auth 阶段同往返节流写 `last_used_at`，并在会话列表/详情附带 `online`/`last_seen_at`；但前端类型不声明、`useOnlineStatus` 监听的 `yingo:online` 无任何发射源，投入的后端机制 100% 未兑现为 UI 能力。
3. **错误兜底双重失效（#10+#11）**——`errorText()` 兜底指向不存在的 `err.generic`，且 `INTERNAL_ERROR` 未映射；任何 500 或未知 code 都会在界面显示字面量 `err.generic`，而非本地化文案。
4. **`DELETE /admin/users/:id` 文档缺失（#9）**——唯一一个「BE 路由+handler、FE 调用」都齐备却未进 api.md 的端点；摧毁「routes.ts 为唯一真相源 / api.md 为完整参考」的可信度，易误导后续维护与回归。
5. **createDirect/createGroup 返回类型谎（#1+#2）**——后端只回 `{id}`，前端声明并向下传递 `Promise<Conversation>`；当前靠消费者只读 `.id` 未爆雷，但任何按 `Conversation` 全字段使用的改动都会得到 undefined，属高危脆弱点（且为本次任务点名项）。
