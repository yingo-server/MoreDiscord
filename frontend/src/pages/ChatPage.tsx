import { useParams } from "react-router"
import { useEffect, useState } from "react"
import { useRoomStore } from "@/stores/useRoomStore"
import { useAuthStore } from "@/stores/useAuthStore"
import { MessageList } from "@/components/chat/MessageList"
import { MessageInput } from "@/components/chat/MessageInput"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { conversationTitle } from "@/types/models"
import { t } from "@/i18n"
import * as chatApi from "@/api/chat"
import type { ConversationDetail } from "@/types/models"

export default function ChatPage() {
  const { convId } = useParams<{ convId: string }>()
  const { currentRoomId, setCurrentRoom, rooms, loading, fetchError, clearUnread } = useRoomStore()
  const user = useAuthStore((s) => s.user)
  const [detail, setDetail] = useState<ConversationDetail | null>(null)

  useEffect(() => {
    if (convId && convId !== currentRoomId) setCurrentRoom(convId)
  }, [convId, currentRoomId, setCurrentRoom])

  useEffect(() => {
    if (currentRoomId) clearUnread(currentRoomId)
  }, [currentRoomId, clearUnread])

  useEffect(() => {
    if (!currentRoomId) {
      setDetail(null)
      return
    }
    let active = true
    chatApi.getConversation(currentRoomId).then((d) => {
      if (active) setDetail(d)
    }).catch(() => {
      if (active) setDetail(null)
    })
    return () => {
      active = false
    }
  }, [currentRoomId, rooms])

  const room = rooms.find((r) => r.id === (convId || currentRoomId))

  if (!room) {
    if (loading) {
      return (
        <div className="flex h-full flex-col gap-4 p-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      )
    }
    if (fetchError) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-4">
          <p className="text-sm text-destructive">{t("sidebar.loadFailed")}</p>
          <Button variant="outline" size="sm" onClick={() => useRoomStore.getState().fetchRooms()}>{t("common.retry")}</Button>
        </div>
      )
    }
    if (rooms.length > 0) {
      return (
        <div className="flex h-full items-center justify-center p-4">
          <p className="text-sm text-muted-foreground">{t("chat.notFound")}</p>
        </div>
      )
    }
    return (
      <div className="flex h-full items-center justify-center p-4">
        
      </div>
    )
  }

  const title = conversationTitle(room, user?.id)
  const isGroup = room.type === "group"
  const memberCount = detail?.member_count

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b px-4 py-2">
        <div className="min-w-0">
          <h2 className="truncate font-semibold">{title}</h2>
        </div>
        {isGroup && memberCount != null && (
          <span className="text-xs text-muted-foreground">{t("chat.members", { n: memberCount })}</span>
        )}
      </div>
      <MessageList members={detail?.members ?? []} />
      <MessageInput />
    </div>
  )
}
