// L0 契约层：路由表（唯一真相源）
// method + path 模式 → handler 名 + 认证要求
// handler 名对应 handlers/index.ts 的导出。

export interface RouteDef {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  pattern: string;       // 正则字符串，^...$
  auth: boolean;         // false = 免认证
  admin?: boolean;       // true = requireAdmin
  handler: string;       // handlers 导出名
  arg?: "id" | "userId"; // 动态参数提取
}

export const ROUTES: RouteDef[] = [
  // 认证（免认证）
  { method: "POST", pattern: "/auth/signup", auth: false, handler: "signup" },
  { method: "POST", pattern: "/auth/verify", auth: false, handler: "verify" },
  { method: "POST", pattern: "/auth/login", auth: false, handler: "login" },
  { method: "POST", pattern: "/auth/recover", auth: false, handler: "recover" },
  // 认证（需登录）
  { method: "POST", pattern: "/auth/logout", auth: true, handler: "logout" },
  { method: "GET", pattern: "/auth/me", auth: true, handler: "me" },
  // 用户
  { method: "PATCH", pattern: "/user/username", auth: true, handler: "updateUsername" },
  { method: "PATCH", pattern: "/user/profile", auth: true, handler: "updateProfile" },
  // 会话
  { method: "GET", pattern: "/conversations", auth: true, handler: "listConversations" },
  { method: "POST", pattern: "/conversations/direct", auth: true, handler: "createDirect" },
  { method: "POST", pattern: "/conversations/group", auth: true, handler: "createGroup" },
  { method: "GET", pattern: "/conversations/([A-Za-z0-9-]+)", auth: true, handler: "getConversation", arg: "id" },
  { method: "PATCH", pattern: "/conversations/([A-Za-z0-9-]+)", auth: true, handler: "renameConversation", arg: "id" },
  { method: "DELETE", pattern: "/conversations/([A-Za-z0-9-]+)", auth: true, handler: "deleteConversation", arg: "id" },
  { method: "POST", pattern: "/conversations/([A-Za-z0-9-]+)/members", auth: true, handler: "addMember", arg: "id" },
  { method: "DELETE", pattern: "/conversations/([A-Za-z0-9-]+)/members/([A-Za-z0-9-]+)", auth: true, handler: "removeMember", arg: "id" },
  { method: "POST", pattern: "/conversations/([A-Za-z0-9-]+)/leave", auth: true, handler: "leaveConversation", arg: "id" },
  { method: "POST", pattern: "/conversations/([A-Za-z0-9-]+)/transfer", auth: true, handler: "transferOwnership", arg: "id" },
  { method: "PATCH", pattern: "/conversations/([A-Za-z0-9-]+)/read", auth: true, handler: "markRead", arg: "id" },
  // 消息
  { method: "POST", pattern: "/conversations/([A-Za-z0-9-]+)/messages", auth: true, handler: "sendMessage", arg: "id" },
  { method: "GET", pattern: "/conversations/([A-Za-z0-9-]+)/messages", auth: true, handler: "listMessages", arg: "id" },
  { method: "GET", pattern: "/conversations/([A-Za-z0-9-]+)/messages/sync", auth: true, handler: "syncMessages", arg: "id" },
  // 消息翻译
  { method: "POST", pattern: "/translate", auth: true, handler: "translate" },
  // 管理
  { method: "GET", pattern: "/admin/stats/overview", auth: true, admin: true, handler: "adminStats" },
  { method: "GET", pattern: "/admin/users", auth: true, admin: true, handler: "adminListUsers" },
  { method: "GET", pattern: "/admin/users/([A-Za-z0-9-]+)", auth: true, admin: true, handler: "adminGetUser", arg: "id" },
  { method: "PATCH", pattern: "/admin/users/([A-Za-z0-9-]+)", auth: true, admin: true, handler: "adminPatchUser", arg: "id" },
  { method: "GET", pattern: "/admin/channels", auth: true, admin: true, handler: "adminListChannels" },
  { method: "DELETE", pattern: "/admin/channels/([A-Za-z0-9-]+)", auth: true, admin: true, handler: "adminDeleteChannel", arg: "id" },
  { method: "GET", pattern: "/admin/channels/([A-Za-z0-9-]+)/messages", auth: true, admin: true, handler: "adminAuditMessages", arg: "id" },
  { method: "GET", pattern: "/admin/audit-log", auth: true, admin: true, handler: "adminAuditLog" },
];

export interface RouteMatch {
  route: RouteDef;
  params: string[];
}

export function matchRoute(method: string, path: string): RouteMatch | null {
  for (const route of ROUTES) {
    if (route.method !== method) continue;
    const m = path.match(new RegExp(`^${route.pattern}$`));
    if (m) return { route, params: m.slice(1) };
  }
  return null;
}
