# 🚀 CRYPTSK Nexus — CI/CD Setup Guide

> **Sandbox → GitHub → Production (Rocky 10)** pipeline for the Cryptsk Nexus platform.
>
> This guide is structured for **AI-agent convenience**: scannable, recovery-flow-first,
> quick-reference-heavy. It is the authoritative CI/CD reference for the project.
>
> **Source of truth:** `github.com/chiranjitk/cryptsk-nexus` (branch `main`)

---

## 📋 Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Environments](#2-environments)
3. [The Hard Rule](#3-the-hard-rule--push-before-done)
4. [Standard Deploy Flow](#4-standard-deploy-flow)
5. [Sandbox Reset Recovery](#5-sandbox-reset-recovery--critical)
6. [Deploy Script (`scripts/deploy.mjs`)](#6-deploy-script-scriptsdeploymjs)
7. [Manual Deploy Steps](#7-manual-deploy-steps)
8. [Production Service Management](#8-production-service-management)
9. [Database Management](#9-database-management)
10. [Secrets Management](#10-secrets-management)
11. [Phase Alignment](#11-phase-alignment)
12. [Troubleshooting](#12-troubleshooting)
13. [Quick Reference Card](#13-quick-reference-card)

---

## 1. Architecture Overview

```
┌──────────────────────┐   git push    ┌──────────────────────┐   git pull    ┌──────────────────────┐
│   Z.ai Sandbox       │ ────────────► │     GitHub Repo      │ ────────────► │  Production Server    │
│   /home/z/my-project │               |  chiranjitk/cryptsk-  │               │  103.244.7.221:22222  │
│                      │               │  nexus  (source of   │               │  /opt/cryptsk-nexus   │
│   Next.js 16 dev     │               │   truth)             │               │  PM2 + Next.js prod   │
│   SQLite + Bun       │               │   branch: main       │               │  PostgreSQL 18.4      │
│   port 3000          │               └──────────────────────┘               │  port 3000 exposed    │
└──────────────────────┘                                ▲                       └──────────────────────┘
           ▲                                           │                                   ▲
           │                                           │                                   │
           └──────────── SSH deploy.mjs ───────────────┴───────────────────────────┘
                       (port 22222, root)
```

| Layer | Purpose | Constraint |
|---|---|---|
| **Sandbox** | Write code, iterate fast, lint, dev preview | 4 GB RAM, ephemeral filesystem, single exposed port 3000, no `bun run build` |
| **GitHub** | Version control, source of truth, CI runner | Private repo, branch `main` |
| **Production** | Run the actual app, real PostgreSQL, test with real traffic | 7.7 GB RAM, Rocky 10, SSH on port 22222 |

---

## 2. Environments

### 2.1 Sandbox (Z.ai)

| Property | Value |
|---|---|
| Project root | `/home/z/my-project` |
| Dev command | `bun run dev` (port 3000) |
| Framework | Next.js 16.x with App Router + React 19 + TypeScript 5 |
| Package manager | Bun |
| Database | SQLite (local dev only — per ADR-041) |
| Exposed port | 3000 (via Caddy gateway) |
| Other services | Reachable only via `?XTransformPort={Port}` relative paths |
| Persistence | ⚠️ **Ephemeral** — reset without warning |

### 2.2 GitHub (source of truth)

| Property | Value |
|---|---|
| Repo | `https://github.com/chiranjitk/cryptsk-nexus` |
| Branch | `main` |
| Visibility | Private |
| Git identity | `Cryptsk Dev Agent <chiranjitk@users.noreply.github.com>` |
| Credential helper | `store` → `/home/z/.git-credentials` (mode 600, outside repo) |

### 2.3 Production (Rocky 10)

| Property | Value |
|---|---|
| Host | `103.244.7.221` |
| SSH port | `22222` |
| SSH user | `root` |
| Project path | `/opt/cryptsk-nexus` |
| OS | Rocky Linux 10 |
| RAM | 7.7 GB |
| Node.js | v22 |
| Bun | v1.2.4 |
| Process manager | PM2 (Next.js plane) + systemd (gateway plane — Phase 3+) |
| PostgreSQL | 18.4 (`cryptsknexus` DB) |
| DB URL | `postgresql://cryptsknexus:CryptskNexus2026@localhost:5432/cryptsknexus` |
| Exposed port | 3000 |
| Public URL | `https://nexus.cryptsk.com` |

### 2.4 Default admin login

| Field | Value |
|---|---|
| Email | `admin@cryptsk.com` |
| Password | `Admin@2026` |

⚠️ Rotate this in Phase 1+ when secrets are migrated to `.env` (see §10).

---

## 3. The Hard Rule — Push Before "Done"

> **Every code change must be committed AND pushed to GitHub before declaring the work "done".**

This is non-negotiable. Sandbox resets happen without warning, and uncommitted work is lost forever.

### Pre-done checklist (run before saying "done")

```bash
# 1. Lint (must pass)
bun run lint

# 2. Stage everything
git add -A

# 3. Verify no secrets staged
git diff --cached --name-only | grep -iE "\.env|secret|password|token|credential|\.pem$" \
  && echo "ABORT: secret-named file staged" || echo "OK: no secrets staged"

# 4. Commit (conventional message)
git commit -m "feat/fix/chore(scope): description"

# 5. Push
git push origin main

# 6. Verify push
git ls-remote origin main   # HEAD should match local

# 7. Update worklog
# append entry to /home/z/my-project/worklog.md, then commit + push worklog too
```

### Commit cadence

- **Commit after every logical unit of work** (not just at end of session)
- One feature/fix = one commit (small, reviewable)
- Use conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`

---

## 4. Standard Deploy Flow

### Automated (from sandbox)

```bash
# From /home/z/my-project — full deploy:
bun run deploy

# This runs scripts/deploy.mjs which does all 6 steps:
#  1. git add -A && git commit && git push origin main
#  2. SSH to prod → cd /opt/cryptsk-nexus && git fetch --all && git reset --hard origin/main
#  3. SSH to prod → bun install
#  4. SSH to prod → NODE_OPTIONS="--max-old-space-size=2048" npx next build
#  5. SSH to prod → pm2 restart cryptsk-gateway
#  6. SSH to prod → curl http://localhost:3000 (verify 200)
```

### Prerequisites for the deploy script to work from sandbox

1. `ssh2` package installed → ✅ done (commit pending)
2. Outbound SSH from sandbox to `103.244.7.221:22222` must be allowed by sandbox firewall
3. PAT stored at `/home/z/.git-credentials` (survives until sandbox reset)

⚠️ **If outbound SSH is blocked**, use the manual flow below (§7) — push from sandbox,
SSH from your local machine, run `git pull && bun install && npx next build && pm2 restart`.

---

## 5. Sandbox Reset Recovery — CRITICAL

When the sandbox resets (random, unannounced), everything in `/home/z/my-project` and `/home/z`
is wiped. **Only what's on GitHub survives.** Here's the recovery flow.

### Step 1 — Re-establish git credentials

The PAT was wiped. Either:
- **(a)** Re-provide the PAT in chat (user pastes it, I store it), OR
- **(b)** User rotates the old PAT and provides a new one (recommended after each reset)

```bash
# I'll run this once PAT is re-provided:
git config --global user.name "Cryptsk Dev Agent"
git config --global user.email "chiranjitk@users.noreply.github.com"
git config --global init.defaultBranch main
git config --global pull.rebase false
git config --global credential.helper store
printf 'https://chiranjitk:NEW_PAT@github.com\n' > /home/z/.git-credentials
chmod 600 /home/z/.git-credentials
```

### Step 2 — Clone the repo back into the sandbox

```bash
cd /home/z
git clone https://github.com/chiranjitk/cryptsk-nexus.git my-project
cd my-project
```

If the sandbox pre-creates `/home/z/my-project` (Next.js skeleton), instead:
```bash
cd /home/z/my-project
git remote add origin https://github.com/chiranjitk/cryptsk-nexus.git
git fetch origin
git reset --hard origin/main   # may overwrite sandbox template; OK
```

### Step 3 — Reinstall dependencies

```bash
cd /home/z/my-project
bun install
```

### Step 4 — Restart the dev server

```bash
bun run dev
# Verify it's up at port 3000 (Preview Panel)
```

### Step 5 — Verify environment

```bash
git log --oneline -5          # latest commit should match what we last pushed
bun run lint                   # should pass
git status                     # should be clean
```

### Step 6 — Resume from worklog

```bash
cat /home/z/my-project/worklog.md | tail -50   # see what was last done
```

Then continue from where the last entry left off.

### Recovery script (TODO Phase 0+)

A `scripts/sandbox-resetup.sh` will be written in Phase 0 to automate steps 1-6
(except the PAT, which must be re-provided by user).

---

## 6. Deploy Script (`scripts/deploy.mjs`)

### 6.1 Commands

| Command | What it does |
|---|---|
| `bun run deploy` | Full deploy: commit + push → pull → install → build → restart → verify |
| `bun run deploy -- --no-push` | Skip git push (just pull + install + build + restart + verify) |
| `bun run deploy:status` | PM2 status + HTTP check + memory + disk + git log on prod |
| `bun run deploy:restart` | Just `pm2 restart cryptsk-gateway` + verify |
| `bun run deploy:logs` | Tail last 20 lines of PM2 logs |

### 6.2 Configuration (in `scripts/deploy.mjs`)

```javascript
const PROD = {
  host: process.env.PROD_HOST || '103.244.7.221',
  port: parseInt(process.env.PROD_SSH_PORT || '22222', 10),
  username: process.env.PROD_SSH_USER || 'root',
  password: process.env.PROD_SSH_PASS || 'CryptSK@123#$',
  readyTimeout: 30000,
};
const PROD_PROJECT_DIR = '/opt/cryptsk-nexus';
const SANDBOX_DIR = '/home/z/my-project';
const APP_PORT = 3000;
```

Already supports `process.env` overrides (Phase 1+ migration target). Currently
falls back to hardcoded values (Phase 0 — see §10).

### 6.3 Build memory note

Next.js build on prod needs `NODE_OPTIONS="--max-old-space-size=2048"` (or 4096)
because Rocky 10 has 7.7 GB RAM. Script already sets 2048; bump to 4096 if OOM.

---

## 7. Manual Deploy Steps

Use this if the deploy script fails or sandbox can't reach prod SSH.

### 7.1 From sandbox — commit + push

```bash
cd /home/z/my-project
git add -A
git commit -m "feat(scope): description"
git push origin main
```

### 7.2 On production server — pull + build + restart

```bash
# SSH in (from your local machine, since sandbox may not reach port 22222):
ssh -p 22222 root@103.244.7.221

# Pull latest
cd /opt/cryptsk-nexus
git fetch --all
git reset --hard origin/main

# Install deps
bun install

# Build (Next.js prod build — this is the prod build, sandbox forbids it but prod allows)
NODE_OPTIONS="--max-old-space-size=2048" npx next build

# Restart
pm2 restart cryptsk-gateway

# Verify (5s sleep for Next.js to be ready)
sleep 5
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/
# Should print: 200

# Check PM2 status
pm2 status
```

### 7.3 Verify from sandbox via agent-browser

```bash
agent-browser open https://nexus.cryptsk.com
agent-browser snapshot
```

---

## 8. Production Service Management

### 8.1 PM2 Services (Next.js plane — current)

PM2 manages the Next.js app and the legacy v7.0 mini-services:

| Service | Port | Purpose | Status |
|---|---|---|---|
| `cryptsk-gateway` | 3000 | Main Next.js OSS/BSS app | ✅ Active |
| `cryptsk-chat-service` | 3003 | Real-time chat (Socket.IO) | Legacy — will be migrated |
| `cryptsk-speedtest-service` | 3005 | Speed test WebSocket | Legacy — will be migrated |
| `cryptsk-network-monitor` | 3007 | Network monitoring | Legacy — will be migrated |
| `cryptsk-notification-service` | 3009 | Push notifications | Legacy — will be migrated |
| `cryptsk-billing-cron` | — | Billing cron jobs | Legacy — will be migrated |
| `cryptsk-radius-sync` | — | RADIUS sync service | Legacy — will be migrated |
| `cryptsk-mikrotik-service` | 3011 | MikroTik API | Legacy — will be migrated |
| `cryptsk-snmp-service` | 3013 | SNMP monitoring | Legacy — will be migrated |
| `cryptsk-tr069-service` | 3015 | TR-069 ACS | Legacy — will be migrated |
| `cryptsk-captive-portal` | 3017 | Captive portal | Legacy — will be migrated |
| `cryptsk-dhcp-service` | 3019 | DHCP management | Legacy — will be migrated |
| `cryptsk-dns-service` | 3021 | DNS management | Legacy — will be migrated |

**Note:** Port numbers above are the *current* prod values (legacy v7.0).
The Cryptsk Nexus design pack (04_FEATURE §8.2) specifies a *different* port scheme
for the new architecture (radius:3001, network-monitor:3002, whatsapp-bot:3003,
billing-cron:3004, gateway-service:3005, multiwan-monitor:3006, session-engine:3010,
snmp-service:3020, ips-daemon:3030, ndpi-service:3031, diameter-service:3870,
syslog-service:1514/UDP). **Target ports = spec; current ports = legacy.**
Migration happens phase-by-phase (see §11).

### 8.2 PM2 commands

```bash
pm2 status                          # list all services
pm2 restart cryptsk-gateway         # restart main app
pm2 restart cryptsk-chat-service    # restart specific service
pm2 logs cryptsk-gateway --lines 50 # tail logs
pm2 monit                           # live monitor
pm2 save                            # persist process list (survives reboot)
pm2 startup                         # auto-start on boot
pm2 delete cryptsk-gateway         # remove from PM2 (then re-add via ecosystem.config.cjs)
```

### 8.3 systemd Services (Gateway plane — Phase 3+ future)

Per spec (10_AI_AGENT §33, 02_GATEWAY §90), the gateway plane uses **systemd**, not PM2:
- `cryptsk-session-engine.service` (Go Session Engine)
- `cryptsk-freeradius.service` (FreeRADIUS 3.2.x)
- `cryptsk-vpp.service` (VPP dataplane)
- `cryptsk-policy-engine.service` (Policy → VPP compiler)

Unit files will live in `deploy/systemd/` and install via `install-rocky10.sh`.

### 8.4 Caddy Gateway (prod)

- Port 3000 is exposed externally
- Mini-services communicate internally via `?XTransformPort={Port}` query parameter
- Production Caddyfile lives in `deploy/caddy/Caddyfile` (Phase 0+)

---

## 9. Database Management

### 9.1 Prisma commands (run from sandbox for dev, from prod for prod)

```bash
bun run db:push       # push schema changes to DB (dev: SQLite, prod: PostgreSQL)
bun run db:generate   # regenerate Prisma Client
bun run db:migrate    # create + apply migration
bun run db:reset      # drop + recreate (DEV ONLY — never on prod)
```

### 9.2 Backup & restore (prod only)

```bash
# Backup
ssh -p 22222 root@103.244.7.221
pg_dump -U cryptsknexus -d cryptsknexus > backup_$(date +%Y%m%d).sql

# Restore
psql -U cryptsknexus -d cryptsknexus < backup_YYYYMMDD.sql
```

### 9.3 Connection check

```bash
ssh -p 22222 root@103.244.7.221
systemctl status postgresql
psql -U cryptsknexus -d cryptsknexus -c "SELECT 1"
cat /opt/cryptsk-nexus/.env   # verify DATABASE_URL is set
```

### 9.4 Database note per spec

- **Production:** PostgreSQL (ADR-004, ADR-041) ✅ already on prod
- **Dev (sandbox):** SQLite (ADR-041 explicitly permits for dev)
- **Redis:** Optional, not yet deployed (ADR-005 — never authoritative anyway)
- **FreeRADIUS native tables** (`radcheck/radreply/radusergroup/radgroupcheck/radgroupreply/radacct/radpostauth/nas`) + 5 reporting views + 8 DB functions: deferred to Phase 3 (AAA) — will live in `deploy/postgres/pgsql-production/complete-database.sql`

---

## 10. Secrets Management

### 10.1 Current State (Phase 0 — accepted risk)

The following secrets are **hardcoded in git history** (committed before this guide
was rewritten):

| Secret | Where it appears | Rotation priority |
|---|---|---|
| SSH root password `CryptSK@123#$` | `scripts/deploy.mjs` (now env-overridable, but fallback is hardcoded) | 🔴 High |
| PostgreSQL password `CryptskNexus2026` | `docs/CICD-GUIDE.md` §2.3 | 🔴 High |
| Default admin password `Admin@2026` | `docs/CICD-GUIDE.md` §2.4 | 🟠 Medium |
| GitHub PAT `PAT_ROTATED` | Shared in IM chat (not in repo) | 🔴 High |

### 10.2 Target State (Phase 1+)

All secrets read from `.env` (gitignored). The repo ships a `.env.example` (no real values)
and the deploy script + app read from `process.env`.

```bash
# .env (gitignored, on prod at /opt/cryptsk-nexus/.env)
PROD_HOST=103.244.7.221
PROD_SSH_PORT=22222
PROD_SSH_USER=root
PROD_SSH_PASS=<rotated-password>
DATABASE_URL=postgresql://cryptsknexus:<rotated-password>@localhost:5432/cryptsknexus
NEXTAUTH_SECRET=<openssl-rand-base64-32>
ADMIN_EMAIL=admin@cryptsk.com
ADMIN_PASSWORD=<rotated-password>
```

The deploy script already supports `process.env` overrides (see §6.2). Only the fallback
values need to be removed once `.env` is in place on prod.

### 10.3 Rotation plan

1. **Phase 1 (early):** Rotate all 4 secrets. Update prod `/opt/cryptsk-nexus/.env` with new values.
2. **Phase 1 (mid):** Remove hardcoded fallbacks from `scripts/deploy.mjs` (replace with
   `throw new Error('PROD_SSH_PASS not set')` if env missing).
3. **Phase 1 (late):** Add `.env.example` to repo. Document in this guide that `.env` must
   exist on prod.
4. **Ongoing:** Rotate GitHub PAT after each sandbox reset (since it's shared in chat).

---

## 11. Phase Alignment

Which CI/CD capabilities come online in which implementation phase (per
`docs/architecture/12_IMPLEMENTATION_PHASE_ROADMAP.md`):

| Phase | CI/CD capability added |
|---|---|
| **0** (current) | Repo structure, GitHub remote, deploy.mjs script, this guide, sandbox-resetup.sh |
| **1** | `.env`-based secrets, GitHub Actions CI workflow (lint + typecheck), branch protection, ecosystem.config.cjs for PM2 |
| **2** | DB migration runner on prod (Prisma migrate deploy), seed script |
| **3** | FreeRADIUS service unit, `radacct` migrations, RADIUS adapter healthcheck in deploy verify |
| **4** | `cryptsk-session-engine.service` systemd unit, Go binary build in deploy |
| **5** | Policy Engine compiler unit, policy → VPP config dry-run in CI |
| **6** | VPP + DPDK install via `install-rocky10.sh`, hugepages setup, NIC binding, `cryptsk-vpp.service` |
| **7** | Billing cron, payment webhook testing in CI, external adapter integration tests |
| **8** | Captive portal, DHCP/DNS service units, DPI/IPS healthchecks |
| **9** | AI advisor backfill, LLM cost monitoring, advisory-only guardrail tests |
| **10** | Load-test harness (10K → 25K → 50K → 75K → 100K), DR drills, backup/restore automation |

---

## 12. Troubleshooting

### Build fails on prod (OOM)

```bash
# Increase Node memory limit
NODE_OPTIONS="--max-old-space-size=4096" npx next build
# Or reduce to 2048 if 4096 is too much
NODE_OPTIONS="--max-old-space-size=2048" npx next build
```

### PM2 service not starting

```bash
pm2 logs cryptsk-gateway --err --lines 30   # check error logs
pm2 delete cryptsk-gateway                  # remove + re-add
pm2 start ecosystem.config.cjs
pm2 save
```

### Database connection error

```bash
systemctl status postgresql                 # check PG is running
psql -U cryptsknexus -d cryptsknexus -c "SELECT 1"
cat /opt/cryptsk-nexus/.env                 # check DATABASE_URL
```

### Sandbox codebase out of sync

```bash
cd /home/z/my-project
git fetch --all
git reset --hard origin/main
bun install
```

### Git push rejected (non-fast-forward)

```bash
git pull --rebase origin main
git push origin main
```

### CSS/HMR not updating in dev

```bash
rm -rf .next       # clear Next.js cache
bun run dev
```

### Sandbox can't reach prod SSH (port 22222 blocked)

If `bun run deploy` fails on the SSH step, the sandbox firewall is blocking outbound 22222.
Workaround: run the deploy script from your local machine instead:

```bash
# On your local machine:
git clone https://github.com/chiranjitk/cryptsk-nexus.git
cd cryptsk-nexus
bun install
node scripts/deploy.mjs --no-push   # skip push (you already pushed from sandbox)
```

---

## 13. Quick Reference Card

### One-liner deploy (from sandbox, if SSH works)
```bash
bun run deploy
```

### SSH to production
```bash
ssh -p 22222 root@103.244.7.221
```

### Check prod status
```bash
bun run deploy:status
```

### Standard git workflow (sandbox → GitHub → prod)
```bash
# Sandbox:
git add -A && git commit -m "feat(scope): description" && git push origin main
# Then either:
bun run deploy -- --no-push          # if sandbox SSH works
# OR log into prod and:
#   cd /opt/cryptsk-nexus && git pull && bun install && npx next build && pm2 restart cryptsk-gateway
```

### Sandbox reset recovery (5 commands)
```bash
# 1. (re-store PAT at /home/z/.git-credentials — needs user to provide new PAT)
# 2. clone
cd /home/z && git clone https://github.com/chiranjitk/cryptsk-nexus.git my-project
# 3. install
cd my-project && bun install
# 4. dev
bun run dev
# 5. resume from worklog
tail -50 worklog.md
```

### Verify deployment
```bash
# From sandbox via agent-browser:
agent-browser open https://nexus.cryptsk.com
agent-browser snapshot
# Or via curl on prod:
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/
```

### Key file locations

| File | Sandbox | Production |
|---|---|---|
| Project root | `/home/z/my-project` | `/opt/cryptsk-nexus` |
| Environment | `.env` (gitignored, sandbox may not have one yet) | `/opt/cryptsk-nexus/.env` |
| Deploy script | `scripts/deploy.mjs` | (run from sandbox or local, not from prod) |
| PM2 config | `ecosystem.config.cjs` (Phase 1) | `/opt/cryptsk-nexus/ecosystem.config.cjs` |
| Prisma schema | `prisma/schema.prisma` | same path on prod |
| Next.js config | `next.config.ts` | same path on prod |
| CI/CD guide | `docs/CICD-GUIDE.md` (this file) | same path on prod |
| Worklog | `worklog.md` | N/A (sandbox-only) |
| Architecture docs | `docs/architecture/*.md` (14 files) | same path on prod |

---

## 📝 Notes

- **Sandbox is ephemeral** — push to GitHub before declaring any work done (§3).
- **Test on production** using `https://nexus.cryptsk.com` via agent-browser.
- **PM2** manages the Next.js plane; **systemd** will manage the gateway plane (Phase 3+).
- **PostgreSQL** on prod has the full dataset; sandbox uses SQLite for local dev.
- **Deploy script** handles the full pipeline automatically — prefer it over manual steps.
- **Build can take 2-5 minutes** on prod due to Next.js compilation.
- **Spec deviations accepted** for Phase 0 (PM2 instead of systemd, legacy mini-service ports).
  These will be reconciled phase-by-phase per §11.

---

*Last updated: 2026-09-28 · CRYPTSK Nexus · Phase 0 (Architecture & Repository Foundation)*
