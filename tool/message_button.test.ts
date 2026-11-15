// 渲染级测试：不满足条件时，翻译按钮不出现在 DOM 里
// 运行：在 frontend/ 下 npx vite-node（或 deno + npm 链接）。此处用 node + tsx 由 CI 的 node 环境执行。
// 为避免依赖问题，本测试用「提取渲染逻辑」的方式：直接断言 needsTranslation 的返回值
// 决定 JSX 条件分支 —— 与组件内 canTranslate 表达式完全一致。
import { needsTranslation } from "../frontend/src/lib/lang.ts";

interface Case {
  name: string;
  isOwn: boolean;
  content: string;
  uiLang: "zh" | "en";
  expectButton: boolean;
}

const CASES: Case[] = [
  { name: "own message, foreign text", isOwn: true, content: "hello there my friend", uiLang: "zh", expectButton: false },
  { name: "own message, same language", isOwn: true, content: "你好世界", uiLang: "zh", expectButton: false },
  { name: "others, same language", isOwn: false, content: "你好世界今天不错", uiLang: "zh", expectButton: false },
  { name: "others, foreign language", isOwn: false, content: "hello there my friend", uiLang: "zh", expectButton: true },
  { name: "others, mostly foreign in zh UI", isOwn: false, content: "hello hi hey ok you", uiLang: "zh", expectButton: true },
  { name: "others, mostly native with one foreign word in zh UI", isOwn: false, content: "今天天气很好我们出去走走吧 ok", uiLang: "zh", expectButton: false },
  { name: "others, mostly foreign with one native word in zh UI", isOwn: false, content: "hello hi hey ok you 好", uiLang: "zh", expectButton: true },
  { name: "others, unknown lang (digits)", isOwn: false, content: "123 !!! ???", uiLang: "zh", expectButton: false },
  { name: "others, empty message", isOwn: false, content: "   ", uiLang: "zh", expectButton: false },
  { name: "others, foreign in en UI", isOwn: false, content: "你好世界大家好朋友", uiLang: "en", expectButton: true },
  { name: "others, same in en UI", isOwn: false, content: "hello there my friend", uiLang: "en", expectButton: false },
];

// 组件内的精确表达式（与 MessageItem.tsx 的 canTranslate 一致）
function canTranslate(c: Case): boolean {
  return !c.isOwn && needsTranslation(c.content, c.uiLang);
}

let fail = 0;
for (const c of CASES) {
  const got = canTranslate(c);
  if (got !== c.expectButton) {
    fail++;
    console.log(`FAIL ${c.name}: expected button=${c.expectButton}, got ${got}`);
  }
}
console.log(fail === 0 ? `all ${CASES.length} cases: button visibility correct` : `${fail} failures`);
Deno.exit(fail ? 1 : 0);
