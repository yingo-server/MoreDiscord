import { api } from "./client"
import type { AdminPage, AdminChannel, AdminAuditEntry } from "@/types/api"
import type { User, Message } from "@/types/models"

export interface AdminStatsOverview {
  users: number
  conversations: number
  groups: number
  messages: number
  admins: number
}

/** 后端各分页端点返回的字段名不同，统一归一化为 AdminPage<T> */
function normalize<T>(raw: unknown, key: string): AdminPage<T> {
  const r = (raw ?? {}) as Record<string, unknown>
  return {
    items: (r[key] as T[]) ?? [],
    next_cursor: (r.next_cursor as string | null) ?? null,
  }
}

export function getStatsOverview(): Promise<AdminStatsOverview> {
  return api.get<AdminStatsOverview>("/admin/stats/overview")
}

export async function getAdminChannels(cursor?: string, limit = 50): Promise<AdminPage<AdminChannel>> {
  const params = new URLSearchParams({ limit: String(limit) })
  if (cursor) params.set("cursor", cursor)
  return normalize(await api.get(`/admin/channels?${params}`), "channels")
}

export function deleteAdminChannel(id: string): Promise<void> {
  return api.delete(`/admin/channels/${id}`)
}

export async function getAdminChannelMessages(id: string, cursor?: string, limit = 50): Promise<AdminPage<Message>> {
  const params = new URLSearchParams({ limit: String(limit) })
  if (cursor) params.set("cursor", cursor)
  return normalize(await api.get(`/admin/channels/${id}/messages?${params}`), "messages")
}

export async function getAuditLog(cursor?: string, limit = 50): Promise<AdminPage<AdminAuditEntry>> {
  const params = new URLSearchParams({ limit: String(limit) })
  if (cursor) params.set("cursor", cursor)
  return normalize(await api.get(`/admin/audit-log?${params}`), "entries")
}

export async function getAdminUsers(search?: string, cursor?: string, limit = 50): Promise<AdminPage<User>> {
  const params = new URLSearchParams({ limit: String(limit) })
  if (search) params.set("search", search)
  if (cursor) params.set("cursor", cursor)
  return normalize(await api.get(`/admin/users?${params}`), "users")
}

export function deleteAdminUser(id: string): Promise<void> {
  return api.delete(`/admin/users/${id}`)
}

export function patchAdminUser(id: string, patch: { admin?: 0 | 1; display_name?: string | null }): Promise<User> {
  return api.patch<User>(`/admin/users/${id}`, patch)
}
