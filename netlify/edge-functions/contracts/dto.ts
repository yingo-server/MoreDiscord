// L0 契约层：请求/响应类型
export interface UserDTO {
  id: string;
  username: string;
  display_name: string | null;
  email: string;
  created_at?: string;
  admin?: number;
  tag?: number;
}

export interface PeerDTO extends UserDTO {
  last_seen_at?: string | null;
  online?: boolean;
}

export interface ConversationDTO {
  id: string;
  type: "direct" | "group";
  name: string | null;
  updated_at: string;
  last_message: string | null;
  last_at: string | null;
  last_read_at: string | null;
  unread_count: number;
  peer: PeerDTO | null;
}

export interface MemberDTO extends UserDTO {
  role: "owner" | "member";
  joined_at: string;
  last_read_at: string | null;
  last_seen_at?: string | null;
  online?: boolean;
}

export interface ConversationDetailDTO {
  id: string;
  type: "direct" | "group";
  name: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  my_role: "owner" | "member";
  member_count: number;
  members: MemberDTO[];
}

export interface MessageDTO {
  id: string;
  conversation_id?: string;
  sender_id: string;
  content: string;
  created_at: string;
}

export interface PageDTO<T> {
  items: T[];
  next_cursor: string | null;
  next_before?: string | null;
}

export interface SessionDTO {
  session_token: string | null;
  confirmation_required: boolean;
  user: UserDTO;
}
