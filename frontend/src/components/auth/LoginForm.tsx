import { useState } from "react"
import { useNavigate, Link } from "react-router"
import { useAuthStore } from "@/stores/useAuthStore"
import { markPendingUnconfirmed, consumePendingUnconfirmed } from "@/i18n"
import { t } from "@/i18n"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export function LoginForm() {
  const navigate = useNavigate()
  const login = useAuthStore((s) => s.login)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [hint, setHint] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")
    setHint("")
    try {
      await login(email.trim(), password)
      navigate("/", { replace: true })
    } catch (err: unknown) {
      const msg = (err as Error)?.message || t("auth.login.failed")
      if (/INVALID_CREDENTIALS|invalid credentials/i.test(msg)) {
        setError(t("auth.login.emailOrPasswordWrong"))
        if (consumePendingUnconfirmed()) {
          setHint(t("auth.login.unconfirmedHint"))
        }
      } else {
        setError(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">{t("auth.login.title")}</CardTitle>
        <CardDescription>{t("auth.login.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
          {hint && <div className="rounded-md bg-muted p-3 text-sm">{hint}</div>}
          <div className="space-y-2">
            <Label htmlFor="email">{t("auth.login.email")}</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{t("auth.login.password")}</Label>
            <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? t("auth.login.signingIn") : t("auth.login.submit")}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          {t("auth.login.noAccount")}{" "}
          <Link to="/register" className="text-primary underline-offset-4 hover:underline">
            {t("auth.login.registerLink")}
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
