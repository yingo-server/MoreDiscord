// util/dom.js — DOM 辅助（零依赖）
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  const kids = Array.isArray(children) ? children : [children];
  for (const c of kids) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

export function qs(sel, root = document) { return root.querySelector(sel); }
export function qsa(sel, root = document) { return [...root.querySelectorAll(sel)]; }

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

export function svgIcon(paths, viewBox = '0 0 24 24') {
  const d = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  d.setAttribute('viewBox', viewBox);
  for (const p of Array.isArray(paths) ? paths : [paths]) {
    const e = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    e.setAttribute('d', p);
    d.append(e);
  }
  return d;
}

// 图标库（线性 1.8 描边风格）
export const icons = {
  chat: 'M21 12a8 8 0 0 1-8 8H5l-2 2V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8z',
  admin: ['M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z'],
  settings: ['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z'],
  send: 'M4 12l16-8-6 16-3-6-7-2z',
  logout: ['M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4', 'M10 17l-5-5 5-5', 'M15 12H5'],
  back: ['M19 12H5', 'M12 19l-7-7 7-7'],
  plus: ['M12 5v14', 'M5 12h14'],
  menu: ['M4 7h16', 'M4 12h16', 'M4 17h16'],
  edit: 'M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3z',
  trash: ['M4 7h16', 'M10 11v6', 'M14 11v6', 'M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13', 'M9 7V4h6v3'],
  users: ['M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2', 'M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M21 21v-2a4 4 0 0 0-3-3.9', 'M16 3.1a4 4 0 0 1 0 7.8'],
  smile: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M9 10h.01', 'M15 10h.01', 'M8 14a4 4 0 0 0 8 0'],
  search: ['M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z', 'M21 21l-4.3-4.3'],
  copy: ['M9 9h10v10a1 1 0 0 1-1 1H10a1 1 0 0 1-1-1V9z', 'M5 15V5a1 1 0 0 1 1-1h10'],
  info: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 8h.01', 'M12 12v4'],
  x: ['M6 6l12 12', 'M18 6L6 18'],
  arrowRight: ['M5 12h14', 'M12 5l7 7-7 7'],
};

export function icon(name) {
  const paths = icons[name];
  if (!paths) return document.createElement('span');
  return svgIcon(Array.isArray(paths) ? paths.filter(Boolean) : [paths]);
}

/** 头像：显示名/用户名首字符 */
export function avatar(name, size = 32) {
  const ch = (name || '?').trim().charAt(0).toUpperCase() || '?';
  const hue = [...(name || '')].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  const a = el('div', { class: `avatar avatar-${size}`, text: ch });
  a.style.background = `hsl(${hue} 38% 32%)`;
  a.style.color = `hsl(${hue} 60% 88%)`;
  return a;
}

/** 格式化时间：今天显示 HH:MM，否则 M月D日 */
export function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}
export function fmtDate(iso) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return '今天';
  const y = new Date(now); y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return '昨天';
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

/** 日期 key（用于日期分隔去重） */
export function dateKey(iso) { return new Date(iso).toDateString(); }

/** 简易防抖 */
export function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/** snackbar 提示 */
export function toast(text, ms = 3000) {
  let host = document.querySelector('.snackbar-host');
  if (!host) {
    host = el('div', { class: 'snackbar-host' });
    document.body.append(host);
  }
  const s = el('div', { class: 'snackbar', text });
  host.append(s);
  setTimeout(() => s.remove(), ms);
}

/** 确认对话框 → Promise<boolean> */
export function confirmDialog({ title, body, confirmText = '确认', danger = false }) {
  return new Promise(resolve => {
    const close = ok => { scrim.remove(); resolve(ok); };
    const cancelBtn = el('button', { class: 'btn btn-text', text: '取消', onclick: () => close(false) });
    const okBtn = el('button', { class: 'btn ' + (danger ? 'btn-danger' : 'btn-filled'), text: confirmText, onclick: () => close(true) });
    const dialog = el('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true' }, [
      el('h3', { text: title }),
      body ? el('p', { class: 'dialog-body', text: body }) : null,
      el('div', { class: 'dialog-actions' }, [cancelBtn, okBtn]),
    ]);
    const scrim = el('div', { class: 'dialog-scrim', onclick: e => { if (e.target === scrim) close(false); } }, [dialog]);
    document.body.append(scrim);
    okBtn.focus();
  });
}

/** Acrylic 菜单（定位到元素附近） */
export function showMenu(anchor, items) {
  closeMenu();
  const menu = el('div', { class: 'menu', role: 'menu' });
  for (const it of items) {
    if (!it) continue;
    menu.append(el('button', {
      class: it.danger ? 'danger' : '',
      text: it.label,
      onclick: () => { closeMenu(); it.onclick?.(); },
    }));
  }
  document.body.append(menu);
  const r = anchor.getBoundingClientRect();
  const mw = menu.offsetWidth, mh = menu.offsetHeight;
  let x = Math.min(r.left, window.innerWidth - mw - 8);
  let y = r.bottom + 6;
  if (y + mh > window.innerHeight - 8) y = Math.max(8, r.top - mh - 6);
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
  setTimeout(() => {
    const off = e => {
      if (!menu.contains(e.target)) { closeMenu(); document.removeEventListener('pointerdown', off, true); }
    };
    document.addEventListener('pointerdown', off, true);
  });
}
export function closeMenu() { document.querySelectorAll('.menu').forEach(m => m.remove()); }
