# 消息翻译（Grok 式）

## 目标

每条消息下方「翻译」按钮 → 调用公开接口 → 内联展示译文。不改动原消息、不入库。

## 架构

翻译 API 由 L1 平台层代理（前端只认 `/api/v1/*`，且 Index-Translate 不支持浏览器直连）。

```
前端 MessageItem → POST /api/v1/translate → L4 → L3 handler → L1 platform/indexTranslate → B站 API
```

## 文件

后端（分层）：
- `contracts/routes.ts` 加一条 `POST /translate`，`contracts/errors.ts` 加 `TRANSLATION_UNAVAILABLE`
- `platform/indexTranslate.ts`（新）：唯一接触 B站 API；注入 `enable_thinking:false` + `temperature:0`；instTrans 格式；`</think>` 清洗；有限重试 + 模型降级；服务端发起
- `handlers/translate.ts`（新）：校验 `text` / `target_lang` → 调 platform → `ok()`
- `handlers/index.ts` 加导出；`api.md` 登记

前端：
- `api/translate.ts`（新）：走 client.ts
- `i18n/index.ts`：加译按钮/译文/失败键（中英，短文案）
- `MessageItem.tsx`：按钮 + 译文区 + 点过缓存

## 契约

`POST /translate` `{ text: ≤4000, target_lang: "zh"|"en" }` → `{ translation, target_lang }`。
需认证。目标语言取 `getLang()`。空白/超长 → `INVALID_INPUT`；上游不可用 → 502。

## 约束

- 不暴露上游地址/参数给前端；不引密钥（上游不校验）
- 重试仅 429/5xx/超时，总墙钟 < 40s（Edge 限制）
- 不派子代理；主线执行
- 门禁：deno check / smoke / 真库 / tsc 全绿，失败即停

## 状态

已完成。真实上游实测：`nah bro that was kinda mid tbh 💀` → `不是哥们，说实话那有点中二了 💀`。门禁：deno check / smoke 46/46 / 真库 9/9 / tsc 0 错误。
