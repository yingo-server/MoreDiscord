// L1 平台层：功能开关（存 settings 表，进程内缓存）
// email_verification_required 默认 false —— 发信功能冻结，注册直接入。
import { get as dbGet } from "./db.ts";

const cache = new Map<string, { value: string; at: number }>();
const TTL_MS = 30_000;

export const DEFAULT_SETTINGS: Record<string, string> = {
  email_verification_required: "0",
};

export async function getSetting(key: string): Promise<string> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const row = await dbGet("SELECT value FROM settings WHERE key=?", [key]).catch(() => null);
  const value = row?.value ?? DEFAULT_SETTINGS[key] ?? "";
  cache.set(key, { value, at: Date.now() });
  return value;
}

/** 邮箱验证是否必须（发信冻结期间恒 false） */
export async function emailVerificationRequired(): Promise<boolean> {
  return (await getSetting("email_verification_required")) === "1";
}

export function clearSettingsCache(): void {
  cache.clear();
}
