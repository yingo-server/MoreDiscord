import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router"
import { useAuthStore } from "@/stores/useAuthStore"
import { useRoomStore } from "@/stores/useRoomStore"
import { getAdminUsers } from "@/api/admin"
import type { User } from "@/types/models"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { formatDisplayName } from "@/lib/displayName"
import { t } from "@/i18n"

interface CreateRoomProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateRoom({ open, onOpenChange }: CreateRoomProps) {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const { createDirect, createGroup } = useRoomStore()
  const [tab, setTab] = useState("direct")
  const [searchQuery, setSearchQuery] = useState("")
  const [results, setResults] = useState<User[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [groupName, setGroupName] = useState("")
  const [groupSelected, setGroupSelected] = useState<User[]>([])
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (searchQuery.length < 1) {
      setResults([])
      setSearching(false)
      return
    }
    setSearching(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const page = await getAdminUsers(searchQuery)
        setResults(page.items.filter((u) => u.id !== user?.id))
      } catch {
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [searchQuery, user?.id])

  const handleSelectUser = (u: User) => {
    setSelectedUser(u)
    setSearchQuery(formatDisplayName(u))
    setResults([])
  }

  const handleAddGroupMember = (u: User) => {
    setGroupSelected((prev) => [...prev, u])
    setSearchQuery("")
    setResults([])
  }

  const handleCreateDirect = async () => {
    if (!selectedUser) {
      setError(t("room.create.needUser"))
      return
    }
    setLoading(true)
    setError("")
    try {
      const conv = await createDirect(selectedUser.id)
      useRoomStore.getState().setCurrentRoom(conv.id)
      onOpenChange(false)
      setSearchQuery("")
      setSelectedUser(null)
      navigate(`/chat/${conv.id}`)
    } catch (err: unknown) {
      setError((err as Error)?.message || t("room.create.failed"))
    } finally {
      setLoading(false)
    }
  }

  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      setError(t("room.create.needName"))
      return
    }
    if (groupSelected.length === 0) {
      setError(t("room.create.needMember"))
      return
    }
    setLoading(true)
    setError("")
    try {
      const conv = await createGroup(groupName.trim(), groupSelected.map((u) => u.id))
      useRoomStore.getState().setCurrentRoom(conv.id)
      onOpenChange(false)
      setGroupName("")
      setGroupSelected([])
      navigate(`/chat/${conv.id}`)
    } catch (err: unknown) {
      setError((err as Error)?.message || t("room.create.groupFailed"))
    } finally {
      setLoading(false)
    }
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setError("")
      setTab("direct")
      setSearchQuery("")
      setResults([])
      setSelectedUser(null)
      setGroupName("")
      setGroupSelected([])
    }
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("room.create.title")}</DialogTitle>
          <DialogDescription>{t("room.create.desc")}</DialogDescription>
        </DialogHeader>
        {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full">
            <TabsTrigger value="direct" className="flex-1">{t("room.create.direct")}</TabsTrigger>
            <TabsTrigger value="group" className="flex-1">{t("room.create.group")}</TabsTrigger>
          </TabsList>
          <TabsContent value="direct" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>{t("room.create.searchUser")}</Label>
              <div className="relative">
                <Input
                  placeholder={t("room.create.searchPlaceholder")}
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setSelectedUser(null) }}
                />
                {searching && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">...</span>}
              </div>
              {results.length > 0 && (
                <div className="max-h-40 overflow-y-auto rounded-md border bg-popover">
                  {results.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
                      onClick={() => handleSelectUser(u)}
                    >
                      <span className="font-medium">{formatDisplayName(u)}</span>
                      <span className="text-xs text-muted-foreground">@{u.username}</span>
                    </button>
                  ))}
                </div>
              )}
              {!searching && searchQuery.length >= 1 && results.length === 0 && !selectedUser && (
                <p className="text-xs text-muted-foreground">{t("room.create.noUsers")}</p>
              )}
              {selectedUser && (
                <p className="text-xs text-green-600">{t("room.create.selected", { name: formatDisplayName(selectedUser) })}</p>
              )}
            </div>
            <Button className="w-full" onClick={handleCreateDirect} disabled={loading}>
              {loading ? t("room.create.creating") : t("room.create.start")}
            </Button>
          </TabsContent>
          <TabsContent value="group" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>{t("room.create.groupName")}</Label>
              <Input placeholder={t("room.create.groupNamePlaceholder")} value={groupName} onChange={(e) => setGroupName(e.target.value)} maxLength={64} />
            </div>
            <div className="space-y-2">
              <Label>{t("room.create.addMembers")}</Label>
              <Input
                placeholder={t("admin.users.search")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {results.length > 0 && (
                <div className="max-h-40 overflow-y-auto rounded-md border bg-popover">
                  {results.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
                      onClick={() => handleAddGroupMember(u)}
                    >
                      <span className="font-medium">{formatDisplayName(u)}</span>
                      <span className="text-xs text-muted-foreground">@{u.username}</span>
                    </button>
                  ))}
                </div>
              )}
              {groupSelected.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {groupSelected.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      className="flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-xs"
                      onClick={() => setGroupSelected((prev) => prev.filter((x) => x.id !== u.id))}
                    >
                      {formatDisplayName(u)}
                      <span aria-hidden>×</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Button className="w-full" onClick={handleCreateGroup} disabled={loading}>
              {loading ? t("room.create.creating") : t("room.create.group")}
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
