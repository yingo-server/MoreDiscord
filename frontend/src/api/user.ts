import { api } from "./client"
import type { User } from "@/types/api"

export function searchUsers(search: string): Promise<{ users: User[] }> {
  const q = new URLSearchParams({ search })
  return api.get(`/users?${q}`)
}

export async function updateUsername(username: string): Promise<void> {
  await api.patch("/user/username", { username })
}

export async function updateProfile(display_name: string): Promise<void> {
  await api.patch("/user/profile", { display_name })
}

export type { User }
