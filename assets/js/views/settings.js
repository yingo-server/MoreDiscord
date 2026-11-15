// settings.js — 设置视图：改用户名/显示名/登出/WASM 状态
import * as store from '../store.js';
import { request, setToken } from '../api/client.js';
import { describeError } from '../api/errors.js';
import { isWasmReady } from '../wasm/glue.js';
import { el } from '../util/dom.js';

let root = null;

export function mount(parent) {
  root = el('section', { class: 'settings-page' });
  parent.appendChild(root);
  store.subscribe('me', render);
  if (store.get('me')) render(store.get('me'));
  return root;
}

function render(me) {
  if (!me) return;
  root.textContent = '';

  const usernameInput = el('input', { class: 'text-field', value: me.username || '', id: 'set-username', maxlength: '32' });
  const dnInput = el('input', { class: 'text-field', value: me.display_name || '', id: 'set-dn', maxlength: '64', placeholder: '留空则清除' });

  root.appendChild(el('h2', { class: 'settings-page__title' }, '设置'));
  root.appendChild(el('p', { class: 'settings-page__sub' }, `登录身份：${me.email || me.username}（ID: ${me.id.slice(0, 8)}…）`));

  // —— 账户 ——
  const accountCard = el('div', { class: 'settings-card' }, [
    el('h3', { class: 'settings-card__title' }, '账户'),
    el('label', { class: 'field-label', for: 'set-username' }, '用户名（3-32 位小写字母/数字/_/-）'),
    usernameInput,
    el('button', { class: 'btn btn--filled', id: 'btn-save-username' }, '保存用户名'),
    el('div', { class: 'settings-gap' }),
    el('label', { class: 'field-label', for: 'set-dn' }, '显示名（最多 64 字，可空）'),
    dnInput,
    el('button', { class: 'btn btn--filled', id: 'btn-save-dn' }, '保存显示名'),
  ]);
  root.appendChild(accountCard);

  // —— 外观 ——
  root.appendChild(el('div', { class: 'settings-card' }, [
    el('h3', { class: 'settings-card__title' }, '外观'),
    el('label', { class: 'field-label' }, '主题'),
    themeToggle(),
  ]));

  // —— 关于 ——
  root.appendChild(el('div', { class: 'settings-card' }, [
    el('h3', { class: 'settings-card__title' }, '关于'),
    el('p', { class: 'settings-line' }, `WASM 加速：${isWasmReady() ? '已启用' : '未启用（JS 回退运行中）'}`),
    el('p', { class: 'settings-line' }, '设计：Material 3 × WinUI 3 混合 · 纯前端零依赖'),
  ]));

  // —— 登出 ——
  const logoutBtn = el('button', { class: 'btn btn--danger', id: 'btn-logout' }, '退出登录');
  logoutBtn.addEventListener('click', async () => {
    logoutBtn.disabled = true;
    try { await request('logout'); } catch { /* token 已无效也无妨 */ }
    setToken(null);
    location.hash = '';
    location.reload();
  });
  root.appendChild(logoutBtn);

  root.querySelector('#btn-save-username').addEventListener('click', async (e) => {
    e.target.disabled = true;
    try {
      await request('setUsername', { body: { username: usernameInput.value.trim() } });
      const me = store.get('me');
      store.set({ me: { ...me, username: usernameInput.value.trim() } });
      toast('用户名已保存');
    } catch (err) { toastError(err); }
    e.target.disabled = false;
  });

  root.querySelector('#btn-save-dn').addEventListener('click', async (e) => {
    e.target.disabled = true;
    try {
      const dn = dnInput.value.trim() || null;
      await request('setProfile', { body: { display_name: dn } });
      const me = store.get('me');
      store.set({ me: { ...me, display_name: dn } });
      toast('显示名已保存');
    } catch (err) { toastError(err); }
    e.target.disabled = false;
  });
}

function themeToggle() {
  const wrap = el('div', { class: 'theme-toggle' });
  const cur = document.documentElement.dataset.theme || 'dark';
  const mk = (name, label) => {
    const b = el('button', { class: 'btn btn--text theme-toggle__btn' + ((document.documentElement.dataset.theme || 'dark') === name ? ' theme-toggle__btn--on' : '') }, label);
    b.addEventListener('click', () => {
      document.documentElement.dataset.theme = name;
      try { localStorage.setItem('ds_theme', name); } catch { /* ignore */ }
      wrap.querySelectorAll('button').forEach((x) => x.classList.remove('theme-toggle__btn--on'));
      b.classList.add('theme-toggle__btn--on');
    });
    return b;
  };
  wrap.appendChild(mk('dark', '深色（云母）'));
  wrap.appendChild(mk('light', '浅色'));
  return wrap;
}

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
