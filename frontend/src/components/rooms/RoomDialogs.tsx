import { useState } from "react"
import { useNavigate } from "react-router"
import type { Conversation } from "@/types/models"
import { conversationTitle } from "@/types/models"
import { useRoomStore } from "@/stores/useRoomStore"
import { useAuthStore } from "@/stores/useAuthStore"
import * as chatApi from "@/api/chat"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { t } from "@/i18n"

interface RoomDialogsProps {
  /** conversation targeted for delete (direct) or leave (group) */
  deleteTarget: Conversation | null
  renameTarget: Conversation | null
  onClose: () => void
}

export function RoomDialogs({ deleteTarget, renameTarget, onClose }: RoomDialogsProps) {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const { removeRoom, rename } = useRoomStore()
  const [name, setName] = useState(renameTarget?.name ?? "")
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState("")

  const isGroup = deleteTarget?.type === "group"

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    setError("")
    try {
      if (isGroup) {
        await chatApi.leaveConversation(deleteTarget.id)
      } else {
        await chatApi.deleteConversation(deleteTarget.id)
      }
      removeRoom(deleteTarget.id)
      onClose()
      navigate("/")
    } catch (err: unknown) {
      setError((err as Error)?.message || t("room.dialog.operationFailed"))
    } finally {
      setDeleting(false)
    }
  }

  const handleRename = async () => {
    if (!renameTarget) return
    setSaving(true)
    setError("")
    try {
      await rename(renameTarget.id, name.trim())
      onClose()
    } catch (err: unknown) {
      setError((err as Error)?.message || t("profile.saveFailed"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { setError(""); if (!o) onClose() }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{isGroup ? t("sidebar.leaveGroup") : t("sidebar.deleteConv")}</DialogTitle>
            <DialogDescription>
              {isGroup
                ? t("room.dialog.leaveDesc")
                : t("room.dialog.deleteDesc")}
            </DialogDescription>
          </DialogHeader>
          {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={onClose} disabled={deleting}>{t("common.cancel")}</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? t("common.working") : isGroup ? t("common.leave") : t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog key={renameTarget?.id ?? "rename-none"} open={!!renameTarget} onOpenChange={(o) => { setError(""); if (!o) onClose() }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("sidebar.renameGroup")}</DialogTitle>
                      </DialogHeader>
          {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
          <input
            autoFocus
            maxLength={64}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            placeholder={t("room.dialog.namePlaceholder")}
            defaultValue={renameTarget?.name ?? ""}
            onChange={(e) => setName(e.target.value)}
          />
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>{t("common.cancel")}</Button>
            <Button onClick={handleRename} disabled={saving}>{saving ? t("common.saving") : t("common.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
