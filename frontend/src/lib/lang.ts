// 语言判定：按字符占比
// 目标语言 = 界面语言；统计其中"陌生字符"占比，达到阈值即视为跨语言消息。
// 中性字符（数字、标点、空白、链接、@提及）不计入分母。
export const FOREIGN_THRESHOLD = 0.35;

const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/;
const LATIN = /[A-Za-z]/;

export type UiLang = "zh" | "en";

export interface LangRatio {
  native: number;
  foreign: number;
  ratio: number; // 陌生字符占比，0~1
}

export function analyzeText(text: string, uiLang: UiLang): LangRatio {
  const chars = [...text.trim()].filter((c) => !/\s/.test(c));
  const isNative = uiLang === "zh" ? CJK : LATIN;
  const isForeign = uiLang === "zh" ? LATIN : CJK;
  let native = 0;
  let foreign = 0;
  for (const c of chars) {
    if (isNative.test(c)) native++;
    else if (isForeign.test(c)) foreign++;
  }
  const total = native + foreign;
  return { native, foreign, ratio: total === 0 ? 0 : foreign / total };
}

/** 陌生字符占比达阈值 → 需要翻译 */
export function needsTranslation(text: string, uiLang: UiLang): boolean {
  if (!text.trim()) return false;
  const { native, foreign, ratio } = analyzeText(text, uiLang);
  if (native + foreign === 0) return false;
  return ratio >= FOREIGN_THRESHOLD;
}
