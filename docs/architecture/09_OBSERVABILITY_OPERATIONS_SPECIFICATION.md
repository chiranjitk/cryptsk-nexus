# CRYPTSK NEXUS — OBSERVABILITY & OPERATIONS SPECIFICATION
## Metrics, logs, traces, health, alerting, SLOs, capacity, incident response, backup, and production operations

**Status:** LOCKED OBSERVABILITY / OPERATIONS BASELINE
**Authority:** Subordinate to the Master Architecture and Gateway Architecture.

---

# 1. PURPOSE

Cryptsk must be operable as a production network platform, not merely observable as an application.

Observability must answer:

- Is the management plane healthy?
- Is AAA accepting authentication requests?
- Are accounting updates arriving and being processed?
- How many sessions are active?
- Is the Session Engine authoritative and in sync?
- Is VPP enforcing the expected policy?
- Is dataplane throughput healthy?
- Are packets dropping or errors increasing?
- Is PostgreSQL healthy?
- Are integrations failing?
- Are customers affected?
- What changed immediately before the incident?

---

# 2. OBSERVABILITY SIGNALS

Four primary signals:

1. Metrics
2. Logs
3. Traces
4. Domain events / audit

They are related but not interchangeable.

- Metrics answer **how much / how often**.
- Logs explain **what happened**.
- Traces explain **where time was spent**.
- Audit records explain **who changed business state**.

---

# 3. TECHNOLOGY DIRECTION

Use Prometheus-compatible metrics and OpenTelemetry-compatible traces/log correlation.

Grafana remains a supported visualization integration.

Do not hard-couple business logic to one observability vendor.

---

# 4. METRIC NAMING

Use stable lower-case metric names with units.

Examples:

```text
cryptsk_api_requests_total
cryptsk_api_request_duration_seconds
cryptsk_radius_auth_requests_total
cryptsk_radius_auth_failures_total
cryptsk_sessions_active
cryptsk_sessions_activated_total
cryptsk_session_reconciliation_failures_total
cryptsk_vpp_commands_total
cryptsk_vpp_command_duration_seconds
cryptsk_vpp_policy_apply_failures_total
cryptsk_postgres_query_duration_seconds
cryptsk_outbox_backlog
```

Do not include high-cardinality identifiers such as subscriber ID or session ID as metric labels.

---

# 5. LABEL CARDINALITY RULE

Never label metrics with unbounded values such as:

- session_id;
- username;
- IP address;
- MAC address;
- invoice number;
- correlation ID.

Those belong in logs/traces/events.

Use bounded labels:

- service;
- operation;
- result;
- tenant class where bounded;
- protocol;
- deployment mode;
- severity;
- device type.

---

# 6. MANAGEMENT API METRICS

Minimum:

- request rate;
- error rate;
- p50/p95/p99 latency;
- active requests;
- rate-limited requests;
- authentication failures;
- authorization failures;
- dependency latency;
- database wait time;
- worker queue depth.

Break down by logical route group, not every dynamic URL instance.

---

# 7. AAA METRICS

Track:

- Access-Requests/sec;
- Access-Accepts/sec;
- Access-Rejects/sec;
- authentication latency;
- authentication errors;
- accounting starts/sec;
- interim accounting/sec;
- accounting stops/sec;
- CoA requests/sec;
- Disconnect requests/sec;
- RADIUS duplicate/replay conditions;
- NAS availability;
- pending auth queue;
- SQL/auth backend latency.

Dashboard should expose both absolute rates and error ratios.

---

# 8. SESSION ENGINE METRICS

Track:

- active sessions;
- session create rate;
- activation rate;
- disconnect rate;
- timeout rate;
- stale sessions;
- recovery count;
- reconciliation backlog;
- reconciliation failures;
- session command latency;
- epoch conflict/stale-event count;
- ownership conflicts;
- snapshot/recovery duration.

---

# 9. VPP / DPDK METRICS

Track at minimum:

- interface RX/TX packets;
- RX/TX bytes;
- packet drops;
- errors;
- queue utilization;
- worker/core utilization;
- buffer pressure;
- active interfaces;
- NAT translations where exposed;
- Web Browsing / HTTP log ingestion/query health where enabled;
- ACL/policy hit counters where available;
- VPP API latency;
- VPP API errors;
- control-plane object counts.

DPDK-specific metrics should expose queue and poll-loop health without creating a metric per subscriber.

---

# 10. NETWORK METRICS

Capture:

- link state;
- throughput;
- utilization;
- latency;
- packet loss where measured;
- jitter where appropriate;
- DHCP success/failure;
- DNS response/error rate;
- PPPoE session rate;
- IP pool utilization;
- WAN/failover state.

---

# 11. DATABASE METRICS

Track:

- active connections;
- pool utilization;
- query latency;
- lock waits;
- slow queries;
- transaction rate;
- rollback rate;
- cache hit indicators;
- replication lag where applicable;
- disk usage;
- WAL growth/archival health;
- vacuum/bloat indicators where relevant.

---

# 12. WORKER / JOB METRICS

Every worker should expose:

- jobs started;
- jobs completed;
- jobs failed;
- retry count;
- queue depth;
- age of oldest item;
- throughput;
- execution duration;
- dead-letter count.

Unbounded queue growth is an alert condition.

---

# 13. OUTBOX OBSERVABILITY

Track:

- pending events;
- oldest event age;
- processing rate;
- failures;
- retry count;
- dead-letter count.

A growing outbox indicates downstream degradation even if the main database is healthy.

---

# 14. STRUCTURED LOGGING

Logs must be structured JSON or an equivalent machine-readable format.

Common fields:

```text
timestamp
level
service
instance
message
request_id
correlation_id
trace_id
span_id
operation
entity_type
entity_id
result
error_code
duration_ms
```

Sensitive data is redacted.

---

# 15. LOG SEVERITY

Recommended semantics:

- DEBUG: developer diagnostics;
- INFO: normal operational lifecycle;
- WARN: degraded but recoverable condition;
- ERROR: operation failed;
- CRITICAL: service/architecture failure requiring immediate attention.

Do not use ERROR for every expected user validation failure.

---

# 16. TRACE DESIGN

Trace critical workflows end-to-end.

Example:

```text
UI request
  ↓
API handler
  ↓
Subscriber service
  ↓
PostgreSQL transaction
  ↓
outbox
  ↓
policy compiler
  ↓
session engine
  ↓
VPP adapter
  ↓
VPP API
```

RADIUS flow:

```text
NAS
 ↓
FreeRADIUS
 ↓
AAA policy
 ↓
Session Engine
 ↓
Policy Engine
 ↓
VPP Adapter
```

Do not propagate sensitive credential material into traces.

---

# 17. AUDIT VS LOG

Do not substitute logs for audit.

Audit is durable business evidence.

Logs are operational diagnostics.

Example:

```text
Audit: Operator changed Plan A bandwidth from 50M to 100M.
Log: policy compiler took 83 ms and VPP command retried once.
```

---

# 18. HEALTH ENDPOINTS

Every long-running service should expose:

```text
/live
/ready
/health
```

Semantics:

- liveness: process is alive;
- readiness: service can serve required work;
- health: detailed dependency/status summary.

Do not report healthy merely because the process exists.

---

# 19. DEPENDENCY HEALTH

Health should cover relevant dependencies:

- PostgreSQL;
- Redis if enabled;
- FreeRADIUS;
- Session Engine;
- VPP;
- DPDK interfaces;
- event transport;
- external integrations;
- filesystem/storage.

Dependency failure should be represented as degraded where the service can remain useful.

---

# 20. SLO FRAMEWORK

The final SLO values should be deployment-class specific, but the platform should measure:

### API

- availability;
- p95/p99 latency;
- error rate.

### AAA

- authentication success latency;
- reject/error ratio;
- request acceptance availability.

### Session

- activation success;
- provisioning latency;
- disconnect completion;
- reconciliation lag.

### Gateway

- dataplane availability;
- packet error/drop thresholds;
- control-plane reconciliation health.

### Billing

- invoice generation completion;
- payment processing health;
- reconciliation lag.

Do not choose SLO numbers merely because they look impressive; calibrate them from measured workloads.

---

# 21. CAPACITY DASHBOARD

A production operations dashboard must show:

- active sessions;
- session create/auth rate;
- accounting rate;
- CoA/disconnect rate;
- CPU by critical component;
- memory;
- NIC throughput;
- PPS;
- VPP worker utilization;
- queue depth;
- DB latency/connections;
- outbox backlog;
- error rates;
- IP pool utilization;
- NAT/CGNAT utilization;
- policy object counts.

The 100K target is a design capacity objective, not proof that every deployment can sustain it regardless of hardware.

---

# 22. 50 GBPS CLASS VISIBILITY

Certification data must include more than an average bandwidth chart.

Record:

- exact NICs;
- driver/DPDK versions;
- CPU model/core layout;
- NUMA topology;
- packet size mix;
- flows;
- policies enabled;
- NAT enabled/disabled;
- DPI enabled/disabled;
- encryption/security features;
- duration;
- packet loss/drop/error measurements.

This makes throughput claims reproducible.

---

# 23. ALERTING PRINCIPLES

Alert on symptoms that require action, not every unusual metric.

Alert classes:

- availability;
- capacity;
- correctness;
- security;
- performance;
- integration;
- data pipeline.

Each alert should have:

- description;
- severity;
- affected component;
- trigger;
- suggested investigation;
- runbook reference;
- suppression rules.

---

# 24. CRITICAL ALERTS

Examples:

- VPP unavailable;
- dataplane interface down unexpectedly;
- session reconciliation backlog above threshold;
- database unavailable;
- authentication failure surge;
- accounting backlog growing;
- outbox backlog growing;
- IP pool exhaustion;
- NAT pool exhaustion;
- disk space critical;
- clock synchronization failure;
- certificate expiry approaching;
- backup failure;
- replication lag exceeding configured threshold.

---

# 25. ALERT FATIGUE CONTROL

Support:

- deduplication;
- grouping;
- suppression windows;
- maintenance windows;
- escalation;
- acknowledgement;
- silence with reason;
- auto-resolution.

Never hide repeated failures indefinitely because they are noisy.

---

# 26. DASHBOARD / GRAFANA INTEGRATION

Grafana may provide detailed technical dashboards.

The Cryptsk application dashboard remains the product-level operating view.

Do not make the user leave the product for basic subscriber/session status.

---

# 27. BACKUP OPERATIONS

Backups must cover:

- PostgreSQL;
- critical configuration;
- integration configuration;
- certificates/secret references as appropriate;
- audit history according to retention policy.

Do not blindly back up volatile runtime state that should be rebuilt from durable truth.

---

# 28. RESTORE OPERATIONS

Document and test:

```text
Backup
→ Restore to isolated environment
→ Schema/version verification
→ Data integrity verification
→ Application start
→ AAA verification
→ Session recovery verification
→ Gateway reconciliation verification
```

Restore tests must be repeatable.

---

# 29. INCIDENT RESPONSE

Incident workflow:

```text
Detect
→ Triage
→ Contain
→ Diagnose
→ Mitigate
→ Recover
→ Verify
→ Communicate
→ Root-cause analysis
→ Corrective action
```

Operational incidents must have an owner and timeline.

---

# 30. GATEWAY INCIDENT RUNBOOK AREAS

Prepare runbooks for:

- VPP crash/restart;
- Session Engine crash;
- FreeRADIUS failure;
- PostgreSQL unavailable;
- NIC/driver failure;
- DPDK queue imbalance;
- IP pool exhaustion;
- NAT exhaustion;
- policy deployment failure;
- stale session storm;
- accounting outage;
- CoA storm;
- excessive auth failures.

---

# 31. MANAGEMENT PLANE OPERATIONS

Runbooks should cover:

- API saturation;
- DB saturation;
- worker backlog;
- queue starvation;
- report overload;
- integration provider outage;
- notification backlog;
- billing job duplication risk.

---

# 32. RELEASE OBSERVABILITY

Every release should expose:

- new metrics;
- changed metrics;
- new alerts;
- changed dashboards;
- new runbooks;
- migration effects;
- resource impact.

No release is complete if operators cannot determine whether the new component is healthy.

---

# 33. CAPACITY TESTING

Required dimensions include:

### Authentication

- sustained RPS;
- burst RPS;
- mixed success/reject;
- dependency latency.

### Sessions

- 50K certification;
- 100K architecture target test plan;
- create/terminate churn;
- simultaneous CoA/disconnect.

### Accounting

- 1/5 minute style interim frequencies as test variables;
- out-of-order records;
- duplicates;
- stop loss;
- NAS restart.

### Gateway

- throughput;
- PPS;
- mixed packet sizes;
- NAT;
- ACL;
- QoS;
- DPI;
- NUMA distribution.

---

# 34. TIME / CLOCK MANAGEMENT

Accurate time is essential for:

- session duration;
- accounting;
- billing;
- certificates;
- audit;
- traces;
- incident correlation.

Production nodes must use a controlled time-synchronization strategy.

Detect significant clock drift.

---

# 35. DATA RETENTION OPERATIONS

Retention jobs must be:

- scheduled;
- bounded;
- observable;
- resumable;
- audited where appropriate.

Never run an unbounded delete over the largest history table in one transaction.

---

# 36. MONITORING MODULE HEALTH

Optional modules must publish whether they are:

- disabled intentionally;
- enabled and healthy;
- enabled and degraded;
- enabled and unavailable;
- misconfigured.

A disabled integration should not generate a permanent red alert.

---

# 37. OPERATOR EXPERIENCE

The product should surface a hierarchy:

```text
Healthy
Degraded
Action required
Critical
```

Avoid forcing the operator to interpret dozens of raw time-series graphs before seeing the business impact.

---

# 38. OBSERVABILITY ACCEPTANCE GATE

A component is production-ready when:

- metrics exist;
- logs are structured;
- traces exist for critical paths;
- health endpoints work;
- alerts are defined;
- dashboards exist;
- runbook exists;
- resource impact is known;
- failure/recovery can be detected;
- sensitive data is not leaked.

---

# 39. FINAL OPERATIONS PRINCIPLE

```text
We do not operate what we cannot see.
We do not alert on what we cannot explain.
We do not claim capacity we cannot measure.
We do not declare recovery until the system and its business state are verified.
```
