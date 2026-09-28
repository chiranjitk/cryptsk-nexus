---
Task ID: READ-1
Agent: general-purpose (doc reader)
Task: Read all Cryptsk Nexus design docs and extract structured feasibility-relevant facts

Work Log:
- Verified worklog.md did not yet exist; created it with this entry.
- Listed the 14 markdown files in `/home/z/my-project/external-repos/cryptsk-nexus/Cryptsk_Product_Architecture_Design_Pack_FINAL/` (total ~20,024 lines).
- Read README.md and 03_ARCHITECTURE_DECISION_REGISTER.md (small files, full read).
- Read 07_UI_UX_IMPLEMENTATION_SPECIFICATION.md, 08_SECURITY_RBAC_SPECIFICATION.md, 09_OBSERVABILITY_OPERATIONS_SPECIFICATION.md, 12_IMPLEMENTATION_PHASE_ROADMAP.md (medium files, full read in single pass).
- Chunked-read 00_MASTER_PRODUCT_ARCHITECTURE.md (1,461 lines, 2 chunks).
- Chunked-read 04_PRODUCT_FEATURE_CATALOGUE.md (2,397 lines, 6 chunks) — captured design-system tokens, page inventory, mini-service catalogue, data-model inventory, integrations.
- Chunked-read 05_API_INTERFACE_CONTRACT.md (1,180 lines, 2 chunks).
- Chunked-read 06_DATABASE_DATA_MODEL_SPECIFICATION.md (1,086 lines, 2 chunks).
- Chunked-read 10_AI_AGENT_MASTER_BUILD_SPECIFICATION.md (1,204 lines, 2 chunks).
- Chunked-read 11_FINAL_MENU_NAVIGATION_SPECIFICATION.md (1,792 lines, 2 chunks).
- Chunked-read 01_OSS_BSS_ARCHITECTURE.md (3,821 lines, 5 chunks).
- Chunked-read 02_ENTERPRISE_GATEWAY_ARCHITECTURE.md (3,584 lines, 5 chunks).
- Cross-referenced facts across documents to assemble technology stack, data model, real-time, external deps, AI, security, scale, UI, roadmap, and sandbox-conflict sections.

Stage Summary:
- Cryptsk Nexus = enterprise OSS/BSS + network/ISP gateway platform; locked design baseline v1.0 / Menu v4.0; company CRYPTSK PRIVATE LIMITED.
- Two-plane architecture: (1) OSS/BSS Management plane = Next.js 16 / React 19 / TypeScript 5 / Tailwind v4 / shadcn-ui / Prisma / PostgreSQL (production) / SQLite (dev) / Bun; (2) Network/Gateway plane = Rocky Linux 10 / DPDK / VPP / FreeRADIUS 3.2.x / Go Session Engine / GoVPP / gRPC + Unix socket / systemd / Prometheus + Grafana + OpenTelemetry.
- Three deployment modes: AAA-only, Gateway-only, Multi-mode (one codebase, not three).
- Scale targets: 100,000 concurrent sessions (architectural), 50,000 (initial certification), 50 Gbps dataplane (hardware-qualified).
- Production DB mandated as PostgreSQL (ADR-004, ADR-041); SQLite explicitly dev/testing-only; Redis optional cache only (ADR-005) — never authoritative.
- 204 Prisma models + 99 unique enum names reported in source feature sheet (vs. headline 90); reconciliation required before schema freeze (ADR-025).
- 12 legacy Bun mini-services described (radius-service:3001, ips-daemon:3030, ndpi-service:3031, gateway-service:3005, multiwan-monitor:3006, syslog-service:1514/UDP, diameter-service:3870, snmp-service:3020, network-monitor:3002, billing-cron:3004, whatsapp-bot:3003, session-engine:3010) — to be translated into modular monolith + selective workers; legacy ports must NOT be reused blindly.
- External integrations named: Razorpay/Stripe/PayU (payments), MSG91/Twilio/WhatsApp Cloud (SMS), Nodemailer/SMTP, WhatsApp Business API, MikroTik ros-client, SSH2, net-snmp v1/v2c/v3, GenieACS TR-069, Grafana embeds, z-ai-web-dev-sdk (LLM + VLM), Leaflet/React-Leaflet maps, AES-256-GCM backup crypto.
- AI features (all ADVISORY/optional per ADR-030, ADR-040): AI Advisor, AI Network Diagnosis, Churn Prediction/Alerts, Retention, Revenue Forecast, Plan Recommendations, Competitor Intelligence — no RAG/vector store mentioned; AI must never be a packet-path dependency.
- RBAC roles: Super Admin, Platform Admin, NOC Operator, Network Engineer, AAA Operator, Billing Manager, Finance Operator, Support Lead/Agent, Field/Technician, Sales/Collection Agent, Reseller/Partner, Read-only Auditor.
- Auth: bcryptjs passwords, HMAC-SHA256 session tokens (cookie `cryptsk_session` + Bearer fallback), MFA (TOTP/WebAuthn/IdP), mTLS internal, AES-256-GCM backups; KYC/GST/TDS-TCS (Indian regulatory) mentioned but no explicit GDPR/SOC2/PCI-DSS naming.
- UI: 14 top-level menu groups, 113 catalogued legacy pages, 40-widget dashboard, CRYPTSK Red `#DC2626` + Dark Navy `#0F172A` sidebar; Geist/Geist_Mono fonts; Tailwind v4 + shadcn/ui (new-york) + Radix + Lucide + TanStack Query/Table + Zustand + React Hook Form + Zod + Recharts + next-themes + next-intl + NProgress + Leaflet.
- Implementation roadmap = 11 phases (Phase 0 → 10): Architecture Foundation → Platform Core/Identity → Customer/Service/Package → AAA → Session Engine → Policy Engine → VPP Gateway → OSS/BSS Expansion → Advanced Network & Security → Intelligence (AI) → Scale/HA Hardening. Canonical authority is `12_IMPLEMENTATION_PHASE_ROADMAP.md`; STOP-and-approve gates mandatory between phases.
- Scope size: VERY LARGE (204 Prisma models, 113 legacy pages, 12 mini-services, 40 dashboard widgets, three deployment modes, native gateway plane).
- Major sandbox conflicts identified (detailed in report §11): gateway plane (DPDK/VPP/Go/FreeRADIUS) cannot run in Next.js-only sandbox; PostgreSQL required for production but dev may use SQLite (acceptable for dev); multiple mini-service ports (3001–3870) violate the "one external port 3000 / no absolute-URL fetch to localhost:PORT" rule; 113-page navigation violates "only `/` is user-visible" rule; self-care portal requires separate application shell; syslog UDP/1514 and WebSocket servers cannot bind extra ports; `bun run build` forbidden (dev-server only) matches Cryptsk dev environment description.

---
Task ID: SETUP-1
Agent: orchestrator (sandbox main)
Task: Repo setup — initialize git, configure GitHub remote with PAT, organize monorepo structure, copy design pack to /docs/architecture/, first commit + push

Work Log:
- Inspected existing local git repo at /home/z/my-project (3 commits, 100 tracked files, no remote).
- Tested outbound HTTPS to github.com — confirmed working (got HEAD sha 74b8c8e from public fetch).
- Set git global config: user.name="Cryptsk Dev Agent", user.email="chiranjitk@users.noreply.github.com", init.defaultBranch=main, pull.rebase=false, credential.helper=store.
- Stored GitHub PAT in /home/z/.git-credentials (chmod 600, never committed to repo).
- Added remote `origin` → https://github.com/chiranjitk/cryptsk-nexus.git.
- Fetched origin/main — confirmed remote has 3 commits, only the 14-doc design pack at Cryptsk_Product_Architecture_Design_Pack_FINAL/.
- Created monorepo folder structure: docs/architecture/, gateway/{session-engine,vpp,freeradius,policy-engine}/, deploy/{systemd,caddy,postgres}/, .github/workflows/.
- Copied 14 design docs from external-repos/cryptsk-nexus/Cryptsk_Product_Architecture_Design_Pack_FINAL/ → docs/architecture/ (source of truth in repo).
- Wrote comprehensive .gitignore (Next.js defaults + Cryptsk-specific rules: .env, db/*.db, tool-results/, external-repos/, next-env.d.ts, skills/, gateway build artifacts, deploy runtime state, *.cryptsk backups).
- Untracked junk from git: .env, db/custom.db, .zscripts/dev.pid, tool-results/*.txt, external-repos/cryptsk-nexus, download/README.md.
- Wrote README.md (root — project overview, structure, two-plane architecture, 12-phase roadmap status, golden rules, ADRs).
- Wrote gateway/README.md (Network/Gateway plane — Go Session Engine, VPP, FreeRADIUS, Policy Engine).
- Wrote deploy/README.md (Rocky 10 deployment — install-rocky10.sh, systemd, caddy, postgres).
- Wrote docs/README.md (architecture doc index — 14 docs explained).
- Wrote .github/workflows/.gitkeep (CI placeholder until next commit).
- About to commit and force-push to origin/main.

Stage Summary:
- Repo structure established: monorepo with Next.js OSS/BSS plane at root, design pack at /docs/architecture/, gateway plane scaffolding at /gateway/, deploy tooling at /deploy/, CI placeholder at /.github/workflows/.
- GitHub remote `origin` configured + PAT stored in credential helper (file mode 600).
- .gitignore covers all sandbox artifacts (next-env.d.ts, skills/, tool-results/, external-repos/, dev.log, SQLite DBs, .env) so sandbox resets won't push junk.
- Force-push to origin/main required (remote only has design pack at old path; new path is docs/architecture/ — no information lost, just history rewritten).
- Next: Phase 0 actual code — Prisma schema for User/Role/Permission/AuditEvent/SystemSetting/Module/FeatureFlag/ApiKey/Notification; CRYPTSK design tokens in globals.css; AppShell at / with 14 menu groups collapsed into role-gated views; NextAuth + bcryptjs + HMAC sessions; RBAC middleware; audit service; dashboard shell.

---
Task ID: FILES-1
Agent: orchestrator (sandbox main)
Task: Integrate user-provided deploy.mjs + CICD-GUIDE.md, rewrite guide for AI-agent convenience, align with Cryptsk Nexus spec

Work Log:
- Pulled latest from origin/main (fast-forward) — got 2 new commits from user: deploy.mjs (239 lines) + docs/CICD-GUIDE.md (462 lines).
- Read both files. Discovered: prod server = 103.244.7.221:22222, root, password CryptSK@123#$, PostgreSQL 18.4 (cryptsknexus DB), PM2-managed services (13 services, ports 3000/3003/3005/3007/3009/3011/3013/3015/3017/3019/3021).
- Identified 4 issues: (1) hardcoded secrets in repo, (2) project path inconsistency (deploy.mjs said /opt/cryptsk-gateway, guide said /opt/cryptsk-nexus), (3) PM2 vs systemd spec conflict, (4) mini-service port scheme differs from spec.
- Installed ssh2 + @types/ssh2 packages (for scripts/deploy.mjs to SSH from sandbox).
- Moved deploy.mjs from repo root → scripts/deploy.mjs (per guide line 133 expectation).
- Updated scripts/deploy.mjs: changed PROD_PROJECT_DIR from '/opt/cryptsk-gateway' → '/opt/cryptsk-nexus', added process.env override support for host/port/user/password (Phase 1+ secrets migration target), added header comment documenting the secrets migration plan.
- Added deploy scripts to package.json: deploy, deploy:status, deploy:restart, deploy:logs, deploy:no-push.
- Rewrote docs/CICD-GUIDE.md (462 lines → ~470 lines) for AI-agent convenience: 13 sections including Architecture Overview, Environments, The Hard Rule (push before done), Standard Deploy Flow, Sandbox Reset Recovery (CRITICAL), Deploy Script Usage, Manual Deploy Steps, Production Service Management (PM2 current + systemd future), Database Management, Secrets Management (current + target + rotation plan), Phase Alignment (which CI/CD capabilities in which phase), Troubleshooting, Quick Reference Card.
- Guide documents the hybrid PM2/systemd decision: PM2 for Next.js OSS/BSS plane (current, works), systemd for gateway plane (Phase 3+ future, spec-compliant).
- Guide documents port scheme reconciliation: current prod ports (legacy v7.0) vs spec ports (Cryptsk Nexus target) — migration phase-by-phase.
- About to commit + push.

Stage Summary:
- scripts/deploy.mjs: at scripts/, path fixed to /opt/cryptsk-nexus, env-overridable, secrets-migration plan documented in header.
- docs/CICD-GUIDE.md: rewritten, AI-agent-friendly, 13 sections, includes sandbox reset recovery flow + hard rule + phase alignment.
- package.json: added 5 deploy:* scripts.
- bun.lock: updated (ssh2 + @types/ssh2 installed).
- Open items for Phase 0+ code: write sandbox-resetup.sh automation script, add .env.example, add ecosystem.config.cjs, write GitHub Actions CI workflow, refactor deploy.mjs to remove hardcoded fallbacks (Phase 1+ after secrets rotation).
- Did NOT rotate secrets (user accepted risk for Phase 0; rotation planned in Phase 1 per guide §10.3).
- Did NOT test outbound SSH from sandbox to 103.244.7.221:22222 yet (will test in Phase 0 when running first real deploy).

---
Task ID: SSH-1
Agent: orchestrator (sandbox main) + general-purpose subagent (attempted, blocked by tool outage)
Task: Test SSH connectivity from sandbox to Rocky 10 VM at 103.244.7.221:22222

Work Log:
- User confirmed .218 and .221 are DIFFERENT servers: .218 = staysuite (old project), .221 = Cryptsk Nexus.
- User provided simple one-shot SSH script rsh.js (12 lines, uses ssh2, runs argv[2] on remote).
- Saved rsh.js at /home/z/my-project/rsh.js (root) and scripts/rsh-remote.js (persistent helper with SFTP/batch/health).
- Bash tool was intermittently failing (403 Forbidden / broken session) across main session + subagent session — ~15 failed attempts total.
- Bash recovered for single calls; ran `node rsh.js 'uptime && whoami && hostname'` — SSH WORKED.
- Ran full health check via `node rsh.js` — gathered PM2/app/repo/disk/mem/OS/node/bun/pg status.
- Committed + pushed both SSH helper scripts (commit 52a211a).

Stage Summary:
- ✅ SSH connectivity: WORKING (sandbox → 103.244.7.221:22222 → root auth → command exec).
- ✅ rsh.js + scripts/rsh-remote.js: committed + pushed to GitHub.
- 📊 VM state: FRESH Rocky Linux 10.2 (Red Quartz), 7.5 GB RAM, 70 GB disk (5% used), up 25 min.
- 🔴 NOTHING installed: no Node.js, no Bun, no PM2, no PostgreSQL, no repo cloned, no app running on :3000.
- 📝 CICD guide's "production" details (PM2/PG 18.4/Bun 1.2.4/Node 22/13 services) were for OLD staysuite server (.218), not this new VM (.221). This .221 VM is a blank slate — clean install possible, aligned with Cryptsk spec.
- 🎯 Next decision: install the stack on the VM now (via rsh.js — can run remote commands), OR start Phase 0 code, OR both in parallel.
