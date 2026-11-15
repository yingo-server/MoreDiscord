import { useState, useRef, useEffect } from "react"
import { Send, Languages } from "lucide-react"
import { useRoomStore } from "@/stores/useRoomStore"
import { useMessageStore } from "@/stores/useMessageStore"
import { useToast } from "@/components/ui/toast"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import * as chatApi from "@/api/chat"
import { translateMessage } from "@/api/translate"
import { needsTranslation } from "@/lib/lang"
import { t, getLang } from "@/i18n"

const MAX_LEN = 4000

export function MessageInput() {
  const currentConvId = useRoomStore((s) => s.currentRoomId)
  const { addToast } = useToast()
  const [text, setText] = useState("")
  const [sending, setSending] = useState(false)
  const [translating, setTranslating] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const showTranslate = needsTranslation(text, getLang())

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`
    }
  }, [text])

  useEffect(() => {
    textareaRef.current?.focus()
  }, [currentConvId])

  const handleTranslate = async () => {
    if (translating || !text.trim()) return
    setTranslating(true)
    try {
      const r = await translateMessage(text.trim(), getLang())
      setText(r.translation)
    } catch (e: unknown) {
      addToast((e as Error)?.message || t("msg.translateFailed"), "error")
    } finally {
      setTranslating(false)
    }
  }

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
      addToast((e as Error)?.message || t("input.sendFailed"), "error")
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
    <div className="border-t px-4 py-3">
      <div className="flex items-end gap-2">
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
        {showTranslate && (
          <Button
            size="icon"
            variant="ghost"
            onClick={handleTranslate}
            disabled={translating}
            className="mb-1 h-6 w-6 text-muted-foreground"
            aria-label={t("msg.translate")}
            title={t("msg.translate")}
          >
            <Languages className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button size="icon" onClick={handleSend} disabled={!text.trim() || sending} className="mb-1" aria-label={t("input.send")}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
