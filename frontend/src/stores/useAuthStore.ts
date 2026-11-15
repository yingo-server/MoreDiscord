import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { User } from "@/types/models"
import * as authApi from "@/api/auth"

interface AuthState {
  sessionToken: string | null
  user: User | null
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<User>
  signup: (email: string, password: string, username: string) => Promise<{ confirmationRequired: boolean }>
  logout: () => Promise<void>
  setSession: (token: string, user: User) => void
  fetchMe: () => Promise<void>
  clear: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      sessionToken: null,
      user: null,
      isAuthenticated: false,

      login: async (email, password) => {
        const res = await authApi.login({ email, password })
        set({ sessionToken: res.session_token, user: res.user, isAuthenticated: true })
        return res.user
      },

      signup: async (email, password, username) => {
        const res = await authApi.signup({ email, password, username })
        if (res.session_token) {
          set({ sessionToken: res.session_token, user: res.user, isAuthenticated: true })
        }
        return { confirmationRequired: res.confirmation_required }
      },

      logout: async () => {
        try {
          await authApi.logout()
        } catch {
          // best effort — the session is cleared locally regardless
        }
        get().clear()
      },

      setSession: (token, user) =>
        set({ sessionToken: token, user, isAuthenticated: true }),

      fetchMe: async () => {
        const token = get().sessionToken
        if (!token) return
        try {
          const me = await authApi.getMe()
          if (get().sessionToken === token) {
            set({ user: me, isAuthenticated: true })
          }
        } catch {
          // 401 handled globally in ApiClient; transient errors keep the session
        }
      },

      clear: () => set({ sessionToken: null, user: null, isAuthenticated: false }),
    }),
    {
      name: "yingo_auth",
      partialize: (state) => ({
        sessionToken: state.sessionToken,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)
