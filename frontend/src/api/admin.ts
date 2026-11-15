import { api } from "./client"
import type { AdminPage, AdminChannel, AdminAuditEntry } from "@/types/api"

export interface AdminStatsOverview {
  [key: string]: unknown
}

export async function getStatsOverview(): Promise<AdminStatsOverview> {
  return api.get<AdminStatsOverview>("/admin/stats/overview")
}

export async function getAdminChannels(cursor?: string, limit = 50): Promise<AdminPage<AdminChannel>> {
  const params = new URLSearchParams({ limit: String(limit) })
  if (cursor) params.set("cursor", cursor)
  return api.get<AdminPage<AdminChannel>>(`/admin/channels?${params}`)
}

export async function deleteAdminChannel(id: string): Promise<void> {
  await api.delete(`/admin/channels/${id}`)
}

export async function getAdminChannelMessages(
  id: string,
  cursor?: string,
  limit = 50
): Promise<AdminPage<import("@/types/models").Message>> {
  const params = new URLSearchParams({ limit: String(limit) })
  if (cursor) params.set("cursor", cursor)
  return api.get<AdminPage<import("@/types/models").Message>>(`/admin/channels/${id}/messages?${params}`)
}

export async function getAuditLog(cursor?: string, limit = 50): Promise<AdminPage<AdminAuditEntry>> {
  const params = new URLSearchParams({ limit: String(limit) })
  if (cursor) params.set("cursor", cursor)
  return api.get<AdminPage<AdminAuditEntry>>(`/admin/audit-log?${params}`)
}

export async function getAdminUsers(
  search?: string,
  cursor?: string,
  limit = 50
): Promise<AdminPage<import("@/types/models").User>> {
  const params = new URLSearchParams({ limit: String(limit) })
  if (search) params.set("search", search)
  if (cursor) params.set("cursor", cursor)
  return api.get<AdminPage<import("@/types/models").User>>(`/admin/users?${params}`)
}
