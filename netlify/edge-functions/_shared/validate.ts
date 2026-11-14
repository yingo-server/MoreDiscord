// _shared/validate.ts —— 输入校验（规格 §7/§8/§9）
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
  if (content.length === 0) throw new HttpError("INVALID_INPUT", "content must not be empty");
  if (content.length > 4000) throw new HttpError("INVALID_INPUT", "content must be <= 4000 chars");
  return content;
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
  return raw as string[];
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
