import { useEffect, useState, useCallback } from "react"
import { useAuthStore } from "@/stores/useAuthStore"
import { useToast } from "@/components/ui/toast"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { OverviewTab } from "@/components/admin/OverviewTab"
import { ChannelsTab } from "@/components/admin/ChannelsTab"
import { AuditTab } from "@/components/admin/AuditTab"
import { UsersTab } from "@/components/admin/UsersTab"
import { ShieldAlert } from "lucide-react"

export default function AdminPage() {
  const user = useAuthStore((s) => s.user)
  const { addToast } = useToast()
  const isAdmin = user?.admin === 1
  const [forbidden, setForbidden] = useState(false)

  // One shared confirm dialog for destructive actions
  const [confirm, setConfirm] = useState<{
    title: string
    description: string
    onConfirm: () => Promise<void>
  } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!isAdmin) return
    // probe with a cheap call to see if backend grants admin
    import("@/api/admin").then((m) => {
      const { getStatsOverview } = m
      getStatsOverview().catch((e: Error) => {
        if (/forbidden|403/i.test(e.message)) setForbidden(true)
      })
    })
  }, [isAdmin])

  const requestConfirm = useCallback(
    (title: string, description: string, onConfirm: () => Promise<void>) => {
      setConfirm({ title, description, onConfirm })
    },
    []
  )

  const handleConfirm = async () => {
    if (!confirm) return
    setBusy(true)
    try {
      await confirm.onConfirm()
      setConfirm(null)
    } catch (e: unknown) {
      addToast((e as Error)?.message || "Operation failed", "error")
    } finally {
      setBusy(false)
    }
  }

  if (!isAdmin) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <ShieldAlert className="h-10 w-10 text-muted-foreground" />
        <p className="text-lg font-medium">需要管理员权限</p>
        <p className="text-sm text-muted-foreground">Administrator permission is required to access this page.</p>
      </div>
    )
  }

  if (forbidden) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <ShieldAlert className="h-10 w-10 text-destructive" />
        <p className="text-lg font-medium">需要管理员权限</p>
        <p className="text-sm text-muted-foreground">The server rejected this request (403 FORBIDDEN).</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b px-6 py-4">
        <h1 className="text-xl font-semibold">Admin Panel</h1>
        <p className="text-sm text-muted-foreground">Manage channels, users and audit logs</p>
      </div>
      <Tabs defaultValue="overview" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="mx-6 mt-4 w-fit">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="channels">Channels</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="audit">Audit Log</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-4">
          <OverviewTab />
        </TabsContent>
        <TabsContent value="channels" className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-4">
          <ChannelsTab onRequestConfirm={requestConfirm} />
        </TabsContent>
        <TabsContent value="users" className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-4">
          <UsersTab />
        </TabsContent>
        <TabsContent value="audit" className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-4">
          <AuditTab />
        </TabsContent>
      </Tabs>

      <Dialog open={!!confirm} onOpenChange={(o) => { if (!o) setConfirm(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{confirm?.title}</DialogTitle>
            <DialogDescription>{confirm?.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirm(null)} disabled={busy}>Cancel</Button>
            <Button variant="destructive" onClick={handleConfirm} disabled={busy}>
              {busy ? "Working..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
