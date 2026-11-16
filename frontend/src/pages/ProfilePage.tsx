import { useState } from "react"
import { useAuthStore } from "@/stores/useAuthStore"
import * as userApi from "@/api/user"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/toast"
import { Shield, User } from "lucide-react"
import { formatDisplayName } from "@/lib/displayName"
import { t } from "@/i18n"
import { errorText } from "@/i18n/errors"
import { ApiError } from "@/api/client"

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user)
  const fetchMe = useAuthStore((s) => s.fetchMe)
  const { addToast } = useToast()
  const [displayName, setDisplayName] = useState(user?.display_name ?? "")
  const [saving, setSaving] = useState(false)

  if (!user) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
      </div>
    )
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await userApi.updateProfile(displayName.trim())
      await fetchMe()
      addToast(t("profile.updated"), "success")
    } catch (e: unknown) {
      addToast(errorText((e as ApiError)?.code, t("profile.saveFailed")), "error")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex h-full items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="flex flex-row items-center gap-4">
          <Avatar className="h-16 w-16">
            <AvatarFallback className="text-xl">{formatDisplayName(user).slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="flex flex-col gap-1">
            <CardTitle className="text-xl">{formatDisplayName(user)}</CardTitle>
            <div className="flex items-center gap-2">
              {user.admin === 1 && (
                <Badge>
                  <Shield className="mr-1 h-3 w-3" />
                  {t("profile.admin")}
                </Badge>
              )}
              <Badge variant="outline">@{user.username}</Badge>
            </div>
          </div>
        </CardHeader>
        <Separator />
        <CardContent className="space-y-4 pt-4">
          <div className="flex items-center gap-2 text-sm">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">{t("profile.email")}:</span>
            <span className="truncate">{user.email}</span>
          </div>
          <div className="space-y-2">
            <Label htmlFor="display_name">{t("profile.displayName")}</Label>
            <div className="flex gap-2">
              <Input
                id="display_name"
                value={displayName}
                maxLength={64}
                onChange={(e) => setDisplayName(e.target.value)}
              />
              <Button onClick={handleSave} disabled={saving || !displayName.trim()}>
                {saving ? t("common.saving") : t("common.save")}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
