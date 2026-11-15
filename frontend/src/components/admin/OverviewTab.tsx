import { useEffect, useState } from "react"
import { getStatsOverview, type AdminStatsOverview } from "@/api/admin"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { t } from "@/i18n"

export function OverviewTab() {
  const [stats, setStats] = useState<AdminStatsOverview | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    getStatsOverview().then(setStats).catch((e: Error) => setError(e.message))
  }, [])

  if (error) return <p className="text-sm text-destructive">{error}</p>

  const entries = stats ? Object.entries(stats).filter(([, v]) => typeof v === "number" || typeof v === "string") : []

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {!stats &&
        Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16" />
            </CardContent>
          </Card>
        ))}
      {entries.map(([key, value]) => (
        <Card key={key}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground capitalize">{key.replace(/_/g, " ")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{String(value)}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
