# CRYPTSK — VPP Dataplane Target Specification

**Status:** Target implementation specification

## 1. Objective

Replace the legacy Linux packet-processing stack with a DPDK + VPP dataplane while preserving the functional behavior of the existing gateway.

Target packet path:

```text
NIC
 ↓
DPDK
 ↓
VPP interface / workers
 ↓
Ingress security + classification
 ↓
Subscriber/session lookup
 ↓
Policy enforcement
 ↓
Routing / NAT / QoS / ACL
 ↓
Egress
```

Control path:

```text
AAA
 ↓
Session Engine
 ↓
Policy Engine
 ↓
VPP Adapter / GoVPP
 ↓
VPP Binary API
 ↓
VPP runtime state
```

## 2. VPP owns the packet path

The VPP dataplane must be responsible for functions that can be performed deterministically at line rate:

- interface handling
- L2/L3 forwarding
- IPv4/IPv6 routing
- ACL/firewall enforcement
- NAT/SNAT/masquerade
- subscriber traffic classification
- QoS/policing/scheduling
- WAN/next-hop selection
- packet counters
- ingress rate limiting
- selected DDoS packet filters
- policy-based steering
- service/portal traffic steering where VPP primitives support it

## 3. Control plane owns semantics

The control plane must define:

- subscriber
- service
- session
- package
- policy
- QoS profile
- security profile
- NAT profile
- routing profile
- application policy
- quota
- access state
- gateway assignment

The control plane must not forward packets.

## 4. Session Engine

The Session Engine is the universal runtime session authority across:

- AAA-only
- Gateway-only
- Multi-mode

For every active session it should be able to maintain at least:

```text
session_id
subscriber_id
service_id
access_type
NAS/gateway identity
source IP/prefix
IPv6 identity where applicable
MAC/device identity where applicable
authentication state
authorization state
policy binding
QoS binding
NAT binding
routing/WAN binding
quota state
accounting counters
session epoch/generation
session timestamps
```

The exact schema remains governed by the main database specification.

## 5. VPP Adapter

All normal runtime VPP provisioning must pass through a dedicated VPP Adapter using GoVPP/VPP Binary API.

Responsibilities:

- connect/reconnect to VPP
- translate policy objects into VPP operations
- create/update/delete runtime state
- batch operations where possible
- enforce idempotency
- track VPP object handles/identifiers
- detect stale state
- reconcile after restart
- rebuild state from Session/Policy authority
- report success/failure to Session Engine

Do not implement normal runtime configuration by executing shell commands against `vppctl`.

## 6. Subscriber enforcement model

Do not create:

```text
100 users = 100 nft rules
100 users = 100 Linux qdiscs
100 users = 100 shell processes
100 users = 100 database connections
```

Target model:

```text
100 users
   ↓
100 session bindings
   ↓
shared VPP dataplane primitives
   ↓
policy/classification state keyed by subscriber/session
```

The implementation should prefer scalable tables/maps/classifications and shared graph nodes over rule explosion.

## 7. QoS architecture

The legacy implementation used:

`fwmark → TC classifier → IFB → HTB/PRIO`

The target uses:

`Subscriber/Service Policy → VPP classification → VPP policer/scheduler/queue`

Requirements:

- per-subscriber bandwidth limits
- upload/download directionality
- committed/maximum rates where product semantics require them
- burst behavior
- application-aware class priority where L7 is enabled
- plan migration without stale old QoS state
- immediate enforcement update for CoA/session policy change
- safe removal on session disconnect

QoS is a core revenue function. Never trade correctness for a fast-path optimization.

## 8. NAT architecture

The target must support the functional behaviors present in the legacy script:

- subscriber masquerade
- static SNAT
- pool-based translation
- per-WAN NAT selection
- deterministic policy association
- NAT counters
- NAT logging/telemetry where licensed and configured

Conceptual model:

```text
Subscriber Session
      ↓
NAT Policy
      ↓
IPAM / NAT Pool
      ↓
VPP NAT state
      ↓
WAN interface / next hop
```

NAT state must not depend on PostgreSQL queries for each packet.

## 9. Firewall and ACL architecture

Legacy firewall intent must be represented as policy objects.

Policy categories should include:

- source identity/network
- destination identity/network
- protocol
- source/destination port
- interface/zone
- direction
- session/authentication state
- application class where supported
- action: allow/deny/rate-limit/steer
- logging/telemetry behavior

The Policy Engine compiles the semantic policy to VPP ACL/filter state.

## 10. Security architecture

### 10.1 Fast packet-path protections

VPP should perform cheap, deterministic protections such as:

- malformed packet rejection where supported
- invalid header combinations
- NULL/Xmas scan signatures
- selected fragment protections
- SYN/UDP ingress rate limiting
- ICMP rate limiting
- port/service ACLs
- dynamic IP blocklists

### 10.2 Security Engine

Security Engine is responsible for:

- event correlation
- attack detection
- authentication-event analysis
- brute-force detection
- scanner correlation
- reputation/intelligence
- dynamic block decisions
- block expiry policy
- security incident records
- operator-facing explanations

### 10.3 SSH brute force

Do not implement SSH brute-force detection by simply counting TCP connections.

Required model:

```text
sshd/authentication events
        ↓
Security Engine
        ↓
failed-auth threshold
        ↓
security decision
        ↓
VPP dynamic block
```

A successful login must not be treated as a failed authentication event.

## 11. DDoS architecture

Use two stages.

### Stage A — ingress mitigation

As early as possible, perform cheap stateless filtering/rate limiting at the VPP interface/worker boundary.

Legacy thresholds that must be preserved as initial reference values:

- SYN: 5000 packets/sec/source, burst 2000
- UDP: 2000 packets/sec/source, burst 1000

These are **source-derived baseline values**, not immutable production constants. The implementation must make them configurable and validate them under load testing.

### Stage B — security analysis

Later packet/state inspection can detect:

- SYN floods
- SYN-ACK floods
- RST floods
- UDP floods
- DNS amplification
- ICMP floods
- fragment floods
- port scans
- malformed/scanner signatures

Security Engine can then install or remove VPP enforcement state.

## 12. Captive portal

The legacy behavior distinguishes pre-login and authenticated users and redirects pre-authenticated web traffic to the portal.

Target:

```text
packet
 ↓
Session lookup
 ↓
Unauthenticated?
 ├─ yes → VPP portal steering → Portal Service
 └─ no  → normal policy path
```

The exact VPP redirect/steering primitive must be selected after validating the deployed VPP version and plugin set. Do not fake a VPP capability if the required primitive is unavailable.

## 13. Content filtering

The legacy e2guardian path is a service integration, not a VPP content-filter implementation.

Target:

```text
Subscriber
 ↓
Policy says content filtering enabled
 ↓
VPP steering
 ↓
Content Filter / Proxy / DPI service
 ↓
approved traffic path
```

VPP is responsible for steering/enforcement. The filtering engine remains responsible for content inspection.

## 14. DPI and L7 application intelligence

The legacy implementation has five L7 tiers:

| Tier | Meaning | Examples from source |
|---:|---|---|
| 0 | Real-Time | Zoom, Teams, SIP |
| 1 | Interactive | HTTPS, DNS, SSH |
| 2 | Streaming | Netflix, YouTube, Spotify |
| 3 | Bulk | Windows Update, Dropbox |
| 4 | Penalty | BitTorrent, P2P |

Target:

```text
Traffic
 ↓
DPI / nDPI classification
 ↓
Application class
 ↓
Policy Engine
 ↓
VPP QoS class
```

Do not encode application semantics directly into hundreds of VPP ACL rules.

### Failure behavior

The legacy implementation intentionally fails open to the Interactive tier when classification is unavailable.

The target must preserve a safe configurable fallback. Default fallback should remain equivalent to the source unless product/security review explicitly changes it.

## 15. Accounting and telemetry

VPP counters should provide packet/byte measurements.

Session Engine periodically aggregates:

- upload bytes
- download bytes
- packets
- session duration
- policy usage
- quota consumption

PostgreSQL receives durable aggregates/events, not every packet.

Traffic intelligence can separately collect:

- flow metadata
- DNS query metadata
- HTTP browsing metadata
- TLS SNI metadata
- NAT translation logs

The product terminology should remain:

- **HTTP/Web Browsing Logs** for HTTP browsing visibility
- **NAT Logs** for NAT translation records

## 16. Multiple WAN/gateway support

The legacy implementation uses marks/maps to select gateways.

Target:

```text
Policy / WAN selection decision
        ↓
VPP routing table / FIB / VRF / next-hop state
        ↓
selected WAN
```

The management plane may expose:

- gateways
- WAN interfaces
- health state
- routing policy
- failover policy
- load-balancing policy
- subscriber/service association

Do not introduce a duplicate “Multiple Gateway” product module when Gateway Management/Multi-WAN already covers it.

## 17. IPv6

IPv6 is a first-class dataplane capability where enabled.

Required areas:

- IPv6 routing
- ICMPv6 handling
- IPv6 ACL/security
- IPv6 subscriber/session identity
- IPv6 accounting
- IPv6 policy
- IPv6 NAT behavior only where the selected design explicitly requires it

Do not copy IPv4 assumptions blindly into IPv6.

## 18. Runtime state and recovery

VPP runtime state is ephemeral.

Authoritative sources:

- Session Engine for live session truth
- Policy Engine for desired policy
- Gateway Manager for desired gateway/interface state
- PostgreSQL for durable configuration and historical state

After VPP restart:

```text
VPP reconnect
 ↓
read desired state
 ↓
rebuild/reconcile VPP objects
 ↓
verify object creation
 ↓
mark sessions/dataplane state ACTIVE only after successful provisioning
```

Use generation/epoch values so stale asynchronous operations cannot overwrite newer session state.

## 19. Performance rules

Target scale from the main architecture remains the reference:

- 50K concurrent sessions: initial certification target
- 100K concurrent sessions: product architecture target
- 50 Gbps-class throughput: hardware-qualified target

The implementation must benchmark:

- packets/sec
- Gbps
- new sessions/sec
- authentication/sec
- accounting/sec
- CoA/sec
- disconnect/sec
- policy updates/sec
- VPP operations/sec
- NAT flows
- concurrent flows
- CPU utilization per worker
- memory
- packet loss
- failover/recovery time

## 20. Explicitly forbidden target mechanisms

The new gateway must not depend on:

- iptables
- nftables
- tc
- IFB
- IMQ
- per-user shell-generated packet rules
- packet-path PostgreSQL
- packet-path Redis lookups
- packet-path REST/HTTP calls
- Next.js packet processing
- Java packet processing
- `vppctl` as normal runtime provisioning API

Linux host firewalling may exist separately for protecting the management OS. That is not subscriber dataplane enforcement.

## 21. Completion definition

The VPP migration is complete only when:

- every capability in the migration matrix has an owner
- every VPP capability has a validated API implementation
- unsupported capabilities are explicitly delegated to the correct service
- subscriber QoS is enforced without TC/IFB/IMQ
- NAT works without nftables
- firewall works without nftables
- DDoS baseline protections work without nftables
- session disconnect removes runtime state
- CoA/policy change updates runtime state idempotently
- VPP restart reconstructs desired state
- accounting remains accurate across worker distribution
- management UI can explain active policy/security state
- load tests demonstrate target behavior
