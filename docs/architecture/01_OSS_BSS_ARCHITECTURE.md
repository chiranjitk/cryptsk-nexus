# 0. DOCUMENT PURPOSE --- ARCHITECTURE CONTRACT WITH LOCKED PRODUCT-SCOPE BOUNDARY

**Document status:** LOCKED OSS/BSS ARCHITECTURE BASELINE

THIS DOCUMENT IS AN ARCHITECTURE AND ENGINEERING GOVERNANCE DOCUMENT.

It is NOT the final CRYPTSK Nexus product requirements document, final menu
catalogue, final page-by-page UI specification, final business
requirements specification, final feature list, final industry
catalogue, final deployment-mode catalogue, or a prototype
specification.

The examples in this document exist only to communicate architectural intent. The frozen functional scope is defined by `04_PRODUCT_FEATURE_CATALOGUE.md` and the frozen navigation is defined by `11_FINAL_MENU_NAVIGATION_SPECIFICATION.md`. This document must not silently expand or reduce that scope.

## What This Document Tells The Agent

This document defines:

-   HOW Cryptsk must be architected
-   HOW modules must be isolated
-   HOW Core and optional capabilities must be separated
-   HOW future features must fit the architecture
-   HOW UI, API, business logic, persistence, workers, and integrations
    must relate
-   HOW disabled modules must behave
-   HOW production scalability must be considered
-   HOW development must proceed phase-by-phase
-   HOW the 4 GB development sandbox must be handled
-   HOW production-readiness must be demonstrated
-   WHAT the agent must never fake or shortcut

It does NOT define the complete final list of Cryptsk features.

## Agent Responsibility For Product Definition

The agent must act as a senior product-minded software architect and
engineering team, not as a page generator.

For each domain, the agent must use sound domain and engineering
judgement to discover the complete practical feature set required for
production readiness, including:

-   normal workflows
-   edge cases
-   lifecycle/state transitions
-   permissions
-   validation
-   failure handling
-   auditability
-   reporting
-   search/filter/sort
-   bulk operations
-   import/export
-   configuration
-   integrations
-   background processing
-   observability
-   security
-   recovery
-   scalability
-   upgrade/migration requirements
-   industry differences
-   deployment-mode differences

If a capability is necessary for a professional production
implementation but is not explicitly named in this document, the agent
MUST identify it and place it in the authoritative Product/Module
Catalogue before implementation.

## No Basic-Page Completion

Creating only a sidebar item, table, form, dashboard card, CRUD page,
mock API, or static sample data does NOT constitute completion.

A module is complete only when its real business workflow, backend
behavior, persistence/integration, security, operational behavior,
testing, and production concerns have been addressed.

The agent must continuously ask:

"Would a real customer be able to operate this capability in
production?"

If the answer is no, the module is not complete.

## Production Target vs Sandbox Limitation

The Z.ai sandbox limitation is an implementation-environment constraint,
NOT the product capability limit.

If production requires an external component such as a DHCP server, DNS
service, PPPoE server, RADIUS infrastructure, OLT/GPON system, payment
gateway, messaging provider, or device-management platform, design the
real production integration architecture.

If that external component cannot be installed or executed inside the
sandbox:

-   do not fake the production component
-   do not silently replace it with a toy implementation
-   create the correct production adapter/interface
-   implement the surrounding Cryptsk logic fully
-   implement configuration and validation
-   implement integration contracts
-   use mocks only as isolated test infrastructure
-   clearly record the external-environment dependency
-   keep the production path ready for deployment/integration

"Cannot install in this sandbox" means "integration environment
unavailable", NOT "feature complete with a fake implementation".

## Source-of-Truth Hierarchy

Use:

1.  User-approved requirements and decisions
2.  This master architecture/engineering contract
3.  The authoritative CRYPTSK Nexus Product/Module Catalogue
4.  Detailed domain/module specifications
5.  Source-code architecture and tests
6.  Agent engineering judgement

The authoritative functional scope is already defined by `04_PRODUCT_FEATURE_CATALOGUE.md`; the canonical navigation is defined by `11_FINAL_MENU_NAVIGATION_SPECIFICATION.md`; this document remains authoritative only for OSS/BSS architecture and engineering governance. Changes to scope require the locked-pack change-control process in `03_ARCHITECTURE_DECISION_REGISTER.md`.

------------------------------------------------------------------------

# CRYPTSK NEXUS — OSS/BSS

## MASTER DEVELOPMENT ARCHITECTURE & AGENT SPECIFICATION

> THIS DOCUMENT IS THE MASTER ENGINEERING INSTRUCTION FOR THE Z.AI
> DEVELOPMENT AGENT. READ AND FOLLOW THIS DOCUMENT BEFORE WRITING OR
> MODIFYING ANY SOURCE CODE.

------------------------------------------------------------------------

# 3. PRODUCT MISSION

Build CRYPTSK Nexus as a modern, production-ready OSS/BSS platform for ISPs,
broadband operators, enterprise networks, WiFi operators, FTTH/GPON
operators, and managed network providers.

Cryptsk must be:

-   Modular
-   Resource efficient
-   Production ready
-   Scalable
-   Secure
-   API-first
-   Multi-tenant capable
-   RBAC capable
-   Observable
-   Testable
-   Upgradeable
-   Maintainable
-   License/module aware
-   Suitable for small deployments and large deployments
-   Capable of running only the modules actually enabled by the customer

The final product must NOT behave like a single giant application where
every feature is loaded and initialized regardless of whether it is
being used.

The architecture must support selective module activation.

## Two-Plane Product Architecture

CRYPTSK Nexus consists of two tightly integrated but operationally distinct
planes:

``` text
                    CRYPTSK NEXUS
                           |
          +----------------+----------------+
          |                                 |
          ▼                                 ▼
   OSS/BSS MANAGEMENT PLANE          NETWORK/GATEWAY PLANE
   Next.js / Application             DPDK + VPP
   Customer / Billing / UI            Session Enforcement
   RBAC / Audit / Reporting           NAT / ACL / QoS
   Configuration / Analytics          Packet Forwarding
          |                                 |
          +---------------+-----------------+
                          |
                  Shared Control Contracts
                 APIs / Events / Policies
                 Session / Subscriber Model
```

The OSS/BSS management plane MUST NOT perform packet forwarding or
subscriber packet enforcement.

The network/gateway plane MUST NOT depend on the Next.js UI for packet
processing.

This separation is mandatory for the 100K-session / 50 Gbps-class
product target.

------------------------------------------------------------------------

# 4. PRODUCT POSITIONING --- INDUSTRY-AGNOSTIC ENTERPRISE OSS/BSS PLATFORM

CRYPTSK Nexus is NOT an ISP-only product.

Cryptsk must be architected as a universal enterprise OSS/BSS, network
operations, service management, customer management, billing,
automation, monitoring, and business operations platform.

The ISP/broadband feature set is one industry-specific capability set
inside Cryptsk, not the definition of the entire product.

## Target Industries

Cryptsk should be capable of serving:

-   ISPs and broadband operators
-   Telecom operators
-   Enterprise IT and multi-site enterprises
-   Managed Service Providers (MSPs)
-   Wi-Fi service providers
-   Hospitality and hotels
-   Universities and education/campus networks
-   Healthcare organizations
-   Government organizations
-   Data centers
-   Cloud/network service providers
-   Managed Wi-Fi and hotspot operators
-   Resellers and channel partners
-   Other organizations requiring network, service, customer, asset,
    operations, policy, monitoring, or billing management

Industry-specific capabilities must be implemented as optional modules.

## Universal Core Model

Do NOT design the entire database, business logic, navigation, or
terminology around the ISP concept of a "Subscriber".

The universal Cryptsk domain model must be based on concepts such as:

-   Organization
-   Tenant
-   Customer
-   Account
-   Identity
-   User
-   Site
-   Location
-   Asset
-   Device
-   Network
-   Service
-   Subscription
-   Contract
-   Plan
-   Policy
-   Entitlement
-   Invoice
-   Payment
-   Incident
-   Ticket
-   Work Order
-   Technician
-   Integration
-   Event
-   Audit Record

"Subscriber" may exist as an ISP-specific business concept, but it must
NOT be the universal customer abstraction.

For example:

Enterprise: Customer → Organization → Sites → Users → Assets → Services

ISP: Customer → Account → Subscriber/Service → NAS → Session → Plan

Hotel: Organization → Property → Guests/Accounts → Wi-Fi Service →
Devices → Billing

University: Organization → Campus → Identity → Network Access → Devices
→ Policies

MSP: MSP Tenant → Customer Organizations → Sites → Assets → Services →
Incidents

The same Cryptsk Core must support these models without forcing
irrelevant modules to run.

## Universal Core + Industry Modules

Use this architecture:

                    CRYPTSK NEXUS
                           |
                    UNIVERSAL CORE
                           |
       +-------------------+-------------------+
       |                   |                   |

CUSTOMER SERVICE OPERATIONS MANAGEMENT MANAGEMENT MANAGEMENT \| \| \|
+-------------------+-------------------+ \| MODULE REGISTRY \|
+------------------+------------------+ \| \| \| ISP MODULES ENTERPRISE
MODULES INDUSTRY MODULES \| \| \| PPPoE NAC/802.1X Hospitality RADIUS
SSO/LDAP Education AAA SD-WAN Healthcare GPON VPN Government DHCP Device
Mgmt Data Center Captive Portal Monitoring MSP Subscriber Asset Mgmt
Other Billing Service Desk \| +-------------------------------------+ \|
SHARED PLATFORM Auth / RBAC / Audit Billing / API / Events Notifications
/ Reporting Monitoring / AI

ISP-specific technologies such as:

-   PPPoE
-   RADIUS
-   AAA
-   GPON/OLT
-   DHCP
-   Captive Portal
-   NAS
-   Subscriber Sessions

must remain optional modules.

Enterprise-specific technologies such as:

-   LDAP/Active Directory
-   SSO
-   802.1X/NAC
-   SD-WAN
-   VPN
-   enterprise device management
-   asset management
-   service desk
-   enterprise monitoring

must also remain optional modules.

No industry module may become a hard dependency of the Universal Core
unless the dependency is genuinely universal.

## Industry-Aware Navigation

The navigation system must be generated from:

Module Registry → Industry/Edition Profile → Enabled Modules → License →
Tenant Configuration → User Permissions → Navigation

Therefore:

An ISP deployment can expose PPPoE/RADIUS/GPON.

An enterprise deployment can expose Identity/NAC/Asset/Service
Desk/SD-WAN.

A hotel deployment can expose Guest Management/Wi-Fi/Billing/Property
Operations.

An MSP deployment can expose Customer
Organizations/Assets/Monitoring/Incidents/Billing.

The frontend must not load irrelevant modules.

The backend must not initialize irrelevant workers.

## Product Editions

Architect the platform so commercial editions can later be created
without forking the codebase.

Possible editions/profiles may include:

-   CRYPTSK Nexus ISP
-   Cryptsk Enterprise
-   Cryptsk MSP
-   Cryptsk Hospitality
-   Cryptsk Campus
-   Cryptsk Telecom
-   Cryptsk Data Center
-   Cryptsk Government
-   Cryptsk Custom Enterprise

These are logical product profiles composed from the same modular
platform.

Do NOT create separate codebases for each industry.

## Terminology Rule

Use universal terminology in the Core.

Use industry-specific terminology inside industry modules.

For example:

Core: Customer Service Account Identity Asset Site Subscription

ISP module: Subscriber NAS RADIUS PPPoE AAA GPON

Enterprise module: Employee/User Identity Provider NAC Directory Asset
Site

Hospitality module: Guest Property Room Guest Service

This prevents Cryptsk from becoming structurally locked to the ISP
market while preserving deep ISP functionality.

## Industry Independence Requirement

A customer must be able to deploy Cryptsk with only the modules relevant
to its business.

Example:

Enterprise customer:

Core Customer Identity Asset Network Policy Monitoring Service Desk
Billing

Do NOT start:

PPPoE RADIUS GPON Captive Portal TR-069

unless explicitly enabled.

ISP customer:

Core Customer Subscriber AAA RADIUS PPPoE DHCP IPAM Billing Monitoring

Do NOT start enterprise-only modules unless explicitly enabled.

This requirement is fundamental to the Cryptsk architecture.

------------------------------------------------------------------------

# 5. MASTER DEVELOPMENT CONTRACT --- NO PROTOTYPE / REAL E2E IMPLEMENTATION

This is a HARD engineering contract for every Cryptsk development phase
and every future feature.

CRYPTSK Nexus is NOT being developed as a UI prototype, clickable mockup, demo
dashboard, or collection of placeholder screens. Every feature must be
implemented as a real end-to-end vertical slice from Day Zero.

## Real Feature Requirement

For every feature, the minimum implementation path is:

UI → Real API → Server Validation → Application Service →
Domain/Business Logic → Repository → Real Database → Event/Worker where
required → Real UI State Update → Automated E2E Test

A feature is not considered implemented if only its UI exists.

## Forbidden Prototype Patterns

NEVER use the following as a substitute for production implementation:

-   hardcoded dashboard data
-   fake API responses
-   mock success responses presented as real functionality
-   simulated payment success
-   fake authentication
-   placeholder database operations
-   static tables pretending to contain live data
-   UI-only module enable/disable switches
-   TODO-based business logic for a feature marked complete
-   fake device integrations
-   fake RADIUS/AAA behavior
-   fake billing calculations
-   fake external gateway success

Mocks and test doubles are allowed ONLY inside automated tests and must
never be presented as production functionality.

## Menu/Module Specification Requirement

The Master Architecture document defines the permanent engineering
rules. It does NOT attempt to contain every detailed business rule for
every future menu.

Before implementing a major domain/module, create or maintain a detailed
Module Specification for that domain.

Each module specification must define, as applicable:

-   module purpose
-   business scope
-   menu hierarchy
-   pages/screens
-   user workflows
-   entities
-   fields
-   database tables
-   relationships
-   indexes
-   API endpoints
-   request/response schemas
-   business rules
-   validation rules
-   permissions
-   RBAC requirements
-   module dependencies
-   events produced
-   events consumed
-   workers
-   scheduled jobs
-   external integrations
-   configuration
-   feature flags
-   licensing requirements
-   audit requirements
-   notifications
-   error states
-   loading states
-   empty states
-   performance requirements
-   security requirements
-   E2E workflows
-   acceptance criteria

The Module Specification must follow this Master Architecture. It may
extend the architecture with domain-specific detail but must not
contradict or bypass the Master Architecture.

## Future Feature Compatibility Rule

CRYPTSK Nexus is expected to grow continuously. Future features MUST fit the
same architecture.

When adding a new feature, the agent MUST determine:

1.  Which existing module owns the feature?
2.  Is a new module genuinely required?
3.  What existing domain entities are reused?
4.  What API conventions apply?
5.  What database/repository pattern applies?
6.  What permissions are required?
7.  What events are produced/consumed?
8.  Does the feature require a worker?
9.  What are its resource requirements?
10. Does it need lazy-loaded UI code?
11. Does it need a license or feature flag?
12. What E2E workflow proves it works?

Do NOT introduce a parallel architecture for a new feature.

## New Menu Rule

A new menu item is NOT merely a frontend navigation entry.

A new menu must map to a real module/domain capability and must have:

Navigation → Permission → Page/UI → API → Business Logic → Persistence
where required → Audit where required → Tests → E2E workflow

If the menu represents a configuration capability, the configuration
must affect actual application behavior.

## New API Rule

Every production API must have:

-   real implementation
-   input validation
-   authorization
-   consistent error handling
-   real persistence or real domain action where applicable
-   audit behavior where required
-   automated tests
-   E2E coverage for critical workflows

Do not create API endpoints merely to make a UI appear functional.

## New Database Entity Rule

Every new persistent entity must include:

-   schema/model
-   migration
-   repository access
-   validation schema
-   business service where appropriate
-   indexes based on access patterns
-   authorization rules
-   test coverage

Do not store important business state only in browser state, local
storage, or in-memory variables.

## New Worker Rule

Every worker must declare:

-   purpose
-   owning module
-   dependencies
-   startup condition
-   shutdown behavior
-   concurrency limit
-   retry policy
-   memory considerations
-   external connections
-   queue/event dependencies
-   observability metrics

A disabled module MUST NOT start its workers.

## Module Disablement Must Be Real

Module disablement must operate at multiple layers.

When a module is disabled:

1.  Its navigation is unavailable.
2.  Its protected routes reject access.
3.  Its frontend module is not unnecessarily loaded.
4.  Its module initialization code does not execute.
5.  Its workers do not start.
6.  Its scheduled jobs do not run.
7.  Its external connections are not opened.
8.  Its polling loops do not run.
9.  Its module-specific caches are not initialized unnecessarily.
10. Its event consumers are inactive.

The backend must enforce disablement. Hiding the menu is NOT sufficient.

## Resource Reduction Proof Requirement

Cryptsk must provide measurable evidence that optional modules can be
disabled without unnecessary runtime resource consumption.

For selected modules, establish measurements for:

Module ENABLED: - process/worker count - runtime RAM - CPU utilization
under defined workload - open connections - active timers/jobs -
relevant bundle/build contribution

Module DISABLED: - process/worker count - runtime RAM - CPU
utilization - open connections - active timers/jobs - frontend loading
behavior

Do not claim that disabling a module reduces build memory unless it is
actually excluded from the relevant build graph. Runtime lazy loading
and build-time exclusion are separate concerns.

## Build-Time Module Isolation

Where practical, the architecture must support build-time module
isolation so that optional modules do not unnecessarily increase every
build target.

Use appropriate techniques such as:

-   code splitting
-   dynamic imports
-   conditional module composition
-   separate worker entry points
-   package boundaries
-   production bundle analysis

Do not create a complicated build system merely to satisfy this
requirement. Measure first and use the simplest maintainable solution.

## E2E From Day Zero

E2E testing starts with the first real feature. It is NOT postponed
until the end of the project.

Every major feature must have at least one complete workflow proving:

User Action → UI → API → Business Logic → Database/External System →
Result → UI Verification

Critical workflows must also test failure paths, authorization failures,
validation errors, and relevant module-disabled behavior.

## Feature Completion Gate

A feature may be marked COMPLETE only when:

-   UI is implemented
-   real API is implemented
-   real business logic is implemented
-   real persistence/integration is implemented where applicable
-   validation exists
-   authorization exists
-   audit behavior exists where required
-   loading/empty/error states exist
-   tests exist
-   E2E workflow passes
-   module lifecycle is correct
-   resource behavior is understood
-   no known placeholder implementation remains

## Architecture Compliance Gate

Before accepting any new feature, the agent must verify that it does not
violate:

-   module boundaries
-   dependency rules
-   repository pattern
-   API conventions
-   RBAC architecture
-   event architecture
-   worker lifecycle rules
-   resource management rules
-   UI design system
-   security requirements
-   scalability requirements
-   100K concurrent-session architecture

If a feature cannot fit cleanly, STOP and report the architectural
conflict instead of silently introducing a second pattern.

## Continuous Architecture Rule

This Master Architecture is the permanent source of truth for
engineering constraints.

Every future Cryptsk feature enhancement, menu addition, integration,
module, report, workflow, AI capability, network capability, billing
capability, or enterprise capability must conform to this architecture.

The product may become much larger than the initial implementation. The
architecture must remain coherent as functionality grows.

# 5A. CRITICAL DEVELOPMENT ENVIRONMENT CONSTRAINT

The development/build environment has approximately:

# 4A. 100K CONCURRENT SESSION CAPACITY & SCALABILITY REQUIREMENT

Cryptsk must be architected from Day Zero with a production capacity
target of at least:

**100,000 CONCURRENT ACTIVE SUBSCRIBER/DEVICE SESSIONS**

This is a production architecture target, not a requirement for the 4 GB
development sandbox.

The initial certified deployment profile may be 50,000 concurrent
sessions, but the software architecture MUST NOT contain a hard 50K
ceiling.

## Capacity Dimensions

The architecture must independently account for:

``` text
C1 = concurrent active sessions
C2 = authentication requests/sec
C3 = accounting events/sec
C4 = CoA/sec
C5 = Disconnect/sec
C6 = new sessions/sec
C7 = NAT/flow count
C8 = packets/sec
C9 = throughput
C10 = policy/VPP operations/sec
C11 = database writes/sec
C12 = monitoring/events/sec
```

100,000 sessions does NOT mean:

``` text
100k threads
100k processes
100k SQL connections
100k VPP API connections
100k policy objects
100k DB transactions/sec
```

## Session Architecture

Live session state MUST be owned by the Session Engine / AAA session
subsystem, not by the browser, Next.js process, PostgreSQL packet path,
or FreeRADIUS configuration.

The live-session architecture must support:

``` text
session_id
subscriber/account identity
username
NAS/access source
MAC/device identity
IPv4/IPv6
VLAN
VRF
policy/profile IDs
bandwidth/QoS
ACL
NAT profile
session timers
accounting state
counters
owner node
session epoch/generation
event sequence
```

Live state should be compact and in memory, with durable
recovery/snapshot information persisted separately.

Historical sessions/accounting must use database-optimized storage.

## Accounting Scale

At 100,000 active sessions:

``` text
5-minute interim:
100,000 / 300 ≈ 333 events/sec

1-minute interim:
100,000 / 60 ≈ 1,667 events/sec
```

Accounting ingestion MUST therefore be asynchronous/buffered where
appropriate, bounded, observable, retryable, and idempotent.

Do not synchronously write every accounting event through the
UI/application request path.

## Horizontal Scalability

Production must permit independent scaling of:

``` text
API/UI workers
AAA/authentication workers
Session Engine workers
Accounting workers
Monitoring workers
Reporting workers
```

The dataplane scales separately through VPP workers, NIC queues, RSS,
CPU affinity, NUMA locality, and hardware capacity.

## Capacity Testing

The test methodology must progressively validate:

``` text
10K
25K
50K
75K
100K
```

and measure authentication latency, accounting latency, session
operations, CPU, RAM, database latency, queue depth, VPP programming
latency, packet loss, PPS, throughput, and recovery behavior.

50K is the initial certification profile.

100K is the architectural capacity target.

50 Gbps is a hardware-qualified dataplane target, not a distro-only or
software-only guarantee.

# 4B. CRITICAL DEVELOPMENT ENVIRONMENT CONSTRAINT

The development/build environment has approximately:

MAXIMUM RAM: 4 GB

This is a hard engineering constraint.

The agent MUST design the development process so that:

-   dependency installation does not unnecessarily consume memory
-   TypeScript compilation remains manageable
-   Next.js builds remain manageable
-   tests are executed in controlled groups
-   linting is executed in controlled groups
-   large generated files are avoided
-   unnecessary build processes are never run concurrently
-   unnecessary development servers are never left running
-   unnecessary background workers are never started
-   Docker/Kubernetes are NOT required for local/Z.ai development
-   multiple copies of the application must never run simultaneously
-   heavy AI/build/indexing processes must not run concurrently with
    production builds
-   memory-heavy dependencies must not be added without justification

Never sacrifice architecture quality merely because the development
environment is limited.

Instead use phased development and modular compilation.

------------------------------------------------------------------------

# 5A. IMPORTANT ARCHITECTURAL DECISION

DO NOT BUILD CRYPTSK NEXUS AS A TRADITIONAL LARGE MICROSERVICE SYSTEM.

DO NOT CREATE 50--100 independently running microservices.

That would unnecessarily consume RAM and create operational complexity.

Use:

## MODULAR MONOLITH + SELECTIVE WORKERS

The application should have:

1.  A primary web/application layer
2.  Clearly separated domain modules
3.  A module registry
4.  Lazy-loaded frontend modules
5.  Independently testable backend/domain packages
6.  Optional worker processes for genuinely long-running/background
    workloads
7.  Event-driven communication where appropriate
8.  A clean repository abstraction
9.  Database abstraction
10. API contracts between modules

The architecture must allow future extraction of individual modules into
independent services if required.

------------------------------------------------------------------------

# 6. HIGH-LEVEL ARCHITECTURE

Use this conceptual architecture:

``` text
                           CRYPTSK NEXUS
                                  |
              +-------------------+-------------------+
              |                                       |
              ▼                                       ▼
      OSS/BSS MANAGEMENT                       NETWORK/GATEWAY
             PLANE                                  PLANE
              |                                       |
       Next.js / REST API                     DPDK / VPP
       Customer / Billing                     NAT / ACL / QoS
       RBAC / Audit                           Routing / VRF
       Reporting                              Packet Forwarding
       Configuration                          Session Enforcement
              |                                       |
              +-------------------+-------------------+
                                  |
                         CONTROL / DATA CONTRACTS
                                  |
              +-------------------+-------------------+
              |                   |                   |
          Subscriber          Policy/Profile       Session
           Identity              Model              Model
              |                   |                   |
              +-------------------+-------------------+
                                  |
                              PostgreSQL
```

### Mandatory separation

``` text
Next.js/UI
   |
REST/gRPC/API
   |
Control/Application Services
   |
Session Engine / Policy Engine
   |
VPP Adapter
   |
VPP / DPDK
   |
NIC
```

The UI/API layer MUST never execute packet-path commands directly.

The gateway dataplane MUST never depend on browser state or synchronous
UI availability.

The management plane may be implemented as a modular monolith for
resource efficiency.

The gateway dataplane/control components may be separate native
processes because VPP/DPDK, FreeRADIUS, and high-frequency session
enforcement have different lifecycle and performance requirements.

# 7. FRONTEND ARCHITECTURE

Use:

-   Next.js App Router
-   React
-   TypeScript
-   Tailwind CSS
-   shadcn/ui
-   Radix UI where necessary
-   TanStack Query
-   Zustand only where global client state is genuinely required
-   TanStack Table for complex data tables
-   React Hook Form
-   Zod
-   Lucide icons

Do not add frontend libraries simply because they are popular.

Every new dependency requires justification.

------------------------------------------------------------------------

# 8. CURRENT TECHNOLOGY BASELINE

The project currently uses:

Next.js 16.x React 19.x TypeScript 5.x Bun Tailwind CSS 4.x shadcn/ui
Radix UI Lucide React Zustand TanStack Query TanStack Table Prisma
SQLite NextAuth React Hook Form Zod Recharts next-intl ESLint

Treat versions in the actual package.json as authoritative.

DO NOT blindly upgrade dependencies.

Before changing a major dependency version:

1.  inspect current package.json
2.  check compatibility
3.  check official documentation
4.  make the smallest safe change
5.  test build
6.  test affected functionality

------------------------------------------------------------------------

# 9. DATABASE ARCHITECTURE

SQLite is permitted only for lightweight development/testing where it helps local iteration. Production deployments use PostgreSQL.

DO NOT tightly couple business logic to SQLite.

Use:

Business Logic \| Repository Interface \| +-----+------+ \| \| SQLite
PostgreSQL

Example:

SubscriberRepository

createSubscriber() getSubscriber() updateSubscriber() deleteSubscriber()
listSubscribers()

The business layer must not directly contain SQLite-specific SQL logic.

Prisma may be used for persistence.

Design schema so migration to PostgreSQL is straightforward.

------------------------------------------------------------------------

# 10. CORE DOMAIN MODULES

Cryptsk must be organized around domains rather than individual menu
items.

Recommended domains:

## CORE

-   Core Platform
-   Module Manager
-   System Configuration
-   Feature Flags
-   Licensing
-   API
-   Authentication
-   Authorization
-   RBAC
-   Audit
-   Notifications
-   Backup
-   Integrations

## CUSTOMER & COMMERCIAL

-   Customers / Subscribers
-   Customer 360
-   Product Catalog
-   Plans / Packages
-   Prepaid Packages
-   Postpaid Packages
-   Top-Ups / Vouchers
-   Ancillary Services
-   Service Assignment / Migration
-   Batch Provisioning
-   Customer Lifecycle
-   Customer Addresses
-   Customer Contacts
-   Billing
-   Payments / Reconciliation
-   Collections / Due Recovery
-   Tax / Adjustments

## ORGANIZATION & SCOPE (OPTIONAL)

-   Organizations / Business Units
-   Sites / Locations
-   Scope / Zone Definitions
-   Delegated Administrators
-   Scope Mapping
-   Commercial Scope Rules
-   Scope Reports
-   ISP profile: Areas / POPs / Zones / LCOs

## AAA

-   Authentication
-   Authorization
-   Accounting
-   RADIUS
-   RADIUS Proxy
-   RADIUS Attributes
-   Active Sessions
-   Session History
-   CoA
-   Disconnect
-   Enterprise Authentication

## NETWORK

-   NAS Clients
-   NAS Devices
-   IPAM
-   Subnets
-   System Interfaces
-   DHCP
-   DHCPv6
-   DNS
-   PPPoE
-   Captive Portal
-   MultiWAN
-   Dynamic Routing
-   FTTH/GPON
-   Network Health

## POLICY ENGINE

-   Policy Overview / Groups
-   Surfing Quota (when enabled)
-   Access Time
-   Bandwidth
-   Data Transfer Policy
-   Fair Access Policy / FUP
-   Application / Content Policy
-   Security Profiles
-   Access / Authentication Policy
-   Policy Assignment / Precedence
-   Policy Simulation / Audit

## SECURITY & ADVANCED SERVICES

-   Firewall Rules
-   IPS/Anomaly Detection
-   DDoS Protection
-   VPN
-   DPI / Application Awareness
-   Content / DNS Filtering

## MONITORING

-   Active Sessions
-   Session History
-   Authentication Logs
-   Bandwidth
-   Traffic Analytics
-   Bandwidth Reports
-   Application Awareness
-   Uptime
-   Latency
-   Speed Test
-   Syslog
-   Diagnostics
-   IP-MAC History
-   Zone Budgets
-   NAT Logs
-   Alerts
-   Grafana Integration

## DEVICE MANAGEMENT

-   TR-069 ACS
-   MikroTik Manager
-   SSH Device Manager
-   SNMP Manager
-   OLT/GPON Management
-   Equipment Management

## SERVICES

-   RADIUS Proxy
-   RADIUS Attributes
-   WiFi Offload
-   Hotspot
-   CoA Tracking
-   Technician Performance

## OPERATIONS

-   Complaints / Tickets
-   Incidents
-   Installations
-   Technicians
-   Inventory / Equipment
-   Service Contracts / AMC (optional)
-   Sales / Collection Agents
-   Leads
-   Resellers / Partners
-   Action History
-   Announcements

## FINANCE

-   Reports
-   Revenue Reports
-   Revenue Forecast
-   Collections
-   Due Recovery
-   GST/Tax
-   Referral
-   Loyalty
-   Charge Override
-   Cyclic Billing
-   Grace Period
-   Add-ons
-   Top-ups
-   Smart Collections
-   Revenue Leakage
-   Compliance
-   SLA
-   Reseller Intelligence
-   Data Export

## AI

-   AI Advisor
-   AI Diagnosis
-   Churn Alerts
-   Churn Prediction
-   Competitor Intelligence
-   Competitor Analysis
-   AI-powered operational recommendations

## COMMUNICATION

-   WhatsApp Integration
-   Email
-   SMS
-   Push Notifications
-   Templates
-   Notification Rules

------------------------------------------------------------------------

# 11. MODULE SYSTEM

Create a central Module Registry.

Each module must define metadata similar to:

{ id, name, version, category, description, enabled, licensed,
dependencies, permissions, routes, navigation, apiEndpoints, workers,
settings }

Example:

Billing:

id: billing name: Billing dependencies: - subscribers - plans

Payment:

id: payment dependencies: - billing

AI Diagnosis:

id: ai-diagnosis dependencies: - monitoring - subscribers

If a module is disabled:

-   its frontend routes must not be loaded
-   its navigation should not appear
-   its workers must not start
-   its scheduled jobs must not run
-   its caches must not initialize
-   its external connections must not initialize

------------------------------------------------------------------------

# 12. LAZY LOADING

Frontend modules must use lazy loading/code splitting where appropriate.

Do NOT import the entire application into the initial dashboard bundle.

Conceptually:

Dashboard \| Module Registry \| Is Billing enabled? \| YES --\> Load
Billing module NO --\> Do not load Billing module

The initial dashboard should remain lightweight.

Heavy modules such as:

-   Billing
-   Analytics
-   Reports
-   AI
-   Grafana
-   GPON
-   TR-069

must not unnecessarily increase the initial page bundle.

------------------------------------------------------------------------

# 13. BACKEND MODULE ISOLATION

Use clear boundaries.

Example:

modules/ subscribers/ plans/ aaa/ billing/ payments/ network/
monitoring/ devices/ operations/ finance/ ai/

Each module should contain:

domain/ application/ infrastructure/ api/ schemas/ events/ tests/

Do not allow arbitrary imports between modules.

Use explicit service interfaces.

------------------------------------------------------------------------

# 14. BUSINESS LOGIC RULE

Business logic must NOT live inside:

-   React components
-   page files
-   API route handlers
-   database models
-   UI hooks

Instead:

UI \| API \| Application Service \| Domain Logic \| Repository

Example:

POST /api/billing/invoices

API Handler \| InvoiceService \| InvoiceDomain \| InvoiceRepository

------------------------------------------------------------------------

# 15. EVENT SYSTEM

Use an internal event bus.

Examples:

SubscriberCreated SubscriberUpdated SubscriberSuspended
SubscriberActivated

SessionStarted SessionStopped

PaymentReceived InvoiceCreated InvoiceOverdue

DeviceOnline DeviceOffline

BandwidthThresholdExceeded

ComplaintCreated

InstallationCompleted

Events allow modules to remain loosely coupled.

Example:

PaymentReceived

Billing listens: → mark invoice paid

Subscriber listens: → update account status

Notification listens: → send receipt

Analytics listens: → update revenue metrics

Do not directly chain every module together.

------------------------------------------------------------------------

# 16. WORKER ARCHITECTURE

Only create separate workers when required.

Good worker candidates:

-   AAA accounting processing
-   RADIUS
-   DHCP
-   PPPoE
-   Monitoring collection
-   SNMP polling
-   TR-069
-   Billing scheduled jobs
-   Notifications
-   AI processing
-   Report generation

Do NOT create workers for:

-   simple CRUD
-   settings
-   dashboard rendering
-   basic subscriber pages
-   simple reports

Workers must only start when their module is enabled.

------------------------------------------------------------------------

# 17. MEMORY MANAGEMENT

The agent must constantly optimize for:

-   build RAM
-   runtime RAM
-   bundle size
-   dependency count
-   database connection count
-   worker count
-   cache size
-   polling frequency

Never create:

-   infinite polling
-   unbounded arrays
-   unbounded caches
-   uncontrolled background loops
-   unnecessary WebSocket connections
-   duplicate database connections
-   duplicate API clients

Use pagination everywhere appropriate.

Never load thousands/millions of database records into browser memory.

------------------------------------------------------------------------

# 18. DATA TABLE RULES

OSS/BSS applications contain many large tables.

Every production table must support:

-   server-side pagination
-   filtering
-   sorting
-   search
-   column visibility
-   export where appropriate
-   loading state
-   empty state
-   error state

Do NOT fetch 100,000 records and filter them in React.

Use server-side queries.

------------------------------------------------------------------------

# 19. API DESIGN

Use consistent REST APIs initially.

Example:

/api/v1/subscribers /api/v1/plans /api/v1/sessions
/api/v1/billing/invoices /api/v1/billing/payments /api/v1/network/nas
/api/v1/network/subnets /api/v1/monitoring/alerts

Use:

-   consistent HTTP status codes
-   validation
-   authorization
-   structured errors
-   request IDs
-   audit logging for sensitive operations

Future services should be able to consume these APIs.

------------------------------------------------------------------------

# 20. SECURITY

Security is mandatory from Day 0.

Implement:

-   secure authentication
-   password hashing
-   session security
-   RBAC
-   permissions
-   tenant isolation
-   CSRF protection where applicable
-   input validation
-   output validation
-   API authorization
-   rate limiting where required
-   audit logging
-   secret management
-   secure cookies
-   secure headers
-   encryption for sensitive data where appropriate

Never store:

-   plaintext passwords
-   payment credentials
-   API secrets
-   private keys

in normal application tables without appropriate protection.

------------------------------------------------------------------------

# 21. RBAC

Create permissions at module/action level.

Example:

billing.invoice.read billing.invoice.create billing.invoice.update
billing.invoice.delete

subscriber.read subscriber.create subscriber.update subscriber.suspend

network.nas.read network.nas.create network.nas.update

system.settings.read system.settings.update

Roles can then contain permissions.

Example:

Super Admin ISP Admin Finance Manager Network Engineer Support Agent
Technician Read Only

Never hardcode role checks throughout UI components.

Use centralized authorization.

------------------------------------------------------------------------

# 22. AUDIT LOG

All sensitive operations must be auditable.

Record:

-   user
-   action
-   module
-   resource
-   resource ID
-   timestamp
-   IP
-   user agent where appropriate
-   old value where appropriate
-   new value where appropriate
-   success/failure

Examples:

Subscriber suspended Plan changed Invoice modified Payment manually
overridden Firewall policy changed Admin user created API key generated

------------------------------------------------------------------------

# 23. UI/UX BRAND SYSTEM

CRYPTSK BRAND:

RED BLACK WHITE

IMPORTANT:

DO NOT MAKE THE ENTIRE UI RED.

Red is an accent and action color.

The UI should primarily use:

-   white
-   near-black
-   dark gray
-   light gray
-   neutral borders
-   neutral surfaces

Red should be used strategically for:

-   primary actions
-   important highlights
-   active states
-   selected navigation
-   alerts where appropriate
-   critical status
-   destructive actions
-   important KPIs
-   brand accents

Use neutral colors for most of the interface.

------------------------------------------------------------------------

# 24. DO NOT USE TEAL/GREEN AS PRIMARY BRAND

Do NOT create a generic SaaS design using:

-   teal
-   turquoise
-   mint
-   green gradients
-   blue-green branding

The product must visibly feel like Cryptsk.

However:

Green MAY be used semantically for:

-   success
-   healthy
-   online
-   payment successful

Yellow/amber MAY be used for:

-   warning
-   pending
-   degraded

Red MAY be used for:

-   error
-   critical
-   destructive
-   brand accent

These are semantic colors, not brand colors.

------------------------------------------------------------------------

# 25. UI DESIGN LANGUAGE

The interface should feel:

-   enterprise
-   technical
-   professional
-   dense but readable
-   modern
-   operational
-   trustworthy
-   high-performance
-   ISP/network-management oriented

Avoid:

-   excessive rounded cards
-   excessive gradients
-   childish illustrations
-   huge empty spaces
-   excessive animations
-   excessive shadows
-   excessive red
-   excessive glassmorphism
-   generic startup SaaS appearance

------------------------------------------------------------------------

# 26. DESIGN SYSTEM

Create centralized design tokens.

Example conceptual structure:

colors: background foreground surface surface-secondary border brand
brand-hover success warning danger info

spacing: xs sm md lg xl

radius: sm md lg

typography: heading body label caption numeric

Do not hardcode random colors throughout the application.

Use centralized tokens.

------------------------------------------------------------------------

# 27. DARK MODE

Dark mode must be first-class.

Dark mode should use:

-   near-black background
-   dark neutral surfaces
-   white/light-gray text
-   subtle borders
-   controlled red accent

Do NOT use pure red backgrounds everywhere.

------------------------------------------------------------------------

# 28. DASHBOARD

Dashboard must be configurable.

Support:

-   KPI cards
-   active subscribers
-   active sessions
-   revenue
-   collections
-   bandwidth
-   network health
-   online NAS
-   alerts
-   complaints
-   pending installations
-   payment status

Widgets should be permission/module aware.

If Billing is disabled:

Billing widgets should not appear.

If Network Monitoring is disabled:

Network widgets should not appear.

------------------------------------------------------------------------

# 29. NAVIGATION

Navigation should be generated from the Module Registry.

Do not hardcode all menus permanently.

Example:

Module Registry \| Enabled modules \| Permission check \| Navigation
builder \| Sidebar

This allows different Cryptsk editions to expose different
functionality.

------------------------------------------------------------------------

# 30. RESPONSIVE UI

The application must support:

-   desktop
-   laptop
-   tablet
-   smaller screens where practical

The primary target is enterprise desktop.

Do not sacrifice desktop information density merely to imitate a
mobile-first consumer SaaS product.

------------------------------------------------------------------------

# 31. ACCESSIBILITY

Use:

-   semantic HTML
-   keyboard navigation
-   visible focus states
-   accessible dialogs
-   accessible forms
-   labels
-   proper ARIA where necessary
-   sufficient contrast

Use Radix/shadcn accessibility capabilities correctly.

------------------------------------------------------------------------

# 32. ANIMATION

Animations must be subtle.

Use animation only when it improves:

-   navigation
-   feedback
-   loading
-   transitions
-   state changes

Avoid heavy animation on every component.

Do not use Framer Motion globally just because it is installed.

------------------------------------------------------------------------

# 33. ERROR HANDLING

Every production page must have:

-   loading state
-   empty state
-   error state
-   retry option where appropriate
-   permission denied state
-   disabled module state

Never display raw exceptions to users.

Provide useful technical logging internally.

------------------------------------------------------------------------

# 34. OBSERVABILITY

Create a common logging layer.

Logs should support:

-   timestamp
-   level
-   module
-   request ID
-   user ID where appropriate
-   operation
-   error details

Levels:

DEBUG INFO WARN ERROR FATAL

Do not log secrets.

------------------------------------------------------------------------

# 35. CONFIGURATION

Use environment/configuration management.

Never hardcode:

-   database credentials
-   API keys
-   payment secrets
-   RADIUS shared secrets
-   SMTP credentials
-   WhatsApp credentials
-   AI credentials

Create:

.env.example

and document all variables.

------------------------------------------------------------------------

# 36. LICENSE/MODULE MODEL

Cryptsk must support feature licensing.

Conceptually:

Module:

Billing

Status: Enabled

License: Enterprise

Expiration: 2027-xx-xx

Dependencies: Subscribers Plans

The UI must not merely hide licensed functionality.

Backend authorization must also enforce it.

------------------------------------------------------------------------

# 37. MULTI-TENANCY

Architect the database and domain layer so multi-tenancy can be
introduced cleanly.

Use tenant-aware data access.

Never rely solely on frontend tenant filtering.

Tenant isolation must exist at backend/repository level.

------------------------------------------------------------------------

# 38. INTERNATIONALIZATION

Use next-intl.

Do not hardcode user-facing strings throughout components.

Use translation keys.

Example:

subscriber.title subscriber.create subscriber.status.active

Prepare the application for:

English Bengali Hindi and future languages.

------------------------------------------------------------------------

# 39. DATE/TIME

Never assume a single timezone.

Store timestamps consistently.

Display according to tenant/user timezone.

Use UTC internally where appropriate.

------------------------------------------------------------------------

# 40. MONEY/CURRENCY

Never use floating-point arithmetic for financial calculations.

Use decimal-safe representations.

Support:

-   currency
-   tax
-   discounts
-   rounding
-   invoice totals
-   payments
-   refunds
-   adjustments

Financial calculations must have automated tests.

------------------------------------------------------------------------

# 41. BILLING ARCHITECTURE

Billing must support:

-   plans
-   recurring billing
-   cyclic billing
-   invoices
-   payments
-   overdue
-   grace periods
-   suspension
-   reactivation
-   add-ons
-   top-ups
-   vouchers
-   discounts
-   tax
-   payment gateways
-   refunds
-   manual adjustments
-   charge overrides
-   collections
-   revenue reporting

Billing must not directly depend on a particular payment provider.

Use:

PaymentGatewayInterface

Implement providers separately.

------------------------------------------------------------------------

# 42. PAYMENT GATEWAY ARCHITECTURE

Example:

Payment Service \| PaymentGatewayInterface \| +------+------+------+ \|
\| \| \| GatewayA GatewayB GatewayC

Each gateway should be independently configurable.

If no payment gateway is configured:

Payment workers/connections should not initialize.

------------------------------------------------------------------------

# 43. AAA ARCHITECTURE

AAA must be designed as a serious ISP/network-access subsystem.

Separate:

``` text
Authentication
Authorization
Accounting
Live Session Management
Dynamic Authorization
```

The production AAA implementation uses FreeRADIUS as the RADIUS
protocol/authentication component and a dedicated Session Engine for
authoritative live session state.

FreeRADIUS MUST NOT:

``` text
- manipulate VPP for every packet
- execute shell scripts for every login
- execute nftables/tc for subscriber enforcement
- maintain the complete live subscriber state
- become the packet-path policy engine
```

Support:

``` text
RADIUS
PPPoE
DHCP subscriber access
Captive Portal
Enterprise Authentication
CoA
Disconnect
Session Accounting
LDAP/AD where required
```

Do not mix session state with UI state.

Do not make Next.js or PostgreSQL the live packet-path session engine.

------------------------------------------------------------------------

# 44. SESSION ARCHITECTURE

The Session Engine is the authoritative owner of live session state.

Sessions should support:

-   session ID
-   subscriber/account identity
-   username
-   NAS/access source
-   access protocol
-   IP/IPv6
-   MAC/device identity
-   VLAN
-   VRF
-   policy/profile IDs
-   bandwidth/QoS profile
-   ACL profile
-   NAT profile
-   start time
-   last accounting update
-   stop time
-   duration
-   upload
-   download
-   protocol
-   termination reason
-   authentication source
-   owner node
-   session epoch/generation
-   event sequence

Recommended state model:

``` text
AUTHENTICATING
AUTHENTICATED
ACTIVE
COA_PENDING
DISCONNECT_PENDING
DISCONNECTED
EXPIRED
STALE
RECOVERING
```

Active session data must be optimized for high-frequency access and kept
primarily in the Session Engine's live state.

Historical session/accounting data must be optimized separately in
PostgreSQL.

The UI reads session state through APIs; it does not own session state.

------------------------------------------------------------------------

# 45. NETWORK / GATEWAY MODULE

Network functionality must be isolated from billing logic and from the
frontend.

Production gateway architecture:

``` text
NIC
 ↓
DPDK
 ↓
VPP
 ↓
Session/Policy enforcement
 ↓
Network
```

Use VPP/DPDK for the high-performance dataplane.

The gateway subsystem may include:

``` text
DHCP / DHCPv6
DNS
PPPoE
IPAM
NAS
Routing
VRF
VLAN
MultiWAN
NAT
ACL / Firewall
QoS / Policing
Captive Portal
DPI / Application Awareness
GPON/OLT integrations
VPN
```

Linux nftables/tc MUST NOT become the primary subscriber
packet-enforcement architecture of the new gateway.

The UI communicates through APIs/services. It must never directly
execute VPP CLI, nftables, tc, or other packet-path system commands.

Use a dedicated VPP Adapter with VPP Binary API/GoVPP or another
approved API binding.

The management plane may configure policies; VPP performs enforcement.

------------------------------------------------------------------------

# 46. DEPLOYMENT MODES

The product has exactly three first-class deployment modes.

## MODE 1 --- AAA-ONLY

``` text
External NAS
    ↓
FreeRADIUS
    ↓
AAA / Session Engine
    ↓
PostgreSQL
```

Provides RADIUS authentication, authorization, accounting,
CoA/Disconnect, NAS management, subscriber/session management,
policy/profile management, and related AAA capabilities.

VPP/DPDK is not required in this mode.

## MODE 2 --- GATEWAY-ONLY

``` text
Subscriber/NIC
    ↓
DPDK
    ↓
VPP
    ↑
Session / Policy Engine
```

The gateway can use configured local, captive-portal, LDAP/AD, API, or
other supported authentication sources.

External RADIUS is not a mandatory dependency for this deployment mode.

## MODE 3 --- MULTI-MODE (AAA + GATEWAY)

``` text
External NAS / Local Access
          ↓
      FreeRADIUS
          ↓
    Session Engine
          ↓
     Policy Engine
          ↓
      VPP Adapter
          ↓
       VPP/DPDK
          ↓
        Network
```

This is the integrated AAA + gateway deployment.

### Critical rule

These are deployment modes, NOT three codebases.

The following must be shared:

``` text
Subscriber/Customer model
Policy model
Session model
IPAM
Accounting
RBAC
Audit
API
Monitoring
Configuration
Module Registry
```

Captive Portal, ISP Broadband, Hospitality, Enterprise Gateway, PPPoE,
DHCP, GPON, DPI, DNS filtering, etc. are features/modules inside these
modes, not additional deployment modes.

# 47. DEVICE MANAGEMENT

Device adapters should use interfaces.

Example:

DeviceManager \| +-- MikroTikAdapter +-- SNMPAdapter +-- TR069Adapter
+-- SSHAdapter +-- OLTAdapter

Do not make the whole system MikroTik-specific.

------------------------------------------------------------------------

# 48. MONITORING

Monitoring must support:

-   polling
-   event collection
-   alerts
-   thresholds
-   historical metrics
-   uptime
-   latency
-   bandwidth
-   device status

Polling frequency must be configurable.

Do not allow uncontrolled polling intervals.

------------------------------------------------------------------------

# 49. REPORTING

Reports must use server-side generation for large datasets.

Never render millions of rows in the browser.

Support:

-   filtering
-   date ranges
-   export
-   CSV
-   PDF where necessary
-   scheduled reports later

Report generation can become a worker.

------------------------------------------------------------------------

# 50. AI ARCHITECTURE

AI must be an optional module.

If AI is disabled:

-   no AI SDK initialization
-   no AI workers
-   no AI background jobs
-   no AI polling
-   no AI database processing

AI should consume resources only when enabled.

AI features:

AI Advisor AI Diagnosis Churn Prediction Churn Alerts Competitor
Intelligence Revenue Intelligence Operational Recommendations

AI must never block core OSS/BSS functionality.

If AI provider is unavailable:

Core Cryptsk must continue operating.

------------------------------------------------------------------------

# 51. COMMUNICATION SERVICES

WhatsApp/SMS/Email integrations must be adapters.

Example:

NotificationService \| ChannelAdapter \| +---+---+---+ \| \| \| \| Email
SMS WhatsApp

If WhatsApp is disabled:

Do not initialize WhatsApp client.

------------------------------------------------------------------------

# 52. MODULE DEPENDENCY RULE

Every module must explicitly declare dependencies.

Example:

Payment depends on: Billing

Billing depends on: Subscribers Plans

AI Diagnosis depends on: Monitoring

The Module Manager must detect dependency problems.

Do not allow circular dependencies.

------------------------------------------------------------------------

# 53. NO CIRCULAR DEPENDENCIES

Forbidden:

Billing → Payment → Billing

Instead:

Billing \| Event Bus \| Payment

PaymentReceived \| Billing consumes event

------------------------------------------------------------------------

# 54. CODE QUALITY

Use strict TypeScript.

Avoid:

any

unless genuinely unavoidable.

Prefer:

interfaces types schemas validation

Use ESLint.

Do not disable lint rules merely to make builds pass.

------------------------------------------------------------------------

# 55. TESTING

Every domain module requires:

Unit Tests Integration Tests API Tests

Critical workflows require E2E tests.

Critical workflows include:

-   login
-   subscriber creation
-   plan assignment
-   authentication
-   session creation
-   billing
-   invoice generation
-   payment
-   suspension
-   reactivation
-   RBAC
-   module enable/disable

------------------------------------------------------------------------

# 56. DEFINITION OF DONE

A feature is NOT complete merely because the UI exists.

A feature is complete only when:

-   UI exists
-   API exists
-   validation exists
-   business logic exists
-   database persistence exists
-   authorization exists
-   audit requirements are handled
-   loading state exists
-   error state exists
-   empty state exists
-   tests exist
-   responsive behavior is checked
-   accessibility is checked
-   build succeeds

------------------------------------------------------------------------

# PHASE GOVERNANCE --- DISCOVER FIRST, THEN BUILD

The phases in this document are an implementation sequence; the product scope is already locked by `04_PRODUCT_FEATURE_CATALOGUE.md` and `11_FINAL_MENU_NAVIGATION_SPECIFICATION.md`.

Every phase has two responsibilities:

1. IMPLEMENT the approved scope for that phase end-to-end.
2. VALIDATE the implementation against the authoritative contracts.

If implementation reveals a missing or conflicting capability, stop and use the locked-pack ADR/change-control process before changing scope.

A detailed specification must cover business workflows, lifecycle
states, menus/pages, actions, validation, APIs, database, permissions,
events, workers, integrations, errors, audit, reporting, observability,
security, performance, E2E workflows, sandbox limitations, and
production deployment requirements.

The agent may identify gaps in the approved scope, but must not silently add or remove product capability. Scope changes require ADR approval before implementation.

## Phase Completion

A phase is complete only when:

-   scope has been discovered and documented
-   module boundaries are documented
-   complete planned workflows are implemented
-   real APIs exist
-   real business logic exists
-   persistence/integration exists
-   security and permissions exist
-   operational/error states exist
-   automated tests exist
-   meaningful E2E workflows pass
-   module enable/disable behavior is verified where applicable
-   production build succeeds
-   resource behavior is measured where applicable
-   sandbox limitations are documented
-   no feature is falsely represented as production-ready

A phase MUST NOT be marked complete because "the UI is done".

## Controlled Scope Change

If implementation reveals a necessary feature or architectural conflict not already approved:

-   document the issue;
-   create an ADR;
-   update the affected authority documents after approval;
-   update contracts/tests;
-   only then implement the change.

The product must grow coherently without silent scope drift.

------------------------------------------------------------------------

# 57. DEVELOPMENT PHASES

DO NOT BUILD EVERYTHING AT ONCE.

Use these phases.

------------------------------------------------------------------------

## PHASE 0 --- FOUNDATION

Build:

-   repository structure
-   package management
-   TypeScript configuration
-   linting
-   formatting
-   environment configuration
-   database layer
-   logging
-   error handling
-   API conventions
-   module registry
-   design tokens
-   base UI
-   authentication foundation

STOP.

Run:

typecheck lint tests build

Fix everything before Phase 1.

------------------------------------------------------------------------

## PHASE 1 --- CORE PLATFORM

Build:

-   Dashboard shell
-   Sidebar
-   Topbar
-   User profile
-   Settings shell
-   Module Manager
-   Feature flags
-   RBAC
-   permissions
-   audit log
-   notifications
-   system health

Acceptance:

A module can be enabled/disabled.

Disabled modules do not appear in navigation.

------------------------------------------------------------------------

## PHASE 2 --- CUSTOMER MANAGEMENT

Build:

-   Subscribers
-   Subscriber profiles
-   Customer 360
-   Plans
-   Batch provisioning
-   subscriber lifecycle
-   customer contacts
-   addresses

Acceptance:

Create subscriber → assign plan → view customer 360 → update subscriber
→ audit action

------------------------------------------------------------------------

## PHASE 3 --- AAA

Build:

-   Authentication
-   Authorization
-   Accounting
-   RADIUS
-   NAS
-   Active Sessions
-   Session History
-   CoA
-   Disconnect
-   RADIUS attributes

Acceptance:

Subscriber → authenticate → session starts → accounting recorded →
session stops → history available

------------------------------------------------------------------------

## PHASE 4 --- NETWORK

Build:

-   NAS devices
-   IPAM
-   subnets
-   interfaces
-   DHCP
-   DHCPv6
-   DNS
-   PPPoE
-   routing
-   MultiWAN

Do not implement hardware-specific integrations before
abstraction/interfaces are stable.

------------------------------------------------------------------------

## PHASE 5 --- POLICY

Build:

-   bandwidth management
-   QoS
-   time access
-   security profiles
-   firewall rules
-   policy assignment

Policies must integrate with subscribers/plans.

------------------------------------------------------------------------

## PHASE 6 --- MONITORING

Build:

-   active monitoring
-   bandwidth
-   traffic analytics
-   uptime
-   latency
-   alerts
-   diagnostics
-   logs
-   IP-MAC history

Introduce workers only where required.

------------------------------------------------------------------------

## PHASE 7 --- BILLING

Build:

-   billing
-   invoices
-   recurring billing
-   cyclic billing
-   grace period
-   suspension
-   reactivation
-   add-ons
-   top-ups
-   vouchers
-   tax

Financial calculations require strong automated tests.

------------------------------------------------------------------------

## PHASE 8 --- PAYMENTS

Build:

-   payment abstraction
-   gateway adapters
-   payment records
-   refunds
-   reconciliation
-   payment history

Payment gateway modules must remain optional.

------------------------------------------------------------------------

## PHASE 9 --- OPERATIONS

Build:

-   complaints
-   technicians
-   agents
-   installations
-   inventory
-   incidents
-   leads
-   reseller
-   action history
-   announcements

------------------------------------------------------------------------

## PHASE 10 --- DEVICE MANAGEMENT

Build:

-   TR-069 ACS
-   MikroTik Manager
-   SNMP Manager
-   SSH Device Manager
-   GPON/OLT integration

Every device family must use an adapter architecture.

------------------------------------------------------------------------

## PHASE 11 --- FINANCE & INTELLIGENCE

Build:

-   revenue reports
-   revenue forecasting
-   collection
-   due recovery
-   GST/tax
-   referral
-   loyalty
-   smart collections
-   revenue leakage
-   compliance
-   SLA
-   reseller intelligence
-   data export

------------------------------------------------------------------------

## PHASE 12 --- COMMUNICATION

Build:

-   email
-   SMS
-   WhatsApp
-   notification templates
-   notification rules

Every communication channel must be optional.

------------------------------------------------------------------------

## PHASE 13 --- AI

Build AI only after core business workflows are stable.

Build:

-   AI Advisor
-   AI Diagnosis
-   churn alerts
-   churn prediction
-   competitor intelligence
-   competitor analysis
-   operational recommendations

AI must never become a dependency for core OSS/BSS operations.

------------------------------------------------------------------------

## PHASE 14 --- PRODUCTION HARDENING

Perform:

-   security audit
-   RBAC audit
-   dependency audit
-   database migration testing
-   performance testing
-   memory testing
-   API testing
-   E2E testing
-   backup/restore testing
-   upgrade testing
-   failure recovery testing

------------------------------------------------------------------------

# APPENDIX A — PHASE GATE

At the end of EVERY phase:

1.  Stop unnecessary processes.
2.  Run typecheck.
3.  Run lint.
4.  Run unit tests.
5.  Run relevant integration tests.
6.  Run relevant E2E tests.
7.  Run production build.
8.  Check build memory.
9.  Check bundle size.
10. Review dependency changes.
11. Fix all errors.
12. Only then continue.

Never knowingly carry broken code into the next phase.

------------------------------------------------------------------------

# 58. MEMORY-SAFE DEVELOPMENT RULES

When executing builds:

DO NOT run:

npm install bun install dev server test server lint watcher type checker
watcher multiple agents

simultaneously unless absolutely necessary.

Prefer sequential execution.

Use production-like builds only at phase gates.

Avoid repeatedly deleting/reinstalling node_modules unless required.

Do not add dependencies to solve simple problems that can be solved with
existing libraries or native TypeScript.

------------------------------------------------------------------------

# 59. DEPENDENCY POLICY

Before adding a dependency ask:

1.  Is it necessary?
2.  Does an existing dependency already solve this?
3.  Is the dependency actively maintained?
4.  Does it increase build complexity?
5.  Does it increase bundle size?
6.  Does it increase server memory?
7.  Is it compatible with the current Next.js/React/Bun versions?

If the answer is uncertain, do not add it.

------------------------------------------------------------------------

# 60. FILE ORGANIZATION

Use a predictable structure.

Example:

src/ app/ components/ modules/ subscribers/ plans/ aaa/ billing/
payments/ network/ monitoring/ operations/ finance/ devices/ ai/ core/
auth/ permissions/ audit/ config/ events/ modules/ lib/ repositories/
services/ schemas/ types/ hooks/

Avoid dumping everything into:

components/ utils/ lib/

without domain ownership.

------------------------------------------------------------------------

# 61. COMPONENT ARCHITECTURE

Create reusable components:

DataTable FormField PageHeader StatusBadge ConfirmDialog EmptyState
ErrorState LoadingState MetricCard FilterBar SearchInput Pagination
DateRangePicker CommandPalette Drawer Modal Tabs PermissionGuard

Do not duplicate these across modules.

------------------------------------------------------------------------

# 62. PAGE ARCHITECTURE

Every page should follow a predictable structure:

Page \| PageHeader \| Filter/Search \| Content \| Data/Table/Form \|
Pagination

Use consistent UX across all modules.

------------------------------------------------------------------------

# 63. FORM ARCHITECTURE

Use:

React Hook Form + Zod

All important forms require:

-   client validation
-   server validation
-   useful validation messages
-   loading state
-   success state
-   failure state
-   duplicate handling

Never trust client-side validation alone.

------------------------------------------------------------------------

# 64. API ERROR FORMAT

Use a consistent structure.

Example:

{ "success": false, "error": { "code": "SUBSCRIBER_NOT_FOUND",
"message": "Subscriber not found", "requestId": "..." } }

Never expose internal stack traces to users.

------------------------------------------------------------------------

# 65. LOGGING RULE

Every important request should have a request ID.

Example:

Request → requestId → API → service → repository → event → worker

This makes production troubleshooting possible.

------------------------------------------------------------------------

# 66. BACKUP

Backup architecture must support:

-   database backup
-   configuration backup
-   restore
-   validation
-   backup history

Never claim backup succeeded unless the operation actually succeeded.

------------------------------------------------------------------------

# 67. MODULE MANAGER UI

Module Manager must show:

Module Description Version Status License Dependencies Resource Type
Worker Status Configuration Enable/Disable Health

Example:

Billing Enabled Healthy Dependencies: OK Worker: Running

AI Disabled License: Available Worker: Stopped

------------------------------------------------------------------------

# 68. RESOURCE-AWARE MODULES

Each module should declare whether it requires:

-   frontend only
-   backend only
-   background worker
-   external connection
-   scheduled jobs
-   cache
-   database tables

This helps Module Manager control resources.

------------------------------------------------------------------------

# 69. DISABLED MODULE GUARANTEE

When disabled, a module must NOT:

-   load frontend bundles unnecessarily
-   start workers
-   create timers
-   start polling
-   open sockets
-   connect to external services
-   create unnecessary caches
-   execute scheduled jobs

This is a HARD REQUIREMENT.

------------------------------------------------------------------------

# 70. DATABASE MIGRATIONS

Module migrations must be organized.

Example:

migrations/ core/ subscribers/ aaa/ billing/ payments/ monitoring/

A disabled module may still have its schema installed if the product
distribution requires it, but its runtime must remain inactive.

Do not repeatedly destroy production data during development.

------------------------------------------------------------------------

# 71. DEMO/SEED DATA

Create controlled seed data.

Include:

-   demo tenant
-   demo admin
-   demo subscribers
-   demo plans
-   demo sessions
-   demo invoices
-   demo payments
-   demo devices

Seed data must never be inserted automatically into production.

------------------------------------------------------------------------

# 72. TEST DATA

Use factories/builders rather than manually duplicating large fixtures.

Avoid massive test datasets that consume unnecessary memory.

Use realistic but controlled datasets.

------------------------------------------------------------------------

# 73. E2E ARCHITECTURE

E2E tests must validate actual workflows.

Example:

Login → Dashboard → Subscriber → Create → Assign Plan → Session →
Invoice → Payment → Customer 360

Do not only test isolated buttons.

------------------------------------------------------------------------

# 74. PERFORMANCE PRINCIPLES

Optimize:

-   database queries
-   indexes
-   pagination
-   caching
-   API response size
-   frontend bundles
-   server rendering
-   worker concurrency

Do not prematurely optimize everything.

Measure before introducing complexity.

------------------------------------------------------------------------

# 75. SECURITY PRINCIPLE

Never trust:

-   browser
-   URL parameters
-   hidden form fields
-   client-side permission checks
-   local storage
-   frontend feature flags

All security-sensitive decisions must be enforced server-side.

------------------------------------------------------------------------

# 76. PRODUCTION CONFIGURATION

The final architecture must support:

Development Testing Staging Production

without changing business logic.

------------------------------------------------------------------------

# 77. FUTURE MICROSERVICE EXTRACTION

The architecture must allow:

AAA Billing Payment Monitoring TR-069 AI

to eventually become independent services.

But DO NOT extract them prematurely.

The first implementation should optimize for:

-   development speed
-   low RAM
-   correctness
-   modularity
-   testing
-   maintainability

------------------------------------------------------------------------

# NO-PROTOTYPE / REAL E2E DEVELOPMENT CONTRACT

CRYPTSK Nexus is a real product development project.

The agent MUST NOT produce a prototype and present it as a completed
product.

Every implemented capability must be a real end-to-end vertical slice:

UI → Real API → Server Validation → Application Service → Domain Logic →
Repository → Real Database / Real Integration → Events / Worker where
required → Real UI State → Automated Tests → E2E Workflow

No fake production behavior. No hardcoded success responses. No fake
payment completion. No static dashboard data presented as live data. No
placeholder API presented as implemented functionality.

Temporary mocks are permitted only inside explicitly isolated test/demo
fixtures.

## Disabled-Module Proof

For every independently disableable module, prove both states.

ENABLED: - UI/module is available - APIs are available - required
workers run - required connections initialize - resource characteristics
are measured

DISABLED: - navigation is absent - module frontend is not unnecessarily
loaded - backend initialization is absent - workers/jobs do not start -
external connections do not initialize - module-specific runtime
resources are not allocated - resource characteristics are measured

The agent must distinguish source size, compile/build memory, artifact
size, frontend bundle size, runtime RAM, runtime CPU, worker count, and
external connections.

A UI feature flag alone is NOT proof of resource isolation.

If build-time resource reduction is a requirement, use separate build
boundaries/packages/product profiles so disabled modules can genuinely
be excluded from the selected build artifact.

## External Software Installation Limitation

The current sandbox may be unable to install or operate production
infrastructure software.

This must never cause the agent to replace real architecture with fake
business logic.

For unavailable external software:

-   implement the production-facing adapter/interface
-   implement configuration
-   implement validation
-   implement error handling
-   implement integration contracts
-   implement test doubles only for automated tests
-   document the exact external dependency
-   provide a reproducible production integration path

Do not claim the external service itself is installed or operational
when it is not.

------------------------------------------------------------------------

# 78. WHAT THE AGENT MUST NEVER DO

NEVER:

-   rewrite the entire architecture without approval
-   introduce Kubernetes unnecessarily
-   introduce dozens of microservices
-   add random dependencies
-   make every UI component red
-   use teal/green as the primary brand
-   put business logic in React components
-   put database logic in UI
-   hardcode permissions
-   hardcode all navigation
-   load all modules on startup
-   start disabled workers
-   use infinite polling
-   fetch huge datasets into the browser
-   bypass validation
-   bypass RBAC
-   expose secrets
-   disable TypeScript strictness just to fix errors
-   disable ESLint rules just to pass builds
-   silently change major dependencies
-   silently change database schema
-   delete working functionality while implementing another feature
-   create fake backend behavior and call it production-ready
-   create mock payment success logic for a production implementation
-   claim hardware integration works without actual implementation
-   claim E2E readiness without tests

------------------------------------------------------------------------

# 79. WHEN A FEATURE CANNOT BE FULLY IMPLEMENTED

Do NOT fake it.

Instead clearly mark:

IMPLEMENTATION STATUS: - UI Complete - Backend Complete - Integration
Pending

Use feature flags where necessary.

Never create fake success responses that could be mistaken for real
functionality.

------------------------------------------------------------------------

# 80. AGENT WORKING METHOD

For every task:

STEP 1: Understand the existing architecture.

STEP 2: Inspect relevant files.

STEP 3: Identify module ownership.

STEP 4: Check dependencies.

STEP 5: Design the smallest correct implementation.

STEP 6: Implement.

STEP 7: Test.

STEP 8: Run typecheck.

STEP 9: Run lint.

STEP 10: Run relevant E2E tests.

STEP 11: Check memory/build impact.

STEP 12: Document architectural changes.

Only then mark the task complete.

------------------------------------------------------------------------

# 81. BEFORE MODIFYING EXISTING CODE

Always inspect:

-   package.json
-   tsconfig
-   Next.js configuration
-   Tailwind configuration
-   Prisma schema
-   environment configuration
-   module registry
-   relevant domain module
-   API routes
-   tests

Do not assume file names or architecture.

------------------------------------------------------------------------

# 82. UI CONSISTENCY RULE

Before creating a new page:

Inspect existing:

-   sidebar
-   topbar
-   page headers
-   tables
-   forms
-   cards
-   dialogs
-   status badges
-   buttons
-   filters

Reuse existing design system.

Do not create a completely different visual language for each module.

------------------------------------------------------------------------

# 83. CRYPTSK VISUAL IDENTITY

Cryptsk should feel like a serious ISP infrastructure platform.

Visual hierarchy:

PRIMARY: Black / white / neutral

ACCENT: Cryptsk red

SEMANTIC: Green = success Amber = warning Red = error/critical Blue =
informational if necessary

The red accent should guide attention, not dominate the entire screen.

Examples of good red usage:

-   primary CTA
-   active navigation indicator
-   important KPI
-   selected state
-   critical alert
-   destructive confirmation

Examples of bad usage:

-   red sidebar background
-   red page background
-   red every button
-   red every card
-   red every icon
-   red text everywhere

------------------------------------------------------------------------

# 84. FINAL PRODUCT QUALITY BAR

Cryptsk must look and behave like a professional commercial OSS/BSS
product.

It must NOT look like:

-   a coding demo
-   an AI-generated dashboard
-   a template
-   a generic shadcn demo
-   a startup landing page
-   a collection of disconnected screens

Every module must feel like part of the same product.

------------------------------------------------------------------------

# 85. FINAL BUILD REQUIREMENT

At final completion, the agent must be able to demonstrate:

1.  Application starts successfully.
2.  Authentication works.
3.  RBAC works.
4.  Module Manager works.
5.  Disabled modules remain inactive.
6.  Navigation reflects enabled modules.
7.  Subscriber/customer management works.
8.  AAA workflows work.
9.  Session Engine workflows work.
10. Network/gateway workflows are implemented according to supported
    scope.
11. DPDK/VPP integration is implemented through the approved adapter
    path where Gateway mode is enabled.
12. No production subscriber enforcement depends on nftables/tc shell
    scripts.
13. Billing works.
14. Payment abstraction works.
15. Monitoring works.
16. Operations work.
17. Finance works.
18. Device integrations have real implementations where declared
    complete.
19. AI remains optional.
20. Audit logging works.
21. Backup/restore works.
22. APIs are documented.
23. All three deployment modes are independently testable.
24. 50K initial certification tests are defined.
25. 100K architectural load tests are defined.
26. 50 Gbps-class dataplane qualification is tied to certified hardware.
27. E2E workflows pass.
28. Production build passes.
29. No known critical security issues remain.
30. No known critical TypeScript errors remain.
31. No disabled module consumes unnecessary runtime resources.

------------------------------------------------------------------------

# 86. AGENT RESPONSE FORMAT

When working on Cryptsk, report progress using:

## CURRENT PHASE

Phase X --- Name

## CURRENT TASK

What is being implemented.

## FILES CHANGED

List only relevant files.

## ARCHITECTURE IMPACT

Explain any architectural changes.

## TESTING

-   Typecheck
-   Lint
-   Unit
-   Integration
-   E2E
-   Build

## RESOURCE IMPACT

Explain whether RAM/build/runtime impact changed.

## REMAINING

What remains before this task/phase is complete.

Do not provide long explanations unless requested.

------------------------------------------------------------------------

# 87. FIRST ACTION --- DAY ZERO

Before writing business features, perform ONLY the following:

1.  Inspect the existing project.
2.  Inspect package.json.
3.  Inspect current source tree.
4.  Inspect current Next.js configuration.
5.  Inspect Prisma configuration.
6.  Inspect Tailwind configuration.
7.  Inspect existing UI components.
8.  Inspect existing authentication.
9.  Inspect existing database schema.
10. Determine what should be retained and what should be replaced.
11. Create the target architecture.
12. Create the module registry foundation.
13. Create the design token system.
14. Create the core application shell.
15. Create the development/build safety rules.
16. Establish Phase 0.

DO NOT immediately generate all 100+ pages.

DO NOT generate fake business logic.

DO NOT generate all modules simultaneously.

------------------------------------------------------------------------

# 88. DAY ZERO STOP CONDITION

After completing the foundation:

STOP.

Do not proceed automatically to all later phases.

Report:

-   architecture created
-   files created
-   dependencies added
-   dependencies removed
-   build result
-   typecheck result
-   lint result
-   memory observations
-   current phase
-   next recommended phase

Then wait for the next development instruction.

------------------------------------------------------------------------

# 89. MASTER PRINCIPLE

The most important architectural principle is:

BUILD A LARGE PRODUCT WITHOUT BUILDING A LARGE RUNTIME.

Cryptsk may contain hundreds of features.

That does NOT mean every feature must be:

-   loaded
-   initialized
-   polled
-   connected
-   cached
-   running

at the same time.

Use:

MODULARITY + LAZY LOADING + FEATURE FLAGS + MODULE REGISTRY + DEPENDENCY
MANAGEMENT + SELECTIVE WORKERS + EVENT-DRIVEN COMMUNICATION + DATABASE
ABSTRACTION + SERVER-SIDE PAGINATION + CONTROLLED RESOURCE USAGE

to create a large OSS/BSS platform with a small active runtime
footprint.

------------------------------------------------------------------------

# 90. PLATFORM TECHNOLOGY BASELINE

The product architecture MUST use a controlled platform BOM.

## Management / OSS-BSS Plane

``` text
Frontend:
Next.js / React / TypeScript
Tailwind / shadcn/ui

Application architecture:
Modular monolith + selective workers

Database:
PostgreSQL for production
SQLite only for lightweight development/testing where appropriate

Persistence:
Repository abstraction / Prisma where appropriate
```

## AAA / Gateway Plane

``` text
OS:
Rocky Linux 10.x

Appliance installation:
Rocky Linux 10.x Minimal ISO

Packet I/O:
DPDK

Dataplane:
VPP

AAA:
FreeRADIUS 3.2.x initially, subject to the approved tested BOM

Session Engine:
Go

VPP integration:
VPP Binary API / GoVPP

Internal control API:
gRPC / Unix socket where appropriate

Service management:
systemd

Observability:
Prometheus + Grafana + OpenTelemetry
```

### Technology boundary

Next.js/TypeScript is the OSS/BSS management plane.

Go/VPP/DPDK/native components are the gateway/AAA runtime plane.

Do NOT implement the 50 Gbps packet path in Next.js, TypeScript,
JavaScript, or PostgreSQL.

Do NOT use the UI process as the authoritative live session engine.

Do NOT use shell commands as the normal runtime API for VPP subscriber
provisioning.

Do NOT introduce Kubernetes or dozens of microservices merely to satisfy
the architecture.

The management plane may remain a modular monolith while the gateway
runtime uses purpose-built native services.

------------------------------------------------------------------------

# 91. GATEWAY RECOVERY AND HA REQUIREMENTS

Gateway deployments must explicitly support:

``` text
Session Engine restart
VPP restart/reconnect
FreeRADIUS restart
PostgreSQL outage/recovery
NAS failure/reconciliation
stale-session cleanup
duplicate login handling
out-of-order event handling
session epoch/generation
event sequence ordering
```

After VPP restart:

``` text
VPP reconnect
    ↓
Session Engine loads active-session recovery state
    ↓
Rebuild required policy/state
    ↓
Verify
    ↓
Resume
```

Control-plane HA and stateful dataplane/NAT HA MUST be treated as
separate capabilities.

Do not advertise stateful NAT/flow HA until active flows, NAT state,
counters, and failover behavior have been implemented and tested.

------------------------------------------------------------------------

# 92. GATEWAY AI-AGENT HARD RULES

The development agent MUST NOT:

1.  implement packet forwarding in the Next.js application
2.  execute `vppctl` as the normal runtime provisioning API
3.  execute nftables/tc commands for subscriber enforcement in the new
    dataplane
4.  put live subscriber packet state in PostgreSQL
5.  create one thread/process/database connection per subscriber
6.  create one policy object per subscriber when shared profiles can be
    used
7.  perform blocking database/HTTP operations inside VPP workers
8.  make billing/reporting/AI a hard dependency of the packet path
9.  assume a successful RADIUS Access-Accept means the VPP dataplane is
    successfully programmed
10. mark a session ACTIVE before required dataplane provisioning
    succeeds
11. ignore session epoch/generation when asynchronous operations can
    race
12. claim 50 Gbps capability without hardware qualification
13. claim 100K readiness without load/recovery testing

------------------------------------------------------------------------

# 93. FINAL COMMAND TO THE DEVELOPMENT AGENT

You are the principal software architect and senior full-stack engineer
responsible for building Cryptsk.

You are NOT a prototype generator. Implement the approved product scope defined by `04_PRODUCT_FEATURE_CATALOGUE.md` and `11_FINAL_MENU_NAVIGATION_SPECIFICATION.md` end-to-end. If you discover a missing capability or conflict, use the locked-pack ADR/change-control process before changing scope.

Follow this specification throughout the entire project.

Prioritize:

1.  Correctness
2.  Security
3.  Architecture
4.  Maintainability
5.  Resource efficiency
6.  UX consistency
7.  Testability
8.  Production readiness

Never trade architecture quality for speed.

Never trade correctness for visual completeness.

Never fake functionality.

Never unnecessarily increase runtime or build memory.

Never introduce unnecessary microservices.

Never turn the entire UI red.

Never use teal/green as the Cryptsk primary brand.

Build CRYPTSK Nexus phase-by-phase.

Complete and validate each phase before beginning the next.

The final result must be a coherent, production-grade, modular OSS/BSS
platform---not merely a collection of UI screens.

START WITH DAY ZERO ONLY.

------------------------------------------------------------------------

# APPENDIX B — ARCHITECTURE RECONCILIATION WITH THE ENTERPRISE GATEWAY SPEC

This document and the dedicated Enterprise Gateway architecture must be
treated as complementary specifications.

``` text
OSS/BSS MASTER ARCHITECTURE
        ↓
Management / Business / UI / Customer / Billing / Operations

ENTERPRISE GATEWAY ARCHITECTURE
        ↓
AAA / Session / Policy / VPP / DPDK / NAT / QoS / ACL / Dataplane
```

When the two documents overlap:

1.  This document governs the overall CRYPTSK Nexus platform, modular OSS/BSS
    architecture, UI, business domains, module lifecycle, and
    development governance.
2.  The Enterprise Gateway architecture governs high-performance
    AAA/session/dataplane behavior.
3.  The shared entities must use one canonical subscriber/customer,
    policy, service-plan, session, NAS, IPAM, and accounting model.
4.  Neither document may create a second incompatible session model.
5.  Neither document may create a second incompatible policy model.
6.  Gateway packet-path logic must remain outside the Next.js
    application.
7.  OSS/BSS workflows configure and observe the gateway through
    APIs/events, not direct packet-path commands.

The combined target is:

``` text
             CRYPTSK OSS/BSS
                  |
       Customer / Billing / UI
       RBAC / Audit / Reporting
       Configuration / Analytics
                  |
             API / Events
                  |
        +---------+---------+
        |                   |
        ▼                   ▼
   AAA / Session        Policy Engine
      Engine                 |
        |                    |
        +---------+----------+
                  |
             VPP Adapter
                  |
             VPP + DPDK
                  |
                 NIC
```

Deployment modes remain exactly:

``` text
1. AAA-ONLY
2. GATEWAY-ONLY
3. MULTI-MODE (AAA + GATEWAY)
```

The product target remains:

``` text
100,000 concurrent sessions — architectural target
50,000 concurrent sessions — initial certification profile
50 Gbps-class dataplane — hardware-qualified target
```
