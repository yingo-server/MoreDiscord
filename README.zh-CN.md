# MoreDiscord

聊天应用：前端 React + Vite + Tailwind，后端 Netlify Edge Functions + Turso + Netlify Identity。客户端唯一入口 `/api/v1/*`，唯一凭证 `Authorization: Bearer sess_...`。

## 目录

```
├── netlify.toml                    # edge_functions 路由 + 前端构建配置
├── schema.sql                      # Turso 建表 SQL
├── api.md                          # 接口文档
├── smoke_test.ts                   # 离线冒烟测试（46 断言）
├── tool/                           # 语言判定与按钮可见性测试、emoji 检查
├── frontend/                       # React + TS + Vite + Tailwind（源码）
├── AUDIT_BACKEND.md                # 后端审查报告
├── AUDIT_FRONTEND.md               # 前端审查报告
├── FIX_PLAN.md                     # 审查修复记录
├── LAYER_PLAN.md                   # 分层重构方案
├── netlify/edge-functions/
    ├── api.ts                      # L4：查路由表 → 鉴权 → dispatch
    ├── contracts/                  # L0 路由表、错误码、DTO
    ├── platform/                   # L1 db / identity / session / cors / response / validate
    ├── domain/                     # L2 tags / presence
    ├── handlers/                   # L3 各端点
    └── index.ts                    # 汇总导出
```

依赖方向 L4→L3→L2→L1→L0，下层不引用上层。

## 部署

1. Turso：

```bash
turso db create chat
turso db shell chat < schema.sql
turso db tokens create chat   # TURSO_AUTH_TOKEN
turso db show chat --url      # TURSO_DATABASE_URL
```

2. Netlify 站点关联本仓库，构建命令与发布目录已写在 `netlify.toml`（`frontend/` 内 `npm ci && npm run build`，发布 `frontend/dist`）。

3. 环境变量（Functions 作用域）：`TURSO_DATABASE_URL`、`TURSO_AUTH_TOKEN`、`IDENTITY_ORIGIN`。

4. Identity 在站点设置里启用，注册模式与 Autoconfirm 按需选择。

## 测试

```bash
deno check netlify/edge-functions/api.ts
deno run -A smoke_test.ts            # 46 断言
deno test tool/lang.test.ts tool/message_button.test.ts
python3 tool/check_emoji.py .        # 禁 emoji
```

前端：`cd frontend && npx tsc -b && npm run build`。

## 接口

全部端点、参数、响应与错误码见 [api.md](api.md)。概要：认证 6 条（signup 走预留/回填/补偿，登录透明续期）、会话 11 条（私聊去重、10 人上限事务内校验、owner 转让/解散）、消息 3 条（游标分页与增量同步，游标不透明透传、失败不推进）、翻译 1 条（服务端代理上游）、管理 8 条（audit_log 留痕）。

## 行为约定

- 消息 ≤4000 字符（Unicode 码点），群 ≤10 人，事务内 COUNT+INSERT 保证并发不超。
- 解散会话保留消息行；移除成员立即失权。
- `display_name` 允许重名，读取时按创建顺序附 `tag`（首个为 1 不显示后缀）；`username` 唯一。
- 在线状态：每个已认证请求在鉴权时以同一次 Turso 往返节流更新 `sessions.last_used_at`（60s），会话列表与详情带出 `last_seen_at`，无独立心跳。
- 翻译：仅他人消息、且语言与界面语言不同（陌生字符占比 ≥35%）时显示按钮；上游由服务端代理。

---

[English](README.md)
