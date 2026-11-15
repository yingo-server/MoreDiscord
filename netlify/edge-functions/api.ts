// api.ts —— 统一路由：pathname → handler（规格 §13）
// 双保险路由：netlify.toml 的 [[edge_functions]] path + 代码内 named config 导出
import { preflight, CORS } from "./_shared/cors.ts";
import { fail, failErr, readJson, HttpError } from "./_shared/response.ts";
import { requireUser } from "./_shared/auth.ts";
import * as auth from "./handlers/auth.ts";
import * as user from "./handlers/user.ts";
import * as conversations from "./handlers/conversations.ts";
import * as messages from "./handlers/messages.ts";
import type { Ctx } from "./handlers/types.ts";

export default async function api(req: Request): Promise<Response> {
  try {
    if (req.method === "OPTIONS") return preflight();
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/api\/v1/, "").replace(/\/+$/, "") || "/";
    const method = req.method.toUpperCase();

    // 根路径健康检查（免认证）
    if (method === "GET" && path === "/") return new Response(null, { status: 204, headers: CORS });

    // 无认证路由
    if (method === "POST" && path === "/auth/signup") {
      return await auth.signup(await makeCtx(req, url));
    }
    if (method === "POST" && path === "/auth/verify") {
      return await auth.verify(await makeCtx(req, url));
    }
    if (method === "POST" && path === "/auth/login") {
      return await auth.login(await makeCtx(req, url));
    }
    if (method === "POST" && path === "/auth/recover") {
      return await auth.recover(await makeCtx(req, url));
    }

    // 认证路由（先解析，再路由）
    if (method === "POST" && path === "/auth/logout") {
      return await auth.logout(await makeCtx(req, url));
    }

    // 路由存在性预检：不存在的路径直接 404，避免先鉴权返回误导性的 401
    const convPreMatch = path.match(/^\/conversations\/([A-Za-z0-9-]+)(\/.*)?$/);
    const known =
      (["GET", "PATCH", "DELETE"].includes(method) && path === "/") ||
      (method === "GET" && path === "/auth/me") ||
      (method === "PATCH" && (path === "/user/username" || path === "/user/profile")) ||
      (method === "GET" && path === "/conversations") ||
      (method === "POST" && (path === "/conversations/direct" || path === "/conversations/group")) ||
      (convPreMatch && methodAllowed(method, convPreMatch[2] ?? "")) ||
      (path.startsWith("/admin/") && (
        (method === "GET" && ["/admin/users", "/admin/channels", "/admin/audit-log", "/admin/stats/overview"].includes(path)) ||
        (method === "GET" && /^\/admin\/users\/[A-Za-z0-9-]+$/.test(path)) ||
        (method === "PATCH" && /^\/admin\/users\/[A-Za-z0-9-]+$/.test(path)) ||
        (method === "DELETE" && /^\/admin\/channels\/[A-Za-z0-9-]+$/.test(path)) ||
        (method === "GET" && /^\/admin\/channels\/[A-Za-z0-9-]+\/messages$/.test(path))
      ));
    if (!known) return fail("INVALID_INPUT", `no route for ${method} ${path}`, 404);

    await requireUser(req);

    if (method === "GET" && path === "/auth/me") {
      return await auth.me(await makeCtx(req, url));
    }
    if (method === "PATCH" && path === "/user/username") {
      return await user.updateUsername(await makeCtx(req, url));
    }
    if (method === "PATCH" && path === "/user/profile") {
      return await user.updateProfile(await makeCtx(req, url));
    }

    const convMatch = path.match(/^\/conversations\/([A-Za-z0-9-]+)(\/.*)?$/);

    if (method === "GET" && path === "/conversations") {
      return await conversations.listConversations(await makeCtx(req, url));
    }
    if (method === "POST" && path === "/conversations/direct") {
      return await conversations.createDirect(await makeCtx(req, url));
    }
    if (method === "POST" && path === "/conversations/group") {
      return await conversations.createGroup(await makeCtx(req, url));
    }

    if (convMatch) {
      const id = convMatch[1];
      const sub = convMatch[2] ?? "";

      if (method === "GET" && sub === "") {
        return await conversations.getConversation(await makeCtx(req, url), id);
      }
      if (method === "PATCH" && sub === "") {
        return await conversations.renameConversation(await makeCtx(req, url), id);
      }
      if (method === "DELETE" && sub === "") {
        return await conversations.deleteConversation(await makeCtx(req, url), id);
      }
      if (method === "POST" && sub === "/members") {
        return await conversations.addMember(await makeCtx(req, url), id);
      }
      const memberMatch = sub.match(/^\/members\/([A-Za-z0-9-]+)$/);
      if (method === "DELETE" && memberMatch) {
        return await conversations.removeMember(await makeCtx(req, url), id, memberMatch[1]);
      }
      if (method === "POST" && sub === "/leave") {
        return await conversations.leaveConversation(await makeCtx(req, url), id);
      }
      if (method === "POST" && sub === "/transfer") {
        return await conversations.transferOwnership(await makeCtx(req, url), id);
      }
      if (method === "PATCH" && sub === "/read") {
        return await conversations.markRead(await makeCtx(req, url), id);
      }
      if (method === "POST" && sub === "/messages") {
        return await messages.sendMessage(await makeCtx(req, url), id);
      }
      if (method === "GET" && sub === "/messages") {
        return await messages.listMessages(await makeCtx(req, url), id);
      }
      if (method === "GET" && sub === "/messages/sync") {
        return await messages.syncMessages(await makeCtx(req, url), id);
      }
    }

    return fail("INVALID_INPUT", `no route for ${method} ${path}`, 404);
  } catch (e) {
    return failErr(e);
  }
}

async function makeCtx(req: Request, url: URL): Promise<Ctx> {
  const body = methodHasBody(req.method) ? await readJson(req) : {};
  return { req, body, params: {}, url };
}

function methodHasBody(method: string): boolean {
  return ["POST", "PATCH", "PUT", "DELETE"].includes(method.toUpperCase());
}

function methodAllowed(method: string, sub: string): boolean {
  if (sub === "") return method === "GET" || method === "PATCH" || method === "DELETE";
  if (sub === "/members") return method === "POST";
  if (/^\/members\/[A-Za-z0-9-]+$/.test(sub)) return method === "DELETE";
  if (["/leave", "/transfer"].includes(sub)) return method === "POST";
  if (sub === "/read") return method === "PATCH";
  if (sub === "/messages") return method === "POST" || method === "GET";
  if (sub === "/messages/sync") return method === "GET";
  return false;
}

// 代码内路由声明：即使 netlify.toml 未生效也能挂上路由（官方推荐的双保险）
// Config 类型仅在 Netlify 构建时可用；此处用结构化对象，类型由构建器校验
export const config = {
  path: ["/api/v1", "/api/v1/*"],
};
