// wasm/loader.js — instantiateStreaming 加载 core.wasm，1s 超时降级
const TIMEOUT_MS = 1000;

/**
 * 尝试加载 /assets/wasm/core.wasm。
 * 成功返回 { ok:true, exports }；失败/超时/不支持返回 { ok:false, reason }。
 * WASM 是渐进增强，任何失败都静默走 JS 回退。
 */
export async function loadWasm() {
  if (typeof WebAssembly === 'undefined') return { ok: false, reason: 'no-wasm' };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch('assets/wasm/core.wasm', { signal: controller.signal });
    if (!res.ok || !res.headers.get('content-type')?.includes('wasm')) {
      clearTimeout(timer);
      return { ok: false, reason: 'fetch-failed' };
    }
    // streaming 失败时回落到 arrayBuffer 编译
    let module;
    try {
      module = await WebAssembly.instantiateStreaming(res);
    } catch {
      const buf = await res.arrayBuffer();
      module = await WebAssembly.instantiate(buf);
    }
    clearTimeout(timer);
    return { ok: true, exports: module.instance.exports };
  } catch {
    return { ok: false, reason: 'error' };
  }
}
