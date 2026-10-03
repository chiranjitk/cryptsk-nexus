# CRYPTSK — Legacy Dataplane Migration Agent Execution Specification

**Audience:** AI coding agent implementing the new CRYPTSK DPDK + VPP platform

## 1. Read this before coding

You are migrating functionality from the legacy `defaultchains_cryptsk.sh` implementation into the target CRYPTSK architecture.

Do **not** interpret this task as “convert nftables commands into VPP commands.”

The correct task is:

> Extract every functional requirement from the legacy dataplane, preserve the behavior, and implement it using the target architecture's ownership model.

## 2. Required reading order

Before changing code, read:

1. Main architecture pack `README.md`
2. `00_MASTER_PRODUCT_ARCHITECTURE.md`
3. `03_ARCHITECTURE_DECISION_REGISTER.md`
4. `04_PRODUCT_FEATURE_CATALOGUE.md`
5. `11_FINAL_MENU_NAVIGATION_SPECIFICATION.md`
6. `01_OSS_BSS_ARCHITECTURE.md`
7. `02_ENTERPRISE_GATEWAY_ARCHITECTURE.md`
8. `05_API_INTERFACE_CONTRACT.md`
9. `06_DATABASE_DATA_MODEL_SPECIFICATION.md`
10. `07_UI_UX_IMPLEMENTATION_SPECIFICATION.md`
11. `08_SECURITY_RBAC_SPECIFICATION.md`
12. `09_OBSERVABILITY_OPERATIONS_SPECIFICATION.md`
13. `10_AI_AGENT_MASTER_BUILD_SPECIFICATION.md`
14. `13_LEGACY_DATAPLANE_TO_VPP_MIGRATION_MATRIX.md`
15. `14_VPP_DATAPLANE_TARGET_SPECIFICATION.md`

Then inspect the complete legacy `defaultchains_cryptsk.sh` source.

Never implement from memory.

## 3. Source-of-truth hierarchy

When deciding what to implement:

1. Product architecture
2. Architecture decision register
3. Feature catalogue
4. Final menu/navigation specification
5. VPP target specification in this pack
6. Legacy script functional behavior
7. Existing implementation details

The legacy implementation is authoritative for **what the system currently does**, not for **how the new system must implement it**.

## 4. First implementation task: inventory

Before writing runtime code, produce an internal implementation checklist containing every functional section of the legacy script.

At minimum include:

- interface role handling
- service/port exposure
- subscriber sets/maps
- subscriber marking/classification
- accounting
- firewall
- NAT
- multi-WAN/gateway routing
- captive portal
- e2guardian
- SNI/HTTP/DNS visibility
- IPv6
- security whitelist
- invalid-state handling
- scanner detection
- SYN/SYN-ACK/RST/UDP/fragment floods
- ICMP rate limiting
- port scanning
- SSH brute force
- L7 classification
- L7 QoS
- flowtable decision
- early WAN ingress protection

Do not mark a capability “done” because a class or API exists. Demonstrate runtime behavior.

## 5. Implementation order

### Phase A — VPP foundation

Implement and test:

- DPDK/VPP NIC ownership
- VPP interfaces
- worker/core model
- routing
- interface roles
- basic counters
- VPP adapter connectivity
- reconnect/retry

### Phase B — subscriber/session runtime

Implement:

- Session Engine
- subscriber/session binding
- IP/prefix binding
- session epoch/generation
- VPP runtime object ownership
- idempotent create/update/delete
- disconnect cleanup

### Phase C — policy and QoS

Implement:

- ACL policy compilation
- subscriber authorization
- QoS profile compilation
- upload/download shaping
- application class mapping
- policy update/CoA

Do not use TC/IFB/IMQ.

### Phase D — NAT and routing

Implement:

- masquerade
- SNAT
- NAT pools
- per-WAN NAT
- gateway routing
- policy-based WAN selection
- failover behavior

### Phase E — security

Implement:

- default deny
- service exposure
- blocklists
- rate limits
- malformed/scanner protections
- DDoS ingress protections
- dynamic expiry
- security counters

### Phase F — specialized services

Integrate:

- captive portal
- DPI/nDPI
- content filtering
- HTTP browsing visibility
- TLS SNI visibility
- DNS query visibility
- NAT logs

### Phase G — observability and recovery

Implement:

- counters
- security events
- policy events
- VPP health
- worker health
- session/dataplane state
- restart recovery
- reconciliation

## 6. VPP Adapter coding rules

All normal runtime operations must be expressed through typed GoVPP/VPP Binary API operations.

The adapter should expose semantic methods at the control-plane boundary, for example:

```text
ProvisionSubscriberSession(...)
UpdateSubscriberPolicy(...)
ApplyQoSProfile(...)
ApplySecurityPolicy(...)
ProvisionNatBinding(...)
ApplyWanPolicy(...)
RemoveSession(...)
ReconcileGateway(...)
```

The exact API names are implementation details, but the abstraction must remain semantic.

Do not leak low-level VPP object details into business/domain code unless necessary.

## 7. Idempotency requirements

Every provisioning operation must be safe to retry.

Examples:

```text
Create session twice → one effective runtime session
Delete session twice → no error that corrupts state
Update policy twice → same effective state
VPP reconnect → reconciliation converges to desired state
Old async operation after new operation → cannot overwrite newer generation
```

## 8. Error handling

Never mark a session dataplane state ACTIVE merely because AAA returned Access-Accept.

Required sequence:

```text
Authentication success
 ↓
Authorization decision
 ↓
Session Engine creates desired runtime state
 ↓
Policy Engine compiles policy
 ↓
VPP Adapter provisions VPP
 ↓
VPP success confirmed
 ↓
Session becomes dataplane ACTIVE
```

On VPP failure:

- session must not be falsely reported ACTIVE
- reason must be recorded
- retry/recovery must be deterministic
- operator must be able to see the failure

## 9. Security implementation rules

### Never do this

```text
failed TCP connections > N → SSH brute force
```

### Do this

```text
authentication failures
 → Security Engine
 → threshold/correlation
 → VPP blocklist
```

### Never do this

```text
DPI application = Netflix → generate 100 firewall rules
```

### Do this

```text
DPI → application class
Policy Engine → QoS/security decision
VPP → enforcement
```

## 10. Dynamic blocklist semantics

The legacy implementation distinguishes:

- tracker state
- actual blocked state

Preserve this distinction.

The UI must not show every IP observed by a rate limiter as an attacker.

A blocked event must contain at least:

```text
source
attack/detection type
policy/rule
first_seen
blocked_at
expires_at
current_state
packet/drop counters
reason
```

## 11. Accounting implementation rules

Do not perform:

```text
packet → database write
```

Use:

```text
VPP counters
 → periodic aggregation
 → session/accounting engine
 → durable usage record
```

Counters must survive worker distribution correctly and must not double-count traffic.

## 12. QoS implementation rules

The legacy source proves that a fast-path optimization can break subscriber bandwidth enforcement.

Therefore:

- subscriber QoS is higher priority than optional fast-path optimization
- any optimization must be proven not to bypass policy
- benchmark before enabling offload/fast paths
- test a subscriber at a low plan rate while the gateway carries high aggregate traffic

Acceptance example:

```text
Subscriber plan = 5 Mbps
Gateway aggregate capacity = 10+ Gbps
Subscriber must remain near configured policy rate.
```

## 13. Captive portal rules

The portal is a product/service function.

VPP only provides packet steering/enforcement.

Required states:

```text
PRE_AUTH
AUTHORIZED
SUSPENDED
BLOCKED
EXPIRED
```

The exact state model must align with the main Session Engine specification.

## 14. Content-filter rules

If e2guardian or another filtering engine is unavailable:

- do not silently pretend filtering is active
- the Session/Policy state must know whether filtering is available
- policy behavior must be explicit: fail-open or fail-closed according to product policy
- operator telemetry must show service health

The legacy source says e2guardian redirect rules are installed only when the service is active. Preserve the concept of service-aware steering.

## 15. L7 failure behavior

The source uses an Interactive/default tier for unclassified traffic.

Unless the product architecture explicitly changes this behavior, retain:

```text
DPI unavailable/unclassified
        ↓
configured safe fallback
        ↓
Interactive/default QoS class
```

Do not allow a DPI outage to accidentally remove all subscriber policy enforcement.

## 16. Testing matrix

The agent must create automated/integration tests for at least:

### Subscriber

- login
- authorization
- policy provisioning
- disconnect
- reconnect
- duplicate provisioning
- stale generation update

### QoS

- 1 subscriber / low rate
- many subscribers / mixed plans
- upload cap
- download cap
- policy change while active
- disconnect cleanup

### NAT

- masquerade
- static SNAT
- NAT pool
- per-WAN NAT
- concurrent flows
- NAT state cleanup

### Firewall

- allowed traffic
- denied traffic
- established return traffic
- service-specific exposure
- blocked IP
- blocked network

### DDoS/security

- SYN flood
- UDP flood
- ICMP flood
- port scan
- NULL scan
- Xmas scan
- fragment abuse
- SSH failed-auth sequence
- whitelist bypass behavior
- block expiry

### Portal

- unauthenticated redirect
- successful login
- post-login normal traffic
- portal service unavailable

### DPI

- known application classification
- each five QoS tiers
- unclassified fallback
- DPI service failure

### Recovery

- VPP restart
- Session Engine restart
- Policy Engine restart
- temporary VPP API disconnect
- partial provisioning failure
- reconciliation

## 17. Load testing

Minimum qualification scenarios:

### Scenario 1 — 5K sessions

Validate:

- session provisioning
- accounting
- QoS
- NAT
- security
- policy updates

### Scenario 2 — 50K sessions

This is the initial certification target.

Measure:

- CPU per VPP worker
- memory
- packet loss
- throughput
- flow count
- VPP API latency
- policy update latency
- accounting aggregation latency

### Scenario 3 — 100K sessions

This is the architecture target.

The system must demonstrate predictable behavior and graceful degradation under overload.

## 18. Failure-injection tests

The agent must test:

- VPP process restart
- DPDK port loss/recovery
- VPP API disconnect
- Session Engine restart
- Policy Engine restart
- PostgreSQL temporary outage
- Redis temporary outage if used
- DPI service outage
- content-filter outage
- portal outage

The packet path must not require PostgreSQL/Redis/HTTP availability for every packet.

## 19. Forbidden shortcuts

Do not:

- generate nftables rules from Go
- execute `nft` from the Session Engine
- execute `tc` from the Session Engine
- create IFB devices for subscriber shaping
- create IMQ devices
- use shell scripts as runtime packet policy
- use PostgreSQL as a live packet lookup table
- use Redis as the authoritative session store
- expose low-level VPP state directly to the UI
- bypass Policy Engine with ad-hoc packet rules
- implement only the “happy path” and call migration complete

## 20. Migration completion report

When implementation is complete, produce a report with:

| Legacy section | Target component | Implemented | Tested | Notes |
|---|---|:---:|:---:|---|
| Interface roles | Gateway Manager/VPP | | | |
| Subscriber state | Session Engine | | | |
| Firewall | Policy/VPP | | | |
| NAT | VPP NAT | | | |
| QoS | VPP QoS | | | |
| Accounting | Session/Telemetry | | | |
| Captive Portal | Portal/VPP | | | |
| Content Filtering | Filter/VPP steering | | | |
| Multi-WAN | Policy/VPP routing | | | |
| IPv6 | VPP IPv6 | | | |
| DDoS | Security/VPP | | | |
| Scanner detection | Security/VPP | | | |
| SSH brute force | Security/VPP | | | |
| DPI | DPI/Policy/VPP | | | |
| L7 QoS | DPI/Policy/VPP | | | |
| Early ingress | VPP/Security | | | |

Do not claim 100% migration until every row is either implemented and tested or explicitly documented as delegated to an external service with an acceptance test.

## 21. Final instruction to the coding agent

**Do not convert the legacy script into another rule script.**

Build the new CRYPTSK dataplane as a proper VPP-native system:

```text
AAA decides
Session Engine remembers
Policy Engine translates
VPP Adapter provisions
VPP enforces
PostgreSQL persists
Monitoring observes
Management controls
```

Preserve the legacy product behavior, remove legacy packet-path mechanisms, and prove the result with functional, recovery, security, and scale tests.
