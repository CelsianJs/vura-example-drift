# Drift API contract

Cookie namespace: `drift-demo` on HTTP and `__Host-drift-demo` on HTTPS. Host-only cookies are shared across ports. Distinct Harbor/Drift names—not port isolation—avoid local session overwrites; each parser selects only its own token from mixed-cookie headers.

Private responses use `Cache-Control: private, no-store`. Errors are `{error:{code,message}}`; SQL, credentials and provider details are never returned. An unknown database/transport failure reports outcome unconfirmed: a lost response may follow a committed transaction. Refresh before retrying.

| Method | Route | Contract |
| --- | --- | --- |
| GET | /api/health | Stateless configuration/process probe; never a durable-storage certificate |
| POST | /api/session | Exact Origin; bounded source-bucket limiter; DB admission; private seeded workspace + HttpOnly cookie + csrfToken |
| GET | /api/session | Valid persisted cookie; returns csrfToken and isolation descriptors |
| DELETE | /api/session | Valid cookie + exact Origin + x-demo-csrf; delete own workspace and clear cookie |
| GET | /api/snapshot | Own items with versions + newest 40 audit events |
| PATCH | /api/items/:id | Own item, JSON, exact Origin, x-demo-csrf, expectedVersion |
| GET | /api/events | Persisted-session-scoped text/event-stream; committed initial/changed snapshots |

PATCH accepts only status/assignee plus `expectedVersion`. Revision range is integer **1–501**. Unknown keys/invalid enum/range → 422; invalid ID → 400; absent own item → 404; stale revision → 409 (including stale-at-ceiling); matching revision 501 → 429 WORKSPACE_LIMIT. One item allows at most 500 accepted changes; audit version/FK/uniqueness constraints bound stored events.

Missing/expired identity → 401. Expired/nonexistent structurally valid identity is cleared by the error response; POST validates it server-side and may replace it with a fresh unrelated workspace. A still-live identity returns 409 SESSION_EXISTS, never resets ownership silently. Bad Origin/CSRF → 403; raw payload over 8 KiB → 413; wrong media type → 415; unconfigured/unavailable storage → 503.

Admission starts disabled → 503 CANARY_CLOSED. A database row lock shared across application instances enforces **100 retained workspaces** and **100 successful creations per UTC day** → 429 CANARY_LIMIT. Each creation removes at most 25 expired workspaces with cascading data deletion; valid sessions are preserved. Physical cleanup is opportunistic, not scheduled deletion. Seven-day logical authentication expiry is enforced on every lookup. The separate 20/hour source-bucket memory limiter is process-local, not a distributed quota.

Successful PATCH returns `{item,sequence}`. Server version is integer; sequence is string to avoid JS bigint precision loss. Activity entries contain itemId/version/patch/at/sequence, never bearer credentials.

SSE snapshot uses the same items/activity envelope as /api/snapshot. No arbitrary workspace query or Last-Event-ID replay is offered. Every reconnect gets database truth. Four streams/workspace, 100/process, 120-second lease, backpressure/abort cleanup; polling is not a globally durable message bus. storage-error closes the stream. Read/poll ingress quotas and managed streaming proof remain hosting gates.

Public /build and /source/...txt are static teaching assets generated from a fixed allowlist. No env file or value is read into them.
