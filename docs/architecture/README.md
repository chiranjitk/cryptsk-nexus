# CRYPTSK NEXUS — PRODUCT ARCHITECTURE DESIGN PACK

**Status: LOCKED DESIGN BASELINE — 2026-09-28**

**Final document set:** v1.0 architecture baseline / Menu v4.0

**Locked product name:** **CRYPTSK Nexus**  
**Descriptor:** **Enterprise OSS/BSS & Gateway Platform**  
**Company:** **CRYPTSK PRIVATE LIMITED**  
**Short name:** **Nexus**  
**Marketing line:** **One Platform. Every Connection. Complete Control.**

## Purpose

This folder is the architecture/design package to be given to the AI development agent before implementation. It is intended to be the product engineering source set, not a loose collection of notes.

## Reading order

1. `00_MASTER_PRODUCT_ARCHITECTURE.md` — **TOP-LEVEL AUTHORITY**
2. `01_OSS_BSS_ARCHITECTURE.md` — OSS/BSS architecture

## Canonical Implementation Roadmap

**`12_IMPLEMENTATION_PHASE_ROADMAP.md` is the mandatory global build sequence.**

The AI agent must implement one phase at a time, pass the phase gate, generate the phase report, and stop for approval before starting the next phase. Domain-specific phase lists elsewhere in the pack do not override this canonical sequence.

3. `02_ENTERPRISE_GATEWAY_ARCHITECTURE.md` — AAA/session/dataplane architecture
4. `03_ARCHITECTURE_DECISION_REGISTER.md` — binding architecture decisions
5. `04_PRODUCT_FEATURE_CATALOGUE.md` — functional scope and preserved product capability
6. `05_API_INTERFACE_CONTRACT.md` — API, RPC, event and gateway-control contracts
7. `06_DATABASE_DATA_MODEL_SPECIFICATION.md` — canonical data architecture
8. `07_UI_UX_IMPLEMENTATION_SPECIFICATION.md` — product design system and UX behavior
9. `08_SECURITY_RBAC_SPECIFICATION.md` — security, RBAC and trust boundaries
10. `09_OBSERVABILITY_OPERATIONS_SPECIFICATION.md` — observability and production operations
11. `10_AI_AGENT_MASTER_BUILD_SPECIFICATION.md` — implementation contract for the engineering agent
12. `11_FINAL_MENU_NAVIGATION_SPECIFICATION.md` — canonical final menu, submenu, Base/Add-on and vertical-navigation authority

## Authority

The Master document owns:
- overall product scope boundaries
- two-plane architecture
- three deployment modes
- domain ownership
- conflict resolution
- shared architectural rules
- implementation order
- AI-agent hard rules

The Feature Catalogue owns the functional capability inventory and preserves the current product behavior/visual identity.

Documents 05–09 convert that functional scope into implementation contracts. Document 10 governs how the AI agent consumes the complete set without silently changing architecture or product scope.

## Important

Do NOT treat detailed documents as independent master specifications.

Do NOT start coding until the agent has read the complete pack and produced an architecture map plus an ADR list for any unresolved conflicts.

The source feature sheet is a functional baseline. The final pack is now locked for implementation: no silent scope, architecture, menu, API, data, security, or licensing changes are permitted. Legacy implementation mechanisms such as TC/nftables, PM2, Bun mini-services, direct RADIUS synchronization, and Next.js runtime APIs must not be copied into the new dataplane architecture merely because they exist in the old implementation.

## Design target

- 100,000 concurrent active sessions: architectural target
- 50,000 concurrent sessions: initial certification target
- 50 Gbps-class: hardware-qualified target
- Exactly three deployment modes: AAA-only, Gateway-only, Multi-mode
- Production durable database: PostgreSQL
- Gateway dataplane: DPDK + VPP
- AAA: FreeRADIUS
- Live session authority: Session Engine
- Management/UI: Next.js + React + TypeScript with preserved Cryptsk visual identity

## Product principle

The documents must be implemented as one coherent platform:

> AAA decides. Session Engine remembers. Policy Engine translates. VPP enforces. PostgreSQL persists. Monitoring observes. Management controls.

## Finalization notes

- `11_FINAL_MENU_NAVIGATION_SPECIFICATION.md` is the canonical navigation authority.
- The supplied 24online module list was used only as a capability-parity reference.
- Legacy names are not copied when a stronger Cryptsk-native capability name exists.
- Areas / POPs / Zones / LCOs remain optional Organization & Scope capabilities, not Universal Base.
- NAT Logs represent the Net Kapture-style NAT/IP translation traceability requirement.
- Web Browsing / HTTP Logs represent the Web Surfing Logger requirement.
- Cache QoS is intentionally excluded.
- Multi-Gateway capability is covered by Gateway Management + Multi-WAN; no duplicate legacy menu is required.

## Lock / Change Control

This pack is one product specification. The documents are subordinate by domain, not independent designs. If implementation discovers a contradiction or required scope change:

```text
STOP
→ record ADR in 03
→ update affected authority documents
→ update API/data/UI/security/observability contracts
→ update tests and Feature Registry
→ rebuild the final pack
→ continue implementation
```

The agent must not silently add or remove product capability after this lock.

The source feature inventory reports 204 models and 90 enums; the named model list reconciles to 204 entries, while the named enum list contains 99 unique entries. Enum reconciliation remains an explicit schema-freeze gate.
