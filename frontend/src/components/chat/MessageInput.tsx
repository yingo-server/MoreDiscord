import { useState, useRef, useEffect } from "react"
import { Send } from "lucide-react"
import { useRoomStore } from "@/stores/useRoomStore"
import { useMessageStore } from "@/stores/useMessageStore"
import { useToast } from "@/components/ui/toast"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import * as chatApi from "@/api/chat"
import { t } from "@/i18n"
import { errorText } from "@/i18n/errors"
import { ApiError } from "@/api/client"

const MAX_LEN = 4000

export function MessageInput() {
  const currentConvId = useRoomStore((s) => s.currentRoomId)
  const { addToast } = useToast()
  const [text, setText] = useState("")
  const [sending, setSending] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`
    }
  }, [text])

  useEffect(() => {
    textareaRef.current?.focus()
  }, [currentConvId])

  const handleSend = async () => {
    const content = text.trim()
    if (!content || !currentConvId || sending) return
    if (content.length > MAX_LEN) {
      addToast(t("input.tooLong", { n: MAX_LEN }), "error")
      return
    }
    setText("")
    setSending(true)
    try {
      const msg = await chatApi.sendMessage(currentConvId, content)
      useMessageStore.getState().appendMessage(msg)
    } catch (e: unknown) {
      setText(content)
      addToast(errorText((e as ApiError)?.code, t("input.sendFailed")), "error")
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      handleSend()
    }
  }

  if (!currentConvId) return null

  return (
    <div className="flex items-end gap-2 border-t px-4 py-3">
      <Textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={t("input.placeholder")}
        maxLength={MAX_LEN}
        className="flex-1 resize-none min-h-[40px] max-h-[120px]"
        rows={1}
      />
      <Button size="icon" onClick={handleSend} disabled={!text.trim() || sending} className="mb-1" aria-label={t("input.send")}>
        <Send className="h-4 w-4" />
      </Button>
    </div>
  )
}
