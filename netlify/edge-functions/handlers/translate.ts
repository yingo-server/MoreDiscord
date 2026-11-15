// L3 应用层：消息翻译端点
import { ok, HttpError } from "../platform/response.ts";
import { translate as upstreamTranslate } from "../platform/indexTranslate.ts";
import type { Ctx } from "./types.ts";

const LANGS = new Set(["zh", "en"]);

export async function translate(ctx: Ctx): Promise<Response> {
  const text = ctx.body?.text;
  const targetLang = ctx.body?.target_lang;
  if (typeof text !== "string" || !text.trim()) {
    throw new HttpError("INVALID_INPUT", "text must be a non-empty string");
  }
  // 4000 字符口径与消息发送一致（Unicode 码点）
  if ([...text].length > 4000) {
    throw new HttpError("INVALID_INPUT", "text must be <= 4000 chars");
  }
  if (typeof targetLang !== "string" || !LANGS.has(targetLang)) {
    throw new HttpError("INVALID_INPUT", "target_lang must be zh or en");
  }
  const translation = await upstreamTranslate(text, targetLang);
  return ok({ translation, target_lang: targetLang });
}
