// handlers/types.ts —— 共享 handler 上下文类型
export interface Ctx {
  req: Request;
  body: Record<string, any>;
  params: Record<string, string>;
  url: URL;
  // A8: api.ts 侧 requireUser 解析后注入；未认证路由（signup/verify/login/recover/logout）为 null
  userId?: string | null;
}
