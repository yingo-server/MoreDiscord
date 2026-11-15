// 语言检测（轻量启发式，仅用于判断"是否需要翻译"）
// 规则：出现 CJK 字符视为中文；出现拉丁字母视为拉丁语系。
const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/;
const LATIN = /[A-Za-z]/;

export type TextLang = "zh" | "latin" | "unknown";

export function detectTextLang(text: string): TextLang {
  const t = text.trim();
  if (!t) return "unknown";
  const cjk = CJK.test(t);
  const latin = LATIN.test(t);
  if (cjk && !latin) return "zh";
  if (latin && !cjk) return "latin";
  return "unknown";
}

/** 文本语言与目标界面语言不一致时，需要翻译 */
export function needsTranslation(text: string, uiLang: "zh" | "en"): boolean {
  const detected = detectTextLang(text);
  if (detected === "unknown") return false;
  const target = uiLang === "zh" ? "zh" : "latin";
  return detected !== target;
}
