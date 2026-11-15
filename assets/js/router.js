// router.js — hash 路由：#/c/:id、#/admin、#/settings
import * as store from './store.js';

const routes = [];
let currentRoute = null;

/** routes: [{ pattern:'#/c/:id', handler }] — handler({params, path}) */
export function register(pattern, handler) { routes.push({ pattern, handler }); }

function parse(path) {
  const clean = path.replace(/^#/, '') || '/';
  const segs = clean.split('/').filter(Boolean);
  for (const r of routes) {
    const rsegs = r.pattern.replace(/^#/, '').split('/').filter(Boolean);
    if (rsegs.length !== segs.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < segs.length; i++) {
      if (rsegs[i].startsWith(':')) params[rsegs[i].slice(1)] = decodeURIComponent(segs[i]);
      else if (rsegs[i] !== segs[i]) { ok = false; break; }
    }
    if (ok) return { handler: r.handler, params, path: clean };
  }
  return null;
}

export function navigate(path) {
  if (location.hash === path) dispatch();
  else location.hash = path;
}

function dispatch() {
  const m = parse(location.hash);
  if (m) {
    currentRoute = m;
    m.handler(m.params, m.path);
  } else if (!store.get('me')) {
    currentRoute = null; // 登录视图接管
  } else {
    navigate('#/');
  }
}

export function getRoute() { return currentRoute; }

export function init() {
  window.addEventListener('hashchange', dispatch);
  dispatch();
}
