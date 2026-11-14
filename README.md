# 聊天应用后端（Netlify Edge Functions + Turso + Netlify Identity）

依据《聊天应用后端规划书》实现的完整后端。客户端唯一入口 `/api/v1/*`，唯一凭证 `Authorization: Bearer sess_...`。

## 目录结构

```
├── netlify.toml                    # 唯一一条 edge_functions 路由
├── schema.sql                      # Turso 全量建表 SQL
├── smoke_test.ts                   # 离线冒烟测试（41 断言，mock Turso/Identity）
└── netlify/edge-functions/
    ├── api.ts                      # 统一路由 pathname → handler
    ├── _shared/
    │   ├── cors.ts                 # 预检 + 响应头（错误响应也带 CORS）
    │   ├── auth.ts                 # ★ 唯一接触 Netlify Identity；session 管理
    │   ├── db.ts                   # ★ 唯一接触 Turso（get/all/run/transaction）
    │   ├── response.ts             # 统一 {"data":..,"error":{code,message}}
    │   └── validate.ts             # 输入校验 + 工具
    └── handlers/
        ├── types.ts                # Ctx 类型
        ├── auth.ts                 # signup/verify/login/logout/recover/me
        ├── user.ts                 # username/profile
        ├── conversations.ts        # 11 个会话端点
        └── messages.ts             # send/list/sync
```

## 部署步骤

1. **Turso 建表**
   ```bash
   turso db create chat
   turso db shell chat < schema.sql
   turso db tokens create chat   # 得到 TURSO_AUTH_TOKEN
   turso db show chat --url      # 得到 TURSO_DATABASE_URL
   ```
2. **Netlify 配置**
   - Site configuration → Identity → Enable Identity；注册模式选 Open（或 Invite）；决定是否 Autoconfirm。
   - Site configuration → Environment variables（Functions 作用域）配置：
     - `TURSO_DATABASE_URL`
     - `TURSO_AUTH_TOKEN`
     - `IDENTITY_ORIGIN`（如 `https://<site>.netlify.app`）
   - 修改变量后需重新部署。
3. **部署**：仓库推到 Netlify（`netlify.toml` 已配好 `/api/v1/*` → `api` 函数）。

## 本地验证

```bash
deno check api.ts                                   # 类型检查（已通过）
deno run -A smoke_test.ts                           # 41 断言冒烟测试（已通过）
```

smoke_test.ts mock 了 Turso pipeline 与 Identity HTTP，覆盖：注册（预留+回填+补偿）、用户名冲突、弱密码补偿、登录/登出吊销、伪造 token 401、私聊去重同 id、10 人上限（创建与加成员双校验）、owner 规则（不可直接退群/转让校验）、成员退出失权、4000 字符上限、游标分页、标记已读、CORS/OPTIONS。

## 关键实现点（对应规格 §16）

1. **事务**：用户名预留、私聊去重、建群、加成员（COUNT+INSERT）、移除、转让、解散全部走 `transaction()`（Turso pipeline baton 串行，异常 close 回滚，无泄漏）。
2. **10 人上限**：创建（memberIds 去重剔除自己后 +1 校验）与加成员（事务内 COUNT）双处校验。
3. **owner 规则**：唯一 owner；owner 退群返回 `OWNER_MUST_TRANSFER_OR_DELETE`；转让后 `created_by` 同步更新。
4. **移除即失权**：成员校验实时查表，移除后立即 403。
5. **解散保留 messages**：只删 members + conversations 行。
6. **session_token**：32 字节随机 Base64URL，`sess_` 前缀，仅 SHA-256 哈希入库，明文只返回一次。
7. **透明续期**：`resolveUserId` 内 refresh_token 续期并更新 sessions；失败才 401。
8. **密码重置吊销**：verify(type=recover) 成功后 `revokeAllUserSessions`。
9. **CORS 全覆盖**：`withCors` 包裹所有响应；OPTIONS 204 免认证。
10. **Identity 错误翻译**：GoTrue `{"msg":...}` 映射为 §11 错误码，绝不透传。

## 轮询策略（客户端契约，规格 §10.4）

- 高活跃窗口 1–3s；空闲 10–15s；后台恢复立即拉一次。
- sync 端点返回 `next_cursor`，客户端**写入本地成功后才推进**，失败不推进。
- 调用量估算：10 人 × 20 次/天 × 1 分钟高活跃 ≈ 18 万次/月（免费额度 18%）。
