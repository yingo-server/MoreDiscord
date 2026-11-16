# 全面功能检查（2026-11-16）

基线：`62ff9d6`（去 Identity 后），线上 CI 5 job 绿。

## 范围

- 后端 24 业务端点 + 9 管理端点：路径/方法/鉴权/权限/参数/响应/错误码
- 前端全部页面与交互：登录、注册、会话、消息、翻译、设置、管理面板
- 前后端契约一致性：前端调用的每个端点、请求体、响应字段是否与 api.md / 后端一致
- 分层不破：L4→L3→L2→L1→L0，下层不 import 上层
- 真库状态、线上部署版本
- 发信冻结、密码哈希、#tag、presence、语言检测的特殊路径

## 方式

- 三个只读审查代理（后端 / 前端 / 契约），不改代码，各自写 AUDIT 文件
- 主线跑硬门禁 + 线上实测，汇总
- 效率优先：已查写结论，未查标未覆盖，不无限补工具调用

## P1 补修（主流程阻断）

- **用户搜索**：CreateRoom 现在调 `/admin/users` 导致普通用户 403，私聊/群聊创建整体失效。新增只读公开端点 `GET /users?search=`（返回 `{users:[{id,username,display_name,tag}]}`，需认证，不泄露 email/admin），前端改用 `api/user.ts searchUsers`。扩契约，同步 routes.ts / api.md / 前端。

## 部署

- 线上前端 JS 仍是旧构建（无新代码特征），需在那台 Netlify 站点触发重新部署。

## 门禁（主线）

1. deno check 全模块
2. smoke 45/45
3. lang 6/6 + button 11/11
4. 真库 9/9
5. 前端 tsc + build
6. emoji clean
7. 线上版本与 API 探测
8. git 工作区 / CI

## 产出

AUDIT_BACKEND2.md / AUDIT_FRONTEND2.md / AUDIT_CONTRACT.md + 主会话汇总 + 修复清单（不在此轮修，先看清全貌）
