# CRYPTSK NEXUS — PRODUCT ARCHITECTURE
## MASTER SOURCE OF TRUTH — LOCKED DESIGN BASELINE

**Document status:** LOCKED ARCHITECTURE / DESIGN AUTHORITY  
**Purpose:** This document is the top-level architectural contract for the CRYPTSK Nexus product.  
**Implementation status:** Design first. Development follows only after the architecture and domain contracts are approved.

**Product identity:** **CRYPTSK Nexus**
**Company / brand:** **CRYPTSK PRIVATE LIMITED**
**Product descriptor:** **Enterprise OSS/BSS & Gateway Platform**
**Short product name:** **Nexus**
**Marketing line:** **One Platform. Every Connection. Complete Control.**

The product name **CRYPTSK Nexus** is locked for this architecture pack. “CRYPTSK” identifies the company/brand; “Nexus” identifies the product. Existing references to “CRYPTSK Nexus product” in subordinate documents are to be understood as CRYPTSK Nexus unless they explicitly refer to the company.

---

# 1. READ THIS FIRST

This document is the **single top-level source of truth** for the CRYPTSK Nexus product architecture.

The detailed documents in this design pack are subordinate specifications. Their authority is domain-specific and controlled by the matrix below:

1. `01_OSS_BSS_ARCHITECTURE.md`
2. `02_ENTERPRISE_GATEWAY_ARCHITECTURE.md`
3. `03_ARCHITECTURE_DECISION_REGISTER.md`
4. `04_PRODUCT_FEATURE_CATALOGUE.md`
5. `05_API_INTERFACE_CONTRACT.md`
6. `06_DATABASE_DATA_MODEL_SPECIFICATION.md`
7. `07_UI_UX_IMPLEMENTATION_SPECIFICATION.md`
8. `08_SECURITY_RBAC_SPECIFICATION.md`
9. `09_OBSERVABILITY_OPERATIONS_SPECIFICATION.md`
10. `10_AI_AGENT_MASTER_BUILD_SPECIFICATION.md`

They describe different domains and implementation contracts of the same product. They are **not separate products, competing architectures, or independent master specifications**.

If any statement appears to conflict between documents, use the authority rules in this document before implementation.

## Critical rule

The AI development agent MUST NOT start implementation by independently interpreting multiple documents.

The agent must first:

1. Read this document completely.
2. Read the OSS/BSS specification.
3. Read the Enterprise Gateway specification.
4. Read the Architecture Decision Register.
5. Read the Product Feature Catalogue.
6. Read the API, Data, UI/UX, Security, and Observability specifications.
7. Build an internal architecture map.
5. Identify any remaining ambiguity.
6. Record unresolved decisions in an Architecture Decision Record (ADR).
7. Only then begin implementation.

---

# 2. PRODUCT IDENTITY

CRYPTSK Nexus is a modular enterprise OSS/BSS and network access/gateway platform.

It is designed to support:

- ISP and broadband operators
- telecom/network operators
- enterprise networks
- managed service providers
- Wi-Fi/hotspot operators
- hospitality
- education/campus networks
- government
- healthcare
- data-center/network service environments
- other organizations requiring customer, service, network, policy, monitoring, billing, and operations management

CRYPTSK Nexus must support both business/operations management and high-performance network access/gateway functions.

---

# 3. THE TWO-PLANE ARCHITECTURE

CRYPTSK Nexus consists of two major architectural planes.

```text
                         CRYPTSK NEXUS
                                |
             +------------------+------------------+
             |                                     |
             v                                     v
      MANAGEMENT / OSS-BSS                    NETWORK / GATEWAY
           PLANE                                  PLANE
             |                                     |
   Next.js / TypeScript                    DPDK / VPP / Go
   Business Services                       FreeRADIUS
   Customer Management                     Session Engine
   Billing                                 Policy Engine
   Inventory                               IPAM
   Reporting                               NAT / ACL / QoS
   RBAC / Audit                            DPI / DNS / Routing
   Configuration                           Network enforcement
             |                                     |
             +------------------+------------------+
                                |
                     Shared domain contracts
                     APIs / Events / Policies
                     Customer / Service / Plan
                     Subscriber / Session / NAS
                     IPAM / Accounting / Audit
```

## 3.1 Management / OSS-BSS Plane

Owns:

- customers
- organizations
- tenants
- accounts
- users
- services
- subscriptions
- plans
- products
- billing
- invoices
- payments
- assets
- sites
- devices
- network inventory
- tickets/work orders where enabled
- reporting
- analytics
- RBAC
- audit
- licensing
- configuration
- integrations
- administration
- dashboards

Primary technology direction:

- Next.js
- React
- TypeScript
- Tailwind/shadcn-style design system
- PostgreSQL
- modular application/domain architecture
- selective background workers

## 3.2 Network / Gateway Plane

Owns:

- authentication integration
- authorization
- RADIUS
- accounting
- live subscriber/session lifecycle
- IP allocation
- policy translation
- packet forwarding
- routing
- VLAN
- VRF
- NAT
- ACL/firewall
- QoS/bandwidth enforcement
- DPI/application awareness
- DNS policy
- captive access
- network telemetry
- gateway recovery

Primary technology direction:

- Rocky Linux 10.x
- DPDK
- VPP
- FreeRADIUS
- Go Session Engine
- VPP Binary API / GoVPP
- PostgreSQL for durable state/history
- Prometheus/OpenTelemetry-compatible observability

## 3.3 Hard Boundary

The management plane MUST NOT become the packet-processing path.

The gateway plane MUST NOT depend on the web UI to forward packets.

Examples:

```text
WRONG:

Packet
 -> Next.js
 -> API
 -> Database
 -> VPP

CORRECT:

Packet
 -> DPDK
 -> VPP
 -> dataplane processing
```

Likewise:

```text
WRONG:

Login
 -> shell script
 -> nftables
 -> tc
 -> subscriber enforcement

CORRECT:

Login
 -> FreeRADIUS
 -> Session Engine
 -> Policy Engine
 -> VPP Adapter
 -> VPP
```

---

# 4. ARCHITECTURAL AUTHORITY MATRIX

| Domain | Authoritative specification |
|---|---|
| Product identity | This document |
| Overall system boundaries | This document |
| Conflict resolution | This document |
| OSS/BSS | `01_OSS_BSS_ARCHITECTURE.md` |
| Customer/business domains | `01_OSS_BSS_ARCHITECTURE.md` |
| UI/UX implementation | `07_UI_UX_IMPLEMENTATION_SPECIFICATION.md` |
| Final navigation | `11_FINAL_MENU_NAVIGATION_SPECIFICATION.md` |
| Billing / commercial domain | `01_OSS_BSS_ARCHITECTURE.md` + `04_PRODUCT_FEATURE_CATALOGUE.md` |
| RBAC/audit | `08_SECURITY_RBAC_SPECIFICATION.md` |
| Gateway | `02_ENTERPRISE_GATEWAY_ARCHITECTURE.md` |
| FreeRADIUS | `02_ENTERPRISE_GATEWAY_ARCHITECTURE.md` |
| Session Engine | `02_ENTERPRISE_GATEWAY_ARCHITECTURE.md` |
| DPDK/VPP | `02_ENTERPRISE_GATEWAY_ARCHITECTURE.md` |
| NAT/ACL/QoS | `02_ENTERPRISE_GATEWAY_ARCHITECTURE.md` |
| Gateway recovery/HA | `02_ENTERPRISE_GATEWAY_ARCHITECTURE.md` |
| Gateway 100K scaling | `02_ENTERPRISE_GATEWAY_ARCHITECTURE.md` |
| Development governance | This document + OSS/BSS specification |
| Agent safety rules | This document |
| Functional capability scope | `04_PRODUCT_FEATURE_CATALOGUE.md` |
| Final navigation / menu | `11_FINAL_MENU_NAVIGATION_SPECIFICATION.md` |
| Binding architecture decisions | `03_ARCHITECTURE_DECISION_REGISTER.md` |

---

# 5. THE THREE DEPLOYMENT MODES

Cryptsk has exactly **three primary deployment modes**.

They are deployment configurations of one product architecture, not three separate codebases.

## MODE 1 — AAA ONLY

```text
External NAS
    |
    v
FreeRADIUS
    |
    v
AAA / Session Engine
    |
    v
PostgreSQL
```

Purpose:

- RADIUS authentication
- authorization
- accounting
- NAS management
- CoA
- Disconnect
- subscriber/session management
- LDAP/AD and other supported authentication integrations

VPP/DPDK is not required for this mode.

## MODE 2 — GATEWAY ONLY

```text
Network NIC
    |
    v
DPDK
    |
    v
VPP
    |
    +---- Session Engine
    |
    +---- Policy Engine
    |
    +---- IPAM
    |
    +---- Local / Captive / LDAP / API authentication where enabled
```

Purpose:

- inline gateway
- routing
- NAT
- firewall/ACL
- QoS
- traffic policy
- DPI
- DNS policy
- local gateway enforcement
- gateway session management

External RADIUS is optional in this mode.

## MODE 3 — MULTI-MODE / AAA + GATEWAY

```text
NAS / Subscriber Access
        |
        v
    FreeRADIUS
        |
        v
 Session Engine
        |
        v
 Policy Engine
        |
        v
 VPP Adapter
        |
        v
    VPP / DPDK
        |
        v
     Network
```

This is the combined deployment.

## Mandatory design rule

Do NOT create:

- AAA Session Engine
- Gateway Session Engine

as two separate concepts.

There is one authoritative **Session Engine**.

The Session Engine is the integration point between AAA, subscriber lifecycle, policy, IPAM, accounting, and gateway enforcement.

---

# 6. CORE DOMAIN OWNERSHIP

The following ownership must remain unambiguous.

| Domain | Owner |
|---|---|
| Customer | Management/Core domain |
| Organization | Management/Core domain |
| Account | Management/Core domain |
| Subscriber | Network/ISP domain |
| Service | Shared business domain |
| Plan | Shared business/policy domain |
| Policy | Policy Engine / shared policy model |
| NAS | Gateway/AAA domain |
| Session | Session Engine |
| Live session state | Session Engine |
| Historical session/accounting | PostgreSQL persistence |
| IP allocation | IPAM subsystem |
| Packet forwarding | VPP |
| NIC packet I/O | DPDK |
| Authentication | FreeRADIUS / configured authentication provider |
| Authorization profile | Policy/AAA domain |
| Billing | Billing domain |
| Invoice/payment | Billing domain |
| UI | Management plane |
| Audit | Shared platform |
| Monitoring | Shared platform + gateway observability |
| NAT enforcement | VPP |
| ACL enforcement | VPP |
| QoS enforcement | VPP |
| DPI classification | DPI component |
| Business reporting | Management plane |

---

# 7. SESSION STATE RULE

This is a critical conflict-resolution rule.

## Live state

The authoritative live subscriber session state belongs to the **Session Engine**.

It must support efficient:

- create
- lookup
- update
- timeout
- CoA
- disconnect
- duplicate-login handling
- stale-session recovery
- reconciliation
- VPP provisioning
- VPP deprovisioning
- ownership
- event ordering
- recovery

Typical session information includes:

- session_id
- subscriber/customer/account reference
- username/identity
- NAS
- NAS port/interface
- access protocol
- MAC/device identity
- IPv4/IPv6
- VLAN
- VRF
- policy IDs
- service/plan
- bandwidth profile
- ACL profile
- NAT profile
- DPI profile
- timestamps
- accounting state
- counters/references
- timeout
- session owner
- epoch/generation
- event sequence

## Durable state

PostgreSQL stores:

- configuration
- subscriber/business records
- service/plan data
- policy definitions
- NAS configuration
- historical session records
- accounting records
- audit records
- billing data
- reports/source data
- recovery information where required

## Redis rule

Redis MAY be used for:

- cache
- distributed coordination
- ephemeral coordination
- rate limiting
- queues where justified

Redis MUST NOT become a second authoritative live-session database.

There must be one authoritative session lifecycle owner.

---

# 8. DATABASE RULE

PostgreSQL is the production database direction.

SQLite may be used for:

- lightweight development
- isolated testing
- local tooling

SQLite is NOT the production database for the 100K gateway target.

The gateway packet path must never synchronously query PostgreSQL for each packet.

The packet path must never depend on billing/reporting/AI/database availability.

---

# 9. GATEWAY TECHNOLOGY BOUNDARY

The gateway architecture is explicitly:

```text
NIC
 ↓
DPDK
 ↓
VPP
 ↓
Gateway dataplane
```

Control plane:

```text
FreeRADIUS
 ↓
Session Engine
 ↓
Policy Engine
 ↓
VPP Adapter
 ↓
VPP Binary API
```

Normal runtime subscriber provisioning MUST NOT use:

- shell scripts
- nftables
- iptables
- tc
- repeated vppctl commands

Linux utilities may still exist for host administration, bootstrapping, diagnostics, or platform functions where appropriate. They are not the primary subscriber dataplane enforcement mechanism.

---

# 10. 100,000 CONCURRENT SESSION TARGET

The product architecture must support:

**100,000 concurrent active sessions**

from Day Zero.

Initial certification may target:

**50,000 concurrent sessions**

The architecture must not be redesigned between 50K and 100K.

The 100K target does NOT mean:

- 100K threads
- 100K processes
- 100K database connections
- 100K VPP API connections
- 100K policy objects
- 100K SQL transactions
- one worker per subscriber

Capacity must be measured across:

- concurrent sessions
- authentication requests/sec
- new sessions/sec
- accounting events/sec
- interim accounting rate
- CoA/sec
- disconnect/sec
- NAT flows
- packets/sec
- throughput
- VPP operations/sec
- database writes/sec
- event/monitoring rate

Example accounting load:

```text
100,000 / 300 seconds ≈ 333 events/sec
100,000 / 60 seconds  ≈ 1,667 events/sec
```

Accounting must therefore be asynchronous/buffered and designed for batching, retry, backpressure, and recovery.

---

# 11. 50 GBPS TARGET

The architecture is intended to support a **50 Gbps-class gateway**, subject to actual hardware qualification.

The software architecture MUST NOT claim that 50 Gbps is guaranteed on arbitrary hardware.

Performance depends on:

- CPU
- NIC
- NIC queues
- NUMA topology
- RSS
- packet size
- packet rate
- VPP worker configuration
- DPDK PMD
- memory locality
- NAT/ACL/QoS/DPI workload
- enabled features
- traffic mix

The 50 Gbps claim becomes a product certification claim only after hardware-specific testing.

---

# 12. OSS/BSS DEVELOPMENT MODEL

The OSS/BSS side should use:

**Modular Monolith + Selective Workers**

Do not build 50–100 independent microservices merely because the product has many modules.

The application should have:

- clear domain modules
- module registry
- feature/license activation
- lazy frontend modules
- backend module boundaries
- repository abstractions
- event contracts
- selective workers
- production observability

Future extraction into services is allowed when justified.

---

# 13. GATEWAY DEVELOPMENT MODEL

Gateway-native runtime components have different lifecycle and performance requirements.

They should remain separately controllable processes/components where appropriate:

- FreeRADIUS
- Session Engine
- VPP
- DPDK
- VPP Adapter
- gateway-native workers
- accounting/NAT-log ingestion
- monitoring adapters

Do not force these components into the Next.js application process.

---

# 14. WORKER OWNERSHIP

### Management/application workers

Appropriate for:

- accounting ingestion
- database writers
- reporting
- notifications
- monitoring
- SNMP
- TR-069
- billing jobs
- NAT-log ingestion
- analytics
- AI
- scheduled jobs

### Gateway-native runtime

Appropriate for:

- FreeRADIUS
- Session Engine
- VPP Adapter
- VPP/DPDK
- gateway reconciliation
- high-rate gateway event processing

The frontend must never be treated as a worker runtime.

---

# 15. POLICY ARCHITECTURE

Business policy and dataplane enforcement are different layers.

```text
Business requirement
        ↓
Service / Plan
        ↓
Policy
        ↓
Policy Engine
        ↓
Dataplane object
        ↓
VPP
```

Use reusable objects such as:

- bandwidth profiles
- ACL profiles
- NAT profiles
- QoS profiles
- DPI/application profiles
- DNS profiles
- routing/VRF profiles

Do not create unnecessarily unique dataplane objects for every subscriber when a reusable profile is sufficient.

---

# 16. AAA RESPONSIBILITY

FreeRADIUS is responsible for AAA functions including:

- Access-Request
- authentication
- authorization
- Access-Accept/Reject
- accounting
- CoA
- Disconnect
- NAS integration
- RADIUS attributes
- supported external identity integrations

FreeRADIUS is NOT:

- the packet-processing engine
- the VPP provisioning engine
- the long-term live session database
- the billing engine
- the UI
- the packet-by-packet policy engine

---

# 17. SESSION LIFECYCLE

A normal login should follow:

```text
Authentication
    ↓
Authorization
    ↓
IP allocation
    ↓
Create session
    ↓
Program dataplane
    ↓
Verify dataplane state
    ↓
ACTIVE
    ↓
Accounting
```

The system must NOT mark a session ACTIVE before required dataplane provisioning succeeds.

Logout may be triggered by:

- Accounting-Stop
- timeout
- CoA/Disconnect
- administrator
- duplicate-login policy
- account expiry
- IP conflict
- NAS failure/reconciliation
- gateway policy
- session termination

Normal logout:

```text
Locate session
 ↓
Mark disconnecting
 ↓
Remove dataplane state
 ↓
Release IP/resource
 ↓
Finalize accounting
 ↓
Persist history
 ↓
DISCONNECTED
```

Use idempotency and epoch/generation to prevent stale events from deleting a newer session.

---

# 18. RECOVERY AND HA

The design must address:

- Session Engine restart
- VPP restart
- FreeRADIUS restart
- PostgreSQL outage/recovery
- NAS failure
- delayed accounting
- duplicate accounting
- out-of-order events
- stale sessions
- duplicate login
- network interruption
- partial provisioning
- partial deprovisioning

After VPP restart:

```text
Reconnect
 ↓
Load active-session recovery state
 ↓
Rebuild required VPP state
 ↓
Verify
 ↓
Resume enforcement
```

Control-plane HA and stateful dataplane/NAT-flow HA are separate requirements.

Do not advertise stateful NAT/flow HA until it is actually implemented and tested.

---

# 19. SECURITY AND ISOLATION

Security applies to both planes.

Required concepts include:

- RBAC
- tenant isolation
- API authentication
- authorization
- audit
- secrets management
- secure configuration
- RADIUS shared-secret protection
- TLS where applicable
- secure inter-process communication
- input validation
- least privilege
- structured logging without secrets
- secure upgrade/migration practices

A hidden UI menu is never a security boundary.

Backend authorization must enforce access.

---

# 20. MODULE/Licensing RULE

A disabled module must be disabled operationally, not merely hidden.

When disabled:

- navigation unavailable
- routes protected
- frontend module not unnecessarily loaded
- initialization not executed
- workers not started
- scheduled jobs not run
- external connections not opened
- polling not active
- unnecessary caches not initialized
- event consumers inactive

Module activation must respect:

- license
- edition/profile
- tenant configuration
- dependencies
- user permissions

---

# 21. UNIVERSAL DOMAIN MODEL

Do not make “Subscriber” the universal business abstraction.

Universal concepts include:

- Organization
- Tenant
- Customer
- Account
- Identity
- User
- Site
- Location
- Asset
- Device
- Network
- Service
- Subscription
- Contract
- Plan
- Policy
- Entitlement
- Invoice
- Payment
- Incident
- Ticket
- Work Order
- Integration
- Event
- Audit Record

Subscriber is an ISP/network-specific concept.

Examples:

```text
ISP:
Customer → Account → Subscriber/Service → NAS → Session → Plan

Enterprise:
Customer → Organization → Sites → Users → Assets → Services

Hospitality:
Organization → Property → Guest/Account → Wi-Fi Service → Device
```

---

# 21.1 FINAL PRODUCT INFORMATION ARCHITECTURE

The canonical sidebar/submenu and Base/Add-on/vertical visibility model is defined by `11_FINAL_MENU_NAVIGATION_SPECIFICATION.md`.

This document does not redefine product functionality. It establishes the final navigation presentation for the feature catalogue and applies the following boundaries: universal business concepts remain industry-neutral; ISP-specific Areas/POPs/Zones/LCOs are optional Organization & Scope capabilities; NAT Logs and Web Browsing/HTTP Logs are distinct observability capabilities; and legacy reference-product module names are not copied when Cryptsk already has a stronger canonical capability.

# 22. API AND EVENT PRINCIPLES

Management APIs and gateway control APIs must be separated from the packet path.

Use:

- REST for external management APIs where appropriate
- gRPC/internal contracts where appropriate
- VPP Binary API for VPP integration
- structured events
- versioned contracts

Do not build synchronous chains where an optional subsystem can block authentication or forwarding unnecessarily.

Events should support:

- ordering where required
- versioning
- idempotency
- retries
- bounded queues
- backpressure
- observability

---

# 23. OBSERVABILITY

The platform must provide common observability.

Management plane:

- application logs
- API latency
- database latency
- worker status
- queue depth
- job status
- audit events

Gateway plane:

- RADIUS request rate
- authentication latency
- accounting rate
- active sessions
- session lifecycle errors
- VPP health
- VPP API latency/errors
- packet rate
- throughput
- NAT flow count
- NAT logging rate
- ACL/QoS/DPI statistics
- CPU per worker
- NUMA locality
- NIC queue health
- memory/hugepage status

Never expose raw secrets in logs.

---

# 24. UI/UX AUTHORITY

The OSS/BSS specification remains authoritative for:

- navigation
- dashboard
- design system
- responsive behavior
- accessibility
- dark mode
- forms
- tables
- error states
- loading states
- empty states
- module-aware navigation
- branding

The gateway dataplane is not implemented as a UI feature.

The UI configures and observes the gateway through APIs.

---

# 25. TESTING STRATEGY

Testing must happen at several levels.

## Management plane

- unit
- integration
- API
- database
- authorization
- module enable/disable
- E2E

## Gateway plane

- FreeRADIUS authentication
- accounting
- CoA
- Disconnect
- Session Engine lifecycle
- IPAM
- policy translation
- VPP provisioning
- VPP deprovisioning
- reconciliation
- restart recovery
- stale-session recovery
- duplicate login
- event ordering
- failure injection

## Scale

Progressively test:

```text
10K
25K
50K
75K
100K
```

Measure:

- auth latency
- session create/update/delete
- accounting
- CPU
- RAM
- DB latency
- queue depth
- error rate
- VPP operations
- packet rate
- throughput
- recovery time

50K is the initial certification target.

100K is the architectural target.

50 Gbps is hardware-qualified.

---

# 26. DEVELOPMENT ENVIRONMENT RULE

The development environment may be resource constrained.

This does not reduce the production architecture target.

The agent must:

- avoid unnecessary Docker/Kubernetes requirements during early development
- avoid running multiple copies
- control TypeScript build concurrency
- run tests in manageable groups
- avoid unnecessary background processes
- keep development modular
- create real production adapters even if external systems are unavailable

A missing external dependency in the development environment is NOT permission to fake the production architecture.

Use mocks only as isolated test infrastructure.

---

# 27. AI AGENT HARD RULES

The implementation agent MUST NOT:

1. Put packet forwarding in Next.js.
2. Put packet forwarding in PostgreSQL.
3. Use PostgreSQL as packet-path state.
4. Use shell scripts as the normal subscriber enforcement mechanism.
5. Use nftables/tc as the primary new subscriber dataplane.
6. Use vppctl as the normal runtime provisioning API.
7. Create one thread per subscriber.
8. Create one process per subscriber.
9. Create one DB connection per subscriber.
10. Create one VPP API connection per subscriber.
11. Create unique policy objects unnecessarily.
12. Perform blocking DB/HTTP operations inside VPP workers.
13. Make billing a packet-path dependency.
14. Make reporting a packet-path dependency.
15. Make AI a packet-path dependency.
16. Make the UI a gateway runtime dependency.
17. Create a second Session Engine.
18. Create a second authoritative live-session database.
19. silently introduce a second architecture because an existing implementation is inconvenient.
20. claim 50 Gbps without hardware testing.
21. claim 100K readiness without load and recovery testing.
22. mark ACTIVE before required dataplane provisioning succeeds.
23. allow stale events to overwrite newer session generations.
24. arbitrarily upgrade the tested platform BOM.

---

# 28. VERSION / PLATFORM BOM RULE

The gateway must use a tested platform BOM.

The initial architectural direction is:

```text
OS: Rocky Linux 10.x
Kernel: approved Rocky 10 kernel
DPDK: approved/tested version
VPP: approved/tested version
FreeRADIUS: approved/tested stable version
PostgreSQL: approved/tested version
Go: approved/tested version
```

Exact versions must be pinned in the release BOM before production certification.

The agent must not arbitrarily upgrade:

- kernel
- DPDK
- VPP
- FreeRADIUS
- PostgreSQL
- Go
- NIC firmware

without regression testing.

---

# 29. IMPLEMENTATION ORDER

> **Canonical execution authority:** `12_IMPLEMENTATION_PHASE_ROADMAP.md`. The phase list below is architectural context only and MUST NOT override the canonical roadmap. The AI agent must never implement all phases in one pass. It must complete the current phase, pass its gate, report status, and stop for approval before continuing.


The architecture must be designed before broad feature implementation.

Recommended order:

## Phase 0 — Architecture

- read all design documents
- resolve conflicts
- establish domain boundaries
- establish contracts
- establish module registry
- establish deployment modes
- establish data ownership
- establish technology BOM

## Phase 1 — Platform Core

- repository structure
- configuration
- module registry
- tenant/customer core
- RBAC
- audit
- logging
- observability
- database migrations
- API foundation

## Phase 2 — OSS/BSS Core

- customer/account
- organization/site
- service/plan
- subscription
- billing
- inventory
- reporting foundations

## Phase 3 — AAA

- FreeRADIUS integration
- NAS
- authentication
- authorization
- accounting
- CoA
- Disconnect

## Phase 4 — Session Engine

- live state
- lifecycle
- ownership
- generation/epoch
- IPAM
- reconciliation
- recovery

## Phase 5 — Gateway

- DPDK
- VPP
- VPP Adapter
- routing
- VLAN/VRF
- NAT
- ACL
- QoS
- DNS policy
- DPI

## Phase 6 — Three Deployment Modes

Independently validate:

- AAA-only
- Gateway-only
- Multi-mode

## Phase 7 — Recovery/HA

- restart
- reconciliation
- failover
- stale-session recovery
- NAS failure
- VPP restart

## Phase 8 — Scale Certification

- 10K
- 25K
- 50K
- 75K
- 100K

## Phase 9 — Production Hardening

- security
- upgrade
- backup
- monitoring
- documentation
- hardware qualification
- release BOM

---

# 30. DEFINITION OF ARCHITECTURAL COMPLETION

The architecture phase is complete only when the agent/team can answer, without ambiguity:

- What owns every major domain?
- What is the authoritative live-session store?
- What is the production database?
- What is the packet path?
- What performs AAA?
- What performs policy translation?
- What performs packet forwarding?
- What performs NAT?
- What performs QoS?
- What performs accounting?
- What happens when VPP restarts?
- What happens when Session Engine restarts?
- What happens when FreeRADIUS restarts?
- What happens when PostgreSQL is unavailable?
- How does duplicate login work?
- How does stale-session recovery work?
- How are three deployment modes represented?
- What is enabled in each mode?
- How does OSS/BSS configure the gateway?
- How does the gateway report state to OSS/BSS?
- What is the 50K certification profile?
- What is the 100K architecture target?
- What is required before claiming 50 Gbps?
- Which component owns each API/event/data model?

If an answer is unclear, implementation should pause and the architecture decision should be documented.

---

# 31. FINAL SOURCE-OF-TRUTH RULE

This design pack is now a **LOCKED DESIGN BASELINE** for implementation.

No document, menu, module, API contract, database domain, policy family, deployment mode, or Base/Add-on boundary may be changed silently. Any post-lock change MUST:

1. be documented as an ADR in `03_ARCHITECTURE_DECISION_REGISTER.md`;
2. identify the affected authority documents;
3. update the affected contracts and tests;
4. increment the affected document version/status; and
5. be reflected in the final pack before implementation continues.

The AI agent may identify potential missing capabilities, but it MUST NOT add, remove, or redefine product scope without this change-control process.


The AI agent must treat this hierarchy as authoritative:

```text
LEVEL 1
User-approved product decisions
        ↓
LEVEL 2
MASTER_PRODUCT_ARCHITECTURE.md
        ↓
LEVEL 3
Approved Product / Module Catalogue
        ↓
LEVEL 4
Domain specifications:
  OSS/BSS
  Enterprise Gateway
  AAA/Session
  Data/API
  UI/UX
        ↓
LEVEL 5
Implementation
        ↓
LEVEL 6
Tests / operational evidence
```

A lower-level document MUST NOT silently override a higher-level decision.

If a conflict is discovered:

```text
STOP
 ↓
Identify conflict
 ↓
Identify affected domains
 ↓
Propose alternatives
 ↓
Record ADR
 ↓
Obtain approval
 ↓
Update authoritative specification
 ↓
Continue implementation
```

Do not silently choose a conflicting implementation.

---

# 32. FINAL ARCHITECTURAL STATEMENT

The fundamental architecture is:

```text
                         CRYPTSK
                            |
          +-----------------+-----------------+
          |                                   |
          v                                   v
      OSS / BSS                         NETWORK GATEWAY
      MANAGEMENT                            |
          |                                  |
   Customers / Billing                FreeRADIUS / AAA
   Services / Plans                         |
   Inventory / Reports                 Session Engine
   RBAC / Audit                             |
   Configuration                       Policy Engine
          |                                  |
          +------------- APIs / Events -------+
                                             |
                                        VPP Adapter
                                             |
                                         VPP / DPDK
                                             |
                                            NIC
```

The central architectural principle is:

**OSS/BSS manages the business.  
FreeRADIUS performs AAA.  
Session Engine owns live subscriber lifecycle.  
Policy Engine translates business policy.  
VPP enforces network policy and forwards packets.  
DPDK handles high-performance packet I/O.  
PostgreSQL stores durable business and historical state.  
The UI configures and observes the system; it does not become the dataplane.**

This is the architecture to design first.

Development begins only after this architecture and its subordinate domain specifications are internally consistent.
