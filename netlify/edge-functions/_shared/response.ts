// _shared/response.ts —— 统一 JSON / 错误（规格 §11）
import { withCors } from "./cors.ts";

export interface ApiError {
  code: string;
  message: string;
}

export function ok(data: unknown, status = 200): Response {
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

export class HttpError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.status = STATUS_BY_CODE[code] ?? 500;
  }
}

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
