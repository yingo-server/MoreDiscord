// L1 平台层：唯一接触 Netlify Identity（GoTrue）
import { HttpError } from "./response.ts";

const IDENTITY_ORIGIN = Deno.env.get("IDENTITY_ORIGIN")!;

// ---------- Identity HTTP 封装（仅本文件可调） ----------

export interface IdentityTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

async function identityFetch(path: string, body: unknown): Promise<any> {
  // /token 端点要求 application/x-www-form-urlencoded（GoTrue 规范），其余端点用 JSON
  const isToken = path === "/token";
  const headers: Record<string, string> = isToken
    ? { "Content-Type": "application/x-www-form-urlencoded" }
    : { "Content-Type": "application/json" };
  const payload = isToken
    ? new URLSearchParams(body as Record<string, string>).toString()
    : JSON.stringify(body);
  let res: Response;
  try {
    res = await fetch(`${IDENTITY_ORIGIN}/.netlify/identity${path}`, {
      method: "POST",
      headers,
      body: payload,
    });
  } catch {
    throw new HttpError("INTERNAL_ERROR", "identity unreachable");
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw mapIdentityError(json, res.status);
  return json;
}

// GoTrue {"code":422,"msg":"..."} 或 {"error":"invalid_grant","error_description":"..."} → 网关错误码；禁止透传
function mapIdentityError(json: any, status: number): HttpError {
  const msg = String(json?.msg ?? json?.error_description ?? json?.error ?? json?.message ?? "").toLowerCase();
  if (msg.includes("unsupported_grant_type")) {
    // GoTrue /token 要求 application/x-www-form-urlencoded，JSON 会被拒——这是网关侧的错
    return new HttpError("INTERNAL_ERROR", "identity token encoding error");
  }
  // A4: GoTrue 登录未确认邮箱时同时携带 invalid_grant + "Email not confirmed"，
  // 必须排在纯 invalid_grant 分支之前，否则 EMAIL_NOT_CONFIRMED 不可达
  if ((msg.includes("invalid_grant") || msg.includes("invalid")) && (msg.includes("email not confirmed") || msg.includes("confirm"))) {
    return new HttpError("EMAIL_NOT_CONFIRMED", "email not confirmed");
  }
  // A3: EMAIL_EXISTS → 409（含 error_code=email_exists / "user already registered" 等变体）
  if (msg.includes("already registered") || msg.includes("email exists") || (json?.error_code ?? "").toLowerCase() === "email_exists" || (json?.code ?? "").toString() === "email_exists") {
    return new HttpError("EMAIL_EXISTS", "email already registered");
  }
  if (msg.includes("invalid_grant") || msg.includes("invalid email or password") || msg.includes("no user found") || msg.includes("invalid credentials")) {
    return new HttpError("INVALID_CREDENTIALS", "invalid email or password");
  }
  if (msg.includes("password") && (msg.includes("short") || msg.includes("weak") || msg.includes("at least"))) {
    return new HttpError("INVALID_INPUT", "password does not meet requirements");
  }
  if (msg.includes("confirm") || msg.includes("not confirmed")) {
    return new HttpError("EMAIL_NOT_CONFIRMED", "email not confirmed");
  }
  if (msg.includes("token") && (msg.includes("invalid") || msg.includes("expired"))) {
    return new HttpError("INVALID_INPUT", "invalid or expired token");
  }
  if (status === 400) return new HttpError("INVALID_INPUT", "invalid request");
  return new HttpError("INTERNAL_ERROR", "authentication failed");
}

export async function identitySignup(email: string, password: string): Promise<any> {
  return identityFetch("/signup", { email, password });
}

export async function identityPasswordToken(email: string, password: string): Promise<IdentityTokens> {
  return identityFetch("/token", { grant_type: "password", email, password });
}

// A5: 区分「明确失效」与「瞬时失败」。
// 返回 { ok: tokens, permanent: boolean }：
//  - 明确失效（HTTP 401 / invalid_grant / refresh token 过期吊销）→ permanent=true，可安全 revoke
//  - 网络抖动 / 5xx / 解析失败 → permanent=false，不 revoke（下个请求重试）
export async function refreshIdentityToken(refreshToken: string): Promise<IdentityTokens | null> {
  try {
    return await identityFetch("/token", { grant_type: "refresh_token", refresh_token: refreshToken });
  } catch (e) {
    if (e instanceof HttpError) {
      // 明确失效：身份服务器明确拒绝了这枚 refresh token
      if (e.status === 401) throw new RefreshPermanentError(e.message);
      if (e.code === "INVALID_CREDENTIALS" || e.code === "INVALID_INPUT") throw new RefreshPermanentError(e.message);
      // 其余（400/422/429/500 等）视为瞬时/可重试
    }
    return null; // 网络/5xx 瞬时失败
  }
}
export class RefreshPermanentError extends Error {}


export async function identityVerify(payload: { type: string; token: string; password?: string }): Promise<any> {
  const body: Record<string, unknown> = { type: payload.type, token: payload.token };
  if (payload.password != null) body.password = payload.password;
  return identityFetch("/verify", body);
}

export async function identityRecover(email: string): Promise<any> {
  return identityFetch("/recover", { email });
}

export async function identityGetUser(accessToken: string): Promise<any> {
  const res = await fetch(`${IDENTITY_ORIGIN}/.netlify/identity/user`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw mapIdentityError(json, res.status);
  return json;
}

