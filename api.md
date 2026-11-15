# Coalchat API 文档

Base URL：`/api/v1`（同站点相对路径）
认证：`Authorization: Bearer sess_xxx`（除标注「无需认证」外全部必需）
统一响应：成功 `{"data": ..., "error": null}`；失败 `{"data": null, "error": {"code": "...", "message": "..."}}`

## 错误码总表

| code | HTTP | 含义 |
|---|---|---|
| INVALID_INPUT | 400 | 字段缺失/格式错误 |
| USERNAME_INVALID | 400 | 用户名不合规（3-32 位 `[a-z0-9_-]`） |
| NAME_INVALID | 400 | 群名不合规（1-64 字） |
| GROUP_FULL | 400 | 群聊已达 10 人 |
| NOT_A_GROUP | 400 | 对私聊做群操作 |
| CANNOT_REMOVE_OWNER | 400 | 移除群主自己 |
| OWNER_MUST_TRANSFER_OR_DELETE | 400 | owner 不能直接退群 |
| UNAUTHORIZED | 401 | 缺失/无效 session_token |
| INVALID_CREDENTIALS | 401 | 登录失败 |
| FORBIDDEN | 403 | 非成员/非 owner/非管理员 |
| EMAIL_NOT_CONFIRMED | 403 | 邮箱未确认 |
| USER_NOT_FOUND | 404 | 目标用户不存在 |
| NOT_A_MEMBER | 404 | 会话不存在或目标不是成员 |
| USERNAME_TAKEN | 409 | 用户名冲突 |
| EMAIL_EXISTS | 409 | 邮箱已注册 |
| ALREADY_MEMBER | 409 | 目标已在会话 |

---

## 认证（无需认证）

### POST /auth/signup — 注册

请求：
```json
{ "email": "a@b.c", "password": "至少8位", "username": "alice" }
```
响应（站点未开 Autoconfirm 时）：
```json
{ "data": { "session_token": null, "confirmation_required": true,
            "user": { "id": "uuid", "username": "alice", "email": "a@b.c" } }, "error": null }
```
响应（开了 Autoconfirm 直接返回 token）：
```json
{ "data": { "session_token": "sess_xxx", "confirmation_required": false, "user": { ... } }, "error": null }
```
错误：`USERNAME_INVALID` / `USERNAME_TAKEN` / `EMAIL_EXISTS` / `INVALID_INPUT`

### POST /auth/verify — 邮箱确认 / 密码重置

请求：
```json
{ "type": "signup" | "recover", "token": "邮件链接中的token", "password": "recover 时必需" }
```
响应：
```json
{ "data": { "session_token": "sess_xxx", "user": { "id": "...", "username": "...", "email": "..." } }, "error": null }
```
说明：`type=recover` 成功会吊销该用户全部旧会话。
错误：`INVALID_INPUT`

### POST /auth/login — 登录

请求：
```json
{ "email": "a@b.c", "password": "..." }
```
响应：
```json
{ "data": { "session_token": "sess_xxx", "user": { "id": "...", "username": "...", "email": "..." } }, "error": null }
```
错误：`INVALID_CREDENTIALS` / `EMAIL_NOT_CONFIRMED` / `INVALID_INPUT`

### POST /auth/recover — 发送重置邮件

请求：`{ "email": "a@b.c" }`
响应：`{ "data": { "ok": true }, "error": null }`
说明：无论邮箱是否存在均返回 200（防枚举）。

---

## 认证（需认证）

### POST /auth/logout — 登出（吊销当前 session）
响应：`{ "data": { "ok": true }, "error": null }`

### GET /auth/me — 当前用户
响应：
```json
{ "data": { "id": "uuid", "username": "alice", "display_name": "Alice", "email": "a@b.c" }, "error": null }
```

---

## 用户

### PATCH /user/username
请求：`{ "username": "newname" }`
响应：`{ "data": { "id": "...", "username": "newname" }, "error": null }`
错误：`USERNAME_INVALID` / `USERNAME_TAKEN`

### PATCH /user/profile
请求：`{ "display_name": "昵称" | null }`
响应：`{ "data": { "id": "...", "display_name": "昵称" }, "error": null }`
错误：`INVALID_INPUT`

---

## 会话

### GET /conversations — 会话列表（按最后消息时间倒序）
响应 data 元素：
```json
{
  "id": "uuid", "type": "direct|group", "name": "群名|null",
  "updated_at": "ISO", "last_message": "...|null", "last_at": "ISO|null",
  "last_read_at": "ISO|null", "unread_count": 0,
  "peer": { "id": "...", "username": "...", "display_name": "..." }  // 仅 direct
}
```

### GET /conversations/:id — 会话详情
响应：
```json
{ "data": {
  "id": "...", "type": "group", "name": "...", "created_by": "...",
  "created_at": "...", "updated_at": "...",
  "my_role": "owner|member", "member_count": 3,
  "members": [ { "user_id": "...", "username": "...", "display_name": "...",
                 "role": "owner|member", "joined_at": "...", "last_read_at": "..." } ]
}, "error": null }
```

### POST /conversations/direct — 创建/复用私聊
请求：`{ "targetUserId": "uuid" }`
响应：`{ "data": { "id": "convId" }, "error": null }`
说明：同一对用户重复调用返回同一 id。
错误：`INVALID_INPUT` / `USER_NOT_FOUND`

### POST /conversations/group — 创建群聊（总数含自己 ≤10）
请求：`{ "name": "群名", "memberIds": ["uuid", ...] }`
响应：`{ "data": { "id": "convId" }, "error": null }`
错误：`NAME_INVALID` / `GROUP_FULL` / `USER_NOT_FOUND` / `INVALID_INPUT`

### PATCH /conversations/:id — 改群名（owner）
请求：`{ "name": "新名" }`
响应：`{ "data": { "id": "...", "name": "新名" }, "error": null }`
错误：`NOT_A_GROUP` / `NAME_INVALID` / `FORBIDDEN`

### POST /conversations/:id/members — 加成员（owner，事务内 COUNT）
请求：`{ "userId": "uuid" }`
响应：`{ "data": { "id": "...", "added": "uuid" }, "error": null }`
错误：`GROUP_FULL` / `ALREADY_MEMBER` / `USER_NOT_FOUND` / `FORBIDDEN`

### DELETE /conversations/:id/members/:userId — 移除成员（owner）
响应：`{ "data": { "id": "...", "removed": "uuid" }, "error": null }`
错误：`CANNOT_REMOVE_OWNER` / `NOT_A_MEMBER` / `FORBIDDEN`

### POST /conversations/:id/leave — 退出会话
响应：`{ "data": { "id": "...", "left": true }, "error": null }`
错误：`OWNER_MUST_TRANSFER_OR_DELETE`

### DELETE /conversations/:id — 解散群聊（owner；messages 物理保留）
响应：`{ "data": { "id": "...", "deleted": true }, "error": null }`

### POST /conversations/:id/transfer — 转让群主（owner）
请求：`{ "userId": "uuid" }`
响应：`{ "data": { "id": "...", "new_owner": "uuid" }, "error": null }`
错误：`NOT_A_MEMBER` / `FORBIDDEN`

### PATCH /conversations/:id/read — 标记已读
请求：`{ "last_read_at": "ISO" }`（可省略，默认当前时间）
响应：`{ "data": { "id": "...", "last_read_at": "ISO" }, "error": null }`

---

## 消息

### POST /conversations/:id/messages — 发送（成员）
请求：`{ "content": "文本，trim 后非空且 ≤4000 字符" }`
响应：
```json
{ "data": { "id": "msgId", "conversation_id": "...", "sender_id": "...",
            "content": "...", "created_at": "ISO" }, "error": null }
```
错误：`INVALID_INPUT` / `FORBIDDEN`

### GET /conversations/:id/messages — 分页读取（倒序，向过去翻页）
Query：`before=<游标>`（可选，首页省略）、`limit=1..50`（默认 50）
响应：
```json
{ "data": {
  "messages": [ { "id": "...", "sender_id": "...", "content": "...", "created_at": "ISO" } ],
  "next_before": "Base64游标|null"   // null 表示已到最早
}, "error": null }
```
说明：游标是不透明字符串（内部 `created_at|id` 的 Base64URL），直接透传即可。

### GET /conversations/:id/messages/sync — 增量同步（正序，取更新）
Query：`after=<游标>`（首次可省略=从最早开始）、`limit=1..50`
响应：
```json
{ "data": { "messages": [ ... ], "next_cursor": "Base64游标" }, "error": null }
```
说明：客户端须在**成功写入本地后**才推进 next_cursor，失败不推进。

---

## 管理面板（需管理员，users.admin = 1）

### GET /admin/stats/overview — 概览统计
响应：
```json
{ "data": { "users": 0, "conversations": 0, "groups": 0, "messages": 0, "admins": 0 }, "error": null }
```

### GET /admin/users — 用户分页/搜索
Query：`search=<用户名子串>`（可选）、`cursor=<username>`（可选）、`limit=1..50`
响应：
```json
{ "data": { "users": [ { "id": "...", "username": "...", "display_name": "...",
                         "email": "...", "created_at": "ISO", "admin": 0|1 } ],
            "next_cursor": "username|null" }, "error": null }
```

### GET /admin/users/:id — 用户详情
响应：`{ "data": { ...用户字段, "conversations": [ { "id", "type", "name", "role", "joined_at" } ] }, "error": null }`

### PATCH /admin/users/:id — 修改用户（提升/降权、显示名）
请求：`{ "admin": 0|1, "display_name": "..." }`（字段均可选）
响应：`{ "data": { "id", "username", "display_name", "admin" }, "error": null }`
说明：不允许自我降权；操作写入 audit_log。
错误：`INVALID_INPUT` / `USER_NOT_FOUND` / `FORBIDDEN`

### GET /admin/channels — 全站会话分页
Query：`cursor`（可选）、`type=direct|group`（可选）、`limit`
响应：
```json
{ "data": { "channels": [ { "id", "type", "name", "created_by", "created_at",
                            "updated_at", "member_count" } ],
            "next_cursor": "created_at|id 编码|null" }, "error": null }
```

### DELETE /admin/channels/:id — 强制解散（保留 messages）
响应：`{ "data": { "id": "...", "deleted": true }, "error": null }`

### GET /admin/channels/:id/messages — 跨权限消息审计
Query：`cursor`（可选）、`limit`
响应：`{ "data": { "messages": [...], "next_cursor": "...|null" }, "error": null }`

### GET /admin/audit-log — 管理操作日志
Query：`cursor`（可选）、`limit`
响应：
```json
{ "data": { "entries": [ { "id", "actor_id", "actor_username", "action",
                           "target_type", "target_id", "detail", "created_at" } ],
            "next_cursor": "..." }, "error": null }
```

---

## 其它

### GET /（根路径）— 健康检查
响应：`204 No Content`（带 CORS 头，免认证）

### OPTIONS 任意路径 — CORS 预检
响应：`204 No Content`（免认证）

CORS：`Access-Control-Allow-Origin: *`、Methods `GET,POST,PATCH,DELETE,OPTIONS`、Headers `Authorization,Content-Type`。
