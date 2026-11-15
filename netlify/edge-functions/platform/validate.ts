// validate.ts —— 输入校验（规格 §7/§8/§9）
import { HttpError } from "./response.ts";

const USERNAME_RE = /^[a-z0-9_-]{3,32}$/;

export function validateUsername(raw: unknown): string {
  if (typeof raw !== "string") throw new HttpError("USERNAME_INVALID", "username must be a string");
  const u = raw.toLowerCase();
  if (!USERNAME_RE.test(u)) {
    throw new HttpError("USERNAME_INVALID", "username must be 3-32 chars of [a-z0-9_-]");
  }
  return u;
}

export function validateGroupName(raw: unknown): string {
  if (typeof raw !== "string") throw new HttpError("NAME_INVALID", "name must be a string");
  const name = raw.trim();
  if (name.length < 1 || name.length > 64) {
    throw new HttpError("NAME_INVALID", "name must be 1-64 chars");
  }
  return name;
}

export function validateMessageContent(raw: unknown): string {
  if (typeof raw !== "string") throw new HttpError("INVALID_INPUT", "content must be a string");
  const content = raw.trim();
  // 4000 上限统一按 Unicode 码点数计（与 SQLite length() 口径一致，见 schema.sql CHECK）
  const cps = [...content].length;
  if (cps === 0) throw new HttpError("INVALID_INPUT", "content must not be empty");
  if (cps > 4000) throw new HttpError("INVALID_INPUT", "content must be <= 4000 chars");
  return content;
}

/** display_name 统一校验（user.ts / admin.ts 共用）：trim、空串→null、≤64 码点（B4/B6） */
export function validateDisplayName(raw: unknown): string | null {
  if (raw === null) return null;
  if (typeof raw !== "string") {
    throw new HttpError("INVALID_INPUT", "display_name must be a string or null");
  }
  const dn = raw.trim();
  if (dn.length === 0) return null; // 空串统一存 NULL，与 SQL COALESCE 口径一致
  if ([...dn].length > 64) {
    throw new HttpError("INVALID_INPUT", "display_name must be <= 64 chars");
  }
  return dn;
}

export function requireString(body: Record<string, any>, field: string): string {
  const v = body[field];
  if (typeof v !== "string" || v.length === 0) {
    throw new HttpError("INVALID_INPUT", `missing field: ${field}`);
  }
  return v;
}

export function requireEmail(body: Record<string, any>): string {
  const v = requireString(body, "email");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
    throw new HttpError("INVALID_INPUT", "invalid email");
  }
  return v;
}

export function strArray(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.some((x) => typeof x !== "string")) {
    throw new HttpError("INVALID_INPUT", "expected array of string ids");
  }
  // 去重前先限长，防止超大数组耗尽 CPU（B11）
  if (raw.length > 64) {
    throw new HttpError("INVALID_INPUT", "array too long (max 64 items)");
  }
  return raw as string[];
}

/** 复合游标 Base64URL 编解码（业务 messages.ts 与 admin 共用，B8） */
export function encodeCursor(created_at: string, id: string): string {
  return btoa(`${created_at}|${id}`).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** 解码失败（非法 base64 或缺 '|' 分隔符）一律抛 INVALID_INPUT，不静默退化（B9） */
export function decodeCursor(cursor: string | null): [string, string] | null {
  if (!cursor) return null;
  let raw: string;
  try {
    const b64 = cursor.replace(/-/g, "+").replace(/_/g, "/");
    raw = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  } catch {
    throw new HttpError("INVALID_INPUT", "invalid cursor");
  }
  const idx = raw.indexOf("|");
  if (idx < 0) throw new HttpError("INVALID_INPUT", "invalid cursor: missing '|' separator");
  return [raw.slice(0, idx), raw.slice(idx + 1)];
}

export function newId(): string {
  return crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}
