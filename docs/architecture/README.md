# CRYPTSK — Legacy Dataplane to VPP Migration Documents

## Purpose

This document pack is the functional migration handoff for the legacy `defaultchains_cryptsk.sh` dataplane configuration and the target CRYPTSK DPDK + VPP architecture.

The source script is **not** to be translated line-by-line into VPP commands. It is the authoritative functional reference for the packet-processing capabilities that the new dataplane must preserve.

## Source

- Source file: `defaultchains_cryptsk.sh`
- Source size: 73,459 bytes
- Source length: 1,183 lines
- Source role: legacy nftables gateway/firewall/NAT/QoS/classification/security configuration

## Documents

1. `13_LEGACY_DATAPLANE_TO_VPP_MIGRATION_MATRIX.md`
   - Functional inventory and target ownership for the legacy script.
2. `14_VPP_DATAPLANE_TARGET_SPECIFICATION.md`
   - Target architecture and implementation rules for the VPP dataplane.
3. `15_LEGACY_DATAPLANE_AGENT_EXECUTION_SPECIFICATION.md`
   - Exact instructions for the AI coding agent during migration and implementation.

## Core migration principle

**Preserve behavior, replace mechanism.**

Legacy:

`AAA / login scripts / nftables / ipset / conntrack / tc / IFB / nDPI / ulogd / e2guardian`

Target:

`AAA → Session Engine → Policy Engine → VPP Adapter → VPP/DPDK`

with specialized external services retained where packet forwarding is not their responsibility:

`DPI / content filtering / authentication-log analysis / observability / analytics`

## Non-negotiable rules

- Do not implement subscriber packet enforcement with nftables, iptables, tc, IFB, or IMQ in the new gateway dataplane.
- Do not create one VPP rule/process/queue/DB row per packet.
- Do not create one Linux firewall rule per subscriber.
- Do not make PostgreSQL part of the packet path.
- Do not make Next.js, Java, or REST APIs part of the packet path.
- Do not use `vppctl` for normal runtime subscriber provisioning; use VPP Binary API through GoVPP/VPP Adapter.
- VPP owns packet forwarding/enforcement state.
- Session Engine owns live subscriber/session lifecycle and identity.
- Policy Engine owns policy semantics and policy compilation.
- PostgreSQL owns durable configuration, commercial state, audit, history, and reporting data.
- Redis, if used, is cache/coordination only and never the authoritative live-session database.
- DDoS/security detection may be control-plane or specialized-service logic; VPP performs the packet-path enforcement that it can safely perform.
- DPI/content filtering remains an intelligence/service function; VPP provides steering/classification/enforcement hooks.
- Every migrated capability must have a functional acceptance test.

## Relationship to the main architecture pack

These documents are an extension of the CRYPTSK product architecture pack. They do not replace the master architecture, feature catalogue, API contract, database specification, UI/UX specification, security specification, or observability specification.

Where this migration pack and an older implementation detail conflict, the **target architecture wins** while the legacy behavior is preserved as the functional requirement.
