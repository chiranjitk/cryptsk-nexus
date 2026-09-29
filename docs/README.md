# Architecture Documentation

This directory contains the **locked design baseline** for CRYPTSK Nexus — the
14-document "Product Architecture Design Pack" that is the **single source of truth**
for all implementation decisions.

**Locked Design Baseline:** v1.0 architecture / Menu v4.0 — 2026-09-28

## Document Index

| # | File | Purpose |
|---|---|---|
| 00 | `00_MASTER_PRODUCT_ARCHITECTURE.md` | Master architecture, two-plane overview, golden rules |
| 01 | `01_OSS_BSS_ARCHITECTURE.md` | OSS/BSS Management Plane architecture |
| 02 | `02_ENTERPRISE_GATEWAY_ARCHITECTURE.md` | Network/Gateway Plane architecture (DPDK/VPP/Go/FreeRADIUS) |
| 03 | `03_ARCHITECTURE_DECISION_REGISTER.md` | All ADRs (ADR-001 through ADR-041+) |
| 04 | `04_PRODUCT_FEATURE_CATALOGUE.md` | 113-page feature catalogue, 99 enums, integrations |
| 05 | `05_API_INTERFACE_CONTRACT.md` | REST `/api/v1/...` contract, error model, idempotency |
| 06 | `06_DATABASE_DATA_MODEL_SPECIFICATION.md` | 204 Prisma models, 15 bounded contexts, FreeRADIUS tables |
| 07 | `07_UI_UX_IMPLEMENTATION_SPECIFICATION.md` | Design tokens, AppShell, 40-widget dashboard, animations |
| 08 | `08_SECURITY_RBAC_SPECIFICATION.md` | RBAC, ABAC, break-glass, encryption, compliance |
| 09 | `09_OBSERVABILITY_OPERATIONS_SPECIFICATION.md` | Metrics, logs, traces, SLOs, runbooks |
| 10 | `10_AI_AGENT_MASTER_BUILD_SPECIFICATION.md` | AI advisory features, hard rules, no autonomous actions |
| 11 | `11_FINAL_MENU_NAVIGATION_SPECIFICATION.md` | 14 menu groups, Self-Care Portal, navigation tree |
| 12 | `12_IMPLEMENTATION_PHASE_ROADMAP.md` | 12 phases with stop-and-approve gates |

## Working with these docs

- **Every code change must trace back to a doc requirement.** If a doc needs to change,
  update the doc first, then the code.
- **ADRs are immutable once accepted.** New decisions get a new ADR number, never edit
  an accepted one.
- **Enum freeze is a schema-freeze gate** (ADR-025). The 99 unique enums must be locked
  before Phase 2 schema freeze.

## Source

These docs were originally uploaded to the GitHub repo at
`Cryptsk_Product_Architecture_Design_Pack_FINAL/` and have been reorganized to
`docs/architecture/` as part of the Phase 0 monorepo setup (commit `chore(cryptsk):
organize monorepo structure`).
