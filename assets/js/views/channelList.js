// channelList.js — 会话列表：GET /conversations 渲染、新建私聊/群组 dialog、点击切换 #/c/:id
import * as store from '../store.js';
import { request, on } from '../api/client.js';
import { describeError } from '../api/errors.js';
import { renderMessage } from '../wasm/glue.js';
import { el } from '../util/dom.js';

let root = null;

export function mount(parent) {
  root = el('aside', { class: 'channel-list' });
  root.innerHTML = `
    <header class="channel-list__header">
      <h2 class="channel-list__title">会话</h2>
      <div class="channel-list__actions">
        <button class="icon-btn" id="btn-new-direct" title="发起私聊" aria-label="发起私聊">
          <svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M21 6h-2V4a1 1 0 0 0-2 0v2h-2a1 1 0 0 0 0 2h2v2a1 1 0 0 0 2 0V8h2a1 1 0 0 0 0-2zM9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-3.3 0-8 1.7-8 5v1a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-1c0-3.3-4.7-5-8-5z"/></svg>
        </button>
        <button class="icon-btn" id="btn-new-group" title="创建群组" aria-label="创建群组">
          <svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm-8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm0 2c-2.3 0-7 1.2-7 3.5V19a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5c0-2.3-4.7-3.5-7-3.5zm8 0c-.3 0-.6 0-1 .1 1.2.9 2 2 2 3.4V19h6a1 1 0 0 0 1-1v-2.5c0-2.3-4.7-3.5-8-3.5z"/></svg>
        </button>
      </div>
    </header>
    <div class="channel-list__scroll" id="channel-items" role="list"></div>
  `;
  parent.appendChild(root);

  root.querySelector('#btn-new-direct').addEventListener('click', () => newDirectDialog());
  root.querySelector('#btn-new-group').addEventListener('click', () => newGroupDialog());

  store.subscribe('conversations', render);
  store.subscribe('activeId', render);
  on('conversations:refresh', () => loadConversations());
  loadConversations();
  return root;
}

export async function loadConversations() {
  try {
    const list = await request('conversations');
    store.set({ conversations: list });
  } catch (err) {
    if (err.code !== 'UNAUTHORIZED') toastError(err);
  }
}

function render(list) {
  const wrap = root.querySelector('#channel-items');
  if (!wrap) return;
  wrap.textContent = '';
  const activeId = store.get('activeId');
  if (!list || list.length === 0) {
    wrap.appendChild(el('div', { class: 'channel-list__empty' }, '还没有会话——发起一段私聊，或创建一个群组。'));
    return;
  }
  for (const c of list) {
    const name = c.type === 'direct' ? (c.peer?.display_name || c.peer?.username || '未知用户') : (c.name || '未命名群组');
    const initial = (name[0] || '?').toUpperCase();
    const unread = Number(c.unread_count) || 0;
    const item = el('button', {
      class: 'channel-item' + (c.id === activeId ? ' channel-item--active' : ''),
      role: 'listitem',
    }, [
      el('span', { class: 'channel-item__avatar' + (c.type === 'group' ? ' channel-item__avatar--group' : '') }, c.type === 'group' ? '#' : initial),
      el('span', { class: 'channel-item__body' }, [
        el('span', { class: 'channel-item__name' }, name),
        el('span', { class: 'channel-item__preview' }, c.last_message ? renderMessage(c.last_message) : '（暂无消息）'),
      ]),
      unread > 0 ? el('span', { class: 'channel-item__badge' }, unread > 99 ? '99+' : String(unread)) : null,
    ]);
    item.dataset.id = c.id;
    item.addEventListener('click', () => {
      store.set({ activeId: c.id });
      location.hash = `#/c/${c.id}`;
    });
    wrap.appendChild(item);
  }
}

function dialogShell(title, bodyNodes) {
  const backdrop = el('div', { class: 'dialog-backdrop' });
  const dialog = el('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true' }, [
    el('h3', { class: 'dialog__title' }, title),
    ...bodyNodes,
  ]);
  backdrop.appendChild(dialog);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });
  document.body.appendChild(backdrop);
  return { backdrop, dialog };
}

function errText(dialog, err) {
  const box = dialog.querySelector('.dialog__error');
  if (box) { box.textContent = err.message || '操作失败'; box.hidden = false; }
}

function newDirectDialog() {
  const input = el('input', { class: 'text-field', placeholder: '输入对方用户名（3-32 位小写字母/数字/_/-）', id: 'direct-user' });
  const error = el('p', { class: 'dialog__error', hidden: true });
  const { backdrop, dialog } = dialogShell('发起私聊', [
    el('label', { class: 'field-label', for: 'direct-user' }, '对方用户名'),
    input,
    error,
    el('div', { class: 'dialog__actions' }, [
      el('button', { class: 'btn btn--text', id: 'd-cancel' }, '取消'),
      el('button', { class: 'btn btn--filled', id: 'd-ok' }, '发起'),
    ]),
  ]);
  dialog.querySelector('#d-cancel').addEventListener('click', () => backdrop.remove());
  dialog.querySelector('#d-ok').addEventListener('click', async () => {
    const username = input.value.trim().toLowerCase();
    if (!username) { error.textContent = '请输入用户名'; error.hidden = false; return; }
    const btn = dialog.querySelector('#d-ok');
    btn.disabled = true;
    try {
      // 通过 admin 用户搜索或直接以用户名为 id 的场景都不可行——后端 direct 需要 targetUserId。
      // v1：先尝试 admin 端点解析（管理员），失败则提示。
      let targetId = null;
      try {
        const r = await request('adminListUsers', { query: { search: username } });
        const hit = r.users.find((u) => u.username === username);
        if (hit) targetId = hit.id;
      } catch { /* 非 admin 走 fallback */ }
      if (!targetId) throw Object.assign(new Error('暂无法通过用户名定位用户：请让管理员开通用户搜索，或使用完整用户 ID。'), { code: 'INVALID_INPUT' });
      const r = await request('createDirect', { body: { targetUserId: targetId } });
      backdrop.remove();
      await loadConversations();
      location.hash = `#/c/${r.id}`;
    } catch (e) { errText(dialog, e); btn.disabled = false; }
  });
  input.focus();
}

function newGroupDialog() {
  const name = el('input', { class: 'text-field', placeholder: '群组名称（1-64 字）', id: 'group-name' });
  const members = el('input', { class: 'text-field', placeholder: '成员 userId，逗号分隔（≤9 人，可留空）', id: 'group-members' });
  const error = el('p', { class: 'dialog__error', hidden: true });
  const { backdrop, dialog } = dialogShell('创建群组', [
    el('label', { class: 'field-label', for: 'group-name' }, '群组名称'),
    name,
    el('label', { class: 'field-label', for: 'group-members' }, '初始成员'),
    members,
    error,
    el('div', { class: 'dialog__actions' }, [
      el('button', { class: 'btn btn--text', id: 'g-cancel' }, '取消'),
      el('button', { class: 'btn btn--filled', id: 'g-ok' }, '创建'),
    ]),
  ]);
  dialog.querySelector('#g-cancel').addEventListener('click', () => backdrop.remove());
  dialog.querySelector('#g-ok').addEventListener('click', async () => {
    const btn = dialog.querySelector('#g-ok');
    btn.disabled = true;
    try {
      const memberIds = members.value.split(',').map((s) => s.trim()).filter(Boolean);
      const r = await request('createGroup', { body: { name: name.value.trim(), memberIds } });
      backdrop.remove();
      await loadConversations();
      location.hash = `#/c/${r.id}`;
    } catch (e) { errText(dialog, e); btn.disabled = false; }
  });
  name.focus();
}

function toastError(err) {
  const d = describeError(err?.code);
  const t = document.createElement('div');
  t.className = 'snackbar';
  t.textContent = d.text;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}
