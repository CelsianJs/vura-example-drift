# Drift on Vura

A standalone released-package reference derived from the audited Drift What starter. Card moves/assignees are server-owned; another tab receives committed workspace-scoped SSE snapshots. Preserved synthetic fixtures and branding; no localStorage data masquerades as a backend.

## Run and verify

Use Node22. Exact dependency pins and package-lock are included.

```sh
npm ci
npm run verify
npm run smoke:postgres
```

Chromium must be installed for browser smoke. Local DB tests use disposable PG17; set DEMO_TEST_POSTGRES_BIN to initdb/pg_ctl/psql's directory if needed. Missing binaries explicitly skip database tests, so persistence/admission are then unproven.

`npm run verify` includes typecheck, eight security/real-PG HTTP tests, build and explicit missing-storage desktop/mobile/browser checks. `smoke:postgres` boots the actual Vura build, real Neon driver and browser through a test-only loopback SQL transport to real PostgreSQL. It proves bundled behavior and Node restart retention, not hosted transport/provider durability.

## Learn from the app

Open `/build`: two tabs → move card → committed SSE → reconnect snapshot. Actual SQL/HTTP examples, downloadable source and measured-local/pending-hosted matrix render without a database. No env files or values are published. Read [API.md](API.md) and [BUILD.md](BUILD.md) for exact routes, schemas, migration/role constraints and proof boundaries.

## Durable storage and closed admission

Without DATABASE_URL, creating a workspace returns 503/no cookie/no fake seed. With a migrated database, admission is still **disabled by default**. Do not borrow Platform/customer/Ember credentials. Use an explicitly approved fresh isolated demo schema and separate migration/runtime roles. Copy placeholders from .env.example to ignored .env; APP_ORIGIN must exactly match the browser origin. HTTPS uses Secure/__Host-/HttpOnly/Lax host-only cookies.

After approval only:

```sh
ALLOW_DEMO_MIGRATION=yes npm run db:migrate
npm run dev
# or: npm run build && npm start
```

The database owner grants only the role contract in BUILD.md and explicitly enables the canary after hosting review. Runtime cannot insert workspaces/sessions/items directly, alter admission or own the definer function. Owner credentials go only in ignored `.env.migrate` (from `.env.migrate.example`), loaded only by db:migrate. Never place them in `.env`, runtime platform secrets or a shell environment used to start the app.

Database-wide ceilings are 100 retained workspaces and 100 successful creations per UTC day, serialized on one admission row across app processes. Every creation purges at most25 expired workspaces with cascading deletion; valid sessions survive. Authentication expires after seven days; physical purge is opportunistic, not a wall-clock SLA. Each item permits500 accepted mutations, bounding audit growth. The separate20/hour source-bucket memory limiter and SSE caps are process-local—not distributed quotas.

## Correct behavior

Opaque session hashes, server-derived ownership, exact Origin/genuine CSRF, raw8KiB request bound, enum/revision allowlists and atomic UPDATE+audit protect writes. Stale versions409; matching ceiling429; unsupported revisions422. Expired cookie recovery issues a new unrelated identity. Lost DB response means outcome unconfirmed: refresh before retrying, because a change may already be committed.

SSE sends committed snapshots, four streams/workspace and100/process, abort/backpressure/120s lease cleanup, fresh snapshot on reconnect. Two tabs sharing one cookie are not a multi-user membership/invitation system.

## Deploy only after hosting gates

Vura client/static assets and Function health route are separate from Dedicated private APIs; current ingress/R2 and isolated provider-backed compute are not “all Workers.” PostgreSQL owns durability, not provider disk. Runtime APIs are private/no-store; no personalized ISR.

After root creates/links an isolated Vura framework project, verifies existing Dedicated entitlement, approved roles/admission, runtime secrets and ingress request/read/poll quotas:

```sh
npm run deploy
# fresh production build/upload after verified scope:
npm run deploy:prod
```

Platform CLI0.3.0 is pinned separately from Vura0.8.3. Hot previews may reject requests; mixed preview promotion is not certified. Hosted success needs real Neon transport, production browser writes/isolation and provider replacement/redeploy persistence proof. No deployed backend is claimed by local checks.

No accounts/passwords, shared anonymous workspace, uploads, payments, arbitrary tasks or infrastructure controls. Source/style sync seams are public/styles.css, src/client/App.jsx and preserved src/lib/fixtures.js. Concurrent original-starter changes can be selectively ported without replacing storage/security.
