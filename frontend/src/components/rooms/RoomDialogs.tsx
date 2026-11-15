import { useState } from "react"
import { useNavigate } from "react-router"
import type { Conversation } from "@/types/models"
import { conversationTitle } from "@/types/models"
import { useRoomStore } from "@/stores/useRoomStore"
import { useAuthStore } from "@/stores/useAuthStore"
import * as chatApi from "@/api/chat"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"

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
      setError((err as Error)?.message || "Operation failed")
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
      setError((err as Error)?.message || "Save failed")
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { setError(""); if (!o) onClose() }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{isGroup ? "Leave Group" : "Delete Conversation"}</DialogTitle>
            <DialogDescription>
              {isGroup
                ? "You will leave this group. If you are the owner, transfer ownership first or the group will be deleted."
                : "This permanently deletes the entire conversation for both sides. This cannot be undone."}
            </DialogDescription>
          </DialogHeader>
          {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={onClose} disabled={deleting}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Working..." : isGroup ? "Leave" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog key={renameTarget?.id ?? "rename-none"} open={!!renameTarget} onOpenChange={(o) => { setError(""); if (!o) onClose() }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename Group</DialogTitle>
            <DialogDescription>Only group conversations can be renamed.</DialogDescription>
          </DialogHeader>
          {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
          <input
            autoFocus
            maxLength={64}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            placeholder="group name..."
            defaultValue={renameTarget?.name ?? ""}
            onChange={(e) => setName(e.target.value)}
          />
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button onClick={handleRename} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
