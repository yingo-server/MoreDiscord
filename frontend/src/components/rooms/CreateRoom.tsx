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
    setSearchQuery(u.display_name || u.username)
    setResults([])
  }

  const handleAddGroupMember = (u: User) => {
    setGroupSelected((prev) => [...prev, u])
    setSearchQuery("")
    setResults([])
  }

  const handleCreateDirect = async () => {
    if (!selectedUser) {
      setError("Please search and select a user")
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
      setError((err as Error)?.message || "Failed to create conversation")
    } finally {
      setLoading(false)
    }
  }

  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      setError("Group name is required")
      return
    }
    if (groupSelected.length === 0) {
      setError("Add at least one member")
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
      setError((err as Error)?.message || "Failed to create group")
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
          <DialogTitle>New Conversation</DialogTitle>
          <DialogDescription>Create a direct or group chat</DialogDescription>
        </DialogHeader>
        {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full">
            <TabsTrigger value="direct" className="flex-1">Direct</TabsTrigger>
            <TabsTrigger value="group" className="flex-1">Group</TabsTrigger>
          </TabsList>
          <TabsContent value="direct" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>Search User</Label>
              <div className="relative">
                <Input
                  placeholder="Type username to search..."
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
                      <span className="font-medium">{u.display_name || u.username}</span>
                      <span className="text-xs text-muted-foreground">@{u.username}</span>
                    </button>
                  ))}
                </div>
              )}
              {!searching && searchQuery.length >= 1 && results.length === 0 && !selectedUser && (
                <p className="text-xs text-muted-foreground">No users found</p>
              )}
              {selectedUser && (
                <p className="text-xs text-green-600">Selected: {selectedUser.display_name || selectedUser.username}</p>
              )}
            </div>
            <Button className="w-full" onClick={handleCreateDirect} disabled={loading}>
              {loading ? "Creating..." : "Start Conversation"}
            </Button>
          </TabsContent>
          <TabsContent value="group" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>Group Name</Label>
              <Input placeholder="Enter group name" value={groupName} onChange={(e) => setGroupName(e.target.value)} maxLength={64} />
            </div>
            <div className="space-y-2">
              <Label>Add Members</Label>
              <Input
                placeholder="Search users..."
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
                      <span className="font-medium">{u.display_name || u.username}</span>
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
                      {u.display_name || u.username}
                      <span aria-hidden>×</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Button className="w-full" onClick={handleCreateGroup} disabled={loading}>
              {loading ? "Creating..." : "Create Group"}
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
