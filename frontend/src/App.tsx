import { useEffect } from "react"
import { BrowserRouter, Routes, Route, Navigate } from "react-router"
import { ThemeProvider } from "next-themes"
import { AuthGuard } from "@/components/auth/AuthGuard"
import { AppShell } from "@/components/layout/AppShell"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ErrorBoundary } from "@/components/shared/ErrorBoundary"
import { ToastProvider, useToast } from "@/components/ui/toast"
import { useAuthStore } from "@/stores/useAuthStore"
import { useMessageNotify } from "@/hooks/useMessageNotify"
import { usePolling } from "@/hooks/usePolling"
import LoginPage from "@/pages/LoginPage"
import RegisterPage from "@/pages/RegisterPage"
import ChatPage from "@/pages/ChatPage"
import ProfilePage from "@/pages/ProfilePage"
import AdminPage from "@/pages/AdminPage"

function AppInit() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const user = useAuthStore((s) => s.user)
  const fetchMe = useAuthStore((s) => s.fetchMe)

  usePolling(isAuthenticated)

  useEffect(() => {
    if (isAuthenticated && !user) fetchMe()
  }, [isAuthenticated, user, fetchMe])

  return null
}

function ToastListener() {
  const { addToast } = useToast()
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.message && detail?.type) {
        addToast(detail.message, detail.type)
      }
    }
    window.addEventListener("yingo:toast", handler)
    return () => window.removeEventListener("yingo:toast", handler)
  }, [addToast])
  return null
}

function LogoutListener() {
  useEffect(() => {
    const handler = () => {
      useAuthStore.getState().clear()
    }
    window.addEventListener("yingo:logout", handler)
    return () => window.removeEventListener("yingo:logout", handler)
  }, [])
  return null
}

export default function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <TooltipProvider>
        <ToastProvider>
          <ToastListener />
          <LogoutListener />
          <BrowserRouter>
            <AppInit />
            <ErrorBoundary>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route
                  path="/"
                  element={
                    <AuthGuard>
                      <AppShell />
                    </AuthGuard>
                  }
                >
                  <Route index element={<ChatPage />} />
                  <Route path="chat/:convId" element={<ChatPage />} />
                  <Route path="profile" element={<ProfilePage />} />
                  <Route path="admin" element={<AdminPage />} />
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </ErrorBoundary>
          </BrowserRouter>
        </ToastProvider>
      </TooltipProvider>
    </ThemeProvider>
  )
}
