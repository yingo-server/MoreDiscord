# 前端全面审查报告 AUDIT_FRONTEND2（2026-11-16）

审查对象：`chat-backend/frontend`（只读；仅跑 `tsc -b` / `npm run build`，未改源码）
基线：`FULLCHECK_TASK.md`（62ff9d6）。契约参照 `netlify/edge-functions/contracts/*`、`handlers/*`、`api.md`。

## 总览

tsc / build 均通过；fetch 唯一出口、零后端耦合、_redirects、无 emoji 均达标。但发现 **2 个 P0 授权/权限断裂问题** 与 1 个 P1 功能阻断问题，会导致"登录后数据全部 401（刷新才好）""管理员永远进不了管理面板""普通用户无法新建会话"。详情见文末 TOP5。

严重度：P0 致命（核心流程不可用）/ P1 高（主要功能阻断）/ P2 中（功能缺失或体验错误）/ P3 低（死代码、边缘）。

---

## 1. 认证 UI

| 检查点 | 结论 | 依据 |
|---|---|---|
| 登录/注册页面 | PASS | pages/LoginPage.tsx、RegisterPage.tsx；components/auth/LoginForm.tsx、RegisterForm.tsx |
| ApiError(code) 错误映射 | PASS（有缺口） | i18n/errors.ts:5-25 覆盖 contracts/errors.ts 全部 18 码 + EMAIL_TAKEN 别名 + NETWORK/TIMEOUT；但回落键 `err.generic`（errors.ts:27,29,31）未定义 |
| 401 全局登出 | 部分 | api/client.ts:100-111，仅当 `status===401 && code==="UNAUTHORIZED" && token` 才登出；其他 401（如空 code）不清理，条件过窄 |
| setToken/getToken 与 zustand persist 结构 | **FAIL P0** | 见下 |
| 发信冻结后 RegisterForm 仍调用 verify/recover | 残留（不可达） | 见下 |

**【P0】client.ts 的 token 与 zustand 授权状态从不互相同步。**
- `api/client.ts:16-24` 模块加载时从 localStorage 读一次 token 到内存变量 `token`；此后只靠 `setToken()` 更新。
- `stores/useAuthStore.ts:29-49` 的 `login()`/`signup()`/`setSession()` 只 `set({sessionToken})`（zustand persist 写 localStorage），`clear()` 只清 zustand state，**全程不调用 `client.setToken()`**。
- 全局 grep：`setToken` 仅在 `client.ts:103`（401 登出路径）以 `null` 调用；`getToken` 从未被调用。
- 后果：登录/注册/verify 成功后，SPA 内所有 `api.*` 请求的内存 token 仍为 null → 不带 `Authorization` → 401；`fetchMe`/`fetchRooms` 失败，用户看到"会话加载失败/出错了"，**刷新页面后才恢复**（模块重载重新读 localStorage）。登出后内存 token 也不清，账号切换会带旧 token。
- 建议（不实施）：在 auth store 的 login/signup/setSession/clear 中成对调用 `setToken()`，或让 client 直接读 `useAuthStore.getState().sessionToken`。

**【P2】错误文案回落键拼写不存在。** `i18n/errors.ts:27,29,31` 用 `t("err.generic")`，但 i18n/index.ts 只定义了 `error.generic`（199/354）。未知错误码且无 fallback 时（如 OverviewTab.tsx:20 `errorText(code)`）界面显示原始键 `err.generic`。

**【P3】发信冻结后的死 UI 分支。** 后端 `verify()`/`recover()` 已冻结（handlers/auth.ts:56-58,91-93 直接返回 INVALID_INPUT），settings 默认 `email_verification_required=0`（platform/settings.ts:6），signup 恒返回 `confirmation_required=false`。故 RegisterForm 的 `confirmEmail` 分支、handleVerify（:43-60）、handleResend（:63-75）不可达但代码仍在（含"从邮件获取令牌/设置密码"表单）。属残留，非活跃 bug。

---

## 2. 会话 UI

| 检查点 | 结论 | 依据 |
|---|---|---|
| 会话列表 / 新建私聊 / 群聊 | PASS | Sidebar.tsx、CreateRoom.tsx、useRoomStore.ts |
| admin 列表归一化(items) | PASS | api/admin.ts:7-13 `normalize(raw,"users")`；后端 adminListUsers 返回 `users:`（handlers/admin.ts:48），字段对齐 |
| RoomItem 显示名 #tag | PASS | RoomItem.tsx:11 → conversationTitle → formatDisplayName（lib/displayName.ts:14-18，tag>1 加 `#tag`）；后端 peer 带 tag（handlers/conversations.ts:95） |
| 搜索（会话） | PASS | Sidebar.tsx:34-39 用 formatDisplayName(peer) 过滤 |

**【P1】新建会话的"用户搜索"误用管理员端点，普通用户 403。**
- `components/rooms/CreateRoom.tsx:44` 调用 `getAdminUsers(searchQuery)` 搜索用户（私聊/群聊共用）。
- `/admin/users` 在 routes.ts:55 标记 `admin:true`，后端 `requireAdmin()` 强制 `admin===1`（handlers/admin.ts:8-13）。
- 普通用户（admin=0）调用返回 FORBIDDEN/403 → catch 置 `results=[]`（CreateRoom.tsx:47）→ **搜不到任何人，无法新建私聊/群聊**。契约层也没有非管理员用户搜索端点（routes.ts 无 `/users/search`）。这是前后端共同缺口，前端不应依赖 admin 端点做普通用户搜索。

**【P3】createDirect/createGroup 返回类型虚标。** `api/chat.ts:13,17` 声明返回 `Conversation`，但后端只返回 `{id}`（handlers/conversations.ts:192,232）。目前调用方仅用 `conv.id`，运行无碍，但类型契约不符，后续若读其它字段会 undefined。

---

## 3. 消息 UI

| 检查点 | 结论 | 依据 |
|---|---|---|
| 翻译按钮条件（他人 + 语言占比≥35%） | PASS | MessageItem.tsx:25 `!isOwn && !translation && needsTranslation()`；lib/lang.ts:2 阈值 0.35、:33-37 判定 |
| 译文内联 | PASS | MessageItem.tsx:73-78 译文块内联于消息下方 |
| 游标分页 useInfiniteScroll | PASS | hooks/useInfiniteScroll.ts IntersectionObserver；useMessageStore.fetchMore（:54-73）；后端 next_before（handlers/messages.ts:60） |
| sync 推进 | PASS（注意点） | useMessageStore.syncNew（:76-94）；后端 next_cursor（handlers/messages.ts:78） |
| 未读计数 | PASS（死代码） | clearUnread/bumpUnread（useRoomStore.ts:79-91），列表刷新会从服务端同步 unread_count |

**【P3】游标编码口径不一致（潜在）。** 前端 `cursorOf()`（useMessageStore.ts:21-27）用标准 `btoa`（含 `+/=`），后端 `encodeCursor`（validate.ts:76-78）用 base64url。后端 decodeCursor 能做 `-→+`/`_→/` 反转与补位，标准 base64 多数情况可解；但 `next_cursor` 优先用后端值、`appendMessage` 的 fallback 用 `cursorOf`，两条口径并存，建议统一。

**【P3】bumpUnread 从未被调用**（仅 useRoomStore.ts:20,88 定义）。实时未读增长依赖 12s 列表轮询刷新，不实时。

---

## 4. 设置页

| 检查点 | 结论 | 依据 |
|---|---|---|
| 改显示名 | PASS | ProfilePage.tsx:38-49 → userApi.updateProfile（api/user.ts:9） |
| 改用户名 | **FAIL P2** | api/user.ts:5 有 updateUsername，但 ProfilePage.tsx 无对应 UI/入口，需求"改用户名/显示名"只实现一半 |
| 登出清理 | 部分 | Header.tsx:18-21 → store.logout（useAuthStore.ts:42-49）→ clear()；清了 zustand，但 client 内存 token 未清（见第1项），且 store.clear() 不 dispatch `yingo:logout` |
| 管理员标识 + /auth/me 带 admin？ | **FAIL P0** | 见下 |

**【P0】`/auth/me` 不返回 admin，前端管理员身份永远为假。**
- 后端 me()（handlers/auth.ts:100-108）SELECT 仅 `id, username, display_name, email, created_at`，**无 admin 列**；signup/login 返回的 user 也只有 `{id, username, email}`（auth.ts:60,88）。
- 前端 `user.admin === 1` 是唯一管理员判据：Header.tsx:24/34/72、ProfilePage.tsx:51、AdminPage.tsx:12。
- 后果：`user.admin` 恒 `undefined` → Header 无"管理"入口、Profile 无管理员徽章、AdminPage 的 `isAdmin=false` 直接显示"无权限"（AdminPage.tsx:87-95）。**管理员无法通过 UI 进入管理面板**，即使直连 `/admin` 也被拦。
- 修复方向（不实施）：后端 me 增选 `admin`（及 tag），前端登录/注册响应同步带 admin，或将管理员判定改为服务端探测而非本地字段。

---

## 5. 管理面板 9 端点

| 检查点 | 结论 | 依据 |
|---|---|---|
| 用户删除按钮 | PASS | UsersTab.tsx:40-48 → deleteAdminUser |
| 会话解散 / 消息审计 | PASS | ChannelsTab.tsx handleDelete + ChannelMessagesDialog |
| 审计日志 | PASS | AuditTab.tsx |
| stats 归一化 | PASS | api/admin.ts:31 getStatsOverview 直接用 `{users,conversations,groups,messages,admins}`，与 handlers/admin.ts:212-222 一致 |
| 非 admin 403 处理 | 部分 | AdminPage.tsx:20-29 用 getStatsOverview 探测 403→forbidden；但受第4项 P0 影响，实际永到不了探测（isAdmin 恒 false） |

**【P2】9 端点前端仅覆盖 8 个。** 后端 admin 端点 9 个（routes.ts:54-62）。api/admin.ts 定义 8 个函数，缺 `GET /admin/users/:id`（adminGetUser）；`patchAdminUser`（api/admin.ts:59）虽定义但无任何管理 UI 调用（无改角色/显示名的管理操作）。即"改 admin/显示名"管理功能完全缺失。

---

## 6. 轮询

| 检查点 | 结论 | 依据 |
|---|---|---|
| usePolling 单定时器 | PASS（基本） | hooks/usePolling.ts 一个递归 setTimeout(消息sync 2s/12s) + 一个 setInterval(列表12s)，清理完整（:59-66） |
| visibilitychange | PASS | usePolling.ts:44-50,57 立即补拉 + 恢复可见刷新 |
| 额度估算 | 未覆盖/未实现 | 全仓无额度相关实现，任务要求项无对应代码 |
| 已删除的假 Live 状态残留 | 残留 | hooks/useOnlineStatus.ts 整个模块监听 `yingo:online`，但**全仓无任何地方 dispatch 该事件，也无任何组件 import/使用 useOnlineStatus**；socket.io-client 仍留在 package.json:32。属残留死代码（非活跃 bug，但应清理） |

---

## 7. i18n

| 检查点 | 结论 | 依据 |
|---|---|---|
| EN/ZH 键一致 | **FAIL P1** | ZH 143 键、EN 142 键；ZH 独有 `admin.users.deleteConfirm`（i18n/index.ts ZH 段），EN 缺失 → 英文界面删除用户确认框直接显示原始键 `admin.users.deleteConfirm`（t() 无该键回落） |
| 无 emoji | PASS | src 全量扫描无 emoji |
| 无解释型长文案残留 | PASS | 无 TODO/FIXME/长提示残留 |
| error code 映射完整 | PASS（有缺口） | errors.ts 覆盖 contracts/errors.ts 全部 18 码；缺口为回落键 `err.generic` 未定义（见第1项 P2） |

---

## 8. 工程约束

| 检查点 | 结论 | 依据 |
|---|---|---|
| fetch 唯一出口 client.ts | PASS | `rg 'fetch\(' src` 仅 client.ts:75 一处 |
| 零后端耦合 | PASS | 前端无 import 后端 netlify 代码 |
| tsc 通过 | PASS | `npx tsc -b` exit 0 |
| build 通过 | PASS | `npm run build` exit 0（仅一条 ineffective dynamic import 警告：AdminPage 动态 import api/admin 但已被其它模块静态引入，非错误） |
| _redirects 存在 | PASS | public/_redirects: `/* /index.html 200` |

---

## 8 项统计（PASS / 问题数）

| 项 | 主题 | PASS 项 | 问题（按严重度） |
|---|---|---|---|
| 1 | 认证 UI | 2 | P0×1（token 不同步）、P2×1（err.generic）、P3×1（verify/recover 死分支）、部分×1（401 条件窄） |
| 2 | 会话 UI | 4 | P1×1（用户搜索误用 admin 端点）、P3×1（返回类型虚标） |
| 3 | 消息 UI | 5 | P3×2（游标口径、bumpUnread 死代码） |
| 4 | 设置页 | 1 | P0×1（/auth/me 无 admin）、P2×1（无改 username）、部分×1（登出 client token 未清） |
| 5 | 管理面板 | 4 | P2×1（8/9 端点、无改角色 UI）、部分×1（403 探测被 P0 阻断） |
| 6 | 轮询 | 3 | 未覆盖×1（额度估算）、残留×1（useOnlineStatus/socket.io） |
| 7 | i18n | 3 | P1×1（EN 缺键）、P2×1（err.generic，与项1同源） |
| 8 | 工程约束 | 5 | 0（全 PASS） |

合计：**P0×2、P1×2、P2×4（含与项7重复的 err.generic 一处）、P3×4，外加若干残留/未覆盖**。

---

## TOP5 最严重问题

1. **【P0】登录后授权断裂：`client.ts` token 与 zustand 授权状态从不互相同步。** `api/client.ts:16-24,32-46` vs `stores/useAuthStore.ts:29-49,69`；`setToken(tk)` 从未以非 null 值被调用、`getToken` 从未被调用。登录/注册后立即的 API 请求全部不带 token → 401，须刷新才恢复；登出后旧 token 残留内存。直接破坏登录→会话→消息主流程。

2. **【P0】`/auth/me` 不返回 `admin`，管理员 UI 全程不可达。** `handlers/auth.ts:103`（SELECT 无 admin）+ signup/login 响应无 admin；`Header.tsx:24/34/72`、`ProfilePage.tsx:51`、`AdminPage.tsx:12`。`user.admin===1` 恒假 → 无管理入口、直连 `/admin` 也被"无权限"拦死。整个管理面板实际上无法使用。

3. **【P1】普通用户无法新建会话：用户搜索走了管理员端点。** `components/rooms/CreateRoom.tsx:44` 调 `getAdminUsers()` → `/admin/users`（routes.ts:55 `admin:true`）→ 普通用户 403 → `results=[]`。私聊/群聊创建对非管理员整体失效；契约层也无替代的用户搜索端点。

4. **【P1】i18n EN 缺失 `admin.users.deleteConfirm`。** `i18n/index.ts`（ZH 有、EN 无）→ 英文界面"删除用户"确认框显示原始键名 `admin.users.deleteConfirm`。EN/ZH 键集不一致（143 vs 142）。

5. **【P2】功能缺失组合：设置页无"改用户名"UI + 管理面板 8/9 端点。** `api/user.ts:5` 的 updateUsername 与 `api/admin.ts:59` 的 patchAdminUser 均无界面入口，`GET /admin/users/:id` 前端未实现；需求要求的"改用户名"、管理员"改角色/显示名"操作在 UI 上完全不存在。

> 未覆盖说明：额度估算（第6项）在代码中无实现，无法审查正确性；线上部署版本与真库状态不在本代理（纯前端只读）范围。
