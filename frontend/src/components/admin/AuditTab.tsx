import { useEffect, useState, useCallback } from "react"
import { getAuditLog } from "@/api/admin"
import type { AdminAuditEntry, AdminPage } from "@/types/api"
import { Button } from "@/components/ui/button"
import { t } from "@/i18n"

export function AuditTab() {
  const [entries, setEntries] = useState<AdminAuditEntry[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const load = useCallback(async (cursor?: string) => {
    try {
      const page: AdminPage<AdminAuditEntry> = await getAuditLog(cursor)
      setEntries((prev) => (cursor ? [...prev, ...page.items] : page.items))
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

  return (
    <div>
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left">
              <th className="px-4 py-2 font-medium">{t("admin.audit.time")}</th>
              <th className="px-4 py-2 font-medium">{t("admin.audit.action")}</th>
              <th className="px-4 py-2 font-medium">{t("admin.audit.actor")}</th>
              <th className="px-4 py-2 font-medium">{t("admin.audit.detail")}</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-b last:border-0 hover:bg-muted/30">
                <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">
                  {e.created_at ? new Date(e.created_at).toLocaleString() : "—"}
                </td>
                <td className="px-4 py-2">{e.action ?? "—"}</td>
                <td className="px-4 py-2 font-mono text-xs">{e.actor_id ?? "—"}</td>
                <td className="max-w-[320px] truncate px-4 py-2 text-muted-foreground">{e.detail ?? e.target ?? "—"}</td>
              </tr>
            ))}
            {entries.length === 0 && !loading && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">{t("admin.audit.empty")}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {loading && <p className="mt-4 text-sm text-muted-foreground">{t("common.loading")}</p>}
      {nextCursor && !loading && (
        <div className="mt-4 flex justify-center">
          <Button variant="outline" size="sm" onClick={() => load(nextCursor)}>{t("common.loadMore")}</Button>
        </div>
      )}
    </div>
  )
}
