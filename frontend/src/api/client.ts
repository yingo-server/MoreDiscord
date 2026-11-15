type Method = "GET" | "POST" | "PATCH" | "DELETE"

const BASE = "/api/v1"
const AUTH_KEY = "yingo_auth"

class ApiClient {
  private getToken(): string | null {
    try {
      const raw = localStorage.getItem(AUTH_KEY)
      if (!raw) return null
      const parsed = JSON.parse(raw)
      return parsed?.state?.sessionToken || null
    } catch {
      return null
    }
  }

  async request<T>(method: Method, path: string, body?: unknown): Promise<T> {
    const token = this.getToken()
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    }
    if (token) {
      headers["Authorization"] = `Bearer ${token}`
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10000)

    let res: Response
    try {
      res = await fetch(`${BASE}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      })
    } catch (e) {
      clearTimeout(timer)
      if (e instanceof DOMException && e.name === "AbortError") {
        throw new Error("request timeout")
      }
      throw e
    }
    clearTimeout(timer)

    // 401: stale session — clear and bounce to login (unless already there)
    if (res.status === 401) {
      const p = window.location.pathname
      if (p !== "/login" && p !== "/register") {
        if (this.getToken() === token) {
          localStorage.removeItem(AUTH_KEY)
          window.dispatchEvent(new CustomEvent("yingo:logout"))
          window.dispatchEvent(
            new CustomEvent("yingo:toast", {
              detail: { message: "Session expired, please log in again", type: "error" },
            })
          )
        }
      }
      throw new Error("unauthorized")
    }

    let envelope: { data?: unknown; error?: { code?: string; message?: string } | null } | null = null
    try {
      envelope = await res.json()
    } catch {
      envelope = null
    }

    if (!res.ok) {
      const code = envelope?.error?.code || `http ${res.status}`
      const message = envelope?.error?.message || code
      throw new Error(message)
    }

    return (envelope?.data ?? null) as T
  }

  get<T>(path: string) {
    return this.request<T>("GET", path)
  }
  post<T>(path: string, body?: unknown) {
    return this.request<T>("POST", path, body)
  }
  patch<T>(path: string, body?: unknown) {
    return this.request<T>("PATCH", path, body)
  }
  delete<T>(path: string) {
    return this.request<T>("DELETE", path)
  }
}

export const api = new ApiClient()
export { ApiClient }
