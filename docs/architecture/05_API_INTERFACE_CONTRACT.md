# CRYPTSK NEXUS — API & INTERFACE CONTRACT
## Product-wide application API, gateway control API, events, idempotency, and compatibility specification

**Status:** LOCKED API / INTERFACE BASELINE
**Authority:** Subordinate to `00_MASTER_PRODUCT_ARCHITECTURE.md`; functionally grounded in `04_PRODUCT_FEATURE_CATALOGUE.md` and the AAA/gateway design in `02_ENTERPRISE_GATEWAY_ARCHITECTURE.md`.

---

# 1. PURPOSE

This document defines the interface contract between the Cryptsk UI, management/application services, gateway control components, AAA, Session Engine, integrations, workers, and durable storage.

The objective is not to reproduce the legacy `501 route.ts` files one-for-one. The objective is to preserve the complete product capability surface while creating stable, versioned, typed, observable, secure interfaces.

The API architecture MUST support:

- the full feature catalogue;
- the three deployment modes;
- 100,000 concurrent live sessions;
- management-plane horizontal scaling;
- gateway control-plane recovery;
- asynchronous work where latency-sensitive operations must not block;
- strong validation and authorization;
- idempotent operational commands;
- auditability;
- backward-compatible evolution;
- clear distinction between configuration, commands, queries, and events.

The API layer is a control interface. It is never the packet-processing path.

---

# 2. INTERFACE AUTHORITY

Use this precedence when defining or changing an interface:

1. `00_MASTER_PRODUCT_ARCHITECTURE.md`
2. `01_OSS_BSS_ARCHITECTURE.md`
3. `02_ENTERPRISE_GATEWAY_ARCHITECTURE.md`
4. `04_PRODUCT_FEATURE_CATALOGUE.md`
5. this document
6. implementation details

Implementation MUST NOT create an interface that contradicts a higher authority.

If a requirement cannot be represented cleanly within these contracts, create an ADR before implementation.

---

# 3. INTERFACE TAXONOMY

Cryptsk uses four interface classes.

## 3.1 External management API

Used by:

- Next.js/React management UI
- self-care UI
- approved automation clients
- customer integrations
- reporting/export clients

Preferred style:

- HTTPS
- REST/JSON for public management contracts
- explicit API versioning
- typed request/response schemas

## 3.2 Internal synchronous service interface

Used when a synchronous decision is required between trusted internal components.

Examples:

- Management API → domain service
- Policy Engine → Session Engine
- Session Engine → VPP Adapter
- gateway controller → VPP control component

The implementation MAY use gRPC or another strongly typed RPC mechanism, but the domain contract MUST remain transport-independent.

## 3.3 Asynchronous event interface

Used for:

- accounting ingestion
- notifications
- audit consumers
- analytics
- reporting pipelines
- AI consumers
- integration delivery
- long-running jobs
- lifecycle propagation

Events MUST be versioned schemas, not arbitrary internal JSON objects.

## 3.4 Gateway command interface

Used by trusted control-plane components to request dataplane changes.

Examples:

- create subscriber dataplane state
- update bandwidth profile
- attach/detach ACL
- allocate/release address
- apply NAT policy
- remove session state
- reconcile VPP objects

The gateway command path uses VPP Binary API / GoVPP or an approved adapter. `vppctl` is not the normal runtime provisioning API.

---

# 4. API DESIGN PRINCIPLES

Every production API MUST be:

- authenticated;
- authorized;
- validated;
- observable;
- documented;
- deterministic for the same valid input where applicable;
- explicit about partial failure;
- safe to retry where the operation may be retried;
- protected against unbounded resource consumption.

APIs MUST NOT expose database implementation details as their primary contract.

Do not expose:

- raw Prisma model names as the only interface definition;
- direct SQL endpoints;
- filesystem paths;
- internal secrets;
- VPP object handles without a stable domain abstraction;
- internal service credentials;
- raw password hashes.

---

# 5. URL / RESOURCE CONVENTION

Management API base:

```text
/api/v1
```

Future incompatible contract versions use `/api/v2`, not silent behavior changes under `/api/v1`.

Resource naming uses plural nouns:

```text
/api/v1/subscribers
/api/v1/plans
/api/v1/invoices
/api/v1/payments
/api/v1/nas
/api/v1/sessions
/api/v1/policies
/api/v1/devices
/api/v1/alerts
```

Subresources are used only where ownership is clear:

```text
/api/v1/subscribers/{subscriber_id}/services
/api/v1/subscribers/{subscriber_id}/sessions
/api/v1/invoices/{invoice_id}/lines
/api/v1/nas/{nas_id}/health
```

Action endpoints are reserved for real commands rather than CRUD disguised as verbs:

```text
POST /api/v1/sessions/{id}:disconnect
POST /api/v1/sessions/{id}:reconcile
POST /api/v1/invoices:bulk-generate
POST /api/v1/payments/{id}:refund
```

---

# 6. STANDARD HTTP SEMANTICS

| Method | Meaning | Typical use |
|---|---|---|
| GET | Read | list/detail/report query |
| POST | Create / command | create resource or initiate operation |
| PUT | Replace | full deterministic replacement |
| PATCH | Partial update | targeted mutable fields |
| DELETE | Retire/remove | deletion where safe and meaningful |

Mutation endpoints MUST state whether the operation is:

- transactional;
- asynchronous;
- eventually consistent;
- idempotent;
- reversible;
- auditable.

---

# 7. COMMON REQUEST HEADERS

Recommended:

```text
Authorization: Bearer <token>
Content-Type: application/json
Accept: application/json
X-Correlation-ID: <uuid>
Idempotency-Key: <unique-value>
If-Match: <etag>             # where optimistic concurrency is applicable
```

`X-Correlation-ID` is created at the edge if absent and propagated through all internal calls, logs, traces, jobs, and events.

`Idempotency-Key` is REQUIRED for externally retriable financial and operational commands where duplicate execution could cause damage.

---

# 8. STANDARD RESPONSE ENVELOPE

Successful single-resource response:

```json
{
  "data": {},
  "meta": {
    "request_id": "...",
    "api_version": "v1"
  }
}
```

Collection response:

```json
{
  "data": [],
  "meta": {
    "request_id": "...",
    "api_version": "v1",
    "page": 1,
    "page_size": 50,
    "total": 1234,
    "has_next": true
  }
}
```

Asynchronous command:

```json
{
  "data": {
    "operation_id": "op_...",
    "status": "accepted"
  },
  "meta": {
    "request_id": "...",
    "api_version": "v1"
  }
}
```

---

# 9. STANDARD ERROR CONTRACT

```json
{
  "error": {
    "code": "SUBSCRIBER_PLAN_INVALID",
    "message": "The selected plan cannot be assigned to this subscriber.",
    "details": [
      {
        "field": "plan_id",
        "reason": "plan_disabled"
      }
    ],
    "retryable": false,
    "request_id": "..."
  }
}
```

Do not expose stack traces, SQL errors, file paths, secrets, or internal topology to clients.

Required classes:

- `VALIDATION_ERROR`
- `AUTHENTICATION_REQUIRED`
- `FORBIDDEN`
- `NOT_FOUND`
- `CONFLICT`
- `PRECONDITION_FAILED`
- `RATE_LIMITED`
- `DEPENDENCY_UNAVAILABLE`
- `TIMEOUT`
- `INTERNAL_ERROR`
- domain-specific stable error codes.

---

# 10. PAGINATION / FILTERING / SORTING

Default collection behavior MUST be bounded.

No endpoint may return an unbounded subscriber, session, accounting, log, or audit collection.

Preferred query contract:

```text
?page=1&page_size=50
?sort=-created_at,name
?status=ACTIVE
?area_id=...
?search=...
?from=...
?to=...
```

Maximum page size MUST be enforced by the server.

Large exports use asynchronous jobs rather than forcing the browser to hold millions of rows.

---

# 11. QUERY VS COMMAND RULE

The API MUST distinguish read-heavy queries from state-changing commands.

Example:

```text
GET  /api/v1/sessions
POST /api/v1/sessions/{id}:disconnect
```

A GET request MUST NOT perform a hidden state mutation.

An endpoint that merely "refreshes" cached telemetry MUST still define whether it triggers an expensive operation.

---

# 12. DOMAIN API SURFACE

The following logical resource families cover the feature catalogue.

## 12.1 Identity / Administration

- users
- roles
- permissions
- API keys
- sessions
- module/feature registry
- licenses
- audit events
- system configuration
- backups
- integration credentials references

## 12.2 Subscriber / CRM

- customers/organizations
- organization/scope nodes (when enabled)
- subscribers
- subscriber services
- plans
- add-ons
- organization/scope records (when enabled)
- leads
- referrals
- loyalty
- subscriber profile / 360 view
- batch provisioning

## 12.3 Billing / Finance

- billing accounts
- invoices
- invoice lines
- credit notes
- recurring templates
- payments
- refunds
- top-ups
- promotions
- charge overrides
- collection
- disputes
- due recovery
- tax
- expenses
- agents / commissions
- reseller settlement
- reports

## 12.4 AAA / Access

- NAS clients
- AAA users
- AAA groups
- RADIUS attributes
- proxy realms/servers
- enterprise authentication profiles
- RADIUS settings
- authentication history
- accounting records
- CoA events
- disconnect operations

## 12.5 Session / Access Runtime

- active sessions
- session history
- session events
- data usage
- IP assignments
- session diagnostics
- duplicate-login state

## 12.6 Network / Gateway

- devices
- interfaces
- VLANs
- subnets
- IPAM
- routes
- WAN links
- failover
- DHCP
- DHCPv6
- DNS
- PPPoE
- captive portal
- hotspot
- NAT / CGNAT configuration
- firewall / ACL policy
- QoS / bandwidth policy
- DPI/application policy
- DDoS / security policy
- VPN
- gateway status

## 12.7 Traffic Traceability / Observability

- NAT / CGNAT logs
- Web Browsing / HTTP Logs
- syslog records
- diagnostic captures
- traffic analytics queries

Web-browsing log APIs MUST distinguish visible HTTP request metadata from encrypted HTTPS traffic that does not expose URL paths/payloads without an approved inspection architecture.

## 12.8 Operations

- complaints
- tickets
- technicians
- installations
- inventory
- equipment
- warehouses
- repairs
- returns
- incidents
- maintenance windows
- knowledge base
- announcements
- notifications

## 12.9 Monitoring / Reporting

- health
- alerts
- latency
- uptime
- bandwidth
- traffic analytics
- system metrics
- syslog
- diagnostic jobs
- exports
- report definitions
- report runs

## 12.10 AI / Intelligence

- advisor insights
- diagnosis findings
- churn scores
- retention recommendations
- plan recommendations
- revenue forecasts
- competitor intelligence
- collection recommendations

AI endpoints are advisory unless an explicitly authorized action command exists.

---

# 13. SUBSCRIBER LIFECYCLE API

A subscriber workflow is not a single POST.

Canonical lifecycle:

```text
Create customer
  ↓
Create subscriber
  ↓
Create service/subscription
  ↓
Attach plan
  ↓
Resolve access profile
  ↓
Allocate/prepare network resources
  ↓
Provision AAA identity
  ↓
Activate service
  ↓
Observe authentication/session
  ↓
Bill/account
  ↓
Suspend/modify/terminate
```

The API MUST return resource state accurately. It must not report `ACTIVE` while required provisioning failed.

---

# 14. PLAN → POLICY API

Plans are business objects. Gateway policies are enforcement objects.

The API flow is:

```text
Plan
 → Service Policy
 → Network Policy
 → Compiled Policy Version
 → Gateway Apply
```

A plan update MUST create or identify a versioned effective policy. Existing sessions follow the configured policy change semantics:

- immediate CoA/apply;
- next login;
- scheduled effective time;
- manual rollout.

This rule must be explicit per policy type.

---

# 15. SESSION COMMAND CONTRACT

Example:

```http
POST /api/v1/sessions/sess_123:disconnect
Idempotency-Key: 0c0...
```

```json
{
  "reason": "ADMIN_REQUEST",
  "revoke_service": false
}
```

Response:

```json
{
  "data": {
    "operation_id": "op_123",
    "session_id": "sess_123",
    "status": "ACCEPTED"
  }
}
```

The Session Engine emits lifecycle events and the UI observes the resulting state.

A successful API request to initiate disconnect is not the same as a completed disconnect.

---

# 16. SESSION STATE QUERY CONTRACT

Active-session responses SHOULD expose stable business fields and normalized runtime status:

```json
{
  "id": "sess_...",
  "subscriber_id": "sub_...",
  "username": "user@example",
  "access_type": "PPPOE",
  "nas_id": "nas_...",
  "ip": "203.0.113.10",
  "mac": "00:11:22:33:44:55",
  "policy_id": "policy_...",
  "policy_version": 17,
  "state": "ACTIVE",
  "started_at": "...",
  "last_accounting_at": "...",
  "bytes_up": 123,
  "bytes_down": 456
}
```

Raw VPP object identifiers remain internal unless they are useful operational identifiers explicitly exposed by the gateway API.

---

# 17. ACCOUNTING API

Accounting ingestion must tolerate:

- duplicates;
- delayed records;
- out-of-order records;
- interim updates;
- NAS restarts;
- session reconnects;
- missing stop events;
- counter resets;
- clock skew.

Never treat a single NAS packet as the complete accounting truth without reconciliation rules.

Canonical objects:

- accounting event;
- session counter sample;
- normalized session usage;
- final session record.

Accounting ingestion SHOULD be append-oriented, with deterministic aggregation and dedupe keys.

---

# 18. IDEMPOTENCY

Operations requiring idempotency include:

- subscriber provisioning;
- service activation;
- plan migration;
- invoice generation;
- payment creation;
- refunds;
- gateway session create;
- gateway session delete;
- policy apply;
- IP assignment;
- notification sending where duplicate delivery is harmful;
- integration webhooks;
- backup jobs;
- batch jobs.

Idempotency records MUST have an explicit retention policy.

The implementation MUST distinguish:

```text
same key + same request → same result
same key + different request → conflict
```

---

# 19. CONCURRENCY / VERSIONING

Mutable business resources SHOULD support optimistic concurrency where concurrent edits are possible.

Use either:

- numeric version;
- entity revision;
- ETag/If-Match;
- deterministic update timestamp with server-side compare.

The API must not silently overwrite a newer policy or billing document because two operators edited the same screen.

---

# 20. LONG-RUNNING OPERATIONS

Use an operation resource for:

- mass provisioning;
- bulk invoice generation;
- report generation;
- exports;
- data imports;
- device discovery;
- diagnostics;
- backup/restore;
- large reconciliation;
- gateway rebuild/reconcile.

Pattern:

```text
POST /resource:command
        ↓
202 Accepted
        ↓
operation_id
        ↓
GET /operations/{id}
```

Optional websocket/SSE streaming may provide progress but MUST NOT be the only way to observe job state.

---

# 21. EVENT CONTRACT

Events use a common envelope:

```json
{
  "event_id": "evt_...",
  "event_type": "session.activated",
  "event_version": 1,
  "occurred_at": "2026-09-28T10:00:00Z",
  "producer": "session-engine",
  "tenant_id": "tenant_...",
  "correlation_id": "req_...",
  "causation_id": "evt_...",
  "entity_type": "session",
  "entity_id": "sess_...",
  "payload": {}
}
```

Every event MUST be traceable to a causal request or system action where one exists.

---

# 22. CORE EVENT CATALOGUE

## Subscriber events

- `subscriber.created`
- `subscriber.updated`
- `subscriber.suspended`
- `subscriber.reactivated`
- `subscriber.terminated`

## Service events

- `service.provisioning_started`
- `service.provisioned`
- `service.provisioning_failed`
- `service.activated`
- `service.suspended`
- `service.terminated`

## Session events

- `session.requested`
- `session.authenticated`
- `session.provisioning_started`
- `session.activated`
- `session.policy_changed`
- `session.coa_requested`
- `session.disconnected`
- `session.expired`
- `session.recovered`
- `session.reconciliation_failed`

## Accounting events

- `accounting.start_received`
- `accounting.interim_received`
- `accounting.stop_received`
- `accounting.reconciled`

## Billing events

- `invoice.generated`
- `invoice.overdue`
- `payment.received`
- `payment.refunded`
- `subscriber.billing_status_changed`

## Network events

- `device.online`
- `device.offline`
- `gateway.degraded`
- `gateway.recovered`
- `policy.compilation_failed`
- `policy.apply_failed`
- `ip.allocated`
- `ip.released`

---

# 23. OUTBOX / DELIVERY RULE

Any durable business transaction that also needs event publication MUST use an atomic outbox pattern or an equivalent transactionally reliable mechanism.

Do not do:

```text
DB commit
→ hope event send succeeds
```

Preferred:

```text
DB transaction
  ├─ business state
  └─ outbox event
       ↓
commit
       ↓
outbox dispatcher
       ↓
event transport
       ↓
consumer
```

Consumers MUST be idempotent.

The actual broker technology is an implementation choice recorded in an ADR; domain contracts do not depend on a specific broker.

---

# 24. GATEWAY CONTROL CONTRACT

The policy/control layer MUST express intent, not CLI syntax.

Example logical request:

```json
{
  "session_id": "sess_123",
  "policy_version": 42,
  "access": {
    "ipv4": "203.0.113.10",
    "vrf": "internet",
    "vlan": 120
  },
  "qos": {
    "profile": "plan-100m"
  },
  "acl": {
    "profile": "subscriber-default"
  },
  "nat": {
    "profile": "cgnat-default"
  }
}
```

The VPP Adapter translates this to VPP object operations.

The API/UI MUST NOT contain VPP-specific command-building logic.

---

# 25. VPP OPERATION RESULT

Every gateway mutation returns a structured result internally:

```text
command_id
session_id / object_id
requested_version
applied_version
status
retries
error_code
error_message
vpp_context
applied_at
```

A control-plane success is not accepted until the requested VPP object state has reached the required acknowledgement state.

---

# 26. RECONCILIATION CONTRACT

The Session Engine maintains the desired state; the VPP Adapter observes and reconciles actual state.

State comparison:

```text
Desired Session State
       vs
Actual Dataplane State
```

Outcomes:

- `IN_SYNC`
- `MISSING_ACTUAL`
- `STALE_ACTUAL`
- `MISMATCHED_POLICY`
- `UNKNOWN_ACTUAL`
- `RECONCILE_REQUIRED`

Reconciliation is idempotent.

---

# 27. DEPLOYMENT-MODE API BEHAVIOR

## AAA-only

Available:

- subscriber/account APIs
- plans
- AAA/NAS
- authentication
- accounting
- session visibility from external NAS
- CoA/disconnect
- billing/reporting

Gateway-native dataplane control is disabled or read-only where no local gateway exists.

## Gateway-only

Available:

- gateway/device configuration
- local access authentication
- sessions
- policies
- IPAM
- DHCP/DNS/PPPoE/captive access where enabled
- NAT/QoS/ACL/DPI
- monitoring

RADIUS proxy/AAA integrations are optional.

## Multi-mode

The full contract is available. External NAS AAA and local gateway control coexist under the same Session Engine domain.

---

# 28. AUTHORIZATION ENFORCEMENT

Every API operation maps to a permission such as:

```text
subscriber.read
subscriber.write
billing.invoice.generate
billing.payment.refund
session.read
session.disconnect
policy.read
policy.write
network.device.manage
audit.read
admin.role.manage
```

Permissions are evaluated server-side.

UI visibility is not authorization.

Sensitive commands require explicit permissions and produce audit events.

---

# 29. RATE LIMITING / RESOURCE PROTECTION

Apply bounded controls by class:

| Interface | Control |
|---|---|
| Login | IP/user/device throttling |
| Public APIs | tenant/user/IP rate limits |
| Search | minimum query constraints |
| Export | concurrency/job limits |
| Diagnostics | concurrency + cooldown |
| Device polling | scheduler bounds |
| Gateway commands | bounded queue + dedupe |
| Batch provisioning | job concurrency |
| AI | token/cost/request budgets |
| Webhooks | per-provider retry limits |

Do not let a UI refresh create an unbounded downstream polling storm.

---

# 30. WEBHOOK CONTRACT

Outbound webhooks MUST support:

- signed payloads;
- event type;
- event ID;
- timestamp;
- retry count;
- delivery status;
- exponential backoff;
- dead-letter state;
- replay where authorized;
- secret rotation.

Inbound webhooks MUST validate authenticity before processing.

---

# 31. FILE / EXPORT API

Exports are jobs, not arbitrary file streaming from primary tables for large datasets.

```text
POST /api/v1/exports
GET  /api/v1/exports/{id}
GET  /api/v1/exports/{id}/download
```

Export generation must apply the caller's authorization scope to the source query.

Never create an export that bypasses RBAC.

---

# 32. REPORTING API

Report definitions are separated from report executions.

```text
GET  /api/v1/reports
POST /api/v1/report-runs
GET  /api/v1/report-runs/{id}
```

Large reports use read models, aggregates, or controlled analytical queries rather than blocking runtime transactional paths.

---

# 33. COMPATIBILITY WITH LEGACY ROUTES

The old API surface in the feature sheet is a capability reference.

Migration options:

1. direct adapter preserving existing path temporarily;
2. API gateway compatibility rewrite;
3. UI migration to new canonical API;
4. deprecation window with telemetry;
5. removal only after dependent clients are migrated.

Do not silently remove a legacy capability if external consumers may depend on it.

---

# 34. SCHEMA / CONTRACT GOVERNANCE

All externally consumed contracts MUST be represented in a machine-readable schema, preferably OpenAPI for REST and protobuf for RPC where used.

CI MUST validate:

- schema syntax;
- request/response compatibility;
- enum changes;
- required field changes;
- authentication metadata;
- error contract;
- generated client drift.

Breaking changes require a new API version or an approved migration strategy.

---

# 35. API TESTING CONTRACT

Every critical mutation must have:

- happy path;
- invalid input;
- unauthorized;
- forbidden;
- duplicate request;
- concurrent request;
- dependency failure;
- timeout;
- retry;
- recovery/reconciliation where relevant;
- audit verification.

Gateway command APIs additionally test:

- VPP unavailable;
- VPP reconnect;
- stale session epoch;
- duplicate command;
- partial object creation;
- reconciliation.

---

# 36. NON-NEGOTIABLE RULES

1. API code must not become packet forwarding code.
2. UI code must not contain gateway enforcement logic.
3. Database writes do not imply dataplane success.
4. Access-Accept does not imply session `ACTIVE`.
5. Events are contracts, not ad-hoc strings.
6. Consumers must be idempotent.
7. Large work must be bounded and observable.
8. Permissions are enforced server-side.
9. Financial commands must be auditable and retry-safe.
10. No endpoint may create unbounded load on PostgreSQL, VPP, or external providers.

---

# 37. IMPLEMENTATION EXIT CRITERIA

The API layer is architecturally complete only when:

- all feature domains in `04_PRODUCT_FEATURE_CATALOGUE.md` have an owner;
- every production UI action has a defined command/query;
- every critical command has idempotency semantics;
- event schemas exist for major lifecycle transitions;
- authorization is mapped to permissions;
- audit requirements are mapped;
- large work uses operations/jobs;
- gateway control is fully separated from UI/API code;
- API contract tests run in CI;
- error and correlation contracts are consistent;
- deployment-mode capability differences are explicit.

---

# 38. FINAL API PRINCIPLE

```text
UI
 ↓
Stable API Contract
 ↓
Domain Service / Command Handler
 ↓
Transactional State Change
 ↓
Outbox/Event / Runtime Command
 ↓
Session / Policy / Integration Workers
 ↓
VPP / External Systems
```

The interface layer coordinates the product. It does not become the product's hidden runtime.
