// adminPanel.js — 管理面板 v1：MD3 tabs（概览/会话/审计），走 /admin/* 端点
import * as store from '../store.js';
import { request } from '../../api/client.js';
import { describeError } from '../../api/errors.js';
import { el } from '../../util/dom.js';

let root = null;
let activeTab = 'overview';

export function mount(parent) {
  root = el('section', { class: 'admin-page' });
  parent.appendChild(root);
  store.subscribe('me', render);
  render(store.get('me'));
  return root;
}

async function render(me) {
  if (!me) return;
  if (Number(me.admin) !== 1) {
    root.textContent = '';
    root.appendChild(el('div', { class: 'admin-denied' }, '此区域需要管理员权限。'));
    return;
  }
  root.textContent = '';

  const tabs = el('div', { class: 'md3-tabs', role: 'tablist' }, [
    tabBtn('overview', '概览'),
    tabBtn('channels', '会话'),
    tabBtn('audit', '审计日志'),
  ]);
  const body = el('div', { class: 'admin-page__body', id: 'admin-body' });
  root.appendChild(tabs);
  root.appendChild(body);
  renderTab(activeTab, body);
}

function tabBtn(name, label) {
  const b = el('button', { class: 'md3-tab' + (activeTab === name ? ' md3-tab--active' : ''), role: 'tab', 'data-tab': name }, label);
  b.addEventListener('click', () => {
    activeTab = name;
    root.querySelectorAll('.md3-tab').forEach((x) => x.classList.toggle('md3-tab--active', x.dataset.tab === name));
    renderTab(name, root.querySelector('#admin-body'));
  });
  return b;
}

function renderTab(name, body) {
  body.textContent = '';
  if (name === 'overview') renderOverview(body);
  else if (name === 'channels') renderChannels(body);
  else renderAuditLog(body);
}

// —— 概览 ——
async function renderOverview(body) {
  body.appendChild(loading());
  try {
    const stats = await request('adminStats');
    body.textContent = '';
    body.appendChild(el('div', { class: 'admin-stats' }, [
      statCard('用户总数', stats.users),
      statCard('会话总数', stats.conversations),
      statCard('群组数', stats.groups),
      statCard('消息总数', stats.messages),
      statCard('管理员数', stats.admins),
    ]));
  } catch (err) {
    body.textContent = '';
    body.appendChild(errorBox(err));
  }
}

function statCard(label, value) {
  return el('div', { class: 'admin-stat-card' }, [
    el('span', { class: 'admin-stat-card__value' }, String(value)),
    el('span', { class: 'admin-stat-card__label' }, label),
  ]);
}

// —— 会话管理 ——
async function renderChannels(body) {
  body.appendChild(loading());
  try {
    const r = await request('adminListChannels', { query: { limit: 50 } });
    body.textContent = '';
    if (!r.channels.length) { body.appendChild(el('p', { class: 'admin-empty' }, '暂无会话')); return; }
    const table = el('div', { class: 'admin-table', role: 'table' }, [
      el('div', { class: 'admin-table__head' }, ['类型', '名称', '成员数', '创建时间', '操作'].map((h) => el('span', { class: 'admin-table__th' }, h))),
    ]);
    for (const c of r.channels) {
      const row = el('div', { class: 'admin-table__row' }, [
        el('span', {}, c.type === 'group' ? '群组' : '私聊'),
        el('span', {}, c.name || '（私聊）'),
        el('span', {}, String(c.member_count)),
        el('span', {}, (c.created_at || '').slice(0, 10)),
        el('span', {}, [
          el('button', { class: 'btn btn--text btn--sm', 'data-act': 'audit', 'data-id': c.id }, '审计'),
          el('button', { class: 'btn btn--text btn--sm btn--danger-text', 'data-act': 'delete', 'data-id': c.id }, '解散'),
        ]),
      ]);
      table.appendChild(row);
    }
    body.appendChild(table);
    if (r.next_cursor) {
      const more = el('button', { class: 'btn btn--text' }, '加载更多');
      more.addEventListener('click', () => { void more; /* v1 单页，分页由滚动加载增强 */ });
      body.appendChild(more);
    }
    table.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const id = btn.dataset.id;
      if (btn.dataset.act === 'delete') {
        if (!confirm('解散该会话？消息将保留但所有成员失去访问。')) return;
        try {
          await request('adminDeleteChannel', { params: { id } });
          toast('已解散');
          renderChannels(body);
        } catch (err) { toastError(err); }
      } else if (btn.dataset.act === 'audit') {
        openAuditDialog(id);
      }
    });
  } catch (err) {
    body.textContent = '';
    body.appendChild(errorBox(err));
  }
}

function openAuditDialog(channelId) {
  const backdrop = el('div', { class: 'dialog-backdrop' });
  const list = el('div', { class: 'audit-list' }, loading());
  const dialog = el('div', { class: 'dialog dialog--wide', role: 'dialog', 'aria-modal': 'true' }, [
    el('h3', { class: 'dialog__title' }, `消息审计（${channelId.slice(0, 8)}…）`),
    list,
    el('div', { class: 'dialog__actions' }, [
      el('button', { class: 'btn btn--text', id: 'a-close' }, '关闭'),
    ]),
  ]);
  backdrop.appendChild(dialog);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });
  document.body.appendChild(backdrop);
  dialog.querySelector('#a-close').addEventListener('click', () => backdrop.remove());

  request('adminAuditMessages', { params: { id: channelId }, query: { limit: 50 } })
    .then((r) => {
      list.textContent = '';
      if (!r.messages.length) { list.appendChild(el('p', { class: 'admin-empty' }, '暂无消息')); return; }
      for (const m of r.messages) {
        list.appendChild(el('div', { class: 'audit-row' }, [
          el('span', { class: 'audit-row__who' }, m.sender_id.slice(0, 8)),
          el('span', { class: 'audit-row__text' }, m.content),
          el('time', { class: 'audit-row__time' }, (m.created_at || '').slice(0, 16).replace('T', ' ')),
        ]));
      }
    })
    .catch((err) => { list.textContent = ''; list.appendChild(errorBox(err)); });
}

// —— 审计日志 ——
async function renderAuditLog(body) {
  body.appendChild(loading());
  try {
    const r = await request('adminAuditLog', { query: { limit: 50 } });
    body.textContent = '';
    if (!r.entries.length) { body.appendChild(el('p', { class: 'admin-empty' }, '暂无管理操作记录')); return; }
    const table = el('div', { class: 'admin-table' }, [
      el('div', { class: 'admin-table__head' }, ['操作者', '动作', '对象', '时间'].map((h) => el('span', { class: 'admin-table__th' }, h))),
    ]);
    for (const e of r.entries) {
      table.appendChild(el('div', { class: 'admin-table__row' }, [
        el('span', {}, e.actor_username || e.actor_id.slice(0, 8)),
        el('span', {}, e.action),
        el('span', {}, `${e.target_type}:${e.target_id.slice(0, 8)}`),
        el('span', {}, (e.created_at || '').slice(0, 16).replace('T', ' ')),
      ]));
    }
    body.appendChild(table);
  } catch (err) {
    body.textContent = '';
    body.appendChild(errorBox(err));
  }
}

function loading() { return el('div', { class: 'admin-loading' }, '加载中…'); }
function toast(msg) {
  const t = el('div', { class: 'snackbar' }, msg);
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

function toastError(err) {
  const d = describeError(err?.code);
  const t = document.createElement('div');
  t.className = 'snackbar';
  t.textContent = d.text;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}
