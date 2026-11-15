// navRail.js — 导航栏：桌面 rail（72px，pill 选中指示）/ 移动底部 bar（<600px）
import * as store from '../store.js';
import * as router from '../router.js';

let root = null;

export function mount(parent) {
  root = document.createElement('nav');
  root.className = 'nav-rail';
  root.innerHTML = `
    <div class="nav-rail__logo" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor">
        <path d="M12 2C6.5 2 2 6.1 2 11.2c0 2.9 1.5 5.4 3.9 7.1V22l3.6-2c.8.2 1.7.3 2.5.3 5.5 0 10-4.1 10-9.2S17.5 2 12 2zm4.5 12.8c-.4.7-1.5 1.3-2.6 1.4-.7.1-1.4 0-2.3-.3-1.9-.6-3.5-1.9-4.6-3.6-.6-.9-1-2-1-3 0-1.2.5-2.2 1.4-2.7.4-.2.9-.2 1.2.1.3.3.8 1 1.1 1.5.3.5.2 1-.1 1.4l-.5.5c-.2.2-.2.5-.1.7.6 1.1 1.7 2.1 2.9 2.6.3.1.5.1.7-.1l.6-.6c.3-.4.9-.5 1.4-.3.5.2 1.2.6 1.5 1 .3.2.4.7.3 1.1z"/>
      </svg>
    </div>
    <button class="nav-rail__item" data-nav="chat" aria-label="聊天">
      <span class="nav-rail__pill"></span>
      <svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z"/></svg>
      <span class="nav-rail__label">聊天</span>
    </button>
    <button class="nav-rail__item" data-nav="settings" aria-label="设置">
      <span class="nav-rail__pill"></span>
      <svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M19.4 13a7.5 7.5 0 0 0 0-2l2.1-1.6a.5.5 0 0 0 .1-.7l-2-3.4a.5.5 0 0 0-.6-.2l-2.5 1a7.7 7.7 0 0 0-1.7-1L14.4 2.4a.5.5 0 0 0-.5-.4h-4a.5.5 0 0 0-.5.4L9 4.9a7.7 7.7 0 0 0-1.7 1l-2.5-1a.5.5 0 0 0-.6.2l-2 3.4a.5.5 0 0 0 .1.7L4.6 11a7.5 7.5 0 0 0 0 2l-2.1 1.6a.5.5 0 0 0-.1.7l2 3.4c.1.2.4.3.6.2l2.5-1a7.7 7.7 0 0 0 1.7 1l.4 2.5c0 .3.3.4.5.4h4c.3 0 .5-.2.5-.4l.4-2.6a7.7 7.7 0 0 0 1.7-1l2.5 1c.2.1.5 0 .6-.2l2-3.4a.5.5 0 0 0-.1-.7L19.4 13zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z"/></svg>
      <span class="nav-rail__label">设置</span>
    </button>
    <button class="nav-rail__item nav-rail__item--admin" data-nav="admin" aria-label="管理" hidden>
      <span class="nav-rail__pill"></span>
      <svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M12 1L3 5v6c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V5l-9-4zm0 10.9h7c-.5 4.1-3.3 7.6-7 8.9V12H5V6.3l7-3.1v8.7z"/></svg>
      <span class="nav-rail__label">管理</span>
    </button>
    <div class="nav-rail__spacer"></div>
    <button class="nav-rail__avatar" data-nav="me" aria-label="我的资料">
      <span id="nav-avatar-letter">?</span>
    </button>
  `;
  parent.appendChild(root);

  // 管理入口可见性（me.admin 由 main.js 写入 store）
  store.subscribe('me', (me) => {
    const btn = root.querySelector('[data-nav="admin"]');
    const av = root.querySelector('#nav-avatar-letter');
    if (me && Number(me.admin) === 1) btn.hidden = false;
    if (av && me?.username) av.textContent = me.username[0].toUpperCase();
  });

  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-nav]');
    if (!btn) return;
    const target = btn.dataset.nav;
    if (target === 'chat') router.navigate('#/');
    else if (target === 'settings') router.navigate('#/settings');
    else if (target === 'admin') router.navigate('#/admin');
    else if (target === 'me') router.navigate('#/settings');
  });

  store.subscribe('route', highlight);
  highlight(store.get('route'));
  return root;
}

function highlight(route) {
  if (!root || !route) return;
  const name = route.startsWith('#/admin') ? 'admin'
    : route.startsWith('#/settings') ? 'settings' : 'chat';
  root.querySelectorAll('.nav-rail__item').forEach((el) => {
    el.classList.toggle('nav-rail__item--active', el.dataset.nav === name);
  });
}
