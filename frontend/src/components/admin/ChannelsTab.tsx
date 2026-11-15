import { useEffect, useState, useCallback } from "react"
import { getAdminChannels, getAdminChannelMessages, deleteAdminChannel } from "@/api/admin"
import type { AdminChannel, AdminPage } from "@/types/api"
import type { Message } from "@/types/models"
import { conversationTitle } from "@/types/models"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"

interface Props {
  onRequestConfirm: (title: string, description: string, onConfirm: () => Promise<void>) => void
}

export function ChannelsTab({ onRequestConfirm }: Props) {
  const [channels, setChannels] = useState<AdminChannel[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const load = useCallback(async (cursor?: string) => {
    try {
      const page: AdminPage<AdminChannel> = await getAdminChannels(cursor)
      setChannels((prev) => (cursor ? [...prev, ...page.items] : page.items))
      setNextCursor(page.next_cursor)
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleDelete = (ch: AdminChannel) => {
    onRequestConfirm(
      "Delete Channel",
      `Permanently delete "${conversationTitle(ch as never)}" and all its messages? This cannot be undone.`,
      async () => {
        await deleteAdminChannel(ch.id)
        setChannels((prev) => prev.filter((c) => c.id !== ch.id))
      }
    )
  }

  return (
    <div>
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left">
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">Members</th>
              <th className="px-4 py-2 font-medium">Created</th>
              <th className="px-4 py-2 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {channels.map((ch) => (
              <ChannelRow key={ch.id} channel={ch} onDelete={() => handleDelete(ch)} />
            ))}
            {channels.length === 0 && !loading && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No channels</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {loading && <p className="mt-4 text-sm text-muted-foreground">Loading...</p>}
      {nextCursor && !loading && (
        <div className="mt-4 flex justify-center">
          <Button variant="outline" size="sm" onClick={() => load(nextCursor)}>Load more</Button>
        </div>
      )}
    </div>
  )
}

function ChannelRow({ channel, onDelete }: { channel: AdminChannel; onDelete: () => void }) {
  const [messagesOpen, setMessagesOpen] = useState(false)

  return (
    <tr className="border-b last:border-0 hover:bg-muted/30">
      <td className="max-w-[240px] truncate px-4 py-2">{channel.name || channel.id}</td>
      <td className="px-4 py-2">
        <Badge variant="outline">{channel.type}</Badge>
      </td>
      <td className="px-4 py-2">{channel.member_count ?? "—"}</td>
      <td className="px-4 py-2 text-muted-foreground">
        {channel.created_at ? new Date(channel.created_at).toLocaleString() : "—"}
      </td>
      <td className="px-4 py-2 text-right">
        <Button variant="ghost" size="sm" onClick={() => setMessagesOpen(true)}>Messages</Button>
        <Button variant="ghost" size="sm" className="text-destructive" onClick={onDelete}>Delete</Button>
      </td>
      {messagesOpen && <ChannelMessagesDialog channelId={channel.id} onClose={() => setMessagesOpen(false)} />}
    </tr>
  )
}

function ChannelMessagesDialog({ channelId, onClose }: { channelId: string; onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const load = useCallback(
    async (cursor?: string) => {
      try {
        const page = await getAdminChannelMessages(channelId, cursor)
        setMessages((prev) => (cursor ? [...prev, ...page.items] : page.items))
        setNextCursor(page.next_cursor)
      } catch (e: unknown) {
        setError((e as Error).message)
      } finally {
        setLoading(false)
      }
    },
    [channelId]
  )

  useEffect(() => {
    load()
  }, [load])

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Channel Messages</DialogTitle>
        </DialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <ScrollArea className="max-h-[400px] rounded-md border">
          <div className="divide-y">
            {messages.map((m) => (
              <div key={m.id} className="px-4 py-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{m.sender_id}</span>
                  <span>{new Date(m.created_at).toLocaleString()}</span>
                </div>
                <p className="whitespace-pre-wrap break-words text-sm">{m.content}</p>
              </div>
            ))}
            {messages.length === 0 && !loading && (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">No messages</p>
            )}
          </div>
        </ScrollArea>
        {loading && <p className="text-sm text-muted-foreground">Loading...</p>}
        {nextCursor && !loading && (
          <Button variant="outline" size="sm" className="w-full" onClick={() => load(nextCursor)}>Load more</Button>
        )}
      </DialogContent>
    </Dialog>
  )
}
