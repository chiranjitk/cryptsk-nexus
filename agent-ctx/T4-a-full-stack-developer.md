# T4-a — full-stack-developer (backend) — Monitoring & Diagnostics backend

Task: schema (3 models), 7 API routes, syslog UDP listener mini-service, permissions/module activation.

## Files created
- `prisma/seed-monitoring.ts` — one-off idempotent permission seed + live module flip + verification
- `src/lib/monitoring.ts` — shared probes (HTTP health w/ AbortController, DNS resolver 127.0.0.1), probe persistence (60s dedup + 24h prune), RFC3164/5424 tolerant parser, SEVERITY_LABELS
- `src/app/api/monitoring/overview/route.ts`
- `src/app/api/monitoring/bandwidth/route.ts`
- `src/app/api/monitoring/traffic/route.ts`
- `src/app/api/monitoring/alerts/route.ts` (GET sync-and-return)
- `src/app/api/monitoring/alerts/[id]/route.ts` (PATCH ack/un-ack)
- `src/app/api/monitoring/diagnostics/route.ts` (POST dns/tcp/http)
- `src/app/api/monitoring/probes/route.ts`
- `src/app/api/monitoring/syslog/route.ts` (GET list + POST ingest JSON/text-plain)
- `mini-services/syslog-listener/{index.ts,package.json,README.md}` — UDP :30514, batch insert 2s/50msgs

## Files edited
- `prisma/schema.prisma` — +SyslogEntry, +MonitoringAlert, +ServiceProbeLog (Phase 10 section)
- `prisma/seed.ts` — RESOURCES += "monitoring"; Monitoring module status → "active"

## Contracts (frontend depends on)
- RBAC: read endpoints `monitoring.list`; mutations (alerts PATCH, diagnostics POST, syslog POST) `monitoring.update`. All mutations audit-logged (resource "monitoring"/"syslog").
- `GET /api/monitoring/overview` → `{dbLatencyMs, services:[{key,label,status,latencyMs,detail}] (postgresql/sessionEngine/vppAdapter/dnsResolver), nas:{total,up,down}, sessions:{active,today}, auth:{accepts24h,rejects24h,rejectRatePct}, traffic:{inBytes,outBytes}, syslog:{last24h,errOrWorse1h,lastAt}, alerts:{critical,warning,info,active}}`
- `GET /api/monitoring/bandwidth?hours=24|72|168` → `{series:[{hour,inBytes,outBytes,sessions}], perNas:[{nasId,nasName,inBytes,outBytes,sessions}], perPlan:[{planId,planName,inBytes,outBytes}], totals:{inBytes,outBytes,sessions}}`
- `GET /api/monitoring/traffic?limit&hours` → `{topTalkers:[{username,displayName,planName,inBytes,outBytes,totalBytes,sessions,lastSeen}], totals:{inBytes,outBytes,sessions,distinctUsers}}`
- `GET /api/monitoring/alerts` → `{alerts:[{id(str),alertKey,severity,title,detail,source,isAcknowledged,acknowledgedBy,acknowledgedAt,firstSeenAt,lastSeenAt,resolvedAt,isRecentlyResolved}], counts:{critical,warning,info,active}}` — SYNC-AND-RETURN: 8 real conditions upserted by stable alertKey (overdue-invoices, nas-down, auth-reject-rate, critical-tickets, out-of-stock, low-stock, expiring-plans, vpp-adapter-down); cleared → resolvedAt=now; recently-resolved (1h) included flagged.
- `PATCH /api/monitoring/alerts/[id]` `{isAcknowledged:bool}` → `{alert}` (ack stamps session email; 404/400 handled)
- `POST /api/monitoring/diagnostics` `{tool:dns|tcp|http, target, port?, recordType?}` → `{tool,target,ok,latencyMs,result?,error?,checkedAt}`; logs `service_probe_logs` `diagnostic:<tool>`; audit "execute"
- `GET /api/monitoring/probes?hours&service` → `{probes:[{id(str),service,status,latencyMs,detail,checkedAt}]}` max 200
- `GET /api/monitoring/syslog?severity&search&hours&limit` → `{entries:[{id(str),facility,severity,severityLabel,tag,host,sourceIp,message,receivedAt}], counts:{emerg..debug}, total}`
- `POST /api/monitoring/syslog` JSON `{message,host?,tag?,facility?,severity?}` OR `text/plain` raw lines → 201 `{ingested:N}`

## Decisions / notes for integrator
- Per-plan join: radacct."planId" (session-engine stamped) LEFT JOIN, fallback username→subscribers.radiusUsername→subscribers.planId (COALESCE dual join, documented in code). Sessions bucketed by acctstarttime (dashboard pattern).
- Service probe semantics: 2xx fast=up, 2xx slow(≥1s)=degraded, non-2xx/network error/timeout=down. VPP 502/down is expected in sandbox — still real.
- Probe rows deduped per service (60s) to survive 30s UI polling; pruned >24h.
- BigInt ids serialized to string in all responses; byte sums via Prisma aggregate/raw SUM + Number().
- **Permissions snapshot**: auth.ts JWT snapshots token.permissions at login. Super Administrator bypasses (rbac.ts + canClient) so admin needs NO re-login; non-super roles (e.g. auditor now has monitoring.list) MUST re-login to pick up monitoring.*.
- Dev server was DOWN on arrival (nothing on :3000) — per constraints did NOT restart; HTTP smoke pending orchestrator restart. Verified instead: db:push+generate ✓, 3-table round-trip ✓ (cleanup 0 rows), all raw SQL ran on live PG18 ✓, parser edge cases ✓, lint ✓, tsc 0 errors in my files (pre-existing 64 elsewhere untouched).
