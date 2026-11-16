# 去 Identity：纯 Turso 自管账号

## 目标

认证完全由 Turso 自管，移除 Netlify Identity 依赖。发信冻结：不发信、不验证，注册直接入库并返回 session_token。

## 改动

### 数据层
`schema.sql`：
- `users` 加 `password_hash TEXT NOT NULL`（PBKDF2-SHA256，格式 `pbkdf2$<iter>$<salt_b64>$<hash_b64>`）
- `sessions` 去掉 `identity_access_token` / `identity_refresh_token` / `identity_expires_at` 三列
- 新增 `email_tokens`（冻结期不使用，留位给将来发信）：`token_hash PK, user_id, type('signup'|'recover'), expires_at, created_at`
- 新增 `settings`（存开关）：`key PK, value`；写入 `email_verification_required=0`

### L1 platform
- 新增 `platform/password.ts`：PBKDF2-SHA256（WebCrypto，10000 迭代）hash/verify，常量时间比较
- 新增 `platform/settings.ts`：读 `settings` 表的开关（带进程内缓存）
- 删 `platform/identity.ts`
- 改 `platform/session.ts`：自管 session——只存 `token_hash/user_id/created_at/last_used_at/revoked`；去掉续期分支；`createSession` 不再接收 Identity tokens；`resolveUserId` 查不到即 401（无续期）
- `platform/response.ts` 不变

### L3 handlers
- `handlers/auth.ts`：
  - signup：校验邮箱/密码/用户名 → 查重（username UNIQUE、email UNIQUE）→ hash 密码 → INSERT users → createSession → 返回 `session_token`（`confirmation_required` 恒 false，开关为真时才走 tokens 表路径）
  - login：查 users → verify hash → createSession
  - verify/recover：开关为 false 时返回 `INVALID_INPUT`（功能冻结）；开关为 true 走 email_tokens 表（本轮不实现发信，只留校验分支）
  - me：不变
- 删 `handlers/auth.ts` 里所有 identity* 调用

### L4 路由
- `contracts/routes.ts` 路由表不变（路径契约不变）
- 删 `IDENTITY_ORIGIN` 环境变量引用

### 清理
- `netlify.toml`、README（双语）、api.md 同步：去掉 Identity 描述，加「密码哈希」「发信冻结」说明
- `.github/workflows/deploy.yml` 的 live-db 脚本 import 路径核对

## 契约变化

- signup 响应：`confirmation_required` 恒 `false`，`session_token` 直接有值
- verify/recover：冻结期返回 `INVALID_INPUT`（"email delivery is disabled"）
- 错误码表去掉 `EMAIL_NOT_CONFIRMED`（不可达）？保留但不用——**保留**，避免破坏前端映射；仅不再抛出
- 新增错误码：`EMAIL_TAKEN` 409（邮箱已注册）

## 纪律

- 分层不破：L4→L3→L2→L1→L0，下层不 import 上层
- 密码哈希只在 L1，handler 不碰算法
- 开关读 settings 表（带缓存），默认 false
- 门禁：deno check / smoke / 真库 / tsc 全绿，失败即停
- 不派子代理，主线执行
- 清库放在最后一步（改完代码再清，避免清完发现代码没跑通）
