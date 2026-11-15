// util/format.js — 消息格式化（默认 JS 实现，wasm glue 可替换 renderMessage）

const EMOJI = ['😀', '😂', '🤣', '😊', '😍', '🥰', '😎', '🤔', '😴', '😭', '😡', '👍', '👎', '🙏', '👏', '💪', '🔥', '❤️', '🎉', '✨', '⭐', '🌟', '🚀', '💯', '🍵', '☕', '🍜', '🍕', '🐱', '🐶', '🌙', '☀️', '🌈', '⚡', '🎮', '🎵', '📷', '✅', '❌', '❓'];

export const emojiList = EMOJI;

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * 消息渲染：HTML 转义 + ```代码块``` + `行内代码` + **粗体** + @mention 高亮。
 * 返回 HTML 字符串（调用方用 innerHTML 挂载；内容已转义）。
 */
export function renderMessage(content) {
  if (!content) return '';
  // 按代码块切分
  const parts = content.split(/```/);
  let out = '';
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1) {
      const code = parts[i].replace(/^\w*\n/, '');
      out += `<code class="block-code">${escapeHtml(code)}</code>`;
    } else {
      let seg = escapeHtml(parts[i]);
      // 行内代码
      seg = seg.replace(/`([^`\n]+)`/g, '<span class="inline-code">$1</span>');
      // 粗体
      seg = seg.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
      // @mention（@ + 字母数字下划线/中文 2-24）
      seg = seg.replace(/(^|[\s(])@([\w\u4e00-\u9fa5]{1,24})/g,
        '$1<span class="mention">@$2</span>');
      out += seg;
    }
  }
  return out;
}

/** 从消息中抽取 mention 用户名列表 */
export function parseMentions(content) {
  const m = content.match(/@([\w\u4e00-\u9fa5]{1,24})/g) || [];
  return m.map(s => s.slice(1));
}
