import { useRef } from "react"
import type { Conversation } from "@/types/models"
import { conversationTitle } from "@/types/models"
import { cn, timeAgo } from "@/lib/utils"

interface RoomItemProps {
  room: Conversation
  active: boolean
  onClick: () => void
}

export function RoomItem({ room, active, onClick }: RoomItemProps) {
  const name = conversationTitle(room)
  const lastAt = room.last_at ? new Date(room.last_at).getTime() : null

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full select-none items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
        active && "bg-accent"
      )}
    >
      <div className="relative">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-xs font-medium">
          {name.slice(0, 2).toUpperCase()}
        </div>
        {room.type === "group" && (
          <span className="absolute -bottom-1 -right-1 rounded-full bg-secondary px-1 text-[8px] font-bold text-secondary-foreground">
            G
          </span>
        )}
      </div>
      <div className="flex-1 overflow-hidden">
        <div className="truncate font-medium">{name}</div>
        <div className="truncate text-xs text-muted-foreground">
          {room.last_message || (room.type === "group" ? "Group" : "Direct message")}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="text-[10px] text-muted-foreground">{lastAt ? timeAgo(lastAt) : ""}</div>
        {(room.unread_count || 0) > 0 && (
          <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-medium leading-none text-primary-foreground">
            {room.unread_count}
          </span>
        )}
      </div>
    </button>
  )
}
