import type { Conversation } from "@/types/models"
import { conversationTitle } from "@/types/models"

export interface MenuItem {
  label: string
  danger?: boolean
  onClick: () => void
}

export function RoomContextMenu({
  x,
  y,
  onClose,
  items,
}: {
  x: number
  y: number
  onClose: () => void
  items: MenuItem[]
}) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose() }} />
      <div
        className="fixed z-50 min-w-[160px] overflow-hidden rounded-md border bg-popover p-1 shadow-md"
        style={{ left: x, top: y }}
      >
        {items.map((item) => (
          <button
            key={item.label}
            className={`w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent ${item.danger ? "text-destructive" : ""}`}
            onClick={() => {
              onClose()
              item.onClick()
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </>
  )
}
