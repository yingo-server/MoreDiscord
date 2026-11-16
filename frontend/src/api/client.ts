// 唯一网络出口：所有请求经此，统一注入 token、解包 envelope、抛 ApiError(code)
import { t } from "@/i18n"

const BASE = "/api/v1"
const AUTH_KEY = "yingo_auth"

export class ApiError extends Error {
  code: string
  status: number
  constructor(code: string, message: string, status = 0) {
    super(message || code)
    this.code = code
    this.status = status
  }
}

// token 与 zustand persist 共用 yingo_auth 结构；每次请求实时读取，避免内存快照过期。
export function getToken(): string | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY)
    if (!raw) return null
    return JSON.parse(raw)?.state?.sessionToken ?? null
  } catch {
    return null
  }
}

export function setToken(tk: string | null): void {
  try {
    if (tk) {
      const raw = localStorage.getItem(AUTH_KEY)
      const parsed = raw ? JSON.parse(raw) : {}
      parsed.state = { ...(parsed.state ?? {}), sessionToken: tk }
      localStorage.setItem(AUTH_KEY, JSON.stringify(parsed))
    } else {
      localStorage.removeItem(AUTH_KEY)
    }
  } catch {
    /* ignore */
  }
}

function fillPath(p: string, params?: Record<string, string | number>): string {
  let out = p
  if (params) {
    for (const [k, v] of Object.entries(params)) out = out.replace(`:${k}`, encodeURIComponent(String(v)))
  }
  return out
}

type Query = Record<string, string | number>

class ApiClient {
  async request<T>(
    method: string,
    path: string,
    opts?: { params?: Record<string, string | number>; query?: Query; body?: unknown },
  ): Promise<T> {
    let url = `${BASE}${fillPath(path, opts?.params)}`
    if (opts?.query) {
      const q = new URLSearchParams()
      for (const [k, v] of Object.entries(opts.query)) q.set(k, String(v))
      url += `?${q.toString()}`
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10000)
    let res: Response
    try {
      const currentToken = getToken()
      res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(currentToken ? { Authorization: `Bearer ${currentToken}` } : {}),
        },
        body: opts?.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
      })
    } catch {
      clearTimeout(timer)
      if (controller.signal.aborted) throw new ApiError("TIMEOUT", t("err.TIMEOUT"), 0)
      throw new ApiError("NETWORK", t("err.NETWORK"), 0)
    } finally {
      clearTimeout(timer)
    }

    let envelope: { data?: unknown; error?: { code?: string; message?: string } | null } | null = null
    try {
      envelope = await res.json()
    } catch {
      envelope = null
    }

    const code = envelope?.error?.code ?? ""
    if (!res.ok || envelope?.error) {
      // 会话过期：清理本地凭证并回到登录
      if (res.status === 401 && code === "UNAUTHORIZED" && getToken()) {
        setToken(null)
        const p = window.location.pathname
        if (p !== "/login" && p !== "/register") {
          window.dispatchEvent(new CustomEvent("yingo:logout"))
          window.dispatchEvent(
            new CustomEvent("yingo:toast", {
              detail: { message: t("auth.login.sessionExpired"), type: "error" },
            }),
          )
        }
      }
      throw new ApiError(code || `HTTP_${res.status}`, envelope?.error?.message ?? "", res.status)
    }

    return (envelope?.data ?? null) as T
  }

  /** GET，支持 params 路径参数与 query 查询参数 */
  get<T>(p: string, opts?: { params?: Record<string, string | number>; query?: Query }) {
    return this.request<T>("GET", p, opts)
  }
  /** POST，第二个参数是请求体 */
  post<T>(p: string, body?: unknown, opts?: { params?: Record<string, string | number>; query?: Query }) {
    return this.request<T>("POST", p, { ...opts, body })
  }
  patch<T>(p: string, body?: unknown, opts?: { params?: Record<string, string | number>; query?: Query }) {
    return this.request<T>("PATCH", p, { ...opts, body })
  }
  delete<T>(p: string, body?: unknown, opts?: { params?: Record<string, string | number>; query?: Query }) {
    return this.request<T>("DELETE", p, { ...opts, body })
  }
}

export const api = new ApiClient()
