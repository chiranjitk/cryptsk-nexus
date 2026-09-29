# Enterprise Gateway --- AAA, Session Engine & Dataplane Architecture

**Document status:** LOCKED GATEWAY / AAA / SESSION BASELINE

## 1. Objective

Build a new-generation enterprise/ISP/hospitality gateway platform
capable of:

-   100,000 concurrent subscriber/device sessions as the architectural
    target
-   50 Gbps-class dataplane target, subject to certified
    hardware/NIC/packet-size testing
-   50,000 concurrent sessions as the initial certified deployment
    profile
-   RADIUS AAA
-   PPPoE / DHCP / captive portal / IP-based subscriber access
-   Authentication and authorization
-   Accounting
-   Subscriber session management
-   IP address pools
-   Bandwidth management
-   QoS
-   NAT
-   ACL/firewall
-   Application policy integration
-   CoA / Disconnect
-   Session monitoring
-   Subscriber statistics
-   Policy enforcement through VPP
-   PostgreSQL-based configuration and accounting
-   High availability
-   Graceful recovery after service restart
-   API-driven management
-   No shell-script dependency in the dataplane

------------------------------------------------------------------------

# 2. Fundamental Architecture Decision

Do NOT build the new system as:

``` text
RADIUS
   ↓
shell script
   ↓
nftables
   ↓
tc
   ↓
packet enforcement
```

Do NOT make FreeRADIUS responsible for maintaining the complete live
subscriber state.

The new architecture is:

``` text
                         MANAGEMENT PLANE
                               │
                         REST / gRPC API
                               │
                               ▼
                       ┌───────────────┐
                       │ Policy Engine │
                       └───────┬───────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              ▼                ▼                ▼
        AAA Service      Session Engine    IPAM/Pool Engine
              │                │                │
              ▼                ▼                ▼
        FreeRADIUS        Live Sessions      PostgreSQL
              │                │
              │                ▼
              │          VPP Adapter
              │                │
              └────────────────┤
                               ▼
                         VPP / DPDK
                               │
                         Physical NIC
                               │
                         Subscriber traffic
```

The responsibilities MUST remain separated.

------------------------------------------------------------------------

# 3. Component Responsibilities

## 3.1 FreeRADIUS

FreeRADIUS is responsible for:

-   RADIUS Access-Request
-   Authentication
-   Authorization
-   Access-Accept
-   Access-Reject
-   Accounting-Start
-   Accounting-Interim
-   Accounting-Stop
-   CoA
-   Disconnect
-   RADIUS client/NAS authentication
-   RADIUS attributes
-   LDAP/AD integration
-   SQL-backed subscriber authorization
-   authentication policies
-   RADIUS dictionaries
-   EAP where required
-   PAP/CHAP/MS-CHAP/EAP methods as required
-   proxying when required

FreeRADIUS MUST NOT:

-   manipulate VPP for every packet
-   execute shell scripts for every subscriber login
-   execute nftables commands
-   execute tc commands
-   maintain large subscriber policy state inside unlang
-   perform expensive SQL queries for every packet
-   become the authoritative source of live dataplane state

------------------------------------------------------------------------

# 4. Session Engine

The Session Engine is the core new component.

It owns the authoritative live subscriber/session state.

Example:

``` text
Session ID
Username
Subscriber ID
NAS ID
Access protocol
IPv4
IPv6
MAC
VLAN
Interface
VRF
Authentication time
Last accounting update
Session state
Policy ID
Bandwidth profile
QoS profile
ACL profile
NAT profile
IP pool
Accounting state
Data counters
Packet counters
Idle timeout
Session timeout
Device information
```

The Session Engine MUST be independent from FreeRADIUS.

------------------------------------------------------------------------

# 5. Why Session Engine Must Be Separate

RADIUS is a request/response AAA protocol.

A subscriber session may remain online for:

-   minutes
-   hours
-   days
-   weeks

The RADIUS Access-Accept is only the authentication decision.

Therefore:

``` text
RADIUS request
      ↓
Authentication decision
      ↓
Access-Accept
      ↓
Session Engine creates live session
      ↓
VPP enforces policy
```

The session continues even when there is no RADIUS packet.

------------------------------------------------------------------------

# 6. Session State Model

Every live session MUST have a unique internal `session_id`.

Recommended structure:

``` text
session_id
subscriber_id
username
nas_id
nas_port
access_type
mac_address
ipv4_address
ipv6_prefix
vlan_id
vrf_id
policy_id
bandwidth_profile_id
acl_profile_id
nat_profile_id
session_start
last_seen
last_accounting_update
session_timeout
idle_timeout
input_octets
output_octets
input_packets
output_packets
state
```

Session states:

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

------------------------------------------------------------------------

# 7. Session Lifecycle

## 7.1 Login

``` text
Subscriber
    ↓
NAS
    ↓
RADIUS Access-Request
    ↓
FreeRADIUS
    ↓
Authentication
    ↓
Authorization
    ↓
Access-Accept
    ↓
Session Engine
    ↓
Create session
    ↓
Allocate IP
    ↓
Resolve subscriber policy
    ↓
Generate dataplane policy
    ↓
VPP Adapter
    ↓
VPP
    ↓
Subscriber becomes ACTIVE
```

------------------------------------------------------------------------

# 8. Login Must Be Transactional

Do NOT mark the subscriber ACTIVE before dataplane programming succeeds.

Correct sequence:

``` text
1. Authenticate
2. Authorize
3. Allocate IP
4. Create session
5. Program VPP
6. Verify VPP programming
7. Mark ACTIVE
8. Start accounting
```

If VPP programming fails:

``` text
Authentication successful
        ↓
VPP programming failed
        ↓
Session NOT ACTIVE
        ↓
Return controlled failure
```

Do not create "ghost sessions".

------------------------------------------------------------------------

# 9. Logout

Logout may originate from:

-   NAS Accounting-Stop
-   RADIUS Disconnect
-   CoA
-   session timeout
-   idle timeout
-   administrative disconnect
-   duplicate login policy
-   IP conflict
-   NAS failure recovery
-   system policy
-   subscriber suspension
-   account expiry

Flow:

``` text
Logout Event
     ↓
Session Engine
     ↓
Locate session
     ↓
Mark DISCONNECTING
     ↓
Remove VPP policy/state
     ↓
Release IP
     ↓
Close accounting state
     ↓
Persist final session record
     ↓
Mark DISCONNECTED
```

Operations MUST be idempotent.

Calling logout twice must not corrupt state.

------------------------------------------------------------------------

# 10. FreeRADIUS ↔ Session Engine

Do not tightly couple FreeRADIUS configuration to application internals.

Use an adapter:

``` text
FreeRADIUS
     │
     │ RADIUS events
     ▼
AAA Adapter
     │
     ▼
Session Engine API
```

The adapter can use:

-   local UNIX socket
-   localhost gRPC
-   REST for management operations
-   message queue for asynchronous events

For high-frequency internal events, prefer:

``` text
gRPC / Unix socket / internal message bus
```

over REST.

REST should primarily be the management interface.

------------------------------------------------------------------------

# 11. FreeRADIUS Authentication Path

Recommended:

``` text
Access-Request
      ↓
Identify NAS
      ↓
Normalize attributes
      ↓
Identify subscriber
      ↓
Authentication
      ↓
Authorization lookup
      ↓
Subscriber profile
      ↓
Return RADIUS attributes
```

Avoid unnecessarily querying PostgreSQL multiple times.

One authentication request should ideally retrieve the required
authorization information efficiently.

------------------------------------------------------------------------

# 12. Subscriber Policy Model

Do not store complete policy configuration directly in `radreply`.

Instead:

``` text
Subscriber
    ↓
Subscriber Profile
    ↓
Service Plan
    ↓
Policy Set
    ├── Bandwidth
    ├── QoS
    ├── ACL
    ├── NAT
    ├── Application Policy
    ├── DNS Policy
    ├── IPv4 Pool
    ├── IPv6 Pool
    └── Session Limits
```

FreeRADIUS should return a compact policy identifier where possible.

Example:

``` text
Subscriber = user123

Service-Profile = GOLD-100M
Policy-ID = 10023
IP-Pool = HOTEL-GUEST
```

The Session Engine then resolves:

``` text
Policy-ID 10023
      ↓
Bandwidth = 100 Mbps
QoS = GOLD
ACL = GUEST-INTERNET
NAT = PUBLIC-POOL-01
DPI = STANDARD
```

------------------------------------------------------------------------

# 13. PostgreSQL Responsibilities

PostgreSQL is the durable source of configuration, identity,
accounting-history, audit, and recovery metadata.

It is NOT the authoritative real-time store for packet-path state or the
sole source of truth for live session ownership.

Live session state is authoritative in the Session Engine; PostgreSQL
provides durable configuration/history and recovery persistence.

Use PostgreSQL for:

-   subscribers
-   credentials
-   subscriber profiles
-   service plans
-   policies
-   NAS definitions
-   IP pools
-   VLANs
-   gateway configuration
-   accounting history
-   session history
-   audit logs
-   administrator data
-   configuration
-   billing information

Do NOT use PostgreSQL as the packet-path state store.

------------------------------------------------------------------------

# 14. Live Session Storage

Live sessions should primarily exist in memory inside the Session
Engine.

Example:

``` text
Session Engine
      │
      ├── HashMap / concurrent map
      ├── IP → Session index
      ├── MAC → Session index
      ├── Username → Session index
      ├── Session-ID → Session index
      └── NAS → session index
```

Optional Redis can be used for:

-   HA coordination
-   distributed locks
-   temporary state
-   event distribution
-   shared cache

But Redis should not automatically become the packet-path database.

------------------------------------------------------------------------

# 15. 100,000 Session Architectural Target

The platform MUST be architected for 100,000 concurrent sessions from
day one.

The first production/certification profile may be 50,000 sessions, but
the software architecture must not contain a 50k-specific ceiling.

100,000 concurrent sessions is not itself a difficult memory problem.
The real scalability dimensions are:

The real scalability dimensions are:

``` text
Concurrent sessions
+
Authentication requests/sec
+
Accounting packets/sec
+
CoA/sec
+
Disconnect/sec
+
New sessions/sec
+
Database writes/sec
+
VPP policy operations/sec
+
NAT flows
+
Packets/sec
+
Bandwidth
```

The architecture MUST therefore define capacity independently for each
dimension.

------------------------------------------------------------------------

# 16. Example Accounting Load

For 100,000 active sessions:

With 5-minute interim updates:

``` text
100,000 / 300
≈ 333 accounting updates/sec
```

With 1-minute interim updates:

``` text
100,000 / 60
≈ 1,667 accounting updates/sec
```

Therefore, do NOT blindly configure 60-second SQL accounting updates for
every deployment.

Make the accounting interval configurable.

Recommended defaults:

``` text
Interim update:
300 seconds

High-accuracy mode:
60–120 seconds

Low-load mode:
300–600 seconds
```

The final choice must depend on billing/audit requirements.

------------------------------------------------------------------------

# 17. Accounting Architecture

Do not force every Accounting-Interim packet directly into a large
PostgreSQL transaction if unnecessary.

Recommended:

``` text
NAS
 ↓
FreeRADIUS
 ↓
Accounting Processor
 ↓
Event Queue
 ↓
Accounting Writer
 ↓
PostgreSQL
```

For high-load installations:

``` text
RADIUS
 ↓
fast acknowledgement
 ↓
buffer/event queue
 ↓
batch DB writer
```

FreeRADIUS documentation explicitly describes buffered accounting as a
way to decouple busy RADIUS processing from slower SQL writes.

------------------------------------------------------------------------

# 18. Accounting Tables

Do not allow `radacct` to grow indefinitely as one unpartitioned table.

Use time partitioning.

Example:

``` text
radacct
 ├── 2026_09
 ├── 2026_10
 ├── 2026_11
 └── ...
```

Indexes should be designed around actual queries.

Important lookup dimensions:

``` text
session_id
acct_session_id
username
subscriber_id
nas_id
framed_ip
mac
start_time
stop_time
```

Do not create unnecessary indexes because every additional index
increases write cost.

------------------------------------------------------------------------

# 19. Authentication Cache

Authentication can use multiple levels:

``` text
L1:
Session Engine / local cache

L2:
Redis optional

L3:
PostgreSQL / LDAP / AD

L4:
External authentication backend
```

However, credentials and security-sensitive data must not be cached
indiscriminately.

Cache authorization/profile data more aggressively than passwords.

Example:

``` text
Subscriber
   ↓
Profile cache
   ↓
Service plan
   ↓
Policy ID
```

------------------------------------------------------------------------

# 20. FreeRADIUS Threading

FreeRADIUS uses a thread pool.

The configuration must be tuned based on:

-   CPU cores
-   request rate
-   authentication backend latency
-   SQL latency
-   LDAP latency
-   EAP workload
-   accounting load

Do not simply configure hundreds of threads because there are 100,000
sessions.

100,000 sessions ≠ 100,000 FreeRADIUS threads.

Thread count must be derived from request rate, backend latency,
protocol mix, CPU, and measured queueing behavior.

A session is not a FreeRADIUS worker.

------------------------------------------------------------------------

# 21. FreeRADIUS Request Processing Rule

Fast path:

``` text
RADIUS
 ↓
minimal parsing
 ↓
cache/profile lookup
 ↓
authentication
 ↓
authorization
 ↓
response
```

Avoid:

``` text
RADIUS
 ↓
10 SQL queries
 ↓
external script
 ↓
LDAP
 ↓
shell command
 ↓
another SQL query
 ↓
nftables
 ↓
tc
 ↓
response
```

The second architecture will eventually become a bottleneck.

------------------------------------------------------------------------

# 22. NAS Manager

The Session Engine should include a NAS Manager.

NAS object:

``` text
NAS ID
NAS Name
NAS IP
NAS IPv6
NAS Type
Shared Secret
Vendor
RADIUS Authentication Port
RADIUS Accounting Port
CoA Port
Disconnect Port
Status
Location
Description
```

Supported NAS categories:

``` text
PPPoE NAS
DHCP Gateway
Wi-Fi Controller
Access Point
VPN Gateway
Captive Portal
Enterprise Switch
802.1X
Custom NAS
```

------------------------------------------------------------------------

# 23. NAS Health

Track:

``` text
NAS status
Last Access-Request
Last Accounting-Request
Last Accounting-Start
Last Accounting-Stop
Last response
Packet loss
Authentication latency
Accounting latency
Active sessions
```

Health states:

``` text
UP
DEGRADED
DOWN
UNKNOWN
```

------------------------------------------------------------------------

# 24. CoA / Disconnect

Implement a dedicated Dynamic Authorization subsystem.

Supported operations:

``` text
Disconnect-Request
CoA-Request
```

Typical use:

``` text
Change bandwidth
Change policy
Change VLAN
Change IP profile
Suspend user
Resume user
Force logout
Change service plan
```

Flow:

``` text
Management API
      ↓
Policy Engine
      ↓
Session Engine
      ↓
NAS CoA/Disconnect
```

If the gateway itself is the NAS:

``` text
Session Engine
      ↓
VPP Adapter
```

Do not unnecessarily send CoA through an external NAS when the local
dataplane can be updated directly.

------------------------------------------------------------------------

# 25. Local Gateway Mode

When the product itself is the NAS/gateway:

``` text
FreeRADIUS
     ↓
Session Engine
     ↓
VPP Adapter
     ↓
VPP
```

The Session Engine is authoritative for local sessions.

RADIUS remains the AAA protocol interface.

------------------------------------------------------------------------

# 26. External NAS Mode

When the product is only the AAA server:

``` text
External NAS
     ↓
FreeRADIUS
     ↓
Session Engine
     ↓
Accounting Database
```

VPP is not required for external NAS sessions.

This makes the AAA engine reusable.

------------------------------------------------------------------------

# 27. Dataplane Architecture

Replace:

``` text
nftables
tc
qdisc
tc filter
iptables
```

with:

``` text
DPDK
 ↓
VPP
 ├── L2
 ├── L3
 ├── Routing
 ├── ACL
 ├── NAT
 ├── QoS
 ├── Policers
 ├── Classification
 ├── VLAN
 ├── VRF
 ├── Tunnel
 └── Interface management
```

VPP provides NAT44 functionality and an ACL framework, including
stateful/stateless ACL capabilities.

------------------------------------------------------------------------

# 28. VPP Adapter

Do NOT allow the Session Engine to call `vppctl` shell commands.

Bad:

``` text
Java
 ↓
exec()
 ↓
vppctl
```

Good:

``` text
Session Engine
      ↓
VPP Adapter
      ↓
VPP Binary API
      ↓
VPP
```

The VPP adapter should be a dedicated service/library.

Possible implementation:

``` text
Go
 ↓
GoVPP
 ↓
VPP API
```

or another officially supported VPP API binding.

------------------------------------------------------------------------

# 29. VPP Policy Objects

Represent policies as objects:

``` text
VPP Policy
 ├── ACL
 ├── Policer
 ├── QoS
 ├── NAT
 ├── VRF
 └── Classification
```

Example:

``` text
Policy ID: 10023

ACL:
    INTERNET_ONLY

Bandwidth:
    100 Mbps

QoS:
    GOLD

NAT:
    PUBLIC_POOL_01

DNS:
    DEFAULT

Application:
    STANDARD
```

------------------------------------------------------------------------

# 30. Subscriber → VPP Mapping

Example:

``` text
Subscriber:
    user1001

Session:
    S-987654

IP:
    10.20.30.40

Policy:
    GOLD-100M

VPP:
    subscriber mapping
        ↓
    ACL 100
        ↓
    Policer 100
        ↓
    NAT pool 10
```

The Session Engine maintains the logical mapping.

VPP maintains packet-path state.

------------------------------------------------------------------------

# 31. Bandwidth Control

Do not reproduce Linux `tc qdisc` literally.

Use VPP QoS/policer mechanisms.

Conceptually:

``` text
Subscriber
    ↓
Policy
    ↓
Policer / QoS
    ↓
VPP
```

Examples:

``` text
10 Mbps
25 Mbps
50 Mbps
100 Mbps
500 Mbps
1 Gbps
```

Profiles should be reusable.

Do not create a completely independent configuration object for every
packet.

------------------------------------------------------------------------

# 32. ACL Architecture

Use reusable ACL profiles.

Example:

``` text
ACL-GUEST
ACL-HOTEL
ACL-STAFF
ACL-ISP-BASIC
ACL-ISP-PREMIUM
ACL-BLOCKED
ACL-ADMIN
```

Subscriber:

``` text
subscriber
    ↓
ACL profile
```

Do not create thousands of duplicate ACL definitions when a shared ACL
can be reused.

------------------------------------------------------------------------

# 33. NAT Architecture

VPP handles NAT.

Session Engine should know:

``` text
NAT profile
NAT pool
subscriber mapping
```

VPP owns:

``` text
translation state
flow state
port allocation
NAT processing
```

Session Engine owns the business relationship:

``` text
subscriber → NAT profile
```

------------------------------------------------------------------------

# 34. NAT Logging

For enterprise/ISP environments, NAT logging is critical.

Design:

``` text
VPP NAT events
       ↓
NAT Event Collector
       ↓
Buffered pipeline
       ↓
Compressed/partitioned storage
```

Do NOT perform synchronous PostgreSQL writes for every translated
packet.

Log events such as:

``` text
timestamp
subscriber IP
public IP
port range / port
protocol
session ID
NAT pool
event type
```

For high-volume environments, design a dedicated NAT logging pipeline.

------------------------------------------------------------------------

# 35. DPI / Application Filtering

Do not put DPI inside FreeRADIUS.

Architecture:

``` text
VPP
 ↓
flow/classification
 ↓
DPI Engine
 ↓
Application classification
 ↓
Policy Engine
 ↓
VPP policy
```

Possible DPI engine:

``` text
nDPI
```

The DPI engine should classify traffic.

The Policy Engine should decide what action to take.

VPP should enforce the action.

------------------------------------------------------------------------

# 35A. WEB BROWSING / HTTP LOGGING

The gateway platform may provide an explicit Web Browsing / HTTP Logs capability for traffic where the deployment and protocol visibility make the required fields technically available.

The canonical distinction is:

```text
NAT Logs
  = private/source ↔ translated/public address and port traceability

Web Browsing / HTTP Logs
  = HTTP request/browsing metadata where visible and permitted

DPI / Application Awareness
  = protocol/application classification and usage intelligence
```

For encrypted HTTPS traffic, the product MUST NOT claim visibility into URL paths or payload content unless an explicitly approved inspection/decryption architecture provides that visibility. Standard deployments may record available metadata such as timestamp, source/session identity, destination address, host/domain metadata where available, method/status for visible HTTP traffic, and correlation identifiers.

Retention, privacy, access control, and export behavior MUST follow the security and observability specifications.

# 36. DNS Policy

DNS filtering should be separated from AAA.

Architecture:

``` text
Subscriber
 ↓
DNS request
 ↓
DNS Policy Engine
 ↓
Allowed / blocked
```

The Session Engine only associates:

``` text
subscriber → DNS policy
```

------------------------------------------------------------------------

# 37. Session Identity

Do not depend only on MAC address.

Session identity should support:

``` text
Session ID
Username
MAC
IPv4
IPv6
NAS-Port
VLAN
Circuit-ID
Remote-ID
PPPoE session
DHCP client identifier
Calling-Station-ID
```

Different access methods use different identifiers.

------------------------------------------------------------------------

# 38. Duplicate Login Detection

Implement configurable policies:

``` text
ALLOW_MULTIPLE
DENY_NEW
DISCONNECT_OLD
LIMIT_N
```

Example:

``` text
User = john
Simultaneous sessions = 2

Session 1 → active
Session 2 → active
Session 3 → reject
```

For `DISCONNECT_OLD`:

``` text
new login
   ↓
find old session
   ↓
disconnect old
   ↓
create new session
```

------------------------------------------------------------------------

# 39. Stale Session Recovery

Never rely exclusively on Accounting-Stop.

NAS devices can:

-   reboot
-   lose connectivity
-   crash
-   lose RADIUS connectivity
-   lose accounting packets

Implement:

``` text
Accounting-Stop
+
Interim-Update
+
Session timeout
+
NAS health
+
stale-session detector
```

Session Engine should periodically identify sessions whose accounting
state has expired.

------------------------------------------------------------------------

# 40. Session Reconciliation

After gateway restart:

``` text
VPP state
     +
Session database
     +
RADIUS accounting
     +
NAS state
```

must be reconciled.

Do not assume:

``` text
process restarted = all users disconnected
```

Design recovery states:

``` text
RECOVERING
     ↓
Reconcile
     ↓
ACTIVE
```

or:

``` text
STALE
     ↓
Cleanup
```

------------------------------------------------------------------------

# 41. VPP Restart Recovery

If VPP crashes/restarts:

``` text
VPP restart
    ↓
Session Engine detects VPP reconnect
    ↓
Load active session snapshot
    ↓
Rebuild VPP policies
    ↓
Rebuild required NAT/policy state
    ↓
Verify
    ↓
Resume
```

The Session Engine must therefore maintain enough information to
reconstruct dataplane state.

This is one of the most important architectural requirements.

------------------------------------------------------------------------

# 42. Session Snapshot

Maintain a recoverable snapshot containing:

``` text
session_id
subscriber_id
username
ip
mac
vlan
vrf
policy_id
acl_id
qos_id
nat_id
start_time
timeout
```

Do not depend on VPP as the permanent source of subscriber
configuration.

------------------------------------------------------------------------

# 43. High Availability

HA MUST be separated into clearly defined service levels:

1.  Control-plane HA
2.  Session/state HA
3.  Stateful dataplane/NAT HA

The product must not advertise "stateful HA" merely because PostgreSQL
and management services are replicated.

For enterprise deployments:

``` text
                 ┌──────────────┐
                 │ PostgreSQL HA│
                 └──────┬───────┘
                        │
             ┌──────────┴──────────┐
             │                     │
       Gateway Node A        Gateway Node B
             │                     │
        VPP + Session          VPP + Session
             │                     │
             └──────────┬──────────┘
                        │
                     Network
```

HA design should distinguish:

### Control-plane HA

Easy to replicate:

-   configuration
-   policies
-   subscribers
-   NAS
-   accounting

### Dataplane/session HA

Much harder:

-   active NAT state
-   active flows
-   subscriber state
-   packet counters

Do not claim stateful HA until actual state replication is implemented
and tested.

------------------------------------------------------------------------

# 44. Database Architecture

Recommended:

``` text
PostgreSQL
     │
     ├── configuration
     ├── subscribers
     ├── policies
     ├── NAS
     ├── IP pools
     ├── accounting
     ├── audit
     └── historical sessions
```

Use connection pooling.

Do not allow every microservice to create unlimited PostgreSQL
connections.

------------------------------------------------------------------------

# 45. Database Connection Strategy

Example logical limits:

``` text
Session Engine
    ↓
10–30 pooled connections

AAA
    ↓
10–30 pooled connections

Accounting Writer
    ↓
10–30 pooled connections
```

Actual numbers must be tuned from workload.

The important rule:

``` text
50k sessions ≠ 50k database connections
```

------------------------------------------------------------------------

# 46. IPAM

Create a dedicated IPAM module.

For 100k-scale operation, IPAM MUST use an in-memory allocation
structure plus durable recovery state. PostgreSQL transactions may be
used for authoritative persistence and conflict prevention, but IP
allocation must not require a full SQL round-trip for every subscriber
when the system is under high login churn.

Responsibilities:

``` text
Pool creation
Pool deletion
Pool status
Free IP count
Allocated IP count
Reservation
Static IP
Dynamic IP
Lease
Expiration
Subscriber mapping
```

For very high-concurrency allocation, use transactional allocation.

Avoid:

``` text
SELECT free IP
↓
application waits
↓
UPDATE IP
```

because concurrent workers can collide.

Use atomic/transactional allocation.

------------------------------------------------------------------------

# 47. IP Pool Model

``` text
IP Pool
 ├── pool_id
 ├── name
 ├── network
 ├── gateway
 ├── VLAN
 ├── VRF
 ├── allocation mode
 ├── static/dynamic
 └── address range
```

Allocation:

``` text
subscriber
    ↓
service profile
    ↓
IP pool
    ↓
IPAM
    ↓
IP address
```

------------------------------------------------------------------------

# 48. IPAM Performance

If SQL-based IP allocation is used, use proper transactional allocation
and avoid lock contention.

The FreeRADIUS project specifically documents
`SELECT ... FOR UPDATE SKIP LOCKED` and stored procedures as mechanisms
for high-concurrency SQL IP allocation.

For a very high-throughput gateway, however, the preferred architecture
is:

``` text
IPAM service
     ↓
in-memory free-address structures
     ↓
durable state asynchronously persisted
```

while retaining transactional recovery semantics.

------------------------------------------------------------------------

# 49. API Architecture

Management API:

``` text
/api/v1/subscribers
/api/v1/sessions
/api/v1/nas
/api/v1/policies
/api/v1/service-plans
/api/v1/ip-pools
/api/v1/vpp
/api/v1/accounting
/api/v1/monitoring
```

Session APIs:

``` text
GET    /sessions
GET    /sessions/{id}
POST   /sessions/{id}/disconnect
POST   /sessions/{id}/coa
GET    /subscribers/{id}/sessions
```

------------------------------------------------------------------------

# 50. Event Architecture

Use events internally.

Examples:

``` text
SESSION_CREATED
SESSION_AUTHENTICATED
SESSION_ACTIVE
SESSION_UPDATED
SESSION_COA
SESSION_DISCONNECT_REQUESTED
SESSION_DISCONNECTED
SESSION_EXPIRED
SESSION_STALE
VPP_PROGRAMMED
VPP_PROGRAM_FAILED
NAS_UP
NAS_DOWN
IP_ALLOCATED
IP_RELEASED
```

This makes the system easier to scale.

------------------------------------------------------------------------

# 51. Avoid Synchronous Chains

Bad:

``` text
RADIUS
 ↓
Session Engine
 ↓
PostgreSQL
 ↓
IPAM
 ↓
VPP
 ↓
DPI
 ↓
PostgreSQL
 ↓
RADIUS response
```

Every dependency increases authentication latency.

Better:

``` text
RADIUS
 ↓
AAA decision
 ↓
Session Engine
 ↓
minimum synchronous provisioning
 ↓
Access-Accept
```

Then:

``` text
events
 ↓
policy/VPP/accounting workers
```

with carefully defined transactional boundaries.

------------------------------------------------------------------------

# 52. Authentication Latency

Define explicit SLA targets.

For example:

``` text
P50 < 20 ms
P95 < 50 ms
P99 < 100 ms
```

These are engineering targets, not guaranteed values.

Measure:

``` text
RADIUS receive
 ↓
authentication
 ↓
authorization
 ↓
DB
 ↓
response
```

Do not optimize only average latency.

------------------------------------------------------------------------

# 53. Capacity Model --- 100k Architecture / 50k Certification

Define capacity using:

``` text
C1 = concurrent sessions
C2 = authentication requests/sec
C3 = accounting packets/sec
C4 = CoA/sec
C5 = disconnect/sec
C6 = NAT flows
C7 = packets/sec
C8 = throughput
```

Example product target:

``` text
Concurrent sessions:
100,000 architectural target
50,000 initial certified profile

Authentication burst:
1,000 requests/sec

Accounting:
1,000+ packets/sec

CoA:
100+ operations/sec

Disconnect:
100+ operations/sec

Throughput:
50 Gbps

NAT:
product-defined concurrent flows

Packet rate:
hardware-dependent
```

Do not assume these numbers are automatically achieved. They are
capacity targets that must become acceptance tests.

------------------------------------------------------------------------

# 54. DPDK Architecture

DPDK owns:

``` text
NIC packet I/O
DMA
RX/TX queues
mbufs
poll-mode drivers
RSS
queue distribution
```

VPP owns:

``` text
packet processing graph
routing
forwarding
ACL
NAT
QoS
policing
classification
interfaces
tunnels
```

------------------------------------------------------------------------

# 55. CPU Architecture

Reserve CPU resources.

Conceptually:

``` text
CPU
├── VPP workers
├── DPDK RX/TX
├── IRQ / system
├── Session Engine
├── FreeRADIUS
├── PostgreSQL
└── Management
```

Do not allow PostgreSQL or Java workloads to compete freely with VPP
worker cores.

------------------------------------------------------------------------

# 56. NUMA

For multi-socket hardware:

``` text
NUMA 0
 ├── NIC 0
 ├── VPP workers
 └── memory

NUMA 1
 ├── NIC 1
 ├── VPP workers
 └── memory
```

Keep:

``` text
NIC
+
RX/TX queues
+
VPP workers
+
packet memory
```

on the appropriate NUMA node wherever possible.

DPDK documentation specifically emphasizes NUMA-local memory and
queue/core locality for performance.

------------------------------------------------------------------------

# 57. RSS / Multi-Queue

Use NIC RSS to distribute flows.

Concept:

``` text
NIC
 ├── RX queue 0 → VPP worker 0
 ├── RX queue 1 → VPP worker 1
 ├── RX queue 2 → VPP worker 2
 └── RX queue 3 → VPP worker 3
```

Do not allow multiple workers to fight over the same queue unless the
specific driver/workload supports it appropriately.

------------------------------------------------------------------------

# 58. Hugepages

Use hugepages for the DPDK/VPP dataplane according to the final hardware
and workload.

Do not blindly allocate huge amounts of memory.

Reserve based on:

``` text
NIC queues
+
mbuf pools
+
VPP workers
+
flow tables
+
NAT tables
+
ACL tables
```

------------------------------------------------------------------------

# 59. Management Plane Must Never Block Dataplane

This is a hard requirement.

Never:

``` text
VPP worker
 ↓
PostgreSQL query
```

Never:

``` text
VPP worker
 ↓
HTTP request
```

Never:

``` text
VPP worker
 ↓
FreeRADIUS
```

Never:

``` text
VPP worker
 ↓
Java application
```

The dataplane must continue operating independently.

------------------------------------------------------------------------

# 60. Application Architecture

Recommended services:

``` text
gateway/
│
├── aaa-service/
├── session-service/
├── policy-service/
├── ipam-service/
├── accounting-service/
├── vpp-adapter/
├── nas-service/
├── nat-log-service/
├── dpi-service/
├── monitoring-service/
├── config-service/
└── api-service/
```

For the first implementation these can be deployed as fewer processes.

Do not create dozens of microservices unnecessarily.

A practical first version:

``` text
Process 1:
Gateway Control Service

Process 2:
FreeRADIUS

Process 3:
VPP

Process 4:
Accounting Worker

Process 5:
PostgreSQL

Process 6:
DPI
```

The internal modules can later be separated.

------------------------------------------------------------------------

# 61. Recommended Session Engine Technology

The Session Engine is performance-sensitive but not packet-path code.

Good choices:

``` text
Go
Rust
C++
```

Go is a strong practical choice because:

-   excellent concurrency
-   simple deployment
-   gRPC
-   strong networking libraries
-   GoVPP
-   low operational complexity

Java is also possible, but if the new Session Engine is being designed
specifically around VPP control and high-concurrency state management,
Go should be seriously considered.

------------------------------------------------------------------------

# 62. VPP Adapter Technology

Recommended:

``` text
Go
+
GoVPP
+
VPP Binary API
```

Architecture:

``` text
Session Engine
      ↓
VPP Adapter
      ↓
GoVPP
      ↓
VPP Binary API
      ↓
VPP
```

Never use CLI parsing as the primary integration mechanism.

------------------------------------------------------------------------

# 63. Idempotency

Every provisioning operation must be idempotent.

Example:

``` text
Create subscriber policy
```

If the operation is repeated:

``` text
first → create
second → update/no-op
third → update/no-op
```

Not:

``` text
duplicate policy
duplicate ACL
duplicate policer
duplicate NAT mapping
```

------------------------------------------------------------------------

# 64. Configuration Versioning

Every policy should have:

``` text
policy_id
version
created_at
updated_at
status
```

Example:

``` text
Policy 10023
Version 7
```

When changed:

``` text
Version 8
```

Existing sessions may continue using Version 7 until a CoA/reprovision
event occurs.

This prevents unexpected live-session changes.

------------------------------------------------------------------------

# 65. Live Policy Change

Example:

``` text
User currently:
100 Mbps

Admin changes plan:
500 Mbps
```

Flow:

``` text
Policy update
 ↓
Find active sessions
 ↓
Generate CoA/update event
 ↓
Session Engine
 ↓
VPP Adapter
 ↓
Update policer
 ↓
Session remains connected
```

No logout/login should be required unless the policy specifically
requires it.

------------------------------------------------------------------------

# 66. Subscriber Suspension

``` text
Admin:
Suspend subscriber
        ↓
Policy Engine
        ↓
Find active sessions
        ↓
Disconnect or block
        ↓
VPP
```

The database status alone must not be considered sufficient.

------------------------------------------------------------------------

# 67. Monitoring

Expose metrics for:

### FreeRADIUS

``` text
Access-Request rate
Accept rate
Reject rate
authentication latency
SQL latency
LDAP latency
thread utilization
queue depth
timeouts
```

### Session Engine

``` text
active sessions
login/sec
logout/sec
session creation failures
VPP programming failures
stale sessions
IP allocation failures
CoA rate
```

### VPP

``` text
RX packets
TX packets
drops
errors
worker utilization
interface utilization
ACL counters
NAT sessions
NAT translations
policer drops
queue utilization
```

### PostgreSQL

``` text
connections
transactions/sec
query latency
locks
cache hit ratio
WAL rate
database size
```

------------------------------------------------------------------------

# 68. Observability

Use:

``` text
Prometheus
+
Grafana
+
OpenTelemetry
```

Every session event should have a correlation ID.

Example:

``` text
request_id
session_id
subscriber_id
nas_id
```

This allows:

``` text
RADIUS request
      ↓
Session Engine
      ↓
VPP
```

to be traced as one transaction.

------------------------------------------------------------------------

# 69. Logging

Do not log every packet.

Log:

``` text
authentication events
session lifecycle
policy changes
CoA
disconnect
VPP failures
NAT events
security events
administrative actions
```

Use structured JSON logging.

Example:

``` text
{
  "event": "SESSION_CREATED",
  "session_id": "...",
  "subscriber_id": "...",
  "nas_id": "...",
  "policy_id": 10023
}
```

------------------------------------------------------------------------

# 70. Security

The control plane must be protected.

Requirements:

-   TLS for management APIs
-   mTLS between internal services where appropriate
-   RADIUS shared-secret protection
-   secure PostgreSQL credentials
-   least privilege
-   systemd sandboxing
-   restricted VPP API socket
-   restricted management ports
-   audit logging
-   signed packages
-   configuration integrity
-   administrator RBAC

Do not expose the VPP API socket remotely.

------------------------------------------------------------------------

# 71. Failure Handling

Every dependency needs explicit failure behavior.

### PostgreSQL unavailable

Authentication should use cached authorization where policy permits.

### VPP unavailable

Do not accept new sessions that cannot be enforced.

Existing sessions should enter a defined degraded/recovery state.

### FreeRADIUS unavailable

Session Engine continues existing sessions.

### Session Engine unavailable

Existing VPP sessions should continue where possible.

New authentication/provisioning may be temporarily unavailable.

This separation is critical.

------------------------------------------------------------------------

# 72. FreeRADIUS High Availability

Deploy:

``` text
FreeRADIUS A
FreeRADIUS B
```

NAS configuration:

``` text
Primary RADIUS
Secondary RADIUS
```

or use an internal load-balancing architecture.

Do not depend on one RADIUS process.

------------------------------------------------------------------------

# 73. Session Engine HA

Use:

``` text
Session Engine A
Session Engine B
```

with:

``` text
PostgreSQL
+
event/coordination layer
```

But avoid active-active writes to the same session without ownership.

Use session ownership:

``` text
Session hash
     ↓
Owner node
```

Example:

``` text
hash(session_id) % N
```

This minimizes distributed locking.

------------------------------------------------------------------------

# 74. Session Ownership

Every session should have:

``` text
owner_node
epoch
```

Example:

``` text
session:
S12345

owner:
gateway-01

epoch:
42
```

If gateway-01 fails:

``` text
gateway-02
 ↓
new epoch
 ↓
take ownership
```

Old delayed events must not overwrite newer state.

------------------------------------------------------------------------

# 75. Event Ordering

Session events must be ordered.

Example:

``` text
LOGIN
COA
LOGOUT
```

must not become:

``` text
LOGIN
LOGOUT
COA
```

Use:

``` text
session sequence number
```

Example:

``` text
event_seq = 100
event_seq = 101
event_seq = 102
```

Reject stale events.

------------------------------------------------------------------------

# 76. Race Condition Example

Potential problem:

``` text
User login
       ↓
Session A

Immediately logout
       ↓
Session B login
```

A delayed VPP operation from Session A must not delete Session B.

Therefore VPP operations must include a session generation/epoch.

Example:

``` text
subscriber = 1001
session_generation = 22
```

Only operations matching the current generation may modify the session.

------------------------------------------------------------------------

# 77. NAS Accounting Reconciliation

Accounting-Start should create/confirm session.

Interim updates should refresh:

``` text
last_seen
octets
packets
session timers
```

Accounting-Stop should close the session.

If Stop is missing:

``` text
stale detector
+
NAS reconciliation
+
timeout
```

must eventually close it.

------------------------------------------------------------------------

# 78. Accounting Accuracy

Accounting must distinguish:

``` text
live usage
historical usage
billing usage
diagnostic counters
```

Do not use one database table for every purpose.

Recommended:

``` text
live_session
session_history
accounting_interim
billing_usage
nat_log
audit_log
```

------------------------------------------------------------------------

# 79. Data Retention

Configure independently:

``` text
live sessions:
until disconnected

accounting:
customer-defined

NAT logs:
customer/legal requirement

audit logs:
customer/security requirement

metrics:
30–180 days
```

Do not let logs consume the gateway's entire storage.

------------------------------------------------------------------------

# 80. Deployment Modes

The product MUST have exactly three first-class deployment modes.

## MODE 1 --- AAA-Only

``` text
External NAS
     ↓
FreeRADIUS
     ↓
AAA / Session Engine
     ↓
PostgreSQL
```

VPP/DPDK is not required in this mode.

The platform provides RADIUS authentication, authorization, accounting,
CoA/Disconnect, subscriber/session management, NAS management,
policy/profile management, and related AAA functions.

## MODE 2 --- Gateway-Only

``` text
Subscriber/NIC
     ↓
DPDK
     ↓
VPP
     ↑
Session / Policy Engine
```

This mode does not require an external RADIUS server for the gateway's
local subscriber enforcement path. Authentication sources may include
local accounts, captive portal, LDAP/AD, API, or another configured
source.

## MODE 3 --- Multi-Mode (AAA + Gateway)

``` text
External NAS / local access
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

### Important rule

AAA-only, Gateway-only, and Multi-mode are deployment modes---not
separate codebases.

The same Session Engine, Policy Engine, IPAM, accounting, API,
monitoring, and configuration model must be reused.

Captive Portal, ISP Broadband, Enterprise Gateway, Hospitality, PPPoE,
DHCP, IP subscriber access, DPI, DNS filtering, etc. are FEATURE/ACCESS
PROFILES inside these three modes, not additional deployment modes.

------------------------------------------------------------------------

# 81. Initial Implementation Priority

Do NOT build everything simultaneously.

### Phase 1 --- Platform Foundation

``` text
Rocky Linux 10 Minimal installation
DPDK
VPP
PostgreSQL
Session Engine
Policy Engine
VPP Adapter
Basic REST API
gRPC internal API
systemd services
health/metrics
```

FreeRADIUS is enabled for Mode 1 and Mode 3, but Gateway-only must not
depend on FreeRADIUS being present.

### Phase 2 --- Core AAA + Gateway

``` text
FreeRADIUS
RADIUS authentication
Accounting
IPAM
Subscriber profiles
Bandwidth
ACL
NAT
Gateway interfaces
VLAN/VRF
```

All three deployment modes must be testable by the end of this phase.

### Phase 3 --- Session Reliability

``` text
CoA
Disconnect
duplicate-login handling
stale-session recovery
VPP reconnect/rebuild
Session Engine restart recovery
NAS failure recovery
event ordering
session ownership/epoch
```

HA is introduced only after deterministic single-node recovery is
working.

### Phase 4

``` text
DPI
Application filtering
DNS filtering
Advanced QoS
```

### Phase 5 --- HA and Scale

``` text
Control-plane HA
Session ownership
multi-gateway
central management
distributed deployment
100k session load testing
50 Gbps hardware qualification
```

Stateful NAT/dataplane HA must be treated as a separate qualification
item and must not be assumed from control-plane HA.

------------------------------------------------------------------------

# 82. First MVP

The first working system should support:

``` text
RADIUS Access-Request
        ↓
FreeRADIUS
        ↓
PostgreSQL authorization
        ↓
Access-Accept
        ↓
Session Engine
        ↓
IP allocation
        ↓
VPP
        ↓
ACL
        ↓
Bandwidth policer
        ↓
NAT
        ↓
Internet
```

Logout:

``` text
Accounting-Stop
        ↓
Session Engine
        ↓
VPP cleanup
        ↓
IP release
        ↓
session closed
```

------------------------------------------------------------------------

# 83. Do Not Implement These Initially

Avoid initially:

``` text
custom RADIUS server
custom packet engine
custom NAT engine
custom TCP stack
custom routing engine
custom qdisc
custom kernel firewall
shell-based dataplane automation
```

Use mature components.

Build your differentiation in:

``` text
AAA policy
Session Engine
Policy Engine
Management
Analytics
DPI integration
Subscriber management
Automation
```

------------------------------------------------------------------------

# 84. Product-Level Architecture

Final target:

``` text
                         MANAGEMENT
                             │
                     REST / gRPC / UI
                             │
                             ▼
                    ┌─────────────────┐
                    │  Control Plane  │
                    └────────┬────────┘
                             │
       ┌─────────────────────┼─────────────────────┐
       │                     │                     │
       ▼                     ▼                     ▼
     AAA               Session Engine          Policy
 FreeRADIUS             Live State             Engine
       │                     │                     │
       └─────────────────────┼─────────────────────┘
                             │
                       VPP Adapter
                             │
                             ▼
                       VPP / DPDK
                             │
                             ▼
                           NIC
                             │
                             ▼
                        NETWORK
```

------------------------------------------------------------------------

# 85. Golden Architecture Rule

The product MUST follow this rule:

``` text
AAA decides
Session Engine remembers
Policy Engine translates
VPP enforces
PostgreSQL persists
Monitoring observes
Management controls
```

Never mix these responsibilities.

------------------------------------------------------------------------

# 86. 100k Session Design Principle

The architecture should support:

``` text
100,000 live sessions
```

with:

``` text
50,000 sessions = initial certification profile
100,000 sessions = architectural capacity target
```

without requiring:

``` text
50,000 processes
50,000 threads
50,000 SQL connections
50,000 VPP API connections
50,000 shell scripts
50,000 ACL objects
50,000 PostgreSQL transactions per second
```

Instead:

``` text
50k sessions
     ↓
compact in-memory session state
     ↓
shared policy objects
     ↓
small number of workers
     ↓
VPP dataplane
```

------------------------------------------------------------------------

# 87. AI Agent Implementation Rules

The AI development agent MUST:

1.  Never implement packet forwarding in Java.
2.  Never execute `vppctl` for normal runtime provisioning.
3.  Never execute nftables/tc commands for subscriber enforcement.
4.  Never put subscriber packet state in PostgreSQL.
5.  Never create one thread per subscriber.
6.  Never create one DB connection per subscriber.
7.  Never create duplicate policy objects unnecessarily.
8.  Never make VPP workers perform blocking I/O.
9.  Never use shell scripts as the primary control-plane API.
10. Make every provisioning operation idempotent.
11. Make every session event versioned.
12. Implement session recovery.
13. Implement VPP reconnect/rebuild.
14. Implement NAS failure recovery.
15. Implement RADIUS retry handling.
16. Implement CoA and Disconnect.
17. Implement structured metrics.
18. Implement structured logs.
19. Provide unit tests for every state transition.
20. Provide load tests for 50k sessions.
21. Provide architectural/load-test coverage for 100k sessions.
22. Verify all three deployment modes independently.
23. Do not introduce a hard-coded 50k session limit anywhere.

------------------------------------------------------------------------

# 88. Required Testing Targets

The development agent must create automated tests for:

### Authentication

``` text
normal login
wrong password
unknown user
expired user
disabled user
duplicate login
```

### Sessions

``` text
login
logout
timeout
idle timeout
NAS reboot
RADIUS restart
Session Engine restart
VPP restart
```

### Policy

``` text
bandwidth change
ACL change
service-plan change
subscriber suspension
subscriber activation
```

### Accounting

``` text
Start
Interim
Stop
duplicate Start
duplicate Stop
missing Stop
out-of-order events
```

### HA

``` text
FreeRADIUS failure
Session Engine failure
PostgreSQL failure
VPP failure
network failure
node failure
```

------------------------------------------------------------------------

# 89. Required Load Tests

The test framework must eventually simulate:

``` text
100,000 concurrent sessions
50,000 concurrent sessions as initial certification profile

1,000 authentication requests/sec burst
1,000+ accounting packets/sec at 50k scale
2,000+ accounting packets/sec at 100k scale where configured for 5-minute interim updates

CoA burst
Disconnect burst

50 Gbps-class dataplane on certified hardware

large NAT table

large ACL table

large subscriber policy set
```

Measure:

``` text
P50 latency
P95 latency
P99 latency
CPU
RAM
packet loss
VPP worker utilization
RADIUS queue depth
PostgreSQL latency
session creation latency
session deletion latency
VPP programming latency
```

------------------------------------------------------------------------

# 90. Final Technology Direction

Recommended platform:

``` text
OS:
Rocky Linux 10

Kernel:
Rocky 10 kernel

Packet I/O:
DPDK

Dataplane:
VPP

AAA:
FreeRADIUS 3.2.x stable branch initially

FreeRADIUS 4.x must not be used for production until the project explicitly qualifies a stable release and completes compatibility/regression testing.

Database:
PostgreSQL

Session Engine:
Go

VPP integration:
GoVPP / VPP Binary API

Cache/coordination:
Redis optional

API:
gRPC internally
REST externally

Monitoring:
Prometheus + Grafana

Tracing:
OpenTelemetry

Logs:
structured JSON

Service management:
systemd

Deployment:
native packages initially
containerization only where it does not interfere with dataplane performance
```

------------------------------------------------------------------------

# 91. Critical Version Policy

The AI development agent MUST treat the platform BOM as a controlled
compatibility matrix, not a collection of independently upgradable
packages.

Rocky Linux 10 Minimal is the standardized installation baseline for the
appliance image. Rocky's documentation distinguishes the Minimal ISO
from the Boot ISO: Minimal provides a minimal installation environment,
while Boot is network-install media. For a reproducible appliance build,
standardize on the Minimal ISO and then install the exact approved
package set.

The final appliance image should use a verified SHA256 checksum for the
Rocky ISO and a reproducible Kickstart/post-install procedure.

Do not allow the AI agent to arbitrarily upgrade:

``` text
kernel
DPDK
VPP
FreeRADIUS
PostgreSQL
NIC firmware
```

Define a tested platform BOM:

``` text
Gateway Platform Release

OS:
Rocky Linux 10.x

Kernel:
6.12.x

DPDK:
approved version

VPP:
approved version

FreeRADIUS:
approved stable 3.2.x branch/version

PostgreSQL:
approved version

Go:
approved version
```

Every upgrade requires regression testing.

------------------------------------------------------------------------

# 92. Additional 100k-Scale Requirements

The following are mandatory before declaring 100k architectural
readiness:

## Session Engine

``` text
- session ownership/sharding
- owner_node
- session epoch/generation
- ordered event sequence
- idempotent commands
- compact in-memory state
- durable snapshot/recovery journal
- VPP reconciliation after reconnect
```

## Accounting

``` text
100k / 300 sec ≈ 333 updates/sec
100k / 60 sec  ≈ 1,667 updates/sec

Accounting ingestion must be decoupled from synchronous packet-path processing.
```

## Database

``` text
- partitioned accounting/history tables
- connection pooling
- bounded connection counts
- indexes based on real query patterns
- WAL/storage sizing
- backup/restore testing
```

## Dataplane

``` text
- NUMA-aware NIC/worker placement
- RSS/multi-queue
- VPP worker affinity
- hugepage sizing
- NAT/flow table sizing
- ACL/policy object reuse
- packet-rate qualification in addition to Gbps
```

## HA

``` text
- control-plane HA
- session ownership/failover
- deterministic recovery
- explicit statement of whether active NAT/flow state is replicated
```

Do not claim stateful dataplane HA until active flows, NAT state,
counters, and failover behavior have been demonstrated under load.

------------------------------------------------------------------------

# 93. Final Architectural Principle

The most important change from the legacy architecture is:

### OLD

``` text
RADIUS
 ↓
shell scripts
 ↓
Linux firewall
 ↓
tc
 ↓
subscriber enforcement
```

### NEW

``` text
                    AAA
                     │
                 FreeRADIUS
                     │
                     ▼
               Session Engine
                     │
                     ▼
                Policy Engine
                     │
                     ▼
                VPP Adapter
                     │
                     ▼
                 VPP/DPDK
                     │
                     ▼
                    NIC
```

The Session Engine becomes the central integration point between **AAA
and the dataplane**.

FreeRADIUS authenticates and authorizes.

The Session Engine owns the subscriber lifecycle.

The Policy Engine converts business policy into enforceable dataplane
objects.

VPP performs packet processing.

PostgreSQL stores durable state.

This architecture is the foundation that should be designed first before
implementing individual features.

------------------------------------------------------------------------

# 94. Appliance Platform Baseline

The first appliance build should standardize:

``` text
OS:
Rocky Linux 10.x

Installation media:
Rocky Linux 10.x Minimal ISO

Installation:
UEFI
Minimal Install
Kickstart/reproducible post-install configuration

Dataplane:
DPDK + VPP

AAA:
FreeRADIUS 3.2.x initially

Database:
PostgreSQL

Session Engine:
Go

VPP integration:
GoVPP / VPP Binary API

Internal API:
gRPC / Unix socket where appropriate

External API:
REST

Service management:
systemd

Monitoring:
Prometheus + Grafana

Tracing:
OpenTelemetry

Logs:
structured JSON
```

The Boot ISO is intended for network installation. It should not be the
standard appliance installation image when a reproducible local Minimal
ISO workflow is available.

Official Rocky installation documentation:
https://docs.rockylinux.org/guides/installation/

Rocky ISO documentation:
https://docs.rockylinux.org/teams/rel_eng/image/

------------------------------------------------------------------------

# 95. Three-Mode Architecture Rule

The codebase MUST NOT branch into three separate products.

Use:

``` text
                    ┌──────────────────────┐
                    │   Common Platform    │
                    │ Session / Policy /   │
                    │ IPAM / Accounting /  │
                    │ API / Monitoring     │
                    └──────────┬───────────┘
                               │
             ┌─────────────────┼─────────────────┐
             │                 │                 │
             ▼                 ▼                 ▼
        AAA-ONLY         GATEWAY-ONLY       MULTI-MODE
        FreeRADIUS       VPP/DPDK            RADIUS + VPP
```

Feature availability is controlled by deployment mode and license/module
configuration.

------------------------------------------------------------------------

# 96. 100k Does Not Mean 100k Everything

The AI agent MUST NOT translate the 100k session target into:

``` text
100k threads
100k processes
100k SQL connections
100k VPP API connections
100k policy objects
100k DB transactions/sec
```

Instead:

``` text
100k sessions
    ↓
compact session records
    ↓
sharded/owned workers
    ↓
shared policy objects
    ↓
batched asynchronous accounting
    ↓
VPP dataplane
```

------------------------------------------------------------------------

# 97. Acceptance Criteria

The product is not considered production-ready merely because the
application starts.

Acceptance must include:

``` text
1. 50k concurrent sessions
2. 100k architectural load test
3. authentication burst test
4. accounting burst test
5. CoA/disconnect burst test
6. VPP restart/rebuild test
7. Session Engine restart test
8. PostgreSQL failure/recovery test
9. NAS failure/reconciliation test
10. duplicate/out-of-order RADIUS event test
11. large NAT/flow-table test
12. large ACL/policy-object test
13. NUMA/CPU-affinity validation
14. packet-loss test
15. 50 Gbps-class throughput test on certified hardware
16. PPS test at multiple packet sizes
17. long-duration soak test
18. security and privilege review
19. backup/restore test
20. upgrade/rollback test
```

The acceptance numbers must be tied to a specific certified hardware
profile. Software architecture alone does not prove 50 Gbps throughput.
