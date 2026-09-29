# CRYPTSK Nexus — Canonical Implementation Phase Roadmap

**Document Type:** Execution / Build Governance
**Product:** CRYPTSK Nexus
**Company:** CRYPTSK PRIVATE LIMITED
**Status:** LOCKED
**Authority:** Canonical implementation sequence

---

# 1. PURPOSE

This document defines **how CRYPTSK Nexus must actually be developed**.

The architecture pack defines a large production platform. An AI coding agent MUST NOT attempt to implement the entire product in one pass.

Development is strictly incremental:

```text
Discover
  ↓
Design within approved architecture
  ↓
Implement one phase
  ↓
Compile / migrate / test
  ↓
End-to-end validation
  ↓
Phase Gate
  ↓
STOP
  ↓
Human/Project approval
  ↓
Next phase
```

A later phase MUST NOT be started merely because the previous phase's source code exists. The previous phase must pass its gate.

---

# 2. AUTHORITATIVE BUILD ORDER

This document is the **single canonical global implementation sequence**.

Other architecture documents may contain domain-specific phase groupings for explanation or subsystem design. Those lists MUST NOT be interpreted as permission to reorder the global build.

The global order is:

```text
Phase 0   Architecture & Repository Foundation
Phase 1   Platform Core / Identity / Administration
Phase 2   Customer / Service / Product / Package Core
Phase 3   AAA
Phase 4   Session Engine
Phase 5   Policy Engine
Phase 6   VPP Gateway / Dataplane
Phase 7   OSS/BSS Functional Expansion
Phase 8   Advanced Network & Security
Phase 9   Intelligence
Phase 10  Scale / HA / Production Hardening
```

No phase may be skipped.

A feature that appears in a later phase remains part of the final product scope; it is simply not implemented yet.

---

# 3. NON-NEGOTIABLE AGENT RULE

The AI coding agent MUST follow this rule:

> **Implement ONLY the current approved phase. Do not automatically continue to the next phase.**

At the beginning of every work session the agent must identify:

- current phase;
- phase objective;
- allowed features;
- dependencies already completed;
- dependencies intentionally deferred;
- acceptance criteria;
- tests required;
- phase-gate conditions.

If the current phase is not explicitly established, the agent must stop and report the ambiguity instead of choosing a phase itself.

---

# 4. WHAT "PHASE COMPLETE" MEANS

A phase is complete only when the implemented scope works end-to-end.

For every feature included in the phase, the implementation must cover the applicable layers:

```text
Database / persistence
        ↓
Domain model / business logic
        ↓
API / service contract
        ↓
Events / workers where required
        ↓
Security / RBAC / audit
        ↓
Observability
        ↓
UI / UX
        ↓
Automated tests
        ↓
E2E workflow
```

A phase is **NOT complete** when:

- only the UI exists;
- only APIs exist;
- tables exist without business logic;
- mock data is used instead of real persistence;
- an endpoint returns hard-coded success;
- a feature is visible but not functional;
- tests are skipped;
- production build is broken;
- migrations are incomplete;
- security controls are missing;
- observability is missing where required.

---

# 5. PHASE 0 — ARCHITECTURE & REPOSITORY FOUNDATION

## Objective

Create a stable engineering foundation before implementing business modules.

## Build

- repository structure;
- service boundaries;
- package/module boundaries;
- technology BOM;
- environment configuration;
- configuration management;
- PostgreSQL migration framework;
- API conventions;
- error model;
- logging;
- tracing/metrics baseline;
- CI pipeline;
- linting/formatting;
- automated test framework;
- module/feature registry foundation;
- licensing/module-state foundation;
- base security primitives;
- base UI shell and design tokens;
- deployment skeleton;
- health/readiness endpoints.

## Do NOT build yet

- full subscriber workflows;
- full billing;
- full AAA;
- VPP packet forwarding;
- AI;
- advanced network integrations.

## Gate

Must pass:

- clean repository bootstrap;
- development environment reproducible;
- database migration up/down strategy verified;
- typecheck/lint/test/build pass;
- base services start correctly;
- health/readiness checks pass;
- baseline observability works;
- no architecture conflict remains unresolved.

**STOP after Phase 0.**

---

# 6. PHASE 1 — PLATFORM CORE / IDENTITY / ADMINISTRATION

## Objective

Create the platform control plane on which all later modules depend.

## Build

- authentication;
- users;
- roles;
- permissions;
- RBAC enforcement;
- audit logging;
- system settings;
- module manager;
- feature flags;
- licensing state;
- API key/service identity foundation;
- notification foundation;
- dashboard shell;
- navigation shell;
- user/profile administration;
- system health UI.

## Gate

Verify:

```text
User → Login → RBAC → Authorized page/API → Audit event
Module → Enabled/Disabled → Navigation/API behavior changes correctly
```

No unauthorized API may bypass UI-level RBAC.

**STOP after Phase 1.**

---

# 7. PHASE 2 — CUSTOMER / SERVICE / PRODUCT / PACKAGE CORE

## Objective

Establish the commercial and customer domain required by AAA, policy and billing.

## Build

- customers/accounts;
- subscriber/service-consumer identity;
- contacts;
- addresses;
- sites/locations where applicable;
- products;
- packages/plans;
- pricing;
- subscriptions/services;
- service lifecycle;
- prepaid/postpaid commercial definitions;
- top-up/voucher product definitions;
- add-ons;
- customer 360;
- optional Organization & Scope framework;
- self-care foundation.

## Gate

Verify:

```text
Customer
 → Service/Subscriber
 → Product/Package
 → Subscription
 → Lifecycle state
 → Customer 360
 → Audit
```

**STOP after Phase 2.**

---

# 8. PHASE 3 — AAA

## Objective

Implement authentication, authorization and accounting as a production-grade AAA subsystem.

## Build

- NAS management;
- FreeRADIUS integration;
- RADIUS users/groups/attributes;
- authentication;
- authorization;
- accounting ingestion;
- accounting correlation;
- CoA;
- disconnect;
- authentication logs;
- RADIUS operational controls.

## Gate

Required E2E workflow:

```text
Subscriber
 → Authentication Request
 → AAA decision
 → Access-Accept/Reject
 → Accounting Start
 → Session association
 → CoA/Disconnect
 → Accounting Stop
 → History/Audit
```

**Important:** Access-Accept alone does NOT mean dataplane provisioning succeeded.

**STOP after Phase 3.**

---

# 9. PHASE 4 — SESSION ENGINE

## Objective

Build the universal live-session control plane used by AAA-only, Gateway-only and Multi-mode deployments.

## Build

- session lifecycle;
- session ownership;
- authoritative live-session state;
- session identity;
- generation/epoch;
- idempotency;
- event ordering;
- recovery;
- reconciliation;
- accounting correlation;
- session history integration;
- session actions;
- VPP/NAS adapter interfaces without requiring full VPP dataplane yet.

## Gate

Verify:

```text
Create → Active → Update → Disconnect → Stop
```

and:

```text
Restart → Recover → Reconcile → No duplicate session
```

Race conditions, stale generations and duplicate events must be tested.

**STOP after Phase 4.**

---

# 10. PHASE 5 — POLICY ENGINE

## Objective

Create the deterministic policy decision and compilation layer between business intent and enforcement adapters.

## Build

- policy model;
- policy groups;
- bandwidth policy;
- access-time policy;
- data-transfer policy;
- FUP/fair-access policy;
- application/content policy;
- security policy;
- authorization policy;
- QoS policy;
- Surfing Quota where enabled;
- policy versions;
- precedence;
- conflict resolution;
- effective-policy explanation;
- policy simulator;
- validation;
- compiler;
- plan-to-policy mapping;
- staged changes;
- rollback;
- audit.

## Gate

For a known subscriber, the system must be able to explain:

```text
Subscriber
 → Service/Plan
 → Assigned Policies
 → Precedence
 → Effective Policy
 → Compiled Enforcement Intent
```

Policy calculation must be deterministic and testable.

**STOP after Phase 5.**

---

# 11. PHASE 6 — VPP GATEWAY / DATAPLANE

## Objective

Implement the high-performance Gateway-only and Multi-mode dataplane using DPDK + VPP.

## Build

- DPDK initialization;
- VPP integration;
- GoVPP adapter;
- interfaces;
- VLAN/VRF;
- routing;
- IP assignment integration;
- subscriber dataplane objects;
- ACL;
- QoS;
- NAT;
- telemetry;
- dataplane reconciliation;
- restart recovery.

## Hard boundary

Normal runtime provisioning MUST use the VPP Binary API/GoVPP abstraction.

Do not make `vppctl`, shell scripts, nftables or tc the normal subscriber runtime enforcement path.

No blocking database/HTTP operation may occur inside VPP workers.

## Gate

Validate:

```text
AAA decision
 → Session Engine
 → Policy Engine
 → VPP Adapter
 → VPP dataplane
 → Traffic
```

and failure handling:

```text
VPP restart
 → Session reconciliation
 → Dataplane rebuild
 → Correct subscriber state
```

**STOP after Phase 6.**

---

# 12. PHASE 7 — OSS/BSS FUNCTIONAL EXPANSION

## Objective

Complete the core commercial, operational and reporting capabilities without destabilizing AAA/session/dataplane foundations.

## Build in controlled module groups

### 7A — Billing

- prepaid;
- postpaid;
- recurring/cyclic billing;
- invoices;
- invoice templates;
- grace periods;
- suspension/reactivation;
- add-ons;
- charge overrides;
- credits/adjustments;
- tax.

### 7B — Payments

- payment records;
- payment gateway abstraction;
- verification;
- allocation;
- reconciliation;
- refund/reversal;
- payment history.

### 7C — Collections

- overdue management;
- due recovery;
- payment plans;
- collection workflows;
- agent reconciliation.

### 7D — Operations

- complaints;
- tickets;
- incidents;
- installations;
- inventory/assets;
- technicians/agents;
- reseller operations where enabled.

### 7E — Reporting

- operational reports;
- billing reports;
- subscriber reports;
- collection reports;
- export;
- analytics foundations.

### 7F — Communications

- email;
- SMS;
- WhatsApp where enabled;
- notification templates/rules.

## Gate

Every financial workflow must be deterministic, auditable and covered by automated tests.

Payment state must support:

```text
received → verified → allocated → reconciled
                         ↓
                  refunded/reversed
```

**STOP after Phase 7.**

---

# 13. PHASE 8 — ADVANCED NETWORK & SECURITY

## Objective

Add optional/deployment-specific network and security capabilities on top of stable core runtime.

## Build in controlled module groups

- DHCP/DHCPv6;
- DNS;
- PPPoE;
- captive portal/hotspot;
- walk-in/temporary access;
- IPAM expansion;
- NAT/NAT logs;
- Web Browsing / HTTP Logs where technically visible and enabled;
- DPI/application awareness;
- URL/content filtering;
- firewall/security profiles;
- IPS/DDoS/security integrations;
- VPN;
- Multi-WAN/gateway management;
- dynamic routing;
- FTTH/GPON integrations;
- device management adapters;
- RADIUS Proxy/Diameter/offload where enabled.

Hardware/vendor-specific integrations must use stable adapter contracts.

## Gate

Each advanced module must have:

- enable/disable behavior;
- permissions;
- API contract;
- persistence;
- audit;
- observability;
- failure behavior;
- E2E test;
- deployment-mode validation.

**STOP after Phase 8.**

---

# 14. PHASE 9 — INTELLIGENCE

## Objective

Add AI and advanced intelligence only after core workflows are stable.

## Build

- AI Advisor;
- AI Diagnosis;
- churn risk/prediction;
- retention recommendations;
- revenue forecasting;
- plan recommendations;
- operational recommendations;
- competitor intelligence where enabled.

## Hard rule

AI MUST NOT be a dependency for:

- authentication;
- authorization;
- accounting;
- live session control;
- policy enforcement;
- billing correctness;
- payment reconciliation;
- core gateway forwarding.

## Gate

AI outputs must be traceable to source data, have clear confidence/limitations where applicable, and fail safely without affecting core operations.

**STOP after Phase 9.**

---

# 15. PHASE 10 — SCALE / HA / PRODUCTION HARDENING

## Objective

Turn the validated product into a production-qualified release.

## Build/validate

- HA/failover;
- restart recovery;
- stale-session recovery;
- backup/restore;
- DR procedures;
- security audit;
- dependency audit;
- RBAC audit;
- upgrade testing;
- migration testing;
- performance testing;
- memory/CPU testing;
- observability validation;
- hardware qualification;
- release BOM;
- operational runbooks;
- 10K validation;
- 25K validation;
- 50K certification;
- 75K validation;
- 100K scale validation;
- 50 Gbps-class hardware qualification where supported by the selected hardware.

## Gate

Production release requires all critical E2E, security, recovery and scale gates to pass.

**STOP. Release only after formal production approval.**

---

# 16. PHASE GATE CHECKLIST

Every phase must produce:

```text
[ ] Scope reviewed
[ ] Dependencies verified
[ ] Database migrations complete
[ ] APIs complete
[ ] Business logic complete
[ ] Events/workers complete where required
[ ] RBAC complete
[ ] Audit complete
[ ] Observability complete
[ ] UI complete for included user workflows
[ ] Unit tests pass
[ ] Integration tests pass
[ ] E2E tests pass
[ ] Failure/error paths tested
[ ] Typecheck passes
[ ] Lint passes
[ ] Build passes
[ ] Migration validation passes
[ ] Performance/resource behavior checked where applicable
[ ] Documentation updated
[ ] Known defects recorded
[ ] No unresolved architecture conflict
[ ] Phase acceptance criteria passed
[ ] Phase report generated
[ ] Explicit approval to proceed obtained
```

---

# 17. REQUIRED PHASE REPORT

At the end of each phase, the agent must report:

```text
CRYPTSK Nexus Phase Report

Phase:
Status: PASS / BLOCKED / FAILED

Completed:
-

Not completed:
-

Database migrations:
-

API contracts:
-

Events/workers:
-

Security/RBAC:
-

Audit:
-

Observability:
-

Tests:
-

E2E workflows:
-

Performance:
-

Known defects:
-

Architecture decisions created/changed:
-

Risks:
-

Next phase:
-

Approval required to continue: YES
```

The agent MUST NOT silently move from `Next phase` into implementation.

---

# 18. PARALLEL WORK RULE

Parallel development is permitted only **inside the current phase** when dependencies are clear.

Example:

```text
Phase 2
 ├── Customer domain
 ├── Product/Package domain
 ├── Subscription domain
 └── UI workflows
```

These may be developed in parallel only if their contracts are stable and they do not violate domain ownership.

Cross-phase work is prohibited unless the current phase explicitly requires a dependency stub/interface.

A later-phase component may be represented by an interface or contract, but the agent must not implement the later feature prematurely.

---

# 19. MOCK / STUB RULE

Mocks and stubs are permitted only for:

- external systems not yet available;
- contract tests;
- development harnesses;
- deterministic test fixtures.

Mocks MUST NOT be presented as production functionality.

Before a phase gate, every in-scope production workflow must use the real approved implementation path.

---

# 20. CHANGE CONTROL DURING DEVELOPMENT

If the agent discovers that implementation requires a change to:

- architecture;
- data ownership;
- security boundary;
- packet path;
- session authority;
- API contract;
- product scope;
- technology choice;

it must STOP the affected work and create an ADR/change request.

Do not silently redesign the platform to make implementation easier.

---

# 21. FIRST COMMAND TO THE AI AGENT

The first implementation instruction should be:

> Read the complete CRYPTSK Nexus architecture pack. Do not code the product yet. Identify the authoritative documents, confirm the canonical phase roadmap, inspect the repository, produce the Architecture Map and Phase 0 execution checklist, and STOP for approval.

The second instruction should begin implementation of Phase 0 only after the project owner approves the Phase 0 execution plan.

---

# 22. FINAL RULE

**CRYPTSK Nexus is built phase-by-phase, not feature-by-feature at random and not all-at-once.**

The agent must always preserve:

```text
Architecture integrity
        ↓
Domain ownership
        ↓
Contracts
        ↓
Data integrity
        ↓
Security
        ↓
Runtime correctness
        ↓
UI/UX
        ↓
Observability
        ↓
E2E validation
        ↓
Phase gate
        ↓
Approval
        ↓
Next phase
```

This roadmap is mandatory for implementation.
