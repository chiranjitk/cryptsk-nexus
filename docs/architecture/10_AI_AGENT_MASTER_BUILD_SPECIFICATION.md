# CRYPTSK NEXUS — AI AGENT MASTER BUILD SPECIFICATION
## The implementation contract for the engineering agent

**Status:** LOCKED MASTER IMPLEMENTATION HANDOFF
**Authority:** Subordinate to `00_MASTER_PRODUCT_ARCHITECTURE.md`; consumes `01`–`09` as domain contracts and `11_FINAL_MENU_NAVIGATION_SPECIFICATION.md` as the canonical navigation authority.

---

# 1. PURPOSE

This document tells the AI development agent how to build CRYPTSK Nexus without turning the product into a prototype, fragmented collection of pages, or technically inconsistent set of services.

The agent MUST optimize for:

- architectural correctness;
- complete functional coverage;
- production security;
- operational observability;
- maintainability;
- measurable performance;
- recovery;
- clean domain boundaries;
- preserved UI identity;
- real end-to-end behavior.

The agent MUST NOT optimize merely for:

- number of generated files;
- number of pages that render;
- superficial API coverage;
- passing a mock/demo workflow;
- visual similarity without real data;
- raw benchmark numbers without reproducible test conditions.

---

# 2. DOCUMENT READING ORDER

The agent MUST read:

```text
00_MASTER_PRODUCT_ARCHITECTURE.md
01_OSS_BSS_ARCHITECTURE.md
02_ENTERPRISE_GATEWAY_ARCHITECTURE.md
03_ARCHITECTURE_DECISION_REGISTER.md
04_PRODUCT_FEATURE_CATALOGUE.md
05_API_INTERFACE_CONTRACT.md
06_DATABASE_DATA_MODEL_SPECIFICATION.md
07_UI_UX_IMPLEMENTATION_SPECIFICATION.md
08_SECURITY_RBAC_SPECIFICATION.md
09_OBSERVABILITY_OPERATIONS_SPECIFICATION.md
11_FINAL_MENU_NAVIGATION_SPECIFICATION.md
10_AI_AGENT_MASTER_BUILD_SPECIFICATION.md
```

Then create an internal architecture map before writing implementation code.

---

# 3. FIRST DELIVERABLE — ARCHITECTURE MAP

Before feature coding, the agent produces:

```text
Product planes
Deployment modes
Bounded contexts
Domain ownership
Data ownership
API surfaces
Event flows
Gateway control path
Session lifecycle
RBAC model
Feature registry
Observability model
Test strategy
Build phases
Known ADRs
Unknowns requiring ADR
```

The agent may not invent missing architecture silently.

---

# 4. SINGLE SOURCE OF FUNCTIONAL SCOPE

`04_PRODUCT_FEATURE_CATALOGUE.md` answers:

> What must the product do?

All approved capabilities in `04_PRODUCT_FEATURE_CATALOGUE.md` are in scope. The 113-page inventory is a legacy functional inventory, not the final navigation hierarchy. Product scope is locked; any addition, removal, or redefinition requires the change-control process in `03_ARCHITECTURE_DECISION_REGISTER.md`.

The agent MUST NOT use "not currently in the navigation" as a reason to delete a feature.

`11_FINAL_MENU_NAVIGATION_SPECIFICATION.md` defines how those capabilities are presented in the final sidebar and submenu hierarchy. Navigation visibility is additionally controlled by deployment mode, licensing/module state, vertical profile, and RBAC.

---

# 5. IMPLEMENTATION AUTHORITY

Architecture decisions:

```text
00–03
```

Functional scope:

```text
04
```

Interfaces:

```text
05
```

Data model:

```text
06
```

UI/UX:

```text
07
```

Security:

```text
08
```

Operations:

```text
09
```

Implementation workflow:

```text
10
```

---

# 6. GOLDEN ARCHITECTURE

```text
                      MANAGEMENT / OSS-BSS
                              |
                    Next.js / TypeScript UI
                              |
                         API Contract
                              |
                    Domain/Application Layer
                              |
                +-------------+-------------+
                |                           |
           PostgreSQL                 Event/Job Layer
                |                           |
                +-------------+-------------+
                              |
                      Network Control Plane
                              |
         +--------------------+--------------------+
         |                    |                    |
     FreeRADIUS         Session Engine        Policy Engine
                              |                    |
                              +---------+----------+
                                        |
                                   VPP Adapter
                                        |
                                  VPP / DPDK
                                        |
                                      NIC
```

Golden responsibility sentence:

```text
AAA decides.
Session Engine remembers.
Policy Engine translates.
VPP enforces.
PostgreSQL persists.
Monitoring observes.
Management controls.
```

---

# 7. THREE DEPLOYMENT MODES — EXACTLY THREE

## Mode 1 — AAA-only

```text
External NAS
 → FreeRADIUS
 → Session Engine / AAA control
 → PostgreSQL
```

## Mode 2 — Gateway-only

```text
NIC
 → DPDK
 → VPP
 ← Session/Policy Control
```

Authentication may be local/captive/LDAP/API according to enabled features.

## Mode 3 — Multi-mode

```text
External NAS/access
 → FreeRADIUS
 → Session Engine
 → Policy Engine
 → VPP Adapter
 → VPP/DPDK
```

Do not create a fourth architectural mode disguised as a "special deployment".

---

# 8. NON-NEGOTIABLE TECHNOLOGY BOUNDARY

The new gateway dataplane is:

- DPDK;
- VPP;
- GoVPP/VPP Binary API;
- Go Session Engine;
- FreeRADIUS for AAA.

The OSS/BSS management experience is:

- Next.js;
- React;
- TypeScript;
- Tailwind/shadcn design system;
- PostgreSQL.

Do not use:

- Next.js as packet forwarding;
- Java/Tomcat as packet forwarding;
- shell scripts as normal subscriber policy enforcement;
- nftables/tc as the primary new subscriber dataplane;
- vppctl as normal runtime provisioning;
- PostgreSQL per-packet;
- Redis as hidden session authority.

---

# 9. REPOSITORY / CODE ORGANIZATION

Use domain-oriented modules.

Illustrative structure:

```text
/apps
  /web
  /api
  /session-engine
  /gateway-controller
  /radius-integration

/packages
  /domain
  /contracts
  /auth
  /db
  /events
  /observability
  /ui
  /feature-registry
  /policy-model

/gateway
  /vpp-adapter
  /dataplane-contracts

/ops
  /migrations
  /deploy
  /runbooks
  /tests

/docs
  /architecture
  /api
  /adr
  /runbooks
```

The exact repository layout can differ, but ownership boundaries must remain.

---

# 10. MODULAR MONOLITH RULE

The management plane may start as a modular monolith plus selective workers.

Each domain has:

```text
Domain API
Domain service
Repository/query layer
Validation
Events
Permissions
Audit hooks
Tests
```

Selective extraction is allowed when:

- scale justifies it;
- isolation is needed;
- failure domain is important;
- ownership is clear.

Do not create a microservice for every menu item.

---

# 11. FEATURE REGISTRY FIRST

Build a machine-readable feature registry before creating 100+ navigation entries.

Each feature record:

```text
feature_id
module_id
name
description
status
enabled_by_default
optional
license
modes
dependencies
route
permissions
queries
commands
events
data_domains
runtime_components
observability
```

This registry becomes the coordination point between:

- navigation;
- licensing;
- RBAC;
- tests;
- API docs;
- documentation;
- deployment-mode capability.

---

# 12. BUILD ORDER

**CANONICAL EXECUTION RULE — READ FIRST**

The complete global implementation sequence is defined by `12_IMPLEMENTATION_PHASE_ROADMAP.md`. This document remains the AI-agent master build specification, but its phase descriptions are subordinate to that canonical roadmap. The agent MUST implement only the currently approved phase, pass the phase gate, produce the required phase report, and STOP. It MUST NOT automatically continue into later phases.


## Phase 0 — Architecture foundation

Deliver:

- architecture map;
- ADR cleanup;
- feature registry schema;
- repository boundaries;
- CI baseline;
- coding standards;
- API contract system;
- database migration system;
- observability baseline;
- security baseline.

No large feature coding yet.

## Phase 1 — Identity / administration

Deliver:

- admin auth;
- RBAC;
- audit;
- configuration;
- feature/module registry;
- API keys;
- notification base;
- dashboard shell.

## Phase 2 — Subscriber / customer / plan core

Deliver:

- customer / account;
- subscriber or service-consumer identity where applicable;
- service / subscription;
- product catalog;
- plans / packages;
- prepaid / postpaid commercial model definitions;
- top-up / voucher capability definitions;
- pricing;
- service lifecycle;
- optional Organization & Scope foundation when licensed/enabled;
- self-care foundation.

## Phase 3 — AAA

Deliver:

- NAS;
- RADIUS users/groups/attributes;
- FreeRADIUS integration;
- authentication;
- accounting ingestion;
- CoA/disconnect;
- auth logs.

## Phase 4 — Session Engine

Deliver:

- live sessions;
- ownership;
- epoch/generation;
- idempotency;
- recovery;
- reconciliation;
- accounting correlation.

## Phase 5 — Policy Engine

Deliver:

- policy schema and groups;
- Surfing Quota where enabled;
- Access Time;
- Bandwidth;
- Data Transfer Policy;
- Fair Access Policy / FUP;
- Application / Content Policy;
- Security Profiles;
- Access / Authentication Policy;
- policy versions;
- precedence / conflict resolution;
- policy simulator / effective-policy explanation;
- compiler;
- validation;
- plan-to-policy mapping;
- staged changes / rollback / audit.

## Phase 6 — VPP Gateway

Deliver:

- DPDK/VPP integration;
- subscriber dataplane objects;
- IP assignment;
- ACL;
- QoS;
- NAT;
- routing;
- telemetry;
- restart recovery.

## Phase 7 — OSS/BSS functional expansion

Deliver:

- prepaid billing;
- postpaid billing;
- recurring / cyclic billing;
- invoices / invoice templates;
- payment recording / gateway integrations / reconciliation;
- top-ups / vouchers / PINs where enabled;
- collections / due recovery / payment plans;
- credits / adjustments / refunds;
- tax;
- service contracts / AMC where enabled;
- support / tickets / complaints;
- inventory / assets;
- device management;
- reporting / analytics;
- communications.

## Phase 8 — Advanced network/security

Deliver:

- DHCP/DHCPv6;
- DNS;
- PPPoE;
- captive portal;
- hotspot / walk-in access;
- NAT / NAT logs;
- Web Browsing / HTTP Logs where enabled and technically visible;
- DPI/application awareness;
- IPS/DDoS/security;
- VPN;
- multi-WAN / gateway management;
- dynamic routing;
- FTTH/GPON integrations.

## Phase 9 — Intelligence

Deliver:

- AI advisor;
- diagnosis;
- churn;
- retention;
- revenue forecast;
- plan recommendations;
- competitor intelligence.

AI is additive; core product remains fully functional without it.

## Phase 10 — Scale / HA / production hardening

Deliver:

- 50K certification;
- 100K scale validation plan;
- failover;
- recovery;
- security hardening;
- DR restore;
- operational runbooks.

---

# 13. DO NOT BUILD THE UI FIRST AND BACKEND LATER

For every major feature:

```text
Domain contract
→ data model
→ API/event contract
→ business logic
→ authorization/audit
→ observability
→ UI
→ E2E test
```

The UI is a client of a real product domain.

---

# 14. FEATURE IMPLEMENTATION TEMPLATE

For every feature create:

```text
Feature ID
Owner domain
Dependencies
Data entities
Commands
Queries
Events
Permissions
Audit events
Observability
UI routes
Failure modes
Deployment modes
Test plan
```

Then implement all layers.

---

# 15. NO MOCKS IN PRODUCTION PATH

The agent must not leave:

- hard-coded metrics;
- fake subscriber lists;
- fake session counts;
- fake network health;
- pretend VPP success;
- pretend payment success;
- random AI text replacing real analysis;
- placeholder API responses.

Mocks are allowed only in isolated tests and demos whose status is explicit.

---

# 16. NO SILENT FEATURE LOSS

The agent must never silently:

- remove a source feature;
- remove a page because it is difficult;
- replace a real integration with a stub;
- merge features without preserving workflows;
- remove dashboard widgets;
- remove self-care;
- remove billing depth;
- remove network controls;
- remove AAA operational visibility.

Any consolidation requires an ADR and capability traceability.

---

# 17. DATABASE IMPLEMENTATION RULE

The agent must first reconcile the source model inventory.

Do not create "204 tables" as a success metric.

The canonical schema is driven by domain ownership, normalization, performance, auditability, and migration correctness.

---

# 18. API IMPLEMENTATION RULE

All UI operations map to stable API commands/queries.

Avoid hundreds of tiny endpoint-specific business implementations with duplicated authorization and validation.

Use consistent:

- error codes;
- pagination;
- filtering;
- idempotency;
- correlation;
- audit.

---

# 19. GATEWAY IMPLEMENTATION RULE

The normal runtime path is:

```text
AAA / local auth
 → Session Engine
 → policy resolution
 → VPP Adapter
 → VPP
```

Session state transitions:

```text
REQUESTED
 → AUTHENTICATING
 → AUTHENTICATED
 → PROVISIONING
 → ACTIVE
```

If provisioning fails:

```text
PROVISIONING
 → FAILED
```

Never mark the session ACTIVE merely because Access-Accept was returned.

---

# 20. SESSION ENGINE HARD RULES

The Session Engine MUST implement:

- unique session ID;
- ownership;
- epoch/generation;
- idempotency;
- event ordering;
- stale-event rejection;
- VPP reconnect handling;
- state reconciliation;
- restart recovery;
- bounded concurrency;
- no one goroutine/process per subscriber;
- no synchronous DB dependency per packet.

---

# 21. WORKER MODEL

Workers process classes of work:

- accounting;
- notification;
- report;
- provisioning;
- reconciliation;
- integration;
- AI.

Each worker has:

- bounded queue;
- concurrency limit;
- retry policy;
- dead-letter/error state;
- metrics;
- graceful shutdown;
- recovery.

---

# 22. ERROR HANDLING

Every implementation must distinguish:

```text
Validation failure
Authorization failure
Not found
Conflict
Dependency unavailable
Timeout
Transient failure
Permanent failure
```

Retry only when safe.

Do not turn permanent failures into infinite retries.

---

# 23. CODE QUALITY RULES

The agent should prefer:

- strict typing;
- small domain services;
- explicit interfaces;
- deterministic functions;
- dependency inversion;
- testable units;
- clear error types;
- structured logging;
- comments explaining "why", not obvious "what".

Avoid:

- giant files containing unrelated domains;
- hidden global state;
- circular imports;
- arbitrary singleton caches;
- `any`/unsafe casts without a documented reason;
- copy-paste implementations across 100 pages.

---

# 24. UI IMPLEMENTATION RULE

The UI MUST implement the product design in `07` and the feature sheet.

Do not replace it with:

- generic SaaS dashboard templates;
- default shadcn theme without product tokens;
- teal/green primary brand;
- inconsistent cards;
- random iconography;
- arbitrary navigation patterns.

The dark navy sidebar + red identity is non-negotiable.

---

# 25. DASHBOARD IMPLEMENTATION RULE

The 40-widget dashboard is a functional product surface.

Build shared dashboard infrastructure first:

```text
WidgetCard
Widget registry
Widget data contracts
Query/cache layer
Refresh policy
Skeleton system
Tooltip system
Chart primitives
Dashboard status bar
```

Then add individual widgets.

Do not implement 40 widgets as 40 unrelated mini-applications.

---

# 26. SECURITY IMPLEMENTATION RULE

Every feature declares:

- auth requirement;
- permissions;
- sensitive fields;
- audit events;
- rate limit;
- threat considerations.

Security review occurs before declaring a feature complete.

---

# 27. OBSERVABILITY IMPLEMENTATION RULE

Every service and worker exposes:

- health;
- metrics;
- structured logs;
- traces for critical operations.

Every user-visible long-running operation exposes status.

---

# 28. TESTING PYRAMID

Use multiple layers.

## Unit

Pure business logic, validators, policy compilation, calculations.

## Integration

PostgreSQL, FreeRADIUS integration, VPP adapter boundary, event delivery.

## Contract

API/OpenAPI/protobuf/event compatibility.

## E2E

Real workflows through UI/API/domain/integration.

## Performance

AAA, Session Engine, gateway control, DB, dashboard/report workloads.

## Chaos/recovery

Service restart, dependency loss, VPP restart, network interruption, duplicate events.

---

# 29. E2E WORKFLOW GATES

Critical workflow examples:

### Subscriber activation

```text
Create subscriber
→ assign plan
→ provision AAA
→ authenticate
→ create session
→ VPP policy apply
→ session ACTIVE
→ accounting
→ billing visibility
```

### Plan change

```text
Edit plan
→ compile policy
→ publish version
→ affected session handling
→ VPP apply
→ audit
→ UI verification
```

### Payment

```text
Create payment
→ provider/webhook verification
→ idempotency
→ invoice allocation
→ balance update
→ audit
→ dashboard
```

### Gateway recovery

```text
VPP restart
→ detection
→ Session Engine reconciliation
→ policy rebuild
→ state restoration
→ verification
```

---

# 30. LOAD TESTING RULE

Capacity claims are valid only with reproducible test artifacts.

The test harness must record:

- hardware;
- kernel/driver/DPDK/VPP versions;
- topology;
- configuration;
- traffic mix;
- session/auth load;
- policy complexity;
- CPU/NUMA layout;
- results;
- errors;
- latency distribution.

---

# 31. 50K CERTIFICATION / 100K TARGET

The initial certification target is:

```text
50,000 concurrent sessions
```

The architecture target is:

```text
100,000 concurrent sessions
```

These are not user-count claims. The certification workload must exercise:

- authentication;
- accounting;
- CoA;
- disconnect;
- live policy;
- gateway enforcement;
- monitoring;
- database writes;
- recovery behavior.

---

# 32. 50 GBPS TARGET RULE

Treat 50 Gbps as a hardware-qualified target.

The agent must not write documentation claiming unconditional 50 Gbps throughput.

Certification must specify conditions and traffic profile.

---

# 33. DEPLOYMENT / SYSTEMD RULE

The initial production service lifecycle should use native service management (for example systemd) or another explicitly governed runtime supervisor.

Every service must support:

- start;
- stop;
- restart;
- graceful shutdown;
- health check;
- logs;
- resource limits.

Do not copy legacy PM2 process assumptions into the gateway architecture.

---

# 34. CONFIGURATION MANAGEMENT

Configuration must distinguish:

- defaults;
- deployment config;
- secrets;
- generated runtime config;
- business configuration;
- operator overrides.

Configuration changes should be validated before activation.

High-risk network config should support version/diff/rollback semantics where possible.

---

# 35. RELEASE PROCESS

```text
Feature branch
→ unit tests
→ lint/type checks
→ contract checks
→ integration tests
→ security scans
→ migration validation
→ E2E
→ performance/regression
→ release candidate
→ deployment validation
→ observability verification
```

Do not release because the UI compiled.

---

# 36. MIGRATION PROCESS

Database migrations must be:

- backward-aware where rolling deployment is used;
- tested against realistic data volume;
- observable;
- reversible or forward-fixable;
- accompanied by data verification.

Gateway configuration migrations must have equivalent compatibility handling.

---

# 37. DEFINITION OF DONE

A feature is DONE only when:

- architecture mapped;
- domain owner assigned;
- data model complete;
- API/event contract complete;
- authorization complete;
- audit complete where required;
- UI complete;
- loading/empty/error complete;
- observability complete;
- integration complete;
- tests complete;
- deployment mode behavior verified;
- no mock remains in production path;
- documentation updated;
- rollback/failure behavior understood.

---

# 38. AGENT SELF-CHECK BEFORE EVERY MERGE

Ask:

```text
Did I violate a master rule?
Did I duplicate a domain owner?
Did I bypass the API contract?
Did I write business SQL in UI code?
Did I create direct packet-path dependency on PostgreSQL?
Did I bypass RBAC?
Did I skip audit?
Did I create an unbounded queue?
Did I create a per-subscriber process/thread/connection?
Did I use shell/VPP CLI for normal runtime enforcement?
Did I add a fake fallback?
Did I forget error/loading/empty states?
Did I update the feature registry?
Did I add metrics/traces/logs?
Did I test the failure path?
```

If any answer is "yes", fix it before merge or create an ADR.

---

# 39. ADR ESCALATION RULE

STOP and create an ADR when:

- two authoritative documents conflict;
- a new infrastructure dependency is proposed;
- a domain ownership boundary changes;
- a feature must be removed/consolidated;
- a new deployment mode is proposed;
- a new source of truth is proposed;
- gateway enforcement architecture changes;
- data retention materially changes;
- security trust boundary changes.

Do not resolve major architecture decisions by local code convenience.

---

# 40. AGENT STATUS REPORT FORMAT

At the end of each implementation phase, produce:

```text
Phase
Completed features
Partial features
Blocked features
Architecture decisions added
Database migrations
API contracts
Events
Security controls
Observability
Tests
Performance results
Known defects
Next phase
```

This keeps development auditable.

---

# 41. FINAL BUILD ORDER PRINCIPLE

Do not build the platform as:

```text
pages → APIs → random services → patch architecture
```

Build it as:

```text
architecture
→ domains
→ contracts
→ data
→ security
→ runtime
→ UI
→ observability
→ E2E
→ scale
→ hardening
```

---

# 42. FINAL ENGINEERING PRINCIPLE

The best product is not the product with the most code.

The target is a system where:

```text
Every major feature has an owner.
Every state has a source of truth.
Every command has authorization.
Every critical mutation has auditability.
Every runtime component has recovery behavior.
Every integration can fail safely.
Every important path is observable.
Every production claim is measurable.
Every UI action maps to a real capability.
Every capability remains traceable as the product grows.
```

Cryptsk should be implemented as one coherent platform, not as a collection of screens that happen to share a logo.
