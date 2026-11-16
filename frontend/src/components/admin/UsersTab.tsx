import { useEffect, useState, useCallback, useRef } from "react"
import { getAdminUsers, deleteAdminUser } from "@/api/admin"
import type { User } from "@/types/models"
import type { AdminPage } from "@/types/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Shield } from "lucide-react"
import { formatDisplayName } from "@/lib/displayName"
import { t } from "@/i18n"

export function UsersTab() {
  const [users, setUsers] = useState<User[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [search, setSearch] = useState("")
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const firstLoad = useRef(true)

  const load = useCallback(async (opts: { search?: string; cursor?: string; reset?: boolean }) => {
    setLoading(true)
    setError("")
    try {
      const page: AdminPage<User> = await getAdminUsers(opts.search, opts.cursor)
      setUsers((prev) => (opts.reset || !opts.cursor ? page.items : [...prev, ...page.items]))
      setNextCursor(page.next_cursor)
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (firstLoad.current) {
      firstLoad.current = false
      load({ reset: true })
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => load({ search: search || undefined, reset: true }), 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [search, load])

  async function onDelete(u: User) {
    if (!window.confirm(t("admin.users.deleteConfirm", { name: u.username }))) return
    try {
      await deleteAdminUser(u.id)
      setUsers((prev) => prev.filter((x) => x.id !== u.id))
    } catch (e: unknown) {
      setError(t("admin.opFailed"))
    }
  }

  return (
    <div>
      <div className="mb-4 max-w-sm">
        <Input placeholder={t("admin.users.search")} value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left">
              <th className="px-4 py-2 font-medium">{t("admin.users.username")}</th>
              <th className="px-4 py-2 font-medium">{t("admin.users.display")}</th>
              <th className="px-4 py-2 font-medium">{t("admin.users.email")}</th>
              <th className="px-4 py-2 font-medium">{t("admin.users.role")}</th>
              <th className="px-4 py-2 font-medium">{t("admin.ch.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b last:border-0 hover:bg-muted/30">
                <td className="px-4 py-2 font-mono text-xs">@{u.username}</td>
                <td className="px-4 py-2">{formatDisplayName(u)}</td>
                <td className="px-4 py-2 text-muted-foreground">{u.email}</td>
                <td className="px-4 py-2">
                  {u.admin === 1 ? (
                    <Badge><Shield className="mr-1 h-3 w-3" />{t("profile.admin")}</Badge>
                  ) : (
                    <Badge variant="secondary">{t("admin.users.roleUser")}</Badge>
                  )}
                </td>
                <td className="px-4 py-2">
                  <button
                    type="button"
                    className="text-xs text-destructive hover:underline disabled:opacity-50"
                    onClick={() => onDelete(u)}
                  >
                    {t("common.delete")}
                  </button>
                </td>
              </tr>
            ))}
            {users.length === 0 && !loading && (
              <tr>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {loading && <p className="mt-4 text-sm text-muted-foreground">{t("common.loading")}</p>}
      {nextCursor && !loading && (
        <div className="mt-4 flex justify-center">
          <Button variant="outline" size="sm" onClick={() => load({ cursor: nextCursor, search: search || undefined })}>
            {t("common.loadMore")}
          </Button>
        </div>
      )}
    </div>
  )
}
