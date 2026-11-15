// views/auth.js — 登录/注册/验证视图
import * as api from '../api/client.js';
import { describeError } from '../api/errors.js';
import { el, icon, toast, confirmDialog } from '../util/dom.js';
import * as store from '../store.js';

const root = () => document.getElementById('app');

function brandHeader() {
  return el('div', { class: 'brand-mark' }, [icon('chat'), 'Coalchat']);
}

function field(labelText, inputProps, errorKey, errors) {
  return el('div', { class: 'field' }, [
    el('label', { text: labelText }),
    el('input', { class: 'text-input' + (errors?.[errorKey] ? ' invalid' : ''), ...inputProps }),
    el('div', { class: 'field-error', text: errors?.[errorKey] || '' }),
  ]);
}

/** 渲染登录/注册视图。mode: 'login' | 'signup' */
export function renderAuth(mode = 'login', notice = '') {
  const errors = {};
  let formAlert = null;

  const email = el('input', { class: 'text-input', type: 'email', required: true, placeholder: 'you@example.com', autocomplete: 'email' });
  const password = el('input', { class: 'text-input', type: 'password', required: true, minlength: 8, placeholder: '至少 8 位', autocomplete: mode === 'login' ? 'current-password' : 'new-password' });
  const username = el('input', { class: 'text-input', required: true, placeholder: '3-32 位字母、数字、下划线', autocomplete: 'username' });

  const alertBox = el('div', {});
  const submit = el('button', { class: 'btn btn-filled btn-block', type: 'submit', text: mode === 'login' ? '登录' : '注册' });
  const form = el('form', { novalidate: true }, [
    mode === 'signup' ? wrapField('用户名', username, 'username') : null,
    wrapField('邮箱', email, 'email'),
    wrapField('密码', password, 'password'),
    alertBox,
    submit,
  ]);

  function wrapField(label, input, key) {
    return el('div', { class: 'field', dataset: { fkey: key } }, [
      el('label', { text: label }), input,
      el('div', { class: 'field-error' }),
    ]);
  }
  function fieldError(key, text) {
    const f = form.querySelector(`[data-fkey="${key}"] .field-error`);
    if (f) f.textContent = text || '';
    if (text) form.querySelector(`[data-fkey="${key}"] .text-input`)?.classList.add('invalid');
    else form.querySelector(`[data-fkey="${key}"] .text-input`)?.classList.remove('invalid');
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    form.querySelectorAll('.field-error').forEach(x => x.textContent = '');
    form.querySelectorAll('.text-input').forEach(x => x.classList.remove('invalid'));
    alertBox.textContent = '';
    submit.disabled = true;
    submit.textContent = '请稍候…';
    try {
      let data;
      if (mode === 'login') {
        data = await api.request('login', { body: { email: email.value.trim(), password: password.value } });
        finishLogin(data);
      } else {
        data = await api.request('signup', {
          body: { email: email.value.trim(), password: password.value, username: username.value.trim() },
        });
        if (data.session_token) finishLogin(data);
        else showVerifyNotice(data);
      }
    } catch (err) {
      const d = describeError(err.code);
      if (d.action.startsWith('field:')) fieldError(d.action.slice(6), d.text);
      else if (d.action === 'form') fieldError('password', d.text);
      else if (d.action === 'dialog') {
        if (err.code === 'EMAIL_NOT_CONFIRMED') showConfirmDialog(email.value.trim());
        else confirmDialog({ title: '无法继续', body: d.text, confirmText: '知道了' });
      } else alertBox.append(el('div', { class: 'form-alert', text: d.text }));
    } finally {
      submit.disabled = false;
      submit.textContent = mode === 'login' ? '登录' : '注册';
    }
  });

  function finishLogin(data) {
    if (!data.session_token) { alertBox.append(el('div', { class: 'form-alert', text: '请查收确认邮件后再登录' })); return; }
    api.setToken(data.session_token);
    store.set({ me: data.user });
    location.hash = '#/';
    window.dispatchEvent(new CustomEvent('app:authed'));
  }

  function showVerifyNotice(data) {
    clearAndRender(
      brandHeader(),
      el('h1', { text: '确认邮箱' }),
      el('p', { class: 'auth-sub', text: '确认邮件已发送到 ' + data.user?.email + '，请点击邮件中的链接完成验证。' }),
      el('div', { class: 'card', style: 'margin-bottom:16px' }, [
        el('p', { style: 'font-size:13px;color:var(--md-sys-color-on-surface-variant)' },
          '如果邮件里包含确认码 / token，可粘贴到下方直接完成验证：'),
        el('div', { class: 'field', style: 'margin-top:12px' }, [
          el('input', { class: 'text-input', id: 'verify-token', placeholder: '粘贴确认 token' }),
        ]),
        el('div', { class: 'field', style: 'margin-top:12px' }, [
          el('input', { class: 'text-input', id: 'verify-pass', type: 'password', placeholder: '设置密码（如邮件流程要求）' }),
        ]),
        el('button', {
          class: 'btn btn-filled btn-block', style: 'margin-top:16px', text: '完成验证',
          onclick: async () => {
            const t = document.getElementById('verify-token').value.trim();
            const p = document.getElementById('verify-pass').value;
            try {
              const d = await api.request('verify', { body: { type: 'signup', token: t, password: p || undefined } });
              finishLogin(d);
            } catch (err) {
              toast(describeError(err.code).text);
            }
          },
        }),
      ]),
      el('button', { class: 'btn btn-text btn-block', style: 'margin-top:12px', text: '返回登录', onclick: () => renderAuth('login') }),
    );
  }

  async function showConfirmDialog(emailVal) {
    const ok = await confirmDialog({ title: '邮箱未确认', body: '请先到邮箱点击确认链接。需要重新发送确认邮件吗？', confirmText: '重新发送' });
    if (ok) {
      try {
        await api.request('recover', { body: { email: emailVal } });
        toast('确认邮件已发送');
      } catch (err) { toast(describeError(err.code).text); }
    }
  }

  const switchText = mode === 'login'
    ? [el('span', { text: '还没有账号？' }), el('a', { href: '#', text: '注册', onclick: e => { e.preventDefault(); renderAuth('signup'); } })]
    : [el('span', { text: '已有账号？' }), el('a', { href: '#', text: '登录', onclick: e => { e.preventDefault(); renderAuth('login'); } })];

  clearAndRender(
    brandHeader(),
    el('h1', { text: mode === 'login' ? '欢迎回来' : '创建账号' }),
    el('p', { class: 'auth-sub', text: mode === 'login' ? '登录后继续你的会话' : '注册一个新账号开始聊天' }),
    notice ? el('div', { class: 'form-alert', style: 'margin-bottom:16px', text: notice }) : null,
    form,
    el('div', { class: 'auth-switch' }, switchText),
    el('a', { href: '#', style: 'display:block;text-align:center;margin-top:8px;font-size:13px', text: '忘记密码？',
      onclick: e => { e.preventDefault(); showRecover(); } }),
  );

  async function showRecover() {
    const mailEl = el('input', { class: 'text-input', type: 'email', placeholder: '注册邮箱' });
    const dlg = el('div', { class: 'dialog' }, [
      el('h3', { text: '找回密码' }),
      el('p', { class: 'dialog-body', text: '输入注册邮箱，我们会发送恢复邮件。' }),
      mailEl,
      el('div', { class: 'dialog-actions' }, [
        el('button', { class: 'btn btn-text', text: '取消', onclick: () => dlg.remove() }),
        el('button', {
          class: 'btn btn-filled', text: '发送',
          onclick: async () => {
            try {
              await api.request('recover', { body: { email: mailEl.value.trim() } });
              toast('恢复邮件已发送');
              dlg.remove();
            } catch (err) { toast(describeError(err.code).text); }
          },
        }),
      ]),
    ]);
    document.body.append(el('div', { class: 'dialog-scrim' }, [dlg]));
    mailEl.focus();
  }

  function clearAndRender(...children) {
    const app = root();
    app.innerHTML = '';
    app.append(el('div', { class: 'center-view' }, [el('div', { class: 'auth-card anim-fade' }, children.filter(Boolean))]));
  }
}
