// L4 路由层：OPTIONS → 查路由表 → 一次鉴权 → dispatch
import { matchRoute } from "./contracts/routes.ts";
import { preflight, CORS } from "./platform/cors.ts";
import { fail, failErr, readJson, HttpError } from "./platform/response.ts";
import { resolveUserId } from "./platform/session.ts";
import { get as dbGet } from "./platform/db.ts";
import * as handlers from "./handlers/index.ts";
import type { Ctx } from "./handlers/types.ts";

export default async function api(req: Request): Promise<Response> {
  try {
    if (req.method === "OPTIONS") return preflight();

    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/api\/v1/, "").replace(/\/+$/, "") || "/";
    const method = req.method.toUpperCase();

    if (method === "GET" && path === "/") {
      return new Response(null, { status: 204, headers: CORS });
    }

    const match = matchRoute(method, path);
    if (!match) return fail("INVALID_INPUT", `no route for ${method} ${path}`, 404);

    let userId: string | null = null;
    if (match.route.auth) {
      userId = await resolveUserId(req);
      if (!userId) throw new HttpError("UNAUTHORIZED", "missing or invalid session token");
      // 纵深防御：路由表标记 admin 时统一校验，handler 内无需重复
      if (match.route.admin) {
        const u = await dbGet("SELECT admin FROM users WHERE id=?", [userId]);
        if (!u || Number(u.admin) !== 1) throw new HttpError("FORBIDDEN", "admin role required");
      }
    }

    const ctx = await makeCtx(req, url, userId);
    const fn = (handlers as Record<string, unknown>)[match.route.handler] as
      | ((ctx: Ctx, ...args: string[]) => Promise<Response>)
      | undefined;
    if (typeof fn !== "function") return fail("INVALID_INPUT", "handler not found", 500);

    return await fn(ctx, ...match.params);
  } catch (e) {
    return failErr(e);
  }
}

async function makeCtx(req: Request, url: URL, userId: string | null): Promise<Ctx> {
  const body = ["POST", "PATCH", "PUT", "DELETE"].includes(req.method.toUpperCase())
    ? await readJson(req)
    : {};
  return { req, body, params: {}, url, userId };
}

// 代码内路由声明：netlify.toml 的 [[edge_functions]] 可能被静默丢弃时的双保险
export const config = {
  path: ["/api/v1", "/api/v1/*"],
};
