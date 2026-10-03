# CRYPTSK — Legacy Dataplane to VPP Migration Matrix

**Status:** Implementation authority for legacy dataplane migration

## 1. Scope

This matrix converts the functional behavior of the 1,183-line `defaultchains_cryptsk.sh` implementation into target CRYPTSK architecture responsibilities.

The objective is not to reproduce nftables syntax. The objective is to ensure that **no meaningful legacy gateway capability disappears during migration**.

## 2. Target ownership model

| Responsibility | Target owner |
|---|---|
| Subscriber identity | Session Engine |
| Authentication decision | AAA / Authentication services |
| Session lifecycle | Session Engine |
| Policy definition | Policy Engine |
| Policy compilation | Policy Engine |
| Runtime packet policy | VPP Adapter + VPP |
| Forwarding/routing | VPP |
| NAT/SNAT/masquerade | VPP |
| ACL/firewall enforcement | VPP |
| QoS/shaping/scheduling | VPP |
| WAN selection | Policy Engine + VPP |
| DDoS packet enforcement | VPP |
| DDoS detection/correlation | Security Engine / Monitoring |
| DPI classification | DPI Engine / nDPI integration |
| Content filtering | Content Filtering service |
| Captive portal application | Portal service |
| Portal traffic steering | VPP |
| Accounting aggregation | Session Engine / Monitoring |
| Durable configuration/history | PostgreSQL |
| Operational cache/coordination | Redis, if required |
| Metrics/traces/logs | Observability stack |
| Management UI | Next.js |

## 3. Functional migration matrix

| Legacy capability | Legacy mechanism | Target implementation | VPP | Control/service | Migration rule |
|---|---|---|:---:|---|---|
| Interface role classification | NetworkManager `nettype` values | Gateway interface/zone model | Yes | Network Manager | Preserve WAN/LAN/VLAN/BRIDGE/BOND/MGMT/GUEST/IOT/DMZ/WIFI semantics as gateway interface roles |
| Default-deny input | nft input policy drop | VPP host/gateway security policy | Yes | Security Policy | Preserve default deny; expose explicit allowed services through management plane |
| Interface-specific open ports | nft interface + port rules | VPP interface ACL/service policy | Yes | Policy Engine | Compile role-aware service access; no per-subscriber shell rules |
| Established/related acceptance | conntrack state | VPP connection/state-aware policy where applicable | Yes | Session/Security | Preserve return traffic behavior |
| Invalid-state drop | nft conntrack invalid | VPP protocol/state validation + security policy | Yes/Partial | Security Engine | Preserve malformed/invalid traffic rejection; exact VPP primitive must be validated |
| Loopback bypass | nft `iif lo accept` | Host/service boundary | Partial | Linux host security | This is host protection, not subscriber forwarding |
| DHCP pre-conntrack exception | nft early UDP accept | VPP DHCP/service-plane exception | Yes | DHCP service | Preserve DHCP discover/broadcast behavior |
| RADIUS pre-conntrack exception | nft early UDP accept | VPP/service interface policy | Yes/Partial | AAA | Preserve external NAS/RADIUS reachability where gateway terminates it |
| Subscriber address sets | nft sets `usersset`, `usersdstset` | Session-to-VPP subscriber bindings | Yes | Session Engine | Replace IP-set identity with authoritative session identity and compiled VPP state |
| Logged-in users | nft `loggedinusers` | Session state | Yes | Session Engine | Login state belongs to Session Engine, not a Linux set |
| User IP → mark map | nft `user_mark_map` | Subscriber/policy binding in VPP | Yes | Policy Engine + VPP Adapter | Do not reproduce fwmark architecture unless a specific VPP metadata primitive requires an equivalent |
| Masquerade users | nft `masq_users` | VPP NAT44/CGNAT policy | Yes | Policy Engine | Preserve subscriber/pool/WAN association |
| Static SNAT | nft `snat_map` | VPP SNAT mapping/pool | Yes | IPAM/Policy | Preserve deterministic source translation |
| Per-WAN masquerade | `masq_users_<interface>` sets | VPP NAT pool/translation tied to WAN | Yes | Gateway Manager | Preserve egress-WAN association |
| Gateway IP sets | nft gateway sets | VPP interface/address/policy state | Yes | Gateway Manager | No Linux set dependency |
| Blocked IP/network/MAC | nft sets | VPP ACL/address policy; L2 policy where supported | Yes/Partial | Security Policy | Preserve block semantics; validate MAC-level primitive for each deployment mode |
| Restricted networks | generated `/tmp/restrictednetworks` + nft set | Policy Engine address/network objects | Yes | Policy Engine | Source file becomes durable configuration/API, not runtime shell input |
| HTTP rate limiting | nft per-interface meters | VPP policer/rate-limit policy | Yes | Policy Engine | Preserve thresholds as configurable policy, not hardcoded shell generation |
| HTTPS rate limiting | nft meters | VPP policer/rate-limit policy | Yes | Policy Engine | Preserve optional HTTPS control |
| SMB hardening | TCP/UDP 137/138/139/445 drop | VPP ACL/security policy | Yes | Security Policy | Preserve block and security telemetry |
| NFLOG SNI capture | nft NFLOG + ulogd2 | VPP flow/packet metadata + DPI/Traffic Intelligence | Partial | DPI/Telemetry | Do not write every packet to DB; capture only required metadata/events |
| TLS SNI extraction | ulogd2 + parser | DPI/Traffic Intelligence | Partial | DPI Engine | Preserve SNI visibility where technically possible |
| HTTP Host logging | NFLOG parser | HTTP/Web Browsing Intelligence | Partial | Traffic Intelligence | Preserve as HTTP browsing log capability; not a generic packet dump |
| DNS query logging | NFLOG DNS | DNS/Traffic Intelligence | Partial | DNS/Telemetry | Preserve query visibility subject to deployment and privacy policy |
| User firewall chains | nft dynamic mangle chains | Policy Engine → compiled VPP ACL/policy | Yes | Policy Engine | Preserve rule semantics without per-user Linux chains |
| Upload accounting | nft mangle accounting chains | VPP counters + Session Engine aggregation | Yes | Session Engine | Aggregate counters periodically; no per-packet PostgreSQL writes |
| Download accounting | nft postrouting accounting | VPP counters + Session Engine | Yes | Session Engine | Preserve upload/download octets and packets |
| Gateway accounting | nft gateway accounting | VPP interface/VRF/policy counters | Yes | Monitoring | Preserve gateway-level counters |
| Pool accounting | nft pool accounting | VPP subscriber pool counters | Yes | Session/Monitoring | Preserve pool-level aggregation |
| Firewall accounting | nft counters | VPP ACL counters/telemetry | Yes | Monitoring | Preserve hit/drop counters |
| Captive portal detection | service port check | Service health + gateway policy state | Partial | Portal Manager | Portal availability is control-plane/service state |
| Captive portal redirect | nft NAT redirect | VPP traffic steering/redirect + portal service | Yes/Partial | Portal service | Preserve pre-auth interception without relying on nft redirect |
| Logged-in vs pre-login steering | nft marks/sets | Session state + VPP classification | Yes | Session Engine | Authentication state drives packet policy |
| E2Guardian detection | systemd/pgrep/port check | Service registry/health | No | Service Manager | Replace process probing with service health/registration |
| E2Guardian HTTP redirect | nft redirect to 8080 | VPP steering to filtering service | Yes/Partial | Content Filter | Preserve filtering path; filter engine remains external |
| E2Guardian HTTPS/SNI redirect | nft redirect to 18443 | VPP steering to filtering service | Yes/Partial | Content Filter/DPI | Preserve filtering where supported; do not claim VPP is the content filter |
| Multiple gateway routing | nft marks/maps/sets | VPP FIB/VRF/policy routing | Yes | Policy Engine | Replace fwmark routing with compiled VPP routing/policy state |
| NAT exact flow | nft prerouting/postrouting chain order | VPP NAT pipeline | Yes | VPP Adapter | Preserve ordering semantics: classification/policy before translation where required |
| Portal NAT exceptions | nft NAT chains | VPP policy/redirect exceptions | Yes/Partial | Portal | Preserve exception ordering |
| IPv6 firewall | separate nft IPv6 table | VPP IPv6 ACL/security/routing | Yes | Policy Engine | Preserve IPv6 enable/disable behavior |
| IPv6 ICMPv6 | nft accept | VPP ICMPv6 policy | Yes | Security Policy | Must not break essential IPv6 control traffic |
| IPv6 gateway services | nft port allow rules | VPP IPv6 service policy | Yes | Gateway Manager | Preserve management/service access |
| Scanner detection | malformed TCP/options/low TTL rules | VPP packet-header security + Security Engine | Yes/Partial | Security Engine | Preserve detections that VPP can implement; move correlation/intelligence out of packet path |
| SYN flood | dynamic nft set + rate limiter | VPP ingress/policer + Security Engine | Yes | Security | Preserve rate and block semantics; thresholds configurable |
| SYN-ACK flood | nft rate limiter | VPP packet filter/policer | Yes | Security | Preserve reflection-flood detection |
| TCP RST flood | nft rate limiter | VPP packet filter/policer | Yes | Security | Preserve reset-flood detection |
| Fragment flood | nft fragment checks | VPP fragment/security policy | Yes/Partial | Security | Preserve malicious fragment handling; validate supported VPP primitive |
| NULL scan | TCP flag filter | VPP ACL/header filter | Yes | Security | Preserve drop |
| Xmas scan | TCP flag filter | VPP ACL/header filter | Yes | Security | Preserve drop |
| Port scan | dynamic per-source set | Security detection + VPP blocklist | Yes | Security Engine | Detection/correlation may be external; blocklist enforcement in VPP |
| SSH brute force | fail2ban reads auth logs, then nft set | Security Engine reads auth events, VPP blocklist | Yes | Security Engine | Do not detect brute force solely from TCP connection counts |
| DNS amplification | per-source UDP/53 rate limiter | VPP policer/rate limit + security state | Yes | Security Engine | Preserve threshold and whitelist semantics |
| UDP flood | per-source UDP rate limiter | VPP ingress/policer | Yes | Security | Preserve exclusions for legitimate service ports |
| ICMP flood | per-source echo rate limit | VPP ICMP policer | Yes | Security | Preserve normal monitoring pings while blocking excess |
| Security whitelist | nft IP set | VPP security bypass/allowlist | Yes | Security Policy | Explicitly model allowlist precedence |
| Dynamic blocklist timeouts | nft dynamic timeout sets | VPP blocklist TTL + Session/Security state | Yes/Partial | Security Engine | Preserve expiry and UI visibility |
| Security counters | nft counters | VPP ACL/policer counters + telemetry | Yes | Monitoring | Preserve real drop statistics |
| Security logs | nft log/syslog | structured security events | Partial | Observability | Preserve event semantics, not necessarily syslog implementation |
| L7 application classification | nDPI + conntrack labels | DPI Engine → application class → Policy Engine/VPP | Partial | DPI + Policy | Do not turn L7 intelligence into static ACLs |
| L7 QoS tiers | nft ct label → skb priority → TC PRIO | VPP classification + QoS scheduler | Yes/Partial | DPI + Policy | Preserve five-tier semantic model where enabled |
| Real-time tier | label bit 0 | VPP QoS class | Yes | Policy Engine | Preserve application-class priority |
| Interactive tier | label bit 1 | VPP QoS class | Yes | Policy Engine | Preserve |
| Streaming tier | label bit 2 | VPP QoS class | Yes | Policy Engine | Preserve |
| Bulk tier | label bit 3 | VPP QoS class | Yes | Policy Engine | Preserve |
| Penalty tier | label bit 4 | VPP QoS class | Yes | Policy Engine | Preserve |
| L7 fail-open | unclassified → priority 1 | policy-defined fallback class | Yes | Policy Engine | Preserve safe default; exact fallback configurable |
| L7 opt-in | `ENABLE_L7_SHAPING` | feature/license/property flag | No | Licensing/Policy | Preserve optional deployment behavior |
| Conntrack scale tuning | `nf_conntrack_max` | VPP/session/flow capacity configuration | No | Platform | Do not copy Linux sysctl blindly; benchmark VPP flow capacity |
| Flowtable optimization | intentionally disabled | VPP native fast path/worker architecture | Yes | VPP | Never reintroduce an optimization that bypasses subscriber policy |
| Per-user HTB | TC/IFB/mark classifier | VPP QoS/policer/scheduler | Yes | Policy Engine | This is a mandatory migration, not optional legacy compatibility |
| IFB upload/download | Linux virtual interfaces | VPP interface/queue/worker/QoS architecture | Yes | VPP | No IFB/IMQ in target gateway |
| Flower/fws classifier | TC classifier | VPP classification | Yes | VPP | Do not migrate TC syntax; migrate intent |
| Early WAN flood drop | nft `netdev` ingress | VPP interface ingress policer/filter | Yes | Security | Preserve pre-stack mitigation objective |
| Early SYN threshold | 5000/s per source | VPP ingress policer/detection | Yes | Security | Threshold must be configurable and benchmarked |
| Early UDP threshold | 2000/s per source | VPP ingress policer/detection | Yes | Security | Preserve service exclusions |
| Interface-specific early protection | one ingress hook per WAN NIC | VPP interface/worker policy | Yes | Security | Apply only to configured WAN interfaces |
| Ruleset persistence | `/etc/nftables/rules.nft` | PostgreSQL configuration + versioned runtime state | No | Config/State | VPP runtime state is reconstructed by Session/Policy/Gateway managers |

## 4. Legacy-to-target semantic translations

### 4.1 User IP is not the subscriber identity

The legacy implementation uses IP sets/maps because nftables needs a packet classification key. In the new architecture:

`Subscriber → Service → Session → IP/Prefix → Policy Binding → VPP runtime object`

The IP address remains a packet lookup key where useful, but it is not the authoritative business identity.

### 4.2 fwmark is not the target architecture

Legacy marks are implementation metadata. They must not become a new product-level concept.

The target should expose semantic objects such as:

- subscriber policy
- service policy
- security policy
- QoS profile
- NAT policy
- routing policy
- application class
- gateway selection

The VPP Adapter compiles those semantics into VPP-native state.

### 4.3 Dynamic nft sets become runtime state

Legacy dynamic sets such as `synflood`, `portscan`, `ssh_auth`, `dns_amp`, `ping_limit`, `udp_flood`, `rst_flood`, `synack_flood`, `frag_flood`, and `scanner_detect` represent runtime security state.

Target model:

`Security Engine detects → Security decision → VPP block/limit state → TTL/expiry → telemetry/audit`

The management UI must still be able to answer:

- who/what was blocked
- why
- when
- expiry
- rule/policy that caused it
- packet/drop counters

### 4.4 Accounting is not packet logging

The legacy script has accounting hooks. The target must preserve usage accounting without writing every packet to PostgreSQL.

Preferred model:

`VPP counters → periodic aggregation → Session Engine → durable usage records`

High-cardinality packet telemetry belongs in metrics/flow telemetry, not the transactional database.

### 4.5 DDoS protection is two-layer

The source contains both early ingress protection and later security-chain protection.

Target:

1. **VPP ingress protection** for cheap stateless/header-level drops.
2. **Security Engine** for detection, correlation, reputation, dynamic policy, and operator visibility.
3. **VPP enforcement** for resulting block/rate-limit policy.

## 5. Capabilities that must NOT be lost

The migration is incomplete if any of these disappear:

- default-deny gateway security
- interface-role-aware service exposure
- subscriber authorization
- subscriber upload/download accounting
- subscriber bandwidth/QoS enforcement
- NAT masquerade
- static SNAT
- per-WAN NAT selection
- multiple gateway/WAN routing behavior
- firewall/ACL policy
- captive portal steering
- content-filter steering
- IPv6 support
- DDoS protection
- scanner detection
- SSH brute-force protection
- DNS/ICMP/UDP flood protection
- dynamic security blocklists with expiry
- security counters and operator visibility
- HTTP browsing visibility where enabled
- TLS SNI visibility where enabled
- DNS query visibility where enabled
- L7 application classification where enabled
- application-aware QoS tiers where enabled
- safe fallback behavior when DPI is unavailable
- early WAN flood mitigation

## 6. Capabilities that must be intentionally removed from the new packet path

These are implementation mechanisms, not product features:

- nftables subscriber rules
- iptables rules
- ipset
- per-user nft chain generation
- tc HTB/PRIO as the subscriber enforcement plane
- IFB/IMQ subscriber shaping
- shell-script packet-path provisioning
- packet-path PostgreSQL queries
- packet-path REST calls
- `vppctl` as the normal runtime control API
- flowtable optimizations that bypass policy enforcement

## 7. Migration acceptance criteria

A migrated feature is accepted only when:

1. The business behavior is explicitly identified.
2. The target owner is identified.
3. The VPP capability or external-service dependency is identified.
4. Runtime state ownership is defined.
5. Failure behavior is defined.
6. Counters/telemetry are defined.
7. Audit behavior is defined where required.
8. A repeatable test exists.
9. No Linux firewall/QoS dependency remains in the subscriber packet path.
10. The feature survives Session Engine restart and VPP restart according to the recovery model.

## 8. Important source-specific decisions

### Flowtable
The legacy script explicitly disabled nftables flowtable because it bypassed per-user bandwidth marking and caused real-world policy bypass. The new VPP architecture must preserve this lesson: **never enable a fast path that bypasses policy/QoS state**.

### SSH brute force
The source explicitly moved away from connection-count detection because L3/L4 packet inspection cannot distinguish successful SSH authentication from failed authentication. The target must retain authentication-event-based detection.

### Security dynamic sets
The source uses separate tracker and visible blocklist sets to avoid showing every recent sender as a blocked attacker. The target must retain this semantic distinction even though the storage mechanism changes.

### L7 classification
The source deliberately separates classification, policy, and enforcement. The target must preserve the same separation:

`DPI classification → policy decision → VPP QoS enforcement`

not:

`DPI → hardcoded VPP ACL`

## 9. Final migration statement

The target CRYPTSK dataplane is a **VPP-native policy enforcement system**, not an nftables replacement script.

The legacy script defines the behavior that must remain. The new architecture defines the mechanism that should implement it.
