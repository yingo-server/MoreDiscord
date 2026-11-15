# 分层重构

单向依赖：上层可 import 下层，反之禁止。

```
L0 contracts/   路由表、错误码、DTO（零实现）
L1 platform/    cors、db、identity、session、response
L2 domain/      users、conversations、messages、presence、tags、audit
L3 handlers/    req → domain → Response；权限守卫
L4 api.ts       OPTIONS → 查路由表 → 一次鉴权 → dispatch
```

## 现状

1. `api.ts` 三份路由定义（known / methodAllowed / dispatch）漂移
2. handler 重复 `requireUser`，`Ctx.userId` 未消费
3. handler 直接写 SQL
4. 游标/校验工具分散
5. `api.md` 手工对齐

## 分层内容

### L0 `contracts/`

| 文件 | 内容 |
|---|---|
| `routes.ts` | 唯一路由表；派生 404 预检、dispatch、api.md 校验 |
| `errors.ts` | 错误码 → HTTP 状态 |
| `dto.ts` | 请求/响应类型 |

### L1 `platform/`

| 文件 | 职责 |
|---|---|
| `db.ts` | 唯一 Turso 连接；事务 mode 内部决定 |
| `identity.ts` | 唯一 GoTrue HTTP |
| `session.ts` | token 哈希、签发、吊销、续期 |
| `cors.ts` `response.ts` | 保持 |

### L2 `domain/`

| 文件 | 搬入 |
|---|---|
| `users.ts` | 校验、#tag、用户查询 SQL |
| `conversations.ts` | 成员/owner/人数/去重 SQL |
| `messages.ts` | 长度、游标、分页/同步 SQL |
| `presence.ts` | last_seen_at 查询 |
| `audit.ts` | audit_log 读写 |

### L3 `handlers/`

取 `ctx.userId` → 调 domain → `ok()/fail()`。保留 requireAdmin/requireOwner。

### L4 `api.ts`

OPTIONS → 查表 → 一次 resolveUserId → dispatch。约 60 行。

## 执行

分批，每批独立验证：`deno check` + smoke 44/44 + 真库 9/9。失败即停。

顺序：L0 → L1 → L2 → L3 → L4。

主线亲自执行，不派子代理。不修前端，不改契约、netlify.toml、线上库，不引新依赖。

## 验收

1. `handlers/` 无 `requireUser`（requireAdmin 除外）
2. `handlers/` 无 `fetch(`
3. 路由只定义一次
4. `api.md` 与路由表一致
5. 门禁 + CI 全绿

## 状态

已完成（主线亲自执行）。`_shared/` 删除，目录收敛为 contracts/platform/domain/handlers/api.ts。

门禁：deno check 全绿、smoke 44/44、真库 9/9、前端 tsc 0 错误。
