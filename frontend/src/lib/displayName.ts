/**
 * Discord-style display name disambiguation.
 * Backend contract (for reference): `tag` is computed server-side on read —
 * users sharing the same display_name are ordered by created_at, the first
 * (unique holder) gets tag = 1, subsequent ones 2, 3, ... It is NOT persisted.
 * tag = 1 or missing → no suffix; tag >= 2 → "name#tag".
 */
export interface DisplayableUser {
  username: string
  display_name?: string | null
  tag?: number | null
}

export function formatDisplayName(user: DisplayableUser | null | undefined): string {
  if (!user) return ""
  const base = user.display_name || user.username
  if (!user.tag || user.tag <= 1) return base
  return `${base}#${user.tag}`
}
