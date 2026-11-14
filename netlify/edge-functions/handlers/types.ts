// handlers/types.ts —— 共享 handler 上下文类型
export interface Ctx {
  req: Request;
  body: Record<string, any>;
  params: Record<string, string>;
  url: URL;
}
