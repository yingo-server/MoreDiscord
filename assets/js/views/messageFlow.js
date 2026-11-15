// messageFlow.js — 消息流：初始分页 + sync 增量、连续消息合并、日期分隔、悬停工具条
import * as store from '../store.js';
import { request } from '../api/client.js';
import { describeError } from '../api/errors.js';
import { start as pollerStart, stop as pollerStop, poke as pollerPoke } from '../api/poller.js';
import { renderMessage, mergeMessages, countUnread } from '../wasm/glue.js';
import { el } from '../util/dom.js';

let root = null;
let scrollBox = null;
const GROUP_WINDOW_MS = 5 * 60 * 1000;

export function mount(parent) {
  root = el('main', { class: 'message-flow' });
  root.innerHTML = `
    <header class="message-flow__header" id="flow-header"></header>
    <div class="message-flow__scroll" id="flow-scroll">
      <div class="message-flow__list" id="flow-list" role="log" aria-live="polite"></div>
    </div>
    <div class="message-flow__empty" id="flow-empty">选择左侧会话开始聊天</div>
  `;
  parent.appendChild(root);
  scrollBox = root.querySelector('#flow-scroll');
  scrollBox.addEventListener('scroll', onScroll);

  store.subscribe('activeId', onChannelSwitch);
  return root;
}

function onChannelSwitch(id) {
  const header = root.querySelector('#flow-header');
  const list = root.querySelector('#flow-list');
  const empty = root.querySelector('#flow-empty');
  list.textContent = '';
  root.classList.toggle('message-flow--empty', !id);
  if (!id) { pollerStop('sync'); header.textContent = ''; return; }

  // 会话名
  const conv = (store.get('conversations') || []).find((c) => c.id === id);
  const name = conv ? (conv.type === 'direct' ? (conv.peer?.display_name || conv.peer?.username) : conv.name) : '会话';
  header.textContent = name || '会话';

  loadInitial(id);
  pollerStart('sync', { intervalMs: 2000, fn: () => syncLoop(id) });
}

async function loadInitial(id) {
  const list = root.querySelector('#flow-list');
  try {
    const r = await request('messages', { params: { id }, query: { limit: 50 } });
    // 防竞态：用户已切走
    if (store.get('activeId') !== id) return;
    const detail = await request('conversation', { params: { id } }).catch(() => null);
    if (store.get('activeId') !== id) return;
    store.set({
      activeDetail: detail,
      messages: { ...store.get('messages'), [id]: { list: r.messages, nextBefore: r.next_before, loaded: true, archived: [] } },
      syncCursors: { ...store.get('syncCursors'), [id]: lastCursor(r.messages) },
    });
    renderAll(id);
    scrollToBottom();
    markRead(id, r.messages);
  } catch (err) {
    toastError(err);
    list.appendChild(el('div', { class: 'flow-error' }, '消息加载失败：' + (err.message || '未知错误')));
  }
}

function lastCursor(msgs) {
  if (!msgs || msgs.length === 0) return null;
  const last = msgs[msgs.length - 1];
  return btoa(`${last.created_at}|${last.id}`).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function syncLoop(id) {
  if (store.get('activeId') !== id) return;
  const cursor = (store.get('syncCursors') || {})[id];
  if (!cursor) return;
  try {
    const r = await request('messageSync', { params: { id }, query: { after: cursor, limit: 50 } });
    if (store.get('activeId') !== id) return;
    if (r.messages.length > 0) {
      const bucket = store.get('messages')[id] || { list: [], archived: [] };
      const merged = mergeMessages(bucket.list, r.messages);
      store.set({
        messages: { ...store.get('messages'), [id]: { ...bucket, list: merged } },
        syncCursors: { ...store.get('syncCursors'), [id]: r.next_cursor || cursor },
      });
      renderAll(id);
      scrollToBottom();
      markRead(id, merged);
    }
  } catch { /* poller 自带退避 */ }
}

async function markRead(id, msgs) {
  if (!msgs || msgs.length === 0) return;
  const last = msgs[msgs.length - 1];
  try { await request('markRead', { params: { id }, body: { last_read_at: last.created_at } }); } catch { /* 静默 */ }
}

function renderAll(id) {
  const bucket = store.get('messages')[id];
  const list = root.querySelector('#flow-list');
  if (!bucket || !list) return;
  list.textContent = '';
  let prev = null;
  for (const m of bucket.list) {
    if (needDateDivider(prev, m)) list.appendChild(dateDivider(m.created_at));
    list.appendChild(messageRow(m, prev));
    prev = m;
  }
}

function needDateDivider(prev, cur) {
  if (!prev) return true;
  const d1 = prev.created_at.slice(0, 10);
  const d2 = cur.created_at.slice(0, 10);
  return d1 !== d2;
}

function dateDivider(iso) {
  const d = new Date(iso);
  const label = `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`;
  return el('div', { class: 'flow-date-divider' }, el('span', {}, label));
}

function messageRow(m, prev) {
  const me = store.get('me');
  const mine = me && m.sender_id === me.id;
  const sameAuthor = prev && prev.sender_id === m.sender_id
    && (new Date(m.created_at) - new Date(prev.created_at)) < GROUP_WINDOW_MS
    && !needDateDivider(prev, m);
  const detail = store.get('activeDetail');
  const sender = detail?.members?.find((x) => x.user_id === m.sender_id);
  const displayName = sender?.display_name || sender?.username || '未知用户';

  const row = el('div', {
    class: 'flow-msg' + (mine ? ' flow-msg--mine' : '') + (sameAuthor ? ' flow-msg--same' : ''),
    'data-mid': m.id,
  });
  if (!sameAuthor) {
    const initial = (displayName[0] || '?').toUpperCase();
    row.appendChild(el('span', { class: 'flow-msg__avatar' }, initial));
  } else {
    row.appendChild(el('span', { class: 'flow-msg__avatar-spacer' }));
  }
  const body = el('div', { class: 'flow-msg__body' });
  if (!sameAuthor) {
    body.appendChild(el('div', { class: 'flow-msg__meta' }, [
      el('span', { class: 'flow-msg__author' }, displayName),
      el('time', { class: 'flow-msg__time', datetime: m.created_at }, fmtTime(m.created_at)),
    ]));
  }
  body.appendChild(el('div', { class: 'flow-msg__bubble' }, [
    el('span', { class: 'flow-msg__content' }, renderMessage(m.content)),
    mine ? hoverToolbar(m) : null,
  ]));
  row.appendChild(body);
  return row;
}

function hoverToolbar(m) {
  const bar = el('div', { class: 'flow-msg__toolbar' });
  const del = el('button', { class: 'icon-btn icon-btn--sm', title: '撤回（后端未提供删除端点，v1 为 UI 预留）' }, '🗑');
  bar.appendChild(del);
  return bar;
}

function fmtTime(iso) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function onScroll() {
  if (!scrollBox || scrollBox.scrollTop > 60) return;
  const id = store.get('activeId');
  if (!id) return;
  const bucket = store.get('messages')[id];
  if (!bucket || !bucket.nextBefore || bucket.loading) return;
  bucket.loading = true;
  request('messages', { params: { id }, query: { before: bucket.nextBefore, limit: 50 } })
    .then((r) => {
      const cur = store.get('messages')[id];
      const keepHeight = scrollBox.scrollHeight;
      store.set({
        messages: { ...store.get('messages'), [id]: { ...cur, list: [...r.messages, ...cur.list], nextBefore: r.next_before, loading: false } },
      });
      renderAll(id);
      scrollBox.scrollTop = scrollBox.scrollHeight - keepHeight;
    })
    .catch((e) => { bucket.loading = false; toastError(e); });
}

function scrollToBottom() {
  if (scrollBox) requestAnimationFrame(() => { scrollBox.scrollTop = scrollBox.scrollHeight; });
}

function toastError(err) {
  const d = describeError(err?.code);
  const t = document.createElement('div');
  t.className = 'snackbar';
  t.textContent = d.text;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}
