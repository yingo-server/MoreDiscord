// poller.js — 轮询调度器：active(2s) / idle(12s) / visibility 恢复即拉，全局单定时器
import { on } from './client.js';

const ACTIVE_MS = 2000;
const IDLE_MS = 12000;
const INTERACTION_WINDOW = 30000; // 用户 30s 内有交互视为活跃
const ERROR_BACKOFF_MS = 30000;
const ERROR_THRESHOLD = 3;

const jobs = new Map(); // name -> { fn, consecutiveErrors }
let timer = null;
let lastInteraction = 0;
let hidden = false;
let started = false;

function markInteraction() { lastInteraction = Date.now(); }

function tick() {
  const now = Date.now();
  const focused = !hidden && now - lastInteraction < INTERACTION_WINDOW;
  const interval = focused ? ACTIVE_MS : IDLE_MS;
  const shortest = Math.min(interval, ...[...jobs.values()].map(j => j.intervalMs || Infinity));

  for (const job of jobs.values()) {
    if (now - job.lastRun >= (focused ? Math.min(job.intervalMs || ACTIVE_MS, ACTIVE_MS) : job.intervalMs || IDLE_MS)) {
      job.lastRun = now;
      Promise.resolve(job.fn()).catch(err => {
        job.consecutiveErrors = (job.consecutiveErrors || 0) + 1;
        if (job.consecutiveErrors >= ERROR_THRESHOLD) job.lastRun = now - (job.intervalMs || IDLE_MS) + ERROR_BACKOFF_MS;
        console.warn('[poller] job failed ×' + job.consecutiveErrors, err?.code);
      });
    }
  }
  timer = setTimeout(tick, Math.max(1000, Math.min(shortest, IDLE_MS)));
}

/** 启动轮询任务。poller.start('conv', { fn, intervalMs }) */
export function start(name, { fn, intervalMs } = {}) {
  jobs.set(name, { fn, intervalMs, lastRun: 0, consecutiveErrors: 0 });
  ensureStarted();
}
export function stop(name) { jobs.delete(name); }

/** 用户输入 / 切回会话时：重置计时并立即拉一次 */
export function poke() {
  markInteraction();
  for (const job of jobs.values()) job.lastRun = 0;
  if (timer) { clearTimeout(timer); tick(); }
}

function ensureStarted() {
  if (started) return;
  started = true;
  markInteraction();
  document.addEventListener('visibilitychange', () => {
    hidden = document.hidden;
    if (!hidden) poke(); // 恢复可见 → 立即拉一次
    else if (timer) { clearTimeout(timer); timer = setTimeout(tick, IDLE_MS); }
  });
  ['pointerdown', 'keydown', 'wheel'].forEach(ev =>
    window.addEventListener(ev, markInteraction, { passive: true }));
  on('auth:expired', () => { jobs.clear(); });
  timer = setTimeout(tick, ACTIVE_MS);
}
