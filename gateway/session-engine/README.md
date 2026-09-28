# CRYPTSK Nexus — Session Engine

> **In-memory authoritative live session state** per spec `02_ENTERPRISE_GATEWAY_ARCHITECTURE.md §10`.

The Session Engine owns the authoritative state of all live subscriber sessions. It does NOT use Redis (ADR-005) or PostgreSQL (ADR-004) for session state — it uses an in-memory Map.

## Architecture

```
FreeRADIUS accounting → PostgreSQL radacct → Session Engine (polls every 5s)
OSS/BSS (Next.js) → REST API (:3010) → Session Engine
Session Engine → in-memory Map<string, Session>
```

## Port

`3010` (per spec `04_FEATURE §8.2`)

## REST API

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check + session count + stats |
| `GET` | `/sessions` | List sessions (params: `active`, `search`, `page`, `pageSize`) |
| `GET` | `/sessions/:id` | Get a single session by radacctid |
| `POST` | `/sessions/sync` | Force sync from radacct |
| `DELETE` | `/sessions/:id` | Terminate session (CoA/Disconnect — Phase 4+ skeleton) |
| `GET` | `/stats` | Aggregate stats (active count, bytes, by-NAS, by-group) |

## Run

```bash
cd gateway/session-engine
bun install
bun run start
```

## Environment

- `DATABASE_URL` — PostgreSQL connection string (defaults to `postgresql://cryptsknexus:...@localhost:5432/cryptsknexus`)

## Deploy

Managed by PM2 (see `ecosystem.config.cjs` at repo root).

## Status

🚧 Phase 4 — skeleton implementation. Full Go version will replace this in production (per spec). This TypeScript/Bun version is the dev/cert implementation.
