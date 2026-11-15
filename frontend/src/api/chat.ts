import { api } from "./client"
import type {
  Conversation,
  ConversationDetail,
  MessagesPage,
  MessagesSyncPage,
} from "@/types/api"

export async function getConversations(): Promise<Conversation[]> {
  return api.get<Conversation[]>("/conversations")
}

export async function getConversation(id: string): Promise<ConversationDetail> {
  return api.get<ConversationDetail>(`/conversations/${id}`)
}

export async function createDirect(targetUserId: string): Promise<Conversation> {
  return api.post<Conversation>("/conversations/direct", { targetUserId })
}

export async function createGroup(name: string, memberIds: string[]): Promise<Conversation> {
  return api.post<Conversation>("/conversations/group", { name, memberIds })
}

export async function renameConversation(id: string, name: string): Promise<void> {
  await api.patch(`/conversations/${id}`, { name })
}

export async function addMember(id: string, userId: string): Promise<void> {
  await api.post(`/conversations/${id}/members`, { userId })
}

export async function removeMember(id: string, userId: string): Promise<void> {
  await api.delete(`/conversations/${id}/members/${userId}`)
}

export async function leaveConversation(id: string): Promise<void> {
  await api.post(`/conversations/${id}/leave`)
}

export async function deleteConversation(id: string): Promise<void> {
  await api.delete(`/conversations/${id}`)
}

export async function transferOwnership(id: string, userId: string): Promise<void> {
  await api.post(`/conversations/${id}/transfer`, { userId })
}

export async function markRead(id: string, lastReadAt?: string): Promise<void> {
  await api.patch(`/conversations/${id}/read`, lastReadAt ? { last_read_at: lastReadAt } : {})
}

export async function sendMessage(id: string, content: string): Promise<import("@/types/models").Message> {
  return api.post(`/conversations/${id}/messages`, { content })
}

export async function getMessages(id: string, before?: string, limit = 50): Promise<MessagesPage> {
  const params = new URLSearchParams({ limit: String(limit) })
  if (before) params.set("before", before)
  return api.get<MessagesPage>(`/conversations/${id}/messages?${params}`)
}

export async function syncMessages(id: string, after?: string, limit = 50): Promise<MessagesSyncPage> {
  const params = new URLSearchParams({ limit: String(limit) })
  if (after) params.set("after", after)
  return api.get<MessagesSyncPage>(`/conversations/${id}/messages/sync?${params}`)
}
