# CRYPTSK NEXUS — DATABASE & DATA MODEL SPECIFICATION
## Canonical domain model, PostgreSQL design, live-state boundary, accounting, audit, retention, and migration rules

**Status:** LOCKED DATABASE / DATA MODEL BASELINE
**Authority:** Subordinate to `00_MASTER_PRODUCT_ARCHITECTURE.md`; functionally grounded in `04_PRODUCT_FEATURE_CATALOGUE.md` and the gateway/session architecture.

---

# 1. PURPOSE

This document converts the functional data inventory into a canonical production data architecture.

The database design MUST support:

- full OSS/BSS functionality;
- AAA/accounting integration;
- 100,000 concurrent sessions;
- fast live-session lookup without using PostgreSQL as the packet path;
- durable historical records;
- financial correctness;
- auditability;
- multi-tenant/organizational boundaries where enabled;
- high-volume accounting and telemetry ingestion;
- migrations from the existing feature-sheet data model;
- future module expansion without schema chaos.

---

# 2. SOURCE INVENTORY RECONCILIATION — MANDATORY GATE

The source feature sheet states:

- 204 Prisma models
- 90 enums

The grouped model names in the source inventory contain **204 named model entries**, so the model count itself reconciles. Several inline group labels in the source sheet are inaccurate; the corrected counts are recorded in `04_PRODUCT_FEATURE_CATALOGUE.md`.

The source feature sheet reports **90 enums**, but the named enum list in the same inventory contains **99 unique enum names**. This is the remaining source-enumeration discrepancy. The new system MUST NOT invent or delete enums merely to force the historical count to match.

Before schema freeze, create a reconciliation register for the enum inventory and any legacy model merge/split decisions:

```text
source model/enum
→ canonical entity/enum
→ retained / merged / split / deprecated
→ domain owner
→ migration strategy
→ references
```

The authoritative metric for the CRYPTSK Nexus is the canonical schema and approved migration register, not a historical headline count.

The source enums are a functional reference; each must be classified as:

- retained enum;
- normalized enum;
- status state machine;
- free-form/extensible reference where appropriate;
- deprecated legacy enum.

---

# 3. DATABASE AUTHORITY

Production system of record:

```text
PostgreSQL
```

Development may use lightweight adapters only where they preserve domain behavior, but production semantics must be PostgreSQL-first.

PostgreSQL stores durable business/configuration/history state.

It MUST NOT be used as the per-packet policy lookup mechanism.

---

# 4. DATA-STATE CLASSIFICATION

Every data object MUST be classified into one of these classes.

## 4.1 Configuration state

Examples:

- plan
- policy definition
- NAS configuration
- firewall rule
- IP pool
- DNS configuration
- billing settings
- integration settings

Characteristics:

- durable;
- versioned where necessary;
- auditable;
- relatively low update frequency.

## 4.2 Transactional state

Examples:

- subscriber
- service
- invoice
- payment
- complaint
- installation
- inventory transaction.

Characteristics:

- ACID transaction semantics;
- business constraints;
- audit trail as required.

## 4.3 Runtime/ephemeral state

Examples:

- gateway worker queues;
- current VPP object handles;
- in-memory session index;
- current connection state;
- transient control-plane leases.

These MUST NOT depend on PostgreSQL for every packet or high-frequency mutation.

## 4.4 Historical state

Examples:

- session history;
- accounting samples;
- NAT logs;
- authentication logs;
- audit logs;
- network telemetry;
- notification delivery history.

Designed for append-heavy ingestion and analytical access.

---

# 5. CORE DOMAIN BOUNDED CONTEXTS

The canonical database is organized by bounded context, not by UI page.

1. Identity & Administration
2. Tenant / Organization
3. Customer / Subscriber / Service
4. Product / Plan / Policy
5. AAA / NAS
6. Session / Accounting
7. Network / IPAM
8. Gateway / Security / QoS
9. Billing / Finance
10. Operations / Support
11. Inventory / Assets
12. Monitoring / Alerts
13. Integrations / Notifications
14. Reporting / Analytics
15. AI / Intelligence

A model belongs to one primary domain owner even when referenced by many modules.

---

# 6. TENANCY / ORGANIZATION MODEL

Where multi-tenant operation is enabled, domain records requiring isolation MUST carry an explicit tenant/organization boundary.

Canonical pattern:

```text
Tenant
 ├─ Organization
 │   ├─ Business Unit / Site / Scope (when enabled)
 │   ├─ Users / Delegated Administrators
 │   ├─ Customers
 │   ├─ Subscribers / Service Consumers
 │   ├─ Services
 │   ├─ Plans
 │   ├─ Network
 │   └─ Billing
```

Do not infer tenant identity only from the current URL or UI route.

Authorization scope is enforced in the application/service layer, with database constraints/indexes supporting safe filtering.

---

# 7. IDENTITY MODEL

Use stable opaque identifiers for platform entities.

Recommended logical format:

```text
sub_...
svc_...
plan_...
sess_...
nas_...
inv_...
pay_...
policy_...
op_...
```

The exact physical type may be UUID/UUID-like or another approved stable identifier. The API MUST NOT expose database sequence assumptions.

External IDs are separate from internal IDs when integration systems require their own identifier.

---

# 8. CUSTOMER / SUBSCRIBER / SERVICE MODEL

Do not collapse Customer, Subscriber/Service Consumer, and Service into one record. Subscriber is a vertical/network terminology choice; the universal domain remains Customer/Account/Service.

```text
Customer / Organization
        │
        └── Subscriber
               │
               ├── Service / Subscription
               │       ├── Plan
               │       └── Access Profile
               │
               └── Device / Identity associations
```

A subscriber may have multiple services over time.

A service has its own lifecycle:

```text
DRAFT → PROVISIONING → ACTIVE → SUSPENDED → TERMINATING → TERMINATED
```

Historical state must be reconstructable from durable records.

---

# 9. PLAN / PRODUCT / POLICY MODEL

Business plan and gateway enforcement policy are related but distinct.

```text
Product
  └─ Plan
      ├─ Pricing
      ├─ Service rules
      └─ Network Policy Reference
             ├─ QoS
             ├─ ACL
             ├─ NAT
             ├─ DNS
             └─ Application/DPI
```

A plan may be edited, but already-issued policy versions remain identifiable.

Policy compilation creates a versioned representation suitable for runtime enforcement.

---

# 10. POLICY VERSIONING

Every runtime-relevant policy has:

```text
policy_id
policy_version
status
created_at
created_by
compiled_at
compiled_hash
effective_from
effective_to
```

A compiled policy has a deterministic fingerprint.

The gateway must be able to answer:

```text
Which policy version was applied to this session at time T?
```

This is essential for support, audit, debugging, and billing disputes.

---

# 11. AAA DATA MODEL

Canonical entities include:

- NAS client
- NAS vendor/type
- RADIUS user / access identity
- RADIUS group / profile
- RADIUS attribute definition
- user attribute assignment
- proxy realm
- proxy server
- authentication event
- accounting event
- CoA event
- disconnect command/result
- enterprise authentication profile
- LDAP/AD configuration reference.

The product may retain FreeRADIUS-native tables for compatibility. Those tables must not become the only domain representation for features that require richer business state.

---

# 12. RADIUS COMPATIBILITY BOUNDARY

The canonical ownership is:

```text
Cryptsk Subscriber/Service
       ↓
AAA projection / RADIUS authorization data
       ↓
FreeRADIUS
```

The projection MUST be reconcilable.

Maintain a provisioning/reconciliation record showing:

- desired AAA state;
- last successful projection;
- current projection status;
- error information;
- source entity version.

Do not rely on blind table synchronization without state tracking.

---

# 13. SESSION DATA MODEL

A session record logically contains:

```text
session_id
subscriber_id
service_id
username
nas_id
access_type
mac_address
vlan_id
vrf_id
ipv4_address
ipv6_prefix
policy_id
policy_version
bandwidth_profile
acl_profile
nat_profile
started_at
last_seen_at
last_accounting_at
state
termination_reason
authentication_source
session_epoch
```

Runtime counters may be sampled into durable usage records, but live high-frequency counters remain owned by the Session Engine/gateway telemetry system.

---

# 14. SESSION HISTORY

Session history is durable and queryable.

At minimum capture:

- start;
- authentication context;
- service/plan/policy;
- IP/MAC/NAS;
- accounting samples;
- policy changes;
- CoA/disconnect actions;
- stop reason;
- final counters;
- reconciliation status.

History is not the same object as the live session index.

---

# 15. ACCOUNTING MODEL

Use append-oriented accounting ingestion where practical.

A normalized accounting event should contain:

```text
event_id
source
nas_id
external_session_id
session_id if resolved
username
packet_type
received_at
nas_event_time
input_octets
output_octets
session_time
raw/reference metadata
dedupe_key
```

Normalization must account for RADIUS counter semantics and source resets.

The system must preserve enough information to explain how a final usage total was produced.

---

# 16. HIGH-VOLUME SESSION / ACCOUNTING TABLES

Tables expected to grow quickly should be designed separately from small configuration tables.

Examples:

- accounting_events;
- session_usage_samples;
- authentication_events;
- session_events;
- NAT logs;
- syslog messages;
- telemetry samples;
- audit events.

Use appropriate partitioning and retention when measured volume justifies it.

Do not partition every table preemptively.

---

# 17. INDEX PRINCIPLES

Critical active-session lookup keys include:

```text
session_id
subscriber_id + state
username + state
ip_address + state
mac_address + state
nas_id + state
external_session_id + nas_id
```

Common business indexes include:

- tenant/org + status;
- subscriber + service status;
- invoice + status + due date;
- payment + created_at;
- device + status;
- policy + version/status;
- alert + status + severity;
- audit + actor + occurred_at;
- operation + status.

Indexes must be validated using actual query plans.

---

# 18. CONSTRAINTS

Use the database to enforce durable invariants such as:

- unique external identifiers within scope;
- nonnegative monetary values where applicable;
- valid foreign-key ownership;
- valid status transitions through application/domain logic;
- unique active assignment where the business rule requires it;
- immutable transaction identifiers.

Application validation remains necessary; database constraints are the final integrity boundary.

---

# 19. MONEY / FINANCIAL DATA

Never use floating-point storage for currency amounts.

Use:

- fixed-precision numeric/decimal;
- explicit currency code;
- explicit tax/discount components;
- deterministic rounding rules;
- immutable transaction IDs;
- audit trail.

Financial documents should preserve the calculation inputs required to reproduce the total.

---

# 20. INVOICE MODEL

Invoice should separate:

- header;
- billing period;
- line items;
- taxes;
- discounts;
- adjustments;
- payments/allocations;
- credit notes;
- balance;
- status history.

Do not derive historical invoice totals purely from today's plan configuration.

---

# 21. PAYMENT MODEL

Payment must capture:

- payment ID;
- external gateway transaction/reference;
- mode/provider;
- amount/currency;
- received timestamp;
- allocation to invoices;
- status;
- verification state;
- refund history;
- idempotency key/reference;
- reconciliation state.

Gateway webhook processing must be idempotent.

---

# 21A. PREPAID / TOP-UP / VOUCHER MODEL

Where prepaid commerce is enabled, maintain distinct durable records for:

- top-up product;
- prepaid wallet/balance ledger;
- voucher/PIN definition;
- voucher batch;
- voucher issuance;
- redemption;
- expiry;
- reversal/adjustment.

A voucher/PIN is not the same thing as a package definition or a payment transaction.

# 21B. SERVICE CONTRACT / AMC MODEL

Where managed-service contracts are enabled, maintain:

- contract;
- customer/service links;
- entitlement tier;
- covered assets/services;
- SLA commitments;
- effective/expiry dates;
- renewal state;
- support coverage;
- audit history.

# 22. INVENTORY / ASSET MODEL

Equipment, stock, warehouse, purchase order, return, repair, and inspection are separate concepts.

Inventory mutation should be represented as auditable transactions rather than overwriting history.

Example:

```text
Purchase
 → Receive
 → Stock
 → Assign
 → Install
 → Repair
 → Return / Dispose
```

---

# 23. NETWORK / IPAM MODEL

Canonical entities:

- network device;
- interface;
- VLAN;
- subnet/prefix;
- IP address;
- IP pool;
- assignment;
- assignment history;
- CGNAT pool;
- CGNAT mapping/reference;
- route;
- WAN link;
- failover policy.

IPAM allocation MUST be transactional from the management perspective, but gateway dataplane application occurs separately through a controlled command path.

---

# 24. CAPTIVE PORTAL / HOTSPOT DATA

Separate:

- portal configuration;
- access rules;
- templates;
- schedules;
- advertisements;
- whitelist;
- voucher pool;
- portal session;
- portal event.

Portal session identity MUST remain separate from generic web-admin authentication.

---

# 25. DEVICE MANAGEMENT

Store device configuration and credentials as domain records plus secure secret references.

Avoid storing plaintext passwords/private keys in ordinary business tables.

Device configuration history is append-oriented:

```text
Device
 → Config Version
 → Applied/Failed
 → Operator/Automation
 → Timestamp
```

---

# 26. MONITORING / ALERT DATA

Monitoring objects:

- metric definitions;
- threshold/rule;
- alert;
- alert state history;
- suppression window;
- comment/acknowledgement;
- notification delivery.

Do not use transactional tables as a high-frequency time-series database simply because they already exist.

Where high-cardinality metrics exist, use a purpose-built metrics backend under the observability architecture while preserving business summaries in PostgreSQL where useful.

---

# 26A. WEB BROWSING / HTTP LOG DATA

Where enabled, store a queryable, retention-controlled web browsing log with fields such as:

```text
log_id
timestamp
subscriber/service/session reference when resolved
source IP / port when available
destination IP / port when available
host/domain metadata when available
HTTP method/status for visible HTTP traffic
bytes when available
gateway/node reference
correlation/session identifiers
retention class
```

Do not represent standard HTTPS traffic as full URL/path/payload visibility without an approved inspection/decryption architecture.

# 27. AUDIT MODEL

Audit records are immutable.

Capture:

```text
actor
actor_type
tenant/scope
action
entity_type
entity_id
before_summary
change_summary
reason if required
request_id
correlation_id
source
occurred_at
result
```

Secrets and sensitive fields must be redacted.

Audit data must not be silently deleted because an application record was deleted.

---

# 28. OUTBOX MODEL

Use an outbox table for durable event publication where a state change and event need atomic consistency.

Fields:

```text
id
event_type
event_version
aggregate_type
aggregate_id
occurred_at
payload
correlation_id
causation_id
attempts
available_at
processed_at
last_error
```

The outbox dispatcher must be bounded and observable.

---

# 29. OPERATION / JOB MODEL

Long-running operations use a durable job/operation record.

Fields:

```text
operation_id
type
requested_by
status
progress
created_at
started_at
finished_at
result_reference
error_code
error_detail
idempotency_key
```

This permits restarts without losing the status of a bulk operation.

---

# 30. INTEGRATION MODEL

Every integration should have a normalized configuration state:

- provider;
- enabled/disabled;
- endpoint;
- authentication method;
- secret reference;
- timeout;
- retry policy;
- health state;
- last test;
- last error;
- version/compatibility.

Transactions are stored separately where required.

---

# 31. NOTIFICATION MODEL

Separate:

- template;
- notification intent;
- channel delivery;
- delivery attempt;
- delivery result;
- provider response.

One logical notification may have multiple channel attempts.

---

# 32. AI DATA MODEL

AI outputs must be explainable records, not ephemeral text only.

Capture where appropriate:

- model/provider reference;
- input dataset/time window;
- feature set or query reference;
- result;
- confidence/quality metadata if available;
- recommendation state;
- accepted/rejected;
- human override;
- action audit.

Do not store sensitive customer data in AI logs unnecessarily.

---

# 33. FEATURE / MODULE REGISTRY DATA

A canonical feature registry should capture:

```text
feature_id
module_id
name
version
status
enabled_by_default
license requirement
deployment modes
dependencies
permissions
ui routes
api capabilities
event capabilities
runtime components
observability requirements
```

This data drives feature gating and documentation; it is not a substitute for code-level authorization.

---

# 34. LIVE SESSION STORAGE BOUNDARY

Authoritative live state:

```text
Session Engine
```

Durable state/history:

```text
PostgreSQL
```

Optional cache/coordination:

```text
Redis, only when justified
```

Redis MUST NOT silently become the only source of live truth.

PostgreSQL MUST NOT become a per-packet state store.

---

# 35. SESSION SNAPSHOT / RECOVERY

Session Engine MUST periodically or transactionally preserve enough durable information to reconstruct required live intent after process restart.

The recovery process is:

```text
Durable desired session state
        ↓
Session Engine restore
        ↓
VPP actual-state inspection
        ↓
Reconciliation
        ↓
Recovered ACTIVE / terminated / manual-review state
```

The design must tolerate:

- process restart;
- node restart;
- VPP restart;
- network interruption;
- delayed accounting;
- duplicated events.

---

# 36. RETENTION CLASSES

Every high-volume table must have a documented retention class.

Example classes:

| Class | Example | Default approach |
|---|---|---|
| Critical business | invoice/payment/audit | long-term retention by policy |
| Operational history | session history | configurable |
| High-volume telemetry | bandwidth samples | short/medium with aggregation |
| Security telemetry | NAT/security logs | policy/legal dependent |
| Debug | diagnostic captures | short retention |

Never hard-code deletion without an explicit retention configuration and audit requirement.

---

# 37. PARTITIONING GUIDANCE

Consider time partitioning for measured high-volume append tables such as:

- accounting events;
- session history;
- audit log;
- NAT logs;
- syslog;
- telemetry samples;
- notification delivery history.

Partition only where operational/query benefits justify the complexity.

Partitioning strategy is a performance decision validated by benchmark, not a visual architecture preference.

---

# 38. DATA ACCESS PATTERNS

Domain services should access data through explicit repositories/query services.

Do not allow arbitrary pages to perform direct SQL against every table.

Required read patterns should be optimized intentionally:

- list queries;
- detail queries;
- dashboard aggregates;
- active-session lookups;
- reporting queries;
- background jobs.

Use specialized read models when the normalized transactional model cannot support dashboard/report workloads efficiently.

---

# 39. MIGRATION FROM LEGACY MODEL

Migration sequence:

1. inventory legacy models;
2. reconcile source model names;
3. classify every model;
4. map to canonical entity;
5. define transformation;
6. migrate reference/master data;
7. migrate transactional data;
8. migrate accounting/history;
9. verify counts/checksums/business totals;
10. enable dual-read or validation where required;
11. cut over;
12. preserve rollback path;
13. deprecate legacy structures.

No direct blind Prisma schema copy is accepted as the final architecture.

---

# 40. DATABASE CONNECTION GOVERNANCE

Requirements:

- bounded connection pools;
- separate pools by workload class when justified;
- query timeouts;
- transaction timeouts;
- retry policy only for retry-safe operations;
- connection leak detection;
- slow query visibility;
- migration locking discipline.

There is never one connection per subscriber, packet, request, or session.

---

# 41. DATABASE HIGH AVAILABILITY

Production deployment may use replication/HA according to deployment size.

The application must understand database role/availability states.

A database outage MUST NOT cause a packet-path crash loop.

The gateway must fail according to explicit control-plane/data-plane degradation rules defined by the gateway architecture.

---

# 42. DATA PRIVACY

Sensitive fields should be classified:

- credentials;
- secrets;
- payment references;
- personally identifiable information;
- subscriber identity data;
- support notes;
- device credentials;
- AI-sensitive data.

Use field-level access controls, redaction, encryption-at-rest where appropriate, and strict export permissions.

---

# 43. SCHEMA MIGRATION GOVERNANCE

Every schema change must have:

- migration script;
- rollback/forward strategy;
- compatibility assessment;
- index impact review;
- data-volume consideration;
- lock/downtime analysis;
- test migration;
- production verification.

Never edit production schema manually as the normal deployment method.

---

# 44. DATA ACCEPTANCE GATES

Schema implementation is not complete until:

- all canonical domains have owners;
- source model reconciliation is complete;
- all critical foreign keys/uniques are defined;
- active session lookup paths meet target latency under load;
- high-volume tables have retention plans;
- financial calculations are reproducible;
- audit is immutable;
- outbox is reliable;
- migrations are tested;
- production PostgreSQL backups/restores are tested.

---

# 45. FINAL DATA PRINCIPLE

```text
Business truth → PostgreSQL
Live session truth → Session Engine
Dataplane truth → VPP
Historical evidence → durable history/log stores
Metrics → observability backend
Cache → optional acceleration, never hidden authority
```

The database is the durable memory of the product, not the packet processor.
