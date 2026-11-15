import { create } from "zustand"
import type { Message } from "@/types/models"
import * as chatApi from "@/api/chat"

interface MessageState {
  messages: Message[]
  hasMore: boolean
  /** older-page cursor (before) */
  before: string | null
  /** newest-known cursor for sync (after) */
  syncCursor: string | null
  loading: boolean
  lastConvId: string | null
  _fetchGen: number
  fetchMessages: (convId: string) => Promise<void>
  fetchMore: (convId: string) => Promise<void>
  syncNew: (convId: string) => Promise<number>
  appendMessage: (msg: Message) => void
  reset: () => void
}

/** newest-first cursor helper: Base64("created_at|id") */
function cursorOf(msg: Message): string {
  try {
    return btoa(`${msg.created_at}|${msg.id}`)
  } catch {
    return ""
  }
}

export const useMessageStore = create<MessageState>((set, get) => ({
  messages: [],
  hasMore: false,
  before: null,
  syncCursor: null,
  loading: false,
  lastConvId: null,
  _fetchGen: 0,

  fetchMessages: async (convId) => {
    const gen = get()._fetchGen + 1
    set({ loading: true, lastConvId: convId, _fetchGen: gen, messages: [], hasMore: false, before: null, syncCursor: null })
    try {
      const page = await chatApi.getMessages(convId, undefined, 50)
      if (get()._fetchGen !== gen) return
      const msgs = page.messages.slice().reverse() // oldest → newest for display
      const last = page.messages[0]
      set({
        messages: msgs,
        hasMore: !!page.next_before,
        before: page.next_before,
        syncCursor: last ? cursorOf(last) : null,
      })
    } finally {
      if (get()._fetchGen === gen) set({ loading: false })
    }
  },

  fetchMore: async (convId) => {
    const { before, loading, hasMore } = get()
    if (loading || !hasMore || !before || get().lastConvId !== convId) return
    const gen = get()._fetchGen + 1
    set({ loading: true, _fetchGen: gen })
    try {
      const page = await chatApi.getMessages(convId, before, 50)
      if (get()._fetchGen !== gen) return
      const msgs = page.messages.slice().reverse()
      set((state) => ({
        messages: [...msgs, ...state.messages],
        hasMore: !!page.next_before,
        before: page.next_before,
      }))
    } finally {
      if (get()._fetchGen === gen) set({ loading: false })
    }
  },

  /** Incremental poll: fetch messages newer than syncCursor. Returns count added. */
  syncNew: async (convId) => {
    const { syncCursor, lastConvId } = get()
    if (lastConvId !== convId) return 0
    try {
      const page = await chatApi.syncMessages(convId, syncCursor ?? undefined, 50)
      if (get().lastConvId !== convId) return 0
      if (page.messages.length === 0) return 0
      const known = new Set(get().messages.map((m) => m.id))
      const fresh = page.messages.filter((m) => !known.has(m.id))
      if (fresh.length > 0) {
        set((state) => ({ messages: [...state.messages, ...fresh] }))
      }
      const last = page.messages[page.messages.length - 1]
      const nextCursor = page.next_cursor ?? cursorOf(last)
      set({ syncCursor: nextCursor })
      return fresh.length
    } catch {
      return 0
    }
  },

  appendMessage: (msg) => {
    set((state) => {
      if (state.lastConvId !== msg.conversation_id) return state
      if (state.messages.some((m) => m.id === msg.id)) return state
      return { messages: [...state.messages, msg], syncCursor: cursorOf(msg) }
    })
  },

  reset: () =>
    set({ messages: [], hasMore: false, before: null, syncCursor: null, loading: false, lastConvId: null, _fetchGen: 0 }),
}))
