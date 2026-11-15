# MoreDiscord

Chat app: React + Vite + Tailwind frontend, Netlify Edge Functions + Turso + Netlify Identity backend. Single client entry `/api/v1/*`, single credential `Authorization: Bearer sess_...`.

## Layout

```
├── netlify.toml                    # edge_functions routes + frontend build
├── schema.sql                      # Turso schema
├── api.md                          # API reference
├── smoke_test.ts                   # offline smoke test (46 assertions)
├── tool/                           # lang/button visibility tests, emoji check
├── frontend/                       # React + TS + Vite + Tailwind (source)
├── AUDIT_BACKEND.md                # backend audit report
├── AUDIT_FRONTEND.md               # frontend audit report
├── FIX_PLAN.md                     # audit remediation log
├── LAYER_PLAN.md                   # layering plan
└── netlify/edge-functions/
    ├── api.ts                      # L4: route table lookup → auth → dispatch
    ├── contracts/                  # L0 route table, error codes, DTOs
    ├── platform/                   # L1 db / identity / session / cors / response / validate
    ├── domain/                     # L2 tags / presence
    ├── handlers/                   # L3 endpoints
    └── index.ts                    # barrel export for route dispatch
```

Dependencies flow L4→L3→L2→L1→L0; lower layers never import upper ones.

## Deploy

1. Turso:

```bash
turso db create chat
turso db shell chat < schema.sql
turso db tokens create chat   # TURSO_AUTH_TOKEN
turso db show chat --url      # TURSO_DATABASE_URL
```

2. Link the Netlify site to this repo. Build command and publish dir are in `netlify.toml` (`cd frontend && npm ci && npm run build`, publish `frontend/dist`).

3. Environment variables (Functions scope): `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `IDENTITY_ORIGIN`.

4. Enable Identity in site settings; pick registration mode and Autoconfirm as needed.

## Tests

```bash
deno check netlify/edge-functions/api.ts
deno run -A smoke_test.ts            # 46 assertions
deno test tool/lang.test.ts tool/message_button.test.ts
python3 tool/check_emoji.py .        # no emoji
```

Frontend: `cd frontend && npx tsc -b && npm run build`.

## API

All endpoints, params, responses and error codes: [api.md](api.md). Summary: 6 auth endpoints (signup reserves/backfills/compensates, login transparently refreshes), 11 conversation endpoints (direct dedup, 10-member cap checked in-transaction, owner transfer/delete), 3 message endpoints (cursor pagination and sync; cursors are opaque, only advance after local commit), 1 translation endpoint (server-side proxy), 8 admin endpoints (audit_log).

## Behavior

- Messages ≤4000 chars (Unicode codepoints), groups ≤10 members, COUNT+INSERT inside a transaction.
- Deleting a conversation keeps message rows; removed members lose access immediately.
- `display_name` may repeat; reads attach a `tag` by creation order (first is 1, no suffix shown). `username` is unique.
- Presence: every authenticated request throttles `sessions.last_used_at` in the same Turso round-trip as auth (60s). Conversation list/detail return `last_seen_at`. No heartbeat.
- Translation: button only on others' messages whose language differs from the UI language (foreign chars ≥35%); upstream is proxied server-side.

---

[中文文档](README.zh-CN.md)
