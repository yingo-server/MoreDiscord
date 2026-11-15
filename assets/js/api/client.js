// client.js — fetch 封装、token 注入、统一 ApiError、401 全局处理
import { API } from './endpoints.js';

const TOKEN_KEY = 'ds_token';
let token = null;
try { token = localStorage.getItem(TOKEN_KEY); } catch { /* 隐私模式 */ }

// 全局事件 hub（401 过期、错误 toast 等由 UI 订阅）
const listeners = new Map();
export function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(fn);
  return () => listeners.get(event).delete(fn);
}
function emit(event, payload) {
  const set = listeners.get(event);
  if (set) for (const fn of set) { try { fn(payload); } catch (e) { console.error(e); } }
}

export class ApiError extends Error {
  constructor(code, message, status) {
    super(message || code);
    this.code = code || 'UNKNOWN';
    this.status = status || 0;
  }
}

export function getToken() { return token; }
export function setToken(t) {
  token = t;
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* ignore */ }
}

function fillPath(p, params = {}) {
  let out = p;
  for (const [k, v] of Object.entries(params)) out = out.replace(`:${k}`, encodeURIComponent(v));
  return out;
}
function buildQuery(query) {
  if (!query) return '';
  const parts = [];
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
  }
  return parts.length ? '?' + parts.join('&') : '';
}

// 带指数退避的重试（网络级失败，≤3 次）
async function fetchWithRetry(url, options, retries = 3) {
  let delay = 500;
  for (let i = 0; i < retries; i++) {
    try {
      return await fetch(url, options);
    } catch (err) {
      if (i === retries - 1) throw new ApiError('NETWORK', '网络请求失败', 0);
      await new Promise(r => setTimeout(r, delay));
      delay *= 2;
    }
  }
}

let pending = 0; // 简单并发计数（防 401 风暴重复登出）
let authExpiredFired = false;

/**
 * 统一请求入口。request('login', { body }) / request('messages', { params:{id}, query:{before} })
 * 成功返回 json.data；失败抛 ApiError（.code 为错误码，UI 用 errors.js 映射文案）。
 */
export async function request(name, { params, query, body } = {}) {
  const ep = API[name];
  if (!ep) throw new Error('未知端点: ' + name);
  const headers = { 'Content-Type': 'application/json' };
  if (ep.auth !== false && token) headers.Authorization = 'Bearer ' + token;

  const url = '/api/v1' + fillPath(ep.p, params) + buildQuery(query);
  const res = await fetchWithRetry(url, {
    method: ep.m,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let json = null;
  try { json = await res.json(); } catch { /* 非 JSON 响应 */ }

  const err = json?.error;
  if (!res.ok || err) {
    const code = err?.code || (res.status === 404 ? 'USER_NOT_FOUND' : res.status >= 500 ? 'SERVER' : 'UNKNOWN');
    const e = new ApiError(code, err?.message, res.status);
    // 401 全局处理：清 token，通知路由回登录（并发去重）
    if (res.status === 401 && !authExpiredFired && pending === 0) {
      authExpiredFired = true;
      setToken(null);
      emit('auth:expired', e);
      setTimeout(() => { authExpiredFired = false; }, 1000);
    }
    throw e;
  }
  return json.data;
}
