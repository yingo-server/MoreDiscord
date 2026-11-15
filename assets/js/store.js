// store.js — 微型 observable store（按 key 订阅）
const state = { ...initial() };
const subs = new Map(); // key -> Set<fn>
const subsAny = new Set();

function initial() {
  return {
    me: null,                    // {id,username,display_name,email}
    conversations: [],           // 列表（含 unread_count / last_at）
    activeId: null,              // 当前会话 id
    activeDetail: null,          // 当前会话详情（members 等）
    messages: {},                // id -> { list:[], nextBefore, loaded, archived:[] }
    syncCursors: {},             // convId -> next_cursor
    wasmReady: false,
    view: 'chat',                // chat | settings | auth
  };
}

export function get(key) {
  return key === undefined ? state : state[key];
}
/** set({ key: value }) → 返回被变更的 key 列表 */
export function set(patch) {
  const changed = [];
  for (const [k, v] of Object.entries(patch)) {
    if (state[k] !== v) { state[k] = v; changed.push(k); }
  }
  if (!changed.length) return changed;
  const anySet = subsAny;
  for (const k of changed) {
    const set = subs.get(k);
    if (set) for (const fn of [...set]) { try { fn(state[k], k); } catch (e) { console.error(e); } }
  }
  for (const fn of [...anySet]) { try { fn(state, changed); } catch (e) { console.error(e); } }
  return changed;
}
export function subscribe(key, fn) {
  if (key === '*') { subsAny.add(fn); return () => subsAny.delete(fn); }
  if (!subs.has(key)) subs.set(key, new Set());
  subs.get(key).add(fn);
  return () => subs.get(key).delete(fn);
}
export function reset() { set(initial()); }

// —— 会话/消息便捷操作（保持引用变更以触发订阅） ——
export function upsertConversation(conv) {
  const list = state.conversations.slice();
  const i = list.findIndex(c => c.id === conv.id);
  if (i >= 0) list[i] = { ...list[i], ...conv };
  else list.unshift(conv);
  set({ conversations: list });
}
export function removeConversation(id) {
  set({ conversations: state.conversations.filter(c => c.id !== id) });
}
export function patchConversation(id, patch) {
  const conv = state.conversations.find(c => c.id === id);
  if (conv) upsertConversation({ id, ...patch });
}

/** 追加/归并消息（按 id 去重，按 created_at,id 排序） */
export function mergeMessages(convId, incoming, opts = {}) {
  const cur = state.messages[convId] || { list: [], nextBefore: null, loaded: false, archived: [] };
  const seen = new Set(cur.list.map(m => m.id));
  const add = incoming.filter(m => !seen.has(m.id));
  const list = add.length
    ? [...cur.list, ...add].sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id < b.id ? -1 : 1))
    : cur.list;
  const next = {
    ...cur,
    list,
    nextBefore: opts.nextBefore !== undefined ? opts.nextBefore : cur.nextBefore,
    loaded: cur.loaded || opts.loaded || false,
  };
  set({ messages: { ...state.messages, [convId]: next } });
  return next;
}
export function setMessageState(convId, patch) {
  const cur = state.messages[convId] || { list: [], nextBefore: null, loaded: false, archived: [] };
  set({ messages: { ...state.messages, [convId]: { ...cur, ...patch } } });
}
