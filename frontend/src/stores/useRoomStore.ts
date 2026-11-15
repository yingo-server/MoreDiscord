import { create } from "zustand"
import type { Conversation, ConversationDetail } from "@/types/models"
import { conversationTitle } from "@/types/models"
import * as chatApi from "@/api/chat"

interface RoomState {
  rooms: Conversation[]
  currentRoomId: string | null
  loading: boolean
  fetchError: boolean
  detail: ConversationDetail | null
  fetchRooms: () => Promise<void>
  fetchDetail: (id: string) => Promise<void>
  setCurrentRoom: (id: string | null) => void
  createDirect: (targetUserId: string) => Promise<Conversation>
  createGroup: (name: string, memberIds: string[]) => Promise<Conversation>
  rename: (id: string, name: string) => Promise<void>
  removeRoom: (id: string) => void
  clearUnread: (id: string) => void
  bumpUnread: (id: string) => void
  title: (room: Conversation) => string
}

export const useRoomStore = create<RoomState>((set, get) => ({
  rooms: [],
  currentRoomId: null,
  loading: false,
  fetchError: false,
  detail: null,

  fetchRooms: async () => {
    set({ loading: true, fetchError: false })
    try {
      const rooms = await chatApi.getConversations()
      set({ rooms })
    } catch {
      set({ fetchError: true })
    } finally {
      set({ loading: false })
    }
  },

  fetchDetail: async (id) => {
    try {
      const detail = await chatApi.getConversation(id)
      set({ detail })
    } catch {
      set({ detail: null })
    }
  },

  setCurrentRoom: (id) => set({ currentRoomId: id }),

  createDirect: async (targetUserId) => {
    const conv = await chatApi.createDirect(targetUserId)
    get().fetchRooms()
    return conv
  },

  createGroup: async (name, memberIds) => {
    const conv = await chatApi.createGroup(name, memberIds)
    get().fetchRooms()
    return conv
  },

  rename: async (id, name) => {
    await chatApi.renameConversation(id, name)
    set((state) => ({
      rooms: state.rooms.map((r) => (r.id === id ? { ...r, name } : r)),
      detail: state.detail && state.detail.id === id ? { ...state.detail, name } : state.detail,
    }))
  },

  removeRoom: (id) => {
    set((state) => ({
      rooms: state.rooms.filter((r) => r.id !== id),
      currentRoomId: state.currentRoomId === id ? null : state.currentRoomId,
    }))
  },

  clearUnread: (id) => {
    set((state) => ({
      rooms: state.rooms.map((r) => (r.id === id ? { ...r, unread_count: 0 } : r)),
    }))
    chatApi.markRead(id).catch(() => {})
  },

  bumpUnread: (id) => {
    set((state) => ({
      rooms: state.rooms.map((r) => (r.id === id ? { ...r, unread_count: (r.unread_count || 0) + 1 } : r)),
    }))
  },

  title: (room) => conversationTitle(room),
}))
