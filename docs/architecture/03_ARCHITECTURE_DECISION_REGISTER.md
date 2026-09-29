# CRYPTSK NEXUS — ARCHITECTURE DECISION REGISTER

**Status: LOCKED DESIGN BASELINE DECISIONS**

This register records binding decisions for the current product-design baseline. Decisions are cross-document constraints, not suggestions.

| ID | Decision | Authority |
|---|---|---|
| ADR-001 | Cryptsk has two major planes: OSS/BSS Management and Network/Gateway | Master |
| ADR-002 | There are exactly three deployment modes: AAA-only, Gateway-only, Multi-mode | Master |
| ADR-003 | One Session Engine is authoritative for live session lifecycle | Master + Gateway |
| ADR-004 | PostgreSQL is the production durable database | Master |
| ADR-005 | Redis is optional cache/coordination, not authoritative live session state | Master |
| ADR-006 | DPDK + VPP are the new gateway dataplane | Master + Gateway |
| ADR-007 | nftables/tc are not the primary new subscriber enforcement mechanism | Master + Gateway |
| ADR-008 | vppctl is not the normal runtime provisioning interface | Master + Gateway |
| ADR-009 | FreeRADIUS performs AAA, not packet processing | Master + Gateway |
| ADR-010 | OSS/BSS UI never becomes packet-processing path | Master |
| ADR-011 | 100K concurrent sessions is architectural target | Master |
| ADR-012 | 50K concurrent sessions is initial certification target | Master |
| ADR-013 | 50 Gbps is hardware-qualified, not an arbitrary software guarantee | Master + Gateway |
| ADR-014 | Management plane uses modular monolith + selective workers | OSS/BSS |
| ADR-015 | Gateway-native runtime components remain separately managed where required | Master + Gateway |
| ADR-016 | Subscriber is an ISP/network concept, not the universal customer abstraction | Master + OSS/BSS |
| ADR-017 | Live session state must not be stored only in PostgreSQL/Redis | Master + Gateway |
| ADR-018 | Session ACTIVE state is set only after required dataplane provisioning succeeds | Master + Gateway |
| ADR-019 | Session generation/epoch protects against stale event races | Gateway |
| ADR-020 | Production platform versions must be pinned in a tested BOM | Master + Gateway |
| ADR-021 | Public management APIs use versioned contracts; internal transport is an implementation detail | API |
| ADR-022 | Durable state change + event publication use a transactional outbox pattern or equivalent | API + Data |
| ADR-023 | Gateway control uses domain intent translated through a VPP Adapter; UI never builds VPP commands | API + Gateway |
| ADR-024 | Feature registry is the canonical metadata source for feature/module/navigation/permission traceability | Feature + UI |
| ADR-025 | The source feature-sheet named model groups reconcile to 204 listed models; the source enum heading reports 90 while the named enum list contains 99 unique entries, so enum reconciliation is mandatory before schema freeze | Data |
| ADR-026 | Dashboard visual identity and 40-widget inventory are preserved as product requirements | Feature + UI |
| ADR-027 | Security authorization is enforced server-side; UI visibility is never sufficient authorization | Security |
| ADR-028 | Metrics use bounded labels; high-cardinality identifiers belong in logs/traces/events | Observability |
| ADR-029 | Long-running operations use durable operation/job state and are observable/retriable | API + Operations |
| ADR-030 | AI is optional and cannot be a mandatory packet-path dependency | Master + AI |
| ADR-031 | The final product menu is industry-neutral; ISP concepts such as Areas/POPs/Zones/LCOs are optional Organization & Scope capabilities, not Universal Base | Menu + Master |
| ADR-032 | 24online reference modules are used for capability-parity checks, not 1:1 menu cloning | Menu + Feature |
| ADR-033 | Cache QoS is not a required Cryptsk capability and must not be added solely for legacy parity | Menu + Feature |
| ADR-034 | 24online Multi-Gateway Management is considered covered by Cryptsk Gateway Management + Multi-WAN architecture; no duplicate legacy menu is required | Gateway + Menu |
| ADR-035 | 24online Net Kapture is represented by Cryptsk NAT Logs / NAT translation logging and related session/IP correlation | Feature + Observability |
| ADR-036 | 24online Web Surfing Logger is represented by Cryptsk Web Browsing / HTTP Logs; it is distinct from NAT logs and DPI/application analytics | Feature + Observability |
| ADR-037 | Prepaid, postpaid, top-up, payment tracking, reconciliation, invoices, collections and tax are first-class commercial-engine capabilities; visibility is controlled by deployment/licensing | OSS/BSS + Menu |
| ADR-038 | Area/POP/Zone/LCO hierarchy may participate in package availability, pricing, collections, policy defaults and reporting only when Organization & Scope is enabled | OSS/BSS + Menu |

| ADR-039 | The architecture pack is now a LOCKED DESIGN BASELINE; post-lock scope or architecture changes require an ADR, authority-document updates, contract/test updates, and a versioned final pack | All |
| ADR-040 | The AI agent may identify gaps but must not silently add/remove/redefine product scope after lock | Agent + All |
| ADR-041 | Production deployments use PostgreSQL; SQLite is development/testing-only and never the production system of record | Master + OSS/BSS + Data |
| ADR-042 | The product name is locked as CRYPTSK Nexus; CRYPTSK identifies the company/brand and Nexus identifies the product | Master + All |

## Conflict rule

If implementation discovers a conflict not covered above:

```text
STOP
→ document the conflict
→ create ADR
→ update the relevant authority document
→ update affected contracts/tests
→ continue
```
