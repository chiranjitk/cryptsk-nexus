# 🚀 CRYPTSK Intelligent ISP Platform — CI/CD Setup Guide

> **Complete guide for deploying code from Z.ai Sandbox → GitHub → Production Server**

---

## 📋 Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Environment Details](#environment-details)
4. [CI/CD Pipeline Flow](#cicd-pipeline-flow)
5. [Deploy Script Usage](#deploy-script-usage)
6. [Manual Deploy Steps](#manual-deploy-steps)
7. [Production Server Management](#production-server-management)
8. [Database Management](#database-management)
9. [Troubleshooting](#troubleshooting)
10. [Quick Reference](#quick-reference)

---

## Architecture Overview

```
┌──────────────────┐     git push      ┌──────────────────┐     git pull      ┌──────────────────┐
│   Z.ai Sandbox   │ ──────────────► │    GitHub Repo   │ ──────────────► │  Prod Server     │
│  (Code Editor)   │                  │  (Source of Truth)│                 │  (103.244.7.221) │
│  /home/z/my-project│                │                  │                 │  /opt/cryptsk-gateway│
└──────────────────┘                  └──────────────────┘                 └──────────────────┘
       │                                                                        │
       │  bun run dev (port 3000)                                              │  PM2 → Next.js (port 3000)
       │  Limited: 4GB RAM                                                     │  7.7GB RAM, PostgreSQL
       └────────────────────────────────────────────────────────────────────────┘
                            Test via: http://103.244.7.221:3000
```

### Why This Architecture?

| Component | Purpose | Limitation |
|-----------|---------|------------|
| **Z.ai Sandbox** | Write code, iterate fast | 4GB RAM limit, ephemeral filesystem |
| **GitHub** | Version control, source of truth | — |
| **Production Server** | Run the actual app, test with real DB | Remote access only via SSH |

---

## Environment Details

### Sandbox (Z.ai)

| Property | Value |
|----------|-------|
| **Project Path** | `/home/z/my-project` |
| **Dev Command** | `bun run dev` (port 3000) |
| **Framework** | Next.js 16 with App Router |
| **Package Manager** | Bun |
| **Database** | SQLite (local dev only, limited) |

### Production Server

| Property | Value |
|----------|-------|
| **Host** | `103.244.7.221` |
| **SSH Port** | `22222` |
| **SSH User** | `root` |
| **SSH Password** | `CryptSK@123#$` |
| **Project Path** | `/opt/cryptsk-nexus` |
| **RAM** | 7.7 GB |
| **OS** | Rocky 10 |
| **Node.js** | v22 |
| **Bun** | v1.2.4 |
| **PM2** | Process manager for all services |
| **Database** | PostgreSQL 18.4 |
| **DB Name** | `cryptsknexus` |
| **DB User** | `cryptsknexus` |
| **DB Password** | `CryptskNexus2026` |
| **DB URL** | `postgresql://cryptsknexus:CryptskNexus2026@localhost:5432/cryptsknexus` |

### GitHub Repository

| Property | Value |
|----------|-------|
| **Repo** | `git clone https://github.com/chiranjitk/cryptsk-nexus.git` |
| **Branch** | `main` |
| **Visibility** | Private |

---



### 7. Sync Sandbox Codebase from GitHub

If the sandbox codebase is out of sync:

```bash
cd /home/z/my-project
git fetch --all
git reset --hard origin/main
bun install
```

---

## CI/CD Pipeline Flow

### Standard Deploy Flow

```
1. Write code in sandbox
2. Test locally (bun run dev)
3. Run deploy script →
   a. git add -A && git commit && git push origin main
   b. SSH to prod → git fetch && git reset --hard origin/main
   c. SSH to prod → bun install
   d. SSH to prod → next build
   e. SSH to prod → pm2 restart cryptsk-gateway
   f. SSH to prod → curl http://localhost:3000 (verify)
4. Test on production: http://103.244.7.221:3000
```

### Recovery Flow (if sandbox is reset)

```
1. git fetch --all
2. git reset --hard origin/main
3. bun install
4. Continue development
```

---

## Deploy Script Usage

The deploy script is at `scripts/deploy.mjs`. It uses the `ssh2` npm package for SSH connections.

### Commands

```bash
# Full deploy: commit → push → pull → install → build → restart → verify
node scripts/deploy.mjs

# Skip git push (just pull + restart on server)
node scripts/deploy.mjs --no-push

# Check server status only
node scripts/deploy.mjs --status

# Just restart the dev server on prod
node scripts/deploy.mjs --restart

# Tail PM2 logs from prod
node scripts/deploy.mjs --logs
```

### What Each Command Does

| Command | Steps Executed |
|---------|---------------|
| `node scripts/deploy.mjs` | git commit + push → git pull → bun install → next build → pm2 restart → verify |
| `--no-push` | git pull → bun install → next build → pm2 restart → verify |
| `--status` | PM2 status + HTTP check + memory + disk + git log |
| `--restart` | pm2 restart → verify |
| `--logs` | pm2 logs (last 20 lines) |

### Configuration in deploy.mjs

```javascript
const PROD = {
  host: '103.244.7.221',
  port: 22222,
  username: 'root',
  password: 'CryptSK@123#$',
  readyTimeout: 30000,
};
const PROD_PROJECT_DIR = '/opt/cryptsk-gateway';
const SANDBOX_DIR = '/home/z/my-project';
```

---

## Manual Deploy Steps

If the deploy script fails, you can deploy manually:

### From Sandbox

```bash
# 1. Commit and push
cd /home/z/my-project
git add -A
git commit -m "fix: description of change"
git push origin main
```

### On Production Server

```bash
# SSH into production
ssh -p 22222 root@103.244.7.221

# 2. Pull latest code
cd /opt/cryptsk-gateway
git fetch --all
git reset --hard origin/main

# 3. Install dependencies
bun install

# 4. Build
NODE_OPTIONS="--max-old-space-size=2048" npx next build

# 5. Restart
pm2 restart cryptsk-gateway

# 6. Verify
sleep 5
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/
# Should return: 200

# 7. Check PM2 status
pm2 status
```

---

## Production Server Management

### PM2 Services

The platform runs multiple services managed by PM2:

```bash
# List all services
pm2 status

# Restart main app
pm2 restart cryptsk-gateway

# Restart specific mini-service
pm2 restart cryptsk-chat-service
pm2 restart cryptsk-speedtest-service

# View logs
pm2 logs cryptsk-gateway --lines 50

# Monitor
pm2 monit

# Save process list (survives reboot)
pm2 save

# Auto-start on boot
pm2 startup
```

### Service Architecture

| Service | Port | Purpose |
|---------|------|---------|
| **cryptsk-gateway** | 3000 | Main Next.js application |
| **cryptsk-chat-service** | 3003 | Real-time chat (Socket.IO) |
| **cryptsk-speedtest-service** | 3005 | Speed test WebSocket |
| **cryptsk-network-monitor** | 3007 | Network monitoring |
| **cryptsk-notification-service** | 3009 | Push notifications |
| **cryptsk-billing-cron** | — | Billing cron jobs |
| **cryptsk-radius-sync** | — | RADIUS sync service |
| **cryptsk-mikrotik-service** | 3011 | MikroTik API service |
| **cryptsk-snmp-service** | 3013 | SNMP monitoring |
| **cryptsk-tr069-service** | 3015 | TR-069 ACS |
| **cryptsk-captive-portal** | 3017 | Captive portal |
| **cryptsk-dhcp-service** | 3019 | DHCP management |
| **cryptsk-dns-service** | 3021 | DNS management |

### Caddy Gateway

The Caddy reverse proxy routes external traffic:

- Port 3000 is exposed externally
- Mini-services communicate internally
- API requests to mini-services use `?XTransformPort=<port>` query parameter

---

## Database Management

### Prisma Commands

```bash
# Push schema changes to database
bun run db:push

# Generate Prisma Client
bun run db:generate

# Run migrations
bun run db:migrate

# Seed database
bun run seed
```

### Backup & Restore

```bash
# Backup
pg_dump -U cryptsk -d cryptskdb > backup_$(date +%Y%m%d).sql

# Restore
psql -U cryptsk -d cryptskdb < backup_20250908.sql
```

### Default Admin Login

| Field | Value |
|-------|-------|
| **Email** | `admin@cryptsk.com` |
| **Password** | `Admin@2026` |

---

## Troubleshooting

### Issue: Build Fails on Production (OOM)

```bash
# Increase Node memory limit
NODE_OPTIONS="--max-old-space-size=4096" npx next build

# Or reduce to 2048 if 4096 is too much
NODE_OPTIONS="--max-old-space-size=2048" npx next build
```

### Issue: PM2 Service Not Starting

```bash
# Check error logs
pm2 logs cryptsk-gateway --err --lines 30

# Delete and restart
pm2 delete cryptsk-gateway
pm2 start ecosystem.config.cjs
pm2 save
```

### Issue: Database Connection Error

```bash
# Check PostgreSQL is running
systemctl status postgresql

# Test connection
psql -U cryptsk -d cryptskdb -c "SELECT 1"

# Check .env file
cat /opt/cryptsk-gateway/.env
```

### Issue: Sandbox Codebase Out of Sync

```bash
cd /home/z/my-project
git fetch --all
git reset --hard origin/main
bun install
```

### Issue: Git Push Rejected (Non-fast-forward)

```bash
# Pull first, then push
git pull --rebase origin main
git push origin main
```

### Issue: CSS/HMR Not Updating in Dev Mode

```bash
# Clear Next.js cache
rm -rf .next
# Restart dev server
bun run dev
```

### Issue: 360° Customer View "Failed to load subscriber data"

**Root Cause**: API returns `Subscriber` (capital S) but frontend expects `subscriber` (lowercase s).

**Fix**: In `src/app/api/subscribers/[id]/360/route.ts`, ensure the response key is `subscriber` (lowercase):

```typescript
// ❌ Wrong
return NextResponse.json({ Subscriber: { ... } });

// ✅ Correct
return NextResponse.json({ subscriber: { ... } });
```

---

## Quick Reference

### One-Liner Deploy

```bash
node scripts/deploy.mjs
```

### SSH to Production

```bash
ssh -p 22222 root@103.244.7.221
```

### Check Production Status

```bash
node scripts/deploy.mjs --status
```

### Git Workflow

```bash
# Sandbox → GitHub → Prod
git add -A && git commit -m "fix: description" && git push origin main
# Then: node scripts/deploy.mjs --no-push
```

### Verify Deployment

```bash
# Via agent-browser
agent-browser open http://103.244.7.221:3000

# Via curl (from prod)
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/
```

### Key File Locations

| File | Sandbox | Production |
|------|---------|------------|
| **Project Root** | `/home/z/my-project` | `/opt/cryptsk-gateway` |
| **Environment** | `.env` | `.env` |
| **Deploy Script** | `scripts/deploy.mjs` | N/A (run from sandbox) |
| **PM2 Config** | `ecosystem.config.cjs` | `ecosystem.config.cjs` |
| **Prisma Schema** | `prisma/schema.prisma` | `prisma/schema.prisma` |
| **Next.js Config** | `next.config.ts` | `next.config.ts` |
| **Worklog** | `/home/z/my-project/worklog.md` | N/A |

---

## 📝 Notes

- **Sandbox is ephemeral** — always push code to GitHub before closing a session
- **Test on production** using `http://103.244.7.221:3000` via agent-browser
- **PM2** manages all services — use `pm2 status` to check health
- **PostgreSQL** on prod has the full dataset; sandbox uses SQLite for local dev
- **Deploy script** handles the full pipeline automatically — prefer it over manual steps
- **Build can take 2-5 minutes** on prod due to Next.js compilation

---

*Last updated: 2025-09-08 | CRYPTSK Intelligent ISP Platform*
