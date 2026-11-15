// L1 平台层：唯一接触 Index-Translate 上游
// 服务端发起（避免 412 浏览器直连），强制注入 enable_thinking=false + temperature=0。
import { HttpError } from "../contracts/httpError.ts";

const BASE = "https://index-translate.bilibili.com/v1";
const MODELS = ["Index-Translate-2B", "Index-Translate-9B", "Index-Translate-35B-A3B"];
const TIMEOUT_MS = 9000;
const WALL_CLOCK_MS = 30000; // Edge 40s 上限内留余量

const LANG_NAME: Record<string, string> = { zh: "中文", en: "英语" };

function instTrans(source: string, targetLang: string): string {
  return `请将以下文本翻译成${LANG_NAME[targetLang] ?? targetLang}，并且严格遵循所有约束要求。
〖源文〗
${source}
〖约束要求〗
1. 〖硬性要求〗保留换行、占位符、@提及、#标签与表情；不增删事实。
2. 〖注意〗译成真人聊天会说的话：短句为主，保留原句的随意、迟疑、吐槽和语气词；别补成完整书面句，别加客套或解释，不要翻译腔。
只输出译文，不要有任何额外说明。`;
}

function clean(text: string): string {
  const i = text.indexOf("</think>");
  return (i >= 0 ? text.slice(i + 8) : text).trim();
}

async function callModel(model: string, prompt: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "curl/8.5.0" },
      body: JSON.stringify({
        model,
        temperature: 0,
        chat_template_kwargs: { enable_thinking: false },
        messages: [{ role: "user", content: prompt }],
      }),
      signal: controller.signal,
    });
    if (res.status === 429 || res.status >= 500) return null; // 触发降级
    if (!res.ok) return null;
    const json = await res.json();
    const text = String(json?.choices?.[0]?.message?.content ?? "");
    const out = clean(text);
    return out || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function translate(text: string, targetLang: string): Promise<string> {
  const prompt = instTrans(text, targetLang);
  const start = Date.now();
  // 主路径用 2B（低延迟）；失败依次降级到 9B / 35B，总墙钟受限
  for (const model of MODELS) {
    if (Date.now() - start > WALL_CLOCK_MS) break;
    const out = await callModel(model, prompt);
    if (out) return out;
  }
  throw new HttpError("TRANSLATION_UNAVAILABLE", "translation service unavailable");
}
