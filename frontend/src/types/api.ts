import type { User, Conversation, ConversationDetail, Message } from "./models"

export type { User }

/** Unified envelope: {"data": ..., "error": {code, message} | null} */
export interface ApiEnvelope<T> {
  data: T
  error: { code: string; message: string } | null
}

export class ApiError extends Error {
  code: string
  status: number
  constructor(code: string, message: string, status: number) {
    super(message || code)
    this.code = code
    this.status = status
  }
}

// ---- auth ----
export interface SignupReq {
  email: string
  password: string
  username: string
}

export interface SignupRes {
  session_token: string | null
  confirmation_required: boolean
  user: User
}

export interface VerifyReq {
  type: "signup" | "recover"
  token: string
  password?: string
}

export interface VerifyRes {
  session_token: string
  user: User
}

export interface LoginReq {
  email: string
  password: string
}

export interface LoginRes {
  session_token: string
  user: User
}

// ---- conversations ----
export type { Conversation, ConversationDetail, Message }

export interface MessagesPage {
  messages: Message[]
  next_before: string | null
}

export interface MessagesSyncPage {
  messages: Message[]
  next_cursor: string | null
}

// ---- admin ----
export interface AdminChannel {
  id: string
  type: "direct" | "group"
  name: string | null
  member_count?: number
  message_count?: number
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export interface AdminAuditEntry {
  id: string
  action?: string
  actor_id?: string
  target?: string
  detail?: string
  created_at?: string
  [key: string]: unknown
}

export interface AdminPage<T> {
  items: T[]
  next_cursor: string | null
}
