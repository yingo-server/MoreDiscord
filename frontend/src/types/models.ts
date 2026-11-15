import { formatDisplayName } from "@/lib/displayName"
import { t } from "@/i18n"
export interface User {
  id: string
  username: string
  display_name: string
  email: string
  /** 1 = administrator */
  admin?: number
  /** Discord-style tag: 1 = unique holder, 2+ = nth same-name user */
  tag?: number
}

export interface ConversationPeer {
  id: string
  username: string
  display_name: string
  /** Discord-style tag: 1 = unique holder, 2+ = nth duplicate (computed server-side) */
  tag?: number
}

export interface Conversation {
  id: string
  type: "direct" | "group"
  name: string | null
  updated_at: string
  last_message: string | null
  last_at: string | null
  last_read_at: string | null
  unread_count: number
  peer: ConversationPeer | null
}

export interface ConversationMember {
  user_id: string
  username: string
  display_name: string
  tag?: number
  role: "owner" | "member"
  joined_at: string
}

export interface ConversationDetail extends Conversation {
  my_role: "owner" | "member"
  member_count: number
  members: ConversationMember[]
}

export interface Message {
  id: string
  conversation_id: string
  sender_id: string
  content: string
  created_at: string
}

/** Display title of a conversation: direct → peer name, group → name. */
export function conversationTitle(c: Pick<Conversation, "type" | "name" | "peer">, myId?: string | null): string {
  if (c.type === "direct") {
    if (c.peer) return formatDisplayName(c.peer)
    return t("room.directFallback")
  }
  return c.name || t("room.create.group")
}
