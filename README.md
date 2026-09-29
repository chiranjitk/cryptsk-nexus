# CRYPTSK Nexus

> **One Platform. Every Connection. Complete Control.**
>
> Enterprise OSS/BSS + Network Gateway platform for ISPs, telecom operators, MSPs, hospitality, education, healthcare, government, and data-centre operators.

**Locked Design Baseline:** v1.0 architecture / Menu v4.0 — 2026-09-28
**Company:** CRYPTSK PRIVATE LIMITED

---

## Repository Structure

This is a **monorepo** containing both planes of the CRYPTSK Nexus platform:

```
cryptsk-nexus/
├── docs/
│   └── architecture/          # 14-doc locked design pack (source of truth)
│       ├── 00_MASTER_PRODUCT_ARCHITECTURE.md
│       ├── 01_OSS_BSS_ARCHITECTURE.md
│       ├── 02_ENTERPRISE_GATEWAY_ARCHITECTURE.md
│       ├── 03_ARCHITECTURE_DECISION_REGISTER.md
│       ├── 04_PRODUCT_FEATURE_CATALOGUE.md
│       ├── 05_API_INTERFACE_CONTRACT.md
│       ├── 06_DATABASE_DATA_MODEL_SPECIFICATION.md
│       ├── 07_UI_UX_IMPLEMENTATION_SPECIFICATION.md
│       ├── 08_SECURITY_RBAC_SPECIFICATION.md
│       ├── 09_OBSERVABILITY_OPERATIONS_SPECIFICATION.md
│       ├── 10_AI_AGENT_MASTER_BUILD_SPECIFICATION.md
│       ├── 11_FINAL_MENU_NAVIGATION_SPECIFICATION.md
│       ├── 12_IMPLEMENTATION_PHASE_ROADMAP.md
│       └── README.md
│
├── src/                       # OSS/BSS Management Plane (Next.js 16)
│   ├── app/                   # App Router — single / route (role-gated views)
│   ├── components/            # shadcn/ui + custom components
│   ├── lib/                   # db, auth, audit, utils
│   └── hooks/
│
├── prisma/                    # Prisma schema (PostgreSQL prod / SQLite dev per ADR-041)
│
├── gateway/                   # Network/Gateway Plane (target: Rocky Linux 10)
│   ├── session-engine/        # Go Session Engine (in-memory authoritative state)
│   ├── vpp/                   # VPP configs + GoVPP adapter
│   ├── freeradius/            # FreeRADIUS 3.2.x dictionaries + mods
│   └── policy-engine/         # Policy → VPP config compiler
│
├── deploy/                    # Rocky 10 production deployment
│   ├── systemd/               # systemd unit files (no PM2 per spec)
│   ├── caddy/                 # Production Caddyfile
│   ├── postgres/              # Migrations runner + pgsql-production/
│   └── install-rocky10.sh     # One-shot bare-metal installer
│
├── .github/workflows/         # CI: lint + typecheck + test on push
│
├── package.json               # OSS/BSS plane deps (Next.js 16, React 19, TS 5, Bun)
├── Caddyfile                  # Sandbox dev gateway (port 3000)
├── tailwind.config.ts
├── tsconfig.json
└── README.md                  # this file
```

## Two-Plane Architecture

### Plane 1 — OSS/BSS Management Plane (this repo's root)
- **Next.js 16.x** (App Router) + **React 19.x** + **TypeScript 5.x** + **Bun**
- **Tailwind CSS 4.x** + **shadcn/ui (new-york)** + **Radix UI** + **Lucide**
- **Prisma** ORM — **PostgreSQL** (prod, ADR-004/041) / **SQLite** (dev, ADR-041)
- **NextAuth v4** + bcryptjs + HMAC-SHA256 session tokens
- **TanStack Query** (server) + **Zustand** (client) + **Recharts** + **TanStack Table**
- AI via **z-ai-web-dev-sdk** (backend-only, advisory per ADR-030)

### Plane 2 — Network/Gateway Plane (`/gateway`)
- **Rocky Linux 10.x** appliance baseline
- **DPDK** packet I/O + **VPP** dataplane + **GoVPP** binary API adapter (never `vppctl` — ADR-008)
- **Go** Session Engine (in-memory authoritative live state)
- **FreeRADIUS 3.2.x** (4.x forbidden until qualified — 02_GATEWAY §90)
- **gRPC / Unix socket** internal control API
- **systemd** service management (no PM2 — 10_AI_AGENT §33)

## Implementation Phases (per 12_IMPLEMENTATION_PHASE_ROADMAP.md)

| Phase | Name | Status |
|---|---|---|
| 0 | Architecture & Repository Foundation | 🚧 In progress |
| 1 | Platform Core / Identity / Administration (MVP) | ⏳ Pending |
| 2 | Customer / Service / Product / Package Core | ⏳ Pending |
| 3 | AAA (FreeRADIUS integration) | ⏳ Pending |
| 4 | Session Engine (Go, in-memory) | ⏳ Pending |
| 5 | Policy Engine | ⏳ Pending |
| 6 | VPP Gateway / Dataplane | ⏳ Pending |
| 7 | OSS/BSS Functional Expansion (Billing/Payments/Ops/Reporting/Comms) | ⏳ Pending |
| 8 | Advanced Network & Security | ⏳ Pending |
| 9 | Intelligence (AI — advisory only) | ⏳ Pending |
| 10 | Scale / HA / Production Hardening | ⏳ Pending |

**MVP gate (Phase 1):** `User → Login → RBAC → Authorized page/API → Audit event` and `Module → Enabled/Disabled → Navigation/API behavior changes correctly`.

## Development Workflow

### In-sandbox development
```bash
bun install
bun run db:push    # push Prisma schema to SQLite dev DB
bun run dev        # starts Next.js dev server on port 3000
```

### Production target (Rocky Linux 10)
```bash
# On the Rocky 10 VM:
git pull origin main
sudo ./deploy/install-rocky10.sh
sudo systemctl start cryptsk-oss-bss cryptsk-session-engine cryptsk-freeradius
```

## Architecture Principles (golden rules)

1. **AAA decides.** FreeRADIUS authenticates/authorizes.
2. **Session Engine remembers.** In-memory authoritative live state (NOT Redis, NOT PostgreSQL).
3. **Policy Engine translates.** Config → VPP dataplane objects.
4. **VPP enforces.** DPDK-bypass packet forwarding.
5. **PostgreSQL persists.** Configuration, transactional, historical, audit.
6. **Monitoring observes.** Prometheus-compatible metrics, OpenTelemetry traces.
7. **Management controls.** The OSS/BSS plane owns all configuration.

## Critical ADRs

| ADR | Decision |
|---|---|
| ADR-004 | PostgreSQL is the production durable database |
| ADR-005 | Redis is optional cache/coordination only, never authoritative |
| ADR-008 | VPP integration via GoVPP Binary API, never `vppctl` shell |
| ADR-014 | Modular monolith + selective workers (no 50–100 microservices) |
| ADR-022 | Transactional outbox pattern mandatory |
| ADR-030 | AI is optional, advisory-only, never a packet-path dependency |
| ADR-041 | SQLite for dev/testing; PostgreSQL for production |

## License

Proprietary — CRYPTSK PRIVATE LIMITED. All rights reserved.
