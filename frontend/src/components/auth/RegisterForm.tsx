import { useState } from "react"
import { useNavigate, Link } from "react-router"
import { useAuthStore } from "@/stores/useAuthStore"
import * as authApi from "@/api/auth"
import { markPendingUnconfirmed, t } from "@/i18n"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export function RegisterForm() {
  const navigate = useNavigate()
  const signup = useAuthStore((s) => s.signup)
  const setSession = useAuthStore((s) => s.setSession)
  const [email, setEmail] = useState("")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  // Task 3: "check your email" state after confirmation_required
  const [confirmEmail, setConfirmEmail] = useState<string | null>(null)
  const [token, setToken] = useState("")
  const [verifyPassword, setVerifyPassword] = useState("")
  const [info, setInfo] = useState("")
  const [verifying, setVerifying] = useState(false)
  const [resending, setResending] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")
    try {
      const { confirmationRequired } = await signup(email.trim(), password, username.trim())
      if (confirmationRequired) {
        markPendingUnconfirmed()
        setConfirmEmail(email.trim())
      } else {
        navigate("/", { replace: true })
      }
    } catch (err: unknown) {
      setError((err as Error)?.message || t("auth.register.failed"))
    } finally {
      setLoading(false)
    }
  }

  // ① verify with token from the email + password → POST /auth/verify
  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!confirmEmail) return
    setVerifying(true)
    setError("")
    try {
      const res = await authApi.verify({
        type: "signup",
        token: token.trim(),
        password: verifyPassword || password,
      })
      setSession(res.session_token, res.user)
      navigate("/", { replace: true })
    } catch (err: unknown) {
      setError((err as Error)?.message || t("auth.register.verifyFailed"))
      setVerifying(false)
    }
  }

  // ② resend via POST /auth/recover
  const handleResend = async () => {
    if (!confirmEmail) return
    setResending(true)
    setError("")
    setInfo("")
    try {
      await authApi.recover(confirmEmail)
      setInfo(t("auth.register.resendSent"))
    } catch (err: unknown) {
      setError((err as Error)?.message || t("auth.register.resendFailed"))
    } finally {
      setResending(false)
    }
  }

  if (confirmEmail) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">{t("auth.register.confirmTitle")}</CardTitle>
          <CardDescription>
            {t("auth.register.confirmSent", { email: confirmEmail })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && <div className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
          {info && <div className="mb-4 rounded-md bg-muted p-3 text-sm">{info}</div>}
          <form onSubmit={handleVerify} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="token">{t("auth.register.tokenLabel")}</Label>
              <Input id="token" required value={token} onChange={(e) => setToken(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="verify-password">{t("auth.register.confirmPassword")}</Label>
              <Input id="verify-password" type="password" value={verifyPassword} onChange={(e) => setVerifyPassword(e.target.value)} placeholder="••••••••" />
            </div>
            <Button type="submit" className="w-full" disabled={verifying}>
              {verifying ? t("auth.register.verifying") : t("auth.register.verify")}
            </Button>
          </form>
          <Button variant="outline" className="mt-2 w-full" onClick={handleResend} disabled={resending}>
            {t("auth.register.resend")}
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">{t("auth.register.title")}</CardTitle>
        <CardDescription>{t("auth.register.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
          <div className="space-y-2">
            <Label htmlFor="email">{t("auth.register.email")}</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="username">{t("auth.register.username")}</Label>
            <Input id="username" required value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" />
            <p className="text-xs text-muted-foreground">{t("auth.register.usernameHint")}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{t("auth.register.password")}</Label>
            <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? t("auth.register.creating") : t("auth.register.submit")}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          {t("auth.register.haveAccount")}{" "}
          <Link to="/login" className="text-primary underline-offset-4 hover:underline">
            {t("auth.register.loginLink")}
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
