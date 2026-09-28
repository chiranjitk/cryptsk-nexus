# Gateway Plane — Network / Gateway

This directory contains the **Network/Gateway Plane** of CRYPTSK Nexus — the dataplane
that owns AAA, RADIUS, live sessions, IP allocation, policy translation, and packet
forwarding.

**Target runtime:** Rocky Linux 10.x appliance with DPDK-capable NICs.

## Components

| Subdir | Component | Language | Spec reference |
|---|---|---|---|
| `session-engine/` | Session Engine — in-memory authoritative live state | Go | 02_GATEWAY §10, §17, §43, §72-74 |
| `vpp/` | VPP configs + GoVPP binary API adapter | Go | 02_GATEWAY §90, ADR-008 |
| `freeradius/` | FreeRADIUS 3.2.x dictionaries, mods-available, sql module | Config | 02_GATEWAY §90, 06_DB §12 |
| `policy-engine/` | Policy → VPP config compiler | Go | 02_GATEWAY §29-32 |

## Internal transport

- **gRPC** for service-to-service control (Session ↔ Policy ↔ VPP Adapter)
- **Unix domain sockets** for high-frequency local IPC
- **REST/JSON** only for management plane (the OSS/BSS Next.js app)

## Service management

All gateway components run as **systemd** services (no PM2 — 10_AI_AGENT §33).
Unit files live in `/deploy/systemd/`.

## Status

🚧 **Phase 0 — scaffolding only.** Real Go Session Engine code lands in Phase 4.
VPP/DPDK integration lands in Phase 6. See `docs/architecture/12_IMPLEMENTATION_PHASE_ROADMAP.md`.
