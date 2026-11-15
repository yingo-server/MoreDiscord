// main.js — 入口：store ↔ api ↔ views 装配、路由注册、poller 接线
import * as store from './store.js';
import * as router from './router.js';
import { request, getToken, on } from './api/client.js';
import { poller } from './api/poller.js';
import { initWasm } from './wasm/glue.js';
import { mount as mountNav } from './views/navRail.js';
import { mount as mountChannels, loadConversations } from './views/channelList.js';
import { mount as mountFlow } from './views/messageFlow.js';
import { mount as mountComposer } from './views/composer.js';
import { mount as mountSettings } from './views/settings.js';
import { mount as mountAdmin } from './views/admin/adminPanel.js';
import { renderAuth } from './views/auth.js';

// —— 主题恢复 ——
try {
  const saved = localStorage.getItem('ds_theme');
  if (saved) document.documentElement.dataset.theme = saved;
} catch { /* ignore */ }

// —— DOM 骨架 ——
const appRoot = document.getElementById('app');

const authHost = document.createElement('div');
authHost.id = 'auth-host';
appRoot.appendChild(authHost);

const chatShell = document.createElement('div');
chatShell.className = 'app-shell';
chatShell.hidden = true;
appRoot.appendChild(chatShell);

mountNav(chatShell);
mountChannels(chatShell);
mountFlow(chatShell);
mountComposer(chatShell);

const settingsView = mountSettings(appRoot);
const adminView = mountAdmin(appRoot);
settingsView.hidden = true;
adminView.hidden = true;

function showAuth(show, mode = 'login') {
  authHost.hidden = !show;
  if (show) { chatShell.hidden = true; renderAuth(mode); }
}

function showSection(name) {
  authHost.hidden = true;
  chatShell.hidden = name !== 'chat';
  settingsView.hidden = name !== 'settings';
  adminView.hidden = name !== 'admin';
  store.set({ view: name });
}

// —— WASM（渐进增强，失败静默回退 JS）——
initWasm().then(() => store.set({ wasmReady: true })).catch(() => {});

// —— 会话恢复 ——
async function bootstrap() {
  if (!getToken()) { showAuth(true); return; }
  try {
    const me = await request('me');
    store.set({ me });
    showAuth(false);
    showSection('chat');
    await loadConversations();
  } catch {
    showAuth(true);
  }
}

// 登录成功（auth 视图派发）→ 进入主界面
window.addEventListener('app:authed', () => {
  bootstrap();
});

// —— 路由 ——
router.register('#/', () => { if (getToken()) showSection('chat'); });
router.register('#/c/:id', (ctx) => { if (getToken()) { showSection('chat'); store.set({ activeId: ctx.params.id }); } });
router.register('#/settings', () => { if (getToken()) showSection('settings'); });
router.register('#/admin', () => { if (getToken()) showSection('admin'); });

// —— 401 全局处理 ——
on('auth:expired', () => showAuth(true));

// —— 会话列表轮询 ——
poller.start('conversations', { intervalMs: 12000, fn: () => loadConversations() });

// —— 启动 ——
router.init();
bootstrap();
