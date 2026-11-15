export { HttpError } from "../contracts/httpError.ts";
import { HttpError } from "../contracts/httpError.ts";
// response.ts —— 统一 JSON / 错误（规格 §11）
import { withCors } from "./cors.ts";

export interface ApiError {
  code: string;
  message: string;
}

export function ok(data: unknown, status = 200): Response {
  // A12: 204 必须无 body——带 body 的 204 会破坏解析（TypeError）。带 data 的调用显式断言。
  if (status === 204) {
    if (data != null && !(typeof data === "object" && Object.keys(data as object).length === 0)) {
      throw new TypeError("ok(): 204 responses must not carry a body");
    }
    return withCors(new Response(null, { status: 204, headers: {} }));
  }
  return withCors(new Response(JSON.stringify({ data, error: null }), {
    status,
    headers: { "Content-Type": "application/json" },
  }));
}

export function fail(code: string, message: string, status: number): Response {
  return withCors(new Response(JSON.stringify({ data: null, error: { code, message } }), {
    status,
    headers: { "Content-Type": "application/json" },
  }));
}

// 错误码 → HTTP 状态（规格 §11 总表）
const STATUS_BY_CODE: Record<string, number> = {
  INVALID_INPUT: 400,
  USERNAME_INVALID: 400,
  NAME_INVALID: 400,
  GROUP_FULL: 400,
  NOT_A_GROUP: 400,
  CANNOT_REMOVE_OWNER: 400,
  OWNER_MUST_TRANSFER_OR_DELETE: 400,
  UNAUTHORIZED: 401,
  INVALID_CREDENTIALS: 401,
  FORBIDDEN: 403,
  EMAIL_NOT_CONFIRMED: 403,
  USER_NOT_FOUND: 404,
  NOT_A_MEMBER: 404,
  USERNAME_TAKEN: 409,
  EMAIL_EXISTS: 409,
  ALREADY_MEMBER: 409,
};


export function failErr(e: unknown): Response {
  if (e instanceof HttpError) return fail(e.code, e.message, e.status);
  console.error("unhandled error:", e);
  return fail("INTERNAL_ERROR", "internal error", 500);
}

export async function readJson(req: Request): Promise<Record<string, any>> {
  try {
    const body = await req.json();
    if (body && typeof body === "object") return body as Record<string, any>;
    return {};
  } catch {
    return {};
  }
}
