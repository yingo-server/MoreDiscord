import { useState } from "react"
import type { Message } from "@/types/models"
import { useAuthStore } from "@/stores/useAuthStore"
import { cn, timeAgo, timeFull } from "@/lib/utils"
import { formatDisplayName, type DisplayableUser } from "@/lib/displayName"
import { t, getLang } from "@/i18n"
import { translateMessage } from "@/api/translate"

interface MessageItemProps {
  message: Message
  sender?: DisplayableUser | null
}

export function MessageItem({ message, sender }: MessageItemProps) {
  const user = useAuthStore((s) => s.user)
  const isOwn = message.sender_id === user?.id
  const author: DisplayableUser | null = sender || (isOwn ? user : null)
  const initials = message.sender_id?.slice(0, 2).toUpperCase() || "?"

  const [translation, setTranslation] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  async function onTranslate() {
    if (busy || translation) return
    setBusy(true)
    setFailed(false)
    try {
      const r = await translateMessage(message.content, getLang())
      setTranslation(r.translation)
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={cn("flex gap-3 px-4 py-1.5 hover:bg-muted/30", isOwn && "flex-row-reverse")}>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
        {initials}
      </div>
      <div className={cn("flex max-w-[70%] flex-col gap-0.5", isOwn && "items-end")}>
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-medium">{author ? formatDisplayName(author) : message.sender_id}</span>
          <span className="text-[10px] text-muted-foreground" title={timeFull(new Date(message.created_at).getTime())}>
            {timeAgo(new Date(message.created_at).getTime())}
          </span>
        </div>
        <div
          className={cn(
            "self-start rounded-xl px-3 py-1.5 text-sm whitespace-pre-wrap break-words",
            isOwn ? "self-end bg-primary text-primary-foreground" : "bg-muted"
          )}
        >
          {message.content}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50"
            onClick={onTranslate}
            disabled={busy || !!translation}
          >
            {busy ? t("msg.translating") : translation ? "" : t("msg.translate")}
          </button>
          {failed && <span className="text-[11px] text-destructive">{t("msg.translateFailed")}</span>}
        </div>
        {translation && (
          <div className={cn(
            "self-start rounded-lg border-l-2 border-primary/50 px-3 py-1.5 text-sm whitespace-pre-wrap break-words text-muted-foreground",
            isOwn && "self-end"
          )}>
            {translation}
          </div>
        )}
      </div>
    </div>
  )
}
