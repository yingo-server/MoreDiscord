# MoreDiscord

Chat app: React + Vite + Tailwind frontend, Netlify Edge Functions + Turso backend. Accounts are self-managed in Turso with PBKDF2-SHA256 password hashes; no external identity provider. Client entry `/api/v1/*`, credential `Authorization: Bearer sess_...`.

## Layout

```
├── netlify.toml                    # edge_functions routes + frontend build
├── schema.sql                      # Turso schema
├── api.md                          # API reference
├── smoke_test.ts                   # offline smoke test (45 assertions)
├── tool/                           # lang/button tests, emoji check
├── frontend/                       # React + TS + Vite + Tailwind (source)
├── AUDIT_BACKEND2.md               # backend audit report
├── AUDIT_FRONTEND2.md              # frontend audit report
├── FIX_PLAN.md                     # audit remediation log
├── LAYER_PLAN.md                   # layering plan
└── netlify/edge-functions/
    ├── api.ts                      # L4: route lookup → auth → dispatch
    ├── contracts/                  # L0 route table, error codes, DTOs
    ├── platform/                   # L1 db / session / password / settings / cors / response / validate
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

3. Environment variables (Functions scope): `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`.

## Auth

Signup stores a PBKDF2-SHA256 hash (10k iterations, per-user salt) and returns a session token directly. Login verifies the hash. Password hashes never leave the DB. Email verification is frozen: `email_verification_required` in the `settings` table is `0`, signup returns `confirmation_required: false`, and `/auth/verify` and `/auth/recover` return INVALID_INPUT. Set the setting to `1` only after wiring a mail sender and implementing token delivery.

## Tests

```bash
deno check netlify/edge-functions/api.ts
deno run -A smoke_test.ts            # 45 assertions
deno test tool/lang.test.ts tool/message_button.test.ts
python3 tool/check_emoji.py .        # no emoji
```

Frontend: `cd frontend && npx tsc -b && npm run build`.

## API

Full reference: [api.md](api.md). Summary: 6 auth endpoints, 11 conversation endpoints (direct dedup, 10-member cap in-transaction, owner transfer/delete), 3 message endpoints (opaque cursors, only advance after local commit), 1 translation endpoint (server-side proxy), 9 admin endpoints including `DELETE /admin/users/:id`.

## Behavior

- Messages ≤4000 chars (Unicode codepoints), groups ≤10 members, COUNT+INSERT inside a transaction.
- Deleting a conversation keeps message rows; removed members lose access immediately.
- `display_name` may repeat; reads attach a `tag` by creation order (first is 1, no suffix shown). `username` and `email` are unique.
- Presence: every authenticated request throttles `sessions.last_used_at` in the same Turso round-trip as auth (60s). Conversation list/detail return `last_seen_at`. No heartbeat.
- Translation: button only on others' messages whose language differs from the UI language (foreign chars ≥35%); upstream is proxied server-side.
- Errors: server returns `code`, frontend maps code to localized text; it never renders raw server messages.

---

[中文文档](README.zh-CN.md)
