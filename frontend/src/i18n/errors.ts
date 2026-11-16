// 错误码 → 文案键（前端唯一映射点；服务端只回 code，不回文案）
import { t } from "./index"

const CODE_TO_KEY: Record<string, string> = {
  INVALID_INPUT: "err.INVALID_INPUT",
  USERNAME_INVALID: "err.USERNAME_INVALID",
  NAME_INVALID: "err.NAME_INVALID",
  GROUP_FULL: "err.GROUP_FULL",
  NOT_A_GROUP: "err.NOT_A_GROUP",
  CANNOT_REMOVE_OWNER: "err.CANNOT_REMOVE_OWNER",
  OWNER_MUST_TRANSFER_OR_DELETE: "err.OWNER_MUST_TRANSFER_OR_DELETE",
  UNAUTHORIZED: "err.UNAUTHORIZED",
  INVALID_CREDENTIALS: "err.INVALID_CREDENTIALS",
  FORBIDDEN: "err.FORBIDDEN",
  EMAIL_NOT_CONFIRMED: "err.EMAIL_NOT_CONFIRMED",
  USER_NOT_FOUND: "err.USER_NOT_FOUND",
  NOT_A_MEMBER: "err.NOT_A_MEMBER",
  USERNAME_TAKEN: "err.USERNAME_TAKEN",
  EMAIL_EXISTS: "err.EMAIL_EXISTS",
  ALREADY_MEMBER: "err.ALREADY_MEMBER",
  EMAIL_TAKEN: "err.EMAIL_EXISTS",
  TRANSLATION_UNAVAILABLE: "err.TRANSLATION_UNAVAILABLE",
  NETWORK: "err.NETWORK",
  TIMEOUT: "err.TIMEOUT",
}

/** 按错误码取本地化文案；未知码回落到 err.generic */
export function errorText(code?: string | null, fallback?: string): string {
  if (!code) return fallback ?? t("err.generic")
  const key = CODE_TO_KEY[code]
  if (!key) return fallback ?? t("err.generic")
  return t(key)
}
