import { analyzeText, needsTranslation, FOREIGN_THRESHOLD } from "../frontend/src/lib/lang.ts";

Deno.test("纯本族语言不需翻译", () => {
  if (needsTranslation("你好世界，今天天气不错", "zh")) throw new Error("中文界面不应翻译中文");
  if (needsTranslation("hello there, how are you", "en")) throw new Error("英文界面不应翻译英文");
});

Deno.test("纯陌生语言需翻译", () => {
  if (!needsTranslation("hello there, how are you doing today", "zh")) throw new Error("中文界面应翻译英文");
  if (!needsTranslation("你好世界，今天天气不错啊", "en")) throw new Error("英文界面应翻译中文");
});

Deno.test("混合文本按占比判定", () => {
  // 英文为主 + 一个汉字：2/8 陌生 < 35% → 不译
  if (needsTranslation("hello hi hey ok you 好", "en")) throw new Error("英文为主不应翻译");
  // 中文为主 + 一个英文词：陌生占比低 → 不译
  if (needsTranslation("你好世界这个很好 ok", "zh")) throw new Error("中文为主不应翻译");
  // 英文为主但汉字很多 → 需译
  if (!needsTranslation("hello 世界 大家 好 朋友 今天", "en")) throw new Error("陌生占比高应翻译");
});

Deno.test("中性字符不计入分母", () => {
  const r = analyzeText("123 !@# ok", "en");
  if (r.foreign !== 0) throw new Error("数字标点不应算陌生");
  if (r.native !== 2) throw new Error("ok 两个字母应算本族");
  if (r.ratio !== 0) throw new Error("ratio 应为 0");
});

Deno.test("空白与符号不触发", () => {
  if (needsTranslation("   ", "zh")) throw new Error("空白不应翻译");
  if (needsTranslation("123456", "zh")) throw new Error("数字不应翻译");
  if (needsTranslation("!!! ??? ...", "en")) throw new Error("符号不应翻译");
});

Deno.test("阈值边界 35%", () => {
  // 20 个拉丁 + 11 个汉字 = 11/31 = 35.5% ≥ 35% → 需译
  const s = "a".repeat(20) + "中".repeat(11);
  if (!needsTranslation(s, "en")) throw new Error("35.5% 应触发");
  // 20 + 10 = 33.3% < 35% → 不译
  const s2 = "a".repeat(20) + "中".repeat(10);
  if (needsTranslation(s2, "en")) throw new Error("33.3% 不应触发");
  if (FOREIGN_THRESHOLD !== 0.35) throw new Error("阈值应为 35%");
});
