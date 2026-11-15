import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router"
import { MessageSquarePlus, Search } from "lucide-react"
import { useRoomStore } from "@/stores/useRoomStore"
import { useUIStore } from "@/stores/useUIStore"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { RoomItem } from "@/components/rooms/RoomItem"
import { CreateRoom } from "@/components/rooms/CreateRoom"
import { RoomContextMenu } from "@/components/rooms/RoomContextMenu"
import { RoomDialogs } from "@/components/rooms/RoomDialogs"
import { cn } from "@/lib/utils"
import { formatDisplayName } from "@/lib/displayName"
import { t } from "@/i18n"
import type { Conversation } from "@/types/models"

interface MenuState {
  room: Conversation
  x: number
  y: number
}

export function Sidebar() {
  const navigate = useNavigate()
  const { convId } = useParams()
  const { rooms, currentRoomId, fetchRooms, fetchError } = useRoomStore()
  const sidebarOpen = useUIStore((s) => s.sidebarOpen)
  const [search, setSearch] = useState("")
  const [showCreate, setShowCreate] = useState(false)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Conversation | null>(null)
  const [renameTarget, setRenameTarget] = useState<Conversation | null>(null)

  useEffect(() => {
    fetchRooms()
  }, [fetchRooms])

  const filtered = search
    ? rooms.filter((r) => {
        const name = r.type === "group" ? (r.name || "") : (r.peer ? formatDisplayName(r.peer) : "")
        return name.toLowerCase().includes(search.toLowerCase())
      })
    : rooms

  const handleSelect = (id: string) => {
    useRoomStore.getState().setCurrentRoom(id)
    navigate(`/chat/${id}`)
    if (window.innerWidth < 768) {
      useUIStore.getState().setSidebarOpen(false)
    }
  }

  const closeDialogs = () => {
    setDeleteTarget(null)
    setRenameTarget(null)
  }

  const openMenu = (room: Conversation, x: number, y: number) => setMenu({ room, x, y })

  return (
    <>
      {sidebarOpen && <div className="fixed inset-0 z-20 bg-black/60 md:hidden" onClick={() => useUIStore.getState().setSidebarOpen(false)} />}

      <aside
        className={cn(
          "flex h-full w-72 flex-col border-r sidebar-glass",
          "fixed inset-y-0 left-0 z-30 shadow-2xl md:relative md:shadow-none",
          sidebarOpen ? "sidebar-in" : "sidebar-out"
        )}
      >
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("sidebar.search")}
              className="pl-8 h-8 text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowCreate(true)} aria-label={t("sidebar.newConv")}>
            <MessageSquarePlus className="h-4 w-4" />
          </Button>
        </div>

        <ScrollArea className="flex-1">
          {fetchError ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center text-sm">
              <p className="text-destructive">{t("sidebar.loadFailed")}</p>
              <Button variant="outline" size="sm" onClick={() => fetchRooms()}>{t("common.retry")}</Button>
            </div>
          ) : (
            <div className="flex flex-col gap-0.5 p-2">
              {filtered.map((room) => (
                <div
                  key={room.id}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    openMenu(room, e.clientX, e.clientY)
                  }}
                >
                  <RoomItem
                    room={room}
                    active={room.id === (convId || currentRoomId)}
                    onClick={() => handleSelect(room.id)}
                  />
                </div>
              ))}
              {filtered.length === 0 && (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  {search ? t("sidebar.noResults") : t("sidebar.empty")}
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        <CreateRoom open={showCreate} onOpenChange={setShowCreate} />
      </aside>

      {menu && (
        <RoomContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            {
              label: menu.room.type === "group" ? t("sidebar.renameGroup") : t("sidebar.properties"),
              onClick: () => {
                if (menu.room.type === "group") setRenameTarget(menu.room)
              },
            },
            {
              label: menu.room.type === "direct" ? t("sidebar.deleteConv") : t("sidebar.leaveGroup"),
              danger: true,
              onClick: () => setDeleteTarget(menu.room),
            },
          ]}
        />
      )}

      <RoomDialogs deleteTarget={deleteTarget} renameTarget={renameTarget} onClose={closeDialogs} />
    </>
  )
}
