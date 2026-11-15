// composer.js — 输入框：Enter 发送 / Shift+Enter 换行，4000 字上限，成功后 pollerPoke()
import * as store from '../store.js';
import { request } from '../api/client.js';
import { describeError } from '../api/errors.js';
import { start as pollerStart, stop as pollerStop, poke as pollerPoke } from '../api/poller.js';
import { el } from '../util/dom.js';

const MAX_LEN = 4000;
let root = null;
let textarea = null;
let counter = null;
let sendBtn = null;

export function mount(parent) {
  root = el('footer', { class: 'composer' });
  const attach = el('button', { class: 'icon-btn', title: '附件（v1 预留）', disabled: true }, '＋');
  textarea = el('textarea', {
    class: 'composer__input',
    placeholder: '输入消息…（Enter 发送，Shift+Enter 换行）',
    rows: 1,
    maxlength: String(MAX_LEN),
    'aria-label': '消息内容',
  });
  counter = el('span', { class: 'composer__counter' }, '');
  sendBtn = el('button', { class: 'icon-btn icon-btn--send', title: '发送', 'aria-label': '发送', disabled: true }, '➤');

  root.appendChild(attach);
  root.appendChild(textarea);
  root.appendChild(counter);
  root.appendChild(sendBtn);
  parent.appendChild(root);

  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });
  textarea.addEventListener('input', () => {
    autoGrow();
    const len = textarea.value.trim().length;
    counter.textContent = len > MAX_LEN - 200 ? `${len}/${MAX_LEN}` : '';
    sendBtn.disabled = len === 0;
    pollerPoke();
  });
  sendBtn.addEventListener('click', send);
  return root;
}

function autoGrow() {
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight, 160) + 'px';
}

async function send() {
  const id = store.get('activeId');
  const content = textarea.value.trim();
  if (!id || !content) return;
  sendBtn.disabled = true;
  try {
    await request('sendMessage', { params: { id }, body: { content } });
    textarea.value = '';
    autoGrow();
    counter.textContent = '';
    pollerPoke(); // 立即回拉确认
  } catch (err) {
    toastError(err);
    if (err.code === 'INVALID_INPUT' && /4000|length/i.test(err.message || '')) {
      textarea.classList.add('composer__input--error');
      setTimeout(() => textarea.classList.remove('composer__input--error'), 1200);
    }
  } finally {
    sendBtn.disabled = textarea.value.trim().length === 0;
    textarea.focus();
  }
}

function toastError(err) {
  const d = describeError(err?.code);
  const t = document.createElement('div');
  t.className = 'snackbar';
  t.textContent = d.text;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}
