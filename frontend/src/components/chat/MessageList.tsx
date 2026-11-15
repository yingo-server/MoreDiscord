import { useEffect, useRef, useCallback } from "react"
import { useMessageStore } from "@/stores/useMessageStore"
import { useRoomStore } from "@/stores/useRoomStore"
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll"
import { MessageItem } from "./MessageItem"
import { Skeleton } from "@/components/ui/skeleton"
import { t } from "@/i18n"
import type { ConversationMember } from "@/types/models"

export function MessageList({ members = [] }: { members?: ConversationMember[] }) {
  const currentConvId = useRoomStore((s) => s.currentRoomId)
  const { messages, hasMore, loading, fetchMessages, fetchMore } = useMessageStore()
  const containerRef = useRef<HTMLDivElement>(null)
  const fetchIdRef = useRef(0)
  const prevHeadIdRef = useRef<string | null>(null)

  const scrollToBottom = () => {
    const el = containerRef.current
    if (el) el.scrollTop = el.scrollHeight
  }

  const isNearBottom = () => {
    const el = containerRef.current
    return el ? el.scrollHeight - el.scrollTop - el.clientHeight < 160 : false
  }

  useEffect(() => {
    if (!currentConvId) return
    const fetchId = ++fetchIdRef.current
    useMessageStore.getState().reset()
    fetchMessages(currentConvId).then(() => {
      if (fetchId === fetchIdRef.current) {
        scrollToBottom()
        useRoomStore.getState().clearUnread(currentConvId)
      }
    })
  }, [currentConvId, fetchMessages])

  useEffect(() => {
    const headId = messages[0]?.id ?? null
    if (headId !== null && headId !== prevHeadIdRef.current) {
      prevHeadIdRef.current = headId
      if (isNearBottom()) scrollToBottom()
    }
  }, [messages])

  const handleLoadMore = useCallback(async () => {
    const el = containerRef.current
    const prevHeight = el ? el.scrollHeight : 0
    const prevScrollTop = el ? el.scrollTop : 0
    if (currentConvId) await fetchMore(currentConvId)
    if (el && prevHeight > 0) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight - prevHeight + prevScrollTop
      })
    }
  }, [currentConvId, fetchMore])

  const { setObserver } = useInfiniteScroll(handleLoadMore, hasMore)

  if (!currentConvId) return null

  if (loading && messages.length === 0) {
    return (
      <div className="flex flex-col gap-3 p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="h-8 w-8 rounded-full" />
            <div className="flex flex-col gap-1">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-8 w-48" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={containerRef} className="flex-1 overflow-y-auto">
        {hasMore && <div ref={setObserver} className="h-1" />}
        <div className="flex flex-col">
          {messages.map((msg) => (
            <MessageItem key={msg.id} message={msg} sender={members.find((m) => m.user_id === msg.sender_id)} />
          ))}
        </div>
      </div>
    </div>
  )
}
