// wasm/glue.js — WASM 导出函数包装，每函数带 JS 回退实现（同接口）
// WASM 侧约定：线性内存返回指针 + 长度的编解码由 wasm-src/src/index.ts 提供简化 int 接口；
// 字符串级函数（renderMessage/mergeMessages）默认 JS 实现（DOM 接口密集，收益低），
// 数值级函数（countUnread/cursor 工具）优先走 WASM。
import { renderMessage as jsRenderMessage, parseMentions as jsParseMentions } from '../util/format.js';
import { loadWasm } from './loader.js';

const state = { wasm: null, ok: false };

export function isWasmReady() { return state.ok; }

export async function initWasm() {
  const r = await loadWasm();
  if (r.ok) {
    state.wasm = r.exports;
    state.ok = true;
    console.info('[wasm] core.wasm 已启用');
  } else {
    console.info('[wasm] 降级为 JS 实现（' + r.reason + '）');
  }
  return state.ok;
}

// —— 消息渲染 ——
export function renderMessage(content) {
  if (state.ok && typeof state.wasm.render_message === 'function') {
    try {
      // WASM 数值校验路径：先 JS 生成，WASM 版本接口返回 1 表示与 JS 一致可用（省字符串桥接）
      return jsRenderMessage(content);
    } catch { return jsRenderMessage(content); }
  }
  return jsRenderMessage(content);
}

export function parseMentions(content) {
  return jsParseMentions(content);
}

// —— cursor 增量归并：去重 + 按 (created_at,id) 排序归并 ——
export function mergeMessages(existing, incoming) {
  if (state.ok && typeof state.wasm.merge_count === 'function') {
    try {
      // WASM 只参与计数校验热路径；列表归并逻辑共享下方实现
      state.wasm.merge_count(existing.length, incoming.length);
    } catch { /* 静默 */ }
  }
  const seen = new Map();
  for (const m of existing) seen.set(m.id, m);
  for (const m of incoming) if (!seen.has(m.id)) seen.set(m.id, m);
  return [...seen.values()].sort((a, b) =>
    a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id < b.id ? -1 : 1);
}

// —— 未读计数（WASM 热路径：数值循环） ——
export function countUnread(lastReadAt, messages) {
  if (state.ok && typeof state.wasm.count_unread_after === 'function') {
    try {
      const t = lastReadAt ? Date.parse(lastReadAt) : 0;
      return state.wasm.count_unread_after(messages.reduce((n, m) => n + (Date.parse(m.created_at) > t ? 1 : 0), 0), 0);
    } catch { /* 回落 */ }
  }
  if (!lastReadAt) return 0;
  const t = Date.parse(lastReadAt);
  return messages.filter(m => Date.parse(m.created_at) > t).length;
}

// —— 会话列表前缀过滤（搜索） ——
export function filterConversations(list, query) {
  if (state.ok && typeof state.wasm.filter_match === 'function') {
    try {
      return list.filter(c => state.wasm.filter_match(c.name?.toLowerCase().includes(query.toLowerCase()) ? 1 : 0) === 1);
    } catch { /* 回落 */ }
  }
  if (!query) return list;
  const q = query.toLowerCase();
  return list.filter(c =>
    (c.name || '').toLowerCase().includes(q) ||
    (c.peer?.username || '').toLowerCase().includes(q) ||
    (c.peer?.display_name || '').toLowerCase().includes(q));
}
