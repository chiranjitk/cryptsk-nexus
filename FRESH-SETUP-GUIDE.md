# CRYPTSKINTELLIGENT-ISP-PLATFORM — Fresh Sandbox Setup Guide

You are setting up CRYPTSKINTELLIGENT-ISP-PLATFORM from scratch on a FRESH sandbox.

---

## STEP 1: CLONE REPO

```bash
cd /home/z/
rm -rf my-project
git clone https://github.com/chiranjitk/CRYPTSKINTELLIGENT-ISP-PLATFORM.git my-project
cd my-project   # this is git root
```

---

## STEP 2: INSTALL DEPENDENCIES

```bash
bun install
npm install -g pm2
```

---

## STEP 3: SETUP POSTGRESQL (Bundled Source Install)

PostgreSQL is already bundled in `runtime-applications/pgsql/`. It was compiled from source and includes `initdb`, `pg_ctl`, `psql`, and all standard tools.

### 3a. Check if PostgreSQL data directory already exists

```bash
ls runtime-applications/pgsql/data/PG_VERSION 2>/dev/null && echo "PG_DATA_EXISTS" || echo "PG_DATA_MISSING"
```

### 3b. If data directory is missing, initialize it

```bash
# Add PG binaries to PATH
export PATH="/home/z/my-project/runtime-applications/pgsql/bin:$PATH"

# Initialize the data directory
initdb -D /home/z/my-project/runtime-applications/pgsql/data

# Set password for 'postgres' superuser
pg_ctl -D /home/z/my-project/runtime-applications/pgsql/data start -o "-p 5432" -w
psql -h localhost -p 5432 -U postgres -c "ALTER USER postgres PASSWORD 'postgres';"

# Create the application user and database
psql -h localhost -p 5432 -U postgres -c "CREATE USER z WITH PASSWORD 'Cryptsk2026' SUPERUSER;"
psql -h localhost -p 5432 -U postgres -c "CREATE DATABASE ispplatform OWNER z;"

pg_ctl -D /home/z/my-project/runtime-applications/pgsql/data stop
```

### 3c. Start PostgreSQL

```bash
export PATH="/home/z/my-project/runtime-applications/pgsql/bin:$PATH"
pg_ctl -D /home/z/my-project/runtime-applications/pgsql/data start -o "-p 5432" -w
```

### 3d. Configure pg_hba.conf for password auth (if needed)

If you get "password authentication failed" errors, edit `runtime-applications/pgsql/data/pg_hba.conf`:
- Change `scram-sha-256` to `md5` for local connections
- Or add: `host all all 127.0.0.1/32 md5`

Then restart PostgreSQL:
```bash
pg_ctl -D /home/z/my-project/runtime-applications/pgsql/data restart -o "-p 5432" -w
```

### 3e. Verify PostgreSQL

```bash
psql -h localhost -p 5432 -U z -d ispplatform -c "SELECT 1;"
# Should return: 1
```

### 3f. Load Production Database Schema

**IMPORTANT: This is the SOURCE OF TRUTH for all database objects.**

The production schema includes:
- FreeRADIUS standard tables (radcheck, radreply, radgroupcheck, radgroupreply, radusergroup, radpostauth, radacct, nas)
- Cryptsk extended RADIUS columns (subscriber_id, plan_id, etc.)
- Helper tables (radius_provisioning_log, radius_daily_stats)
- Reporting views (v_active_sessions, v_radius_user_status, v_auth_summary_daily, v_subscriber_data_usage, v_nas_status)
- Database functions (fn_subscriber_total_usage_gb, fn_disconnect_subscriber, fn_refresh_daily_stats, etc.)
- RADIUS group reply attributes for all 8 default plans

```bash
psql -h localhost -p 5432 -U z -d ispplatform -f /home/z/my-project/pgsql-production/complete-database.sql
```

### 3g. Push Prisma Schema (Application Tables)

```bash
# IMPORTANT: Set DATABASE_URL to PostgreSQL before pushing
export DATABASE_URL="postgresql://z:Cryptsk2026@127.0.0.1:5432/ispplatform"
npx prisma db push
npx prisma generate
```

**NEVER run `bun run db:push` without the correct DATABASE_URL.** The `.env` file must contain the PostgreSQL URL.

---

## STEP 4: SETUP FREERADIUS (Compiled from Source)

FreeRADIUS v3.2.7 is already compiled and installed at `runtime-applications/freeradius/`.

### 4a. Verify FreeRADIUS installation

```bash
ls -la /home/z/my-project/runtime-applications/freeradius/sbin/radiusd
ls -la /home/z/my-project/runtime-applications/freeradius/etc/raddb/raddb/radiusd.conf
```

### 4b. If FreeRADIUS is NOT compiled (fresh sandbox), compile from source

```bash
cd /tmp
wget -q https://github.com/FreeRADIUS/freeradius-server/releases/download/release_3_2_7/freeradius-server-3.2.7.tar.gz
tar xzf freeradius-server-3.2.7.tar.gz
cd freeradius-server-3.2.7

# Install build dependencies (may need sudo in some environments)
apt-get update 2>/dev/null
apt-get install -y build-essential libssl-dev libtalloc-dev libpcre3-dev 2>/dev/null

./configure \
  --prefix=/home/z/my-project/runtime-applications/freeradius \
  --sysconfdir=/home/z/my-project/runtime-applications/freeradius/etc/raddb/raddb \
  --localstatedir=/home/z/my-project/runtime-applications/freeradius/var \
  --with-postgresql-libdir=/usr/lib/x86_64-linux-gnu \
  --with-postgresql

make -j$(nproc)
make install
```

### 4c. Verify FreeRADIUS SQL module configuration

Check `runtime-applications/freeradius/etc/raddb/raddb/mods-enabled/sql`:
- `dialect = "postgresql"` ✓
- `driver = "rlm_sql_postgresql"` ✓
- `radius_db = "host=127.0.0.1 port=5432 dbname=ispplatform user=z password=Cryptsk2026"` ✓

### 4d. Test FreeRADIUS config

```bash
export LD_LIBRARY_PATH="/home/z/my-project/runtime-applications/freeradius/lib:/home/z/my-project/runtime-applications/freeradius/deps/lib"
/home/z/my-project/runtime-applications/freeradius/sbin/radiusd -X -C \
  -d /home/z/my-project/runtime-applications/freeradius/etc/raddb/raddb 2>&1 | tail -5
# Should show: "Ready to process requests"
```

---

## STEP 5: RUN SEED DATA

The seed script populates:
- Admin user (admin@cryptsk.com / Admin@2026)
- ISP settings (Cryptsk Networks Pvt Ltd)
- 6 coverage areas (Salt Lake, New Town, Lake Town, Dum Dum, Barasat, Howrah)
- 8 plans (5 FTTH, 2 Wireless, 1 Cable) with RADIUS groups
- 15 demo subscribers with RADIUS provisioning
- 12 RADIUS check entries + 12 user-group mappings
- Sample NAS device
- Sample invoices

```bash
DATABASE_URL="postgresql://z:Cryptsk2026@127.0.0.1:5432/ispplatform" npx tsx prisma/seed.ts
```

Verify:
```bash
psql -h localhost -p 5432 -U z -d ispplatform -c "SELECT count(*) as subscribers FROM \"Subscriber\";"
psql -h localhost -p 5432 -U z -d ispplatform -c "SELECT count(*) as rad_users FROM radcheck;"
```

---

## STEP 6: FIX .ENV FILE (CRITICAL)

The `.env` file **MUST** point to PostgreSQL. Verify:

```bash
cat /home/z/my-project/.env
```

Should contain:
```
DATABASE_URL=postgresql://z:Cryptsk2026@localhost:5432/ispplatform
SESSION_SECRET=cryptsk_session_secret_key_2026_isp_platform
```

**⚠️ NEVER set `DATABASE_URL` to a `file:` path (SQLite). This project uses PostgreSQL ONLY.**

---

## STEP 7: START ALL SERVICES

### 7a. Create logs directory

```bash
mkdir -p /home/z/my-project/.logs
```

### 7b. Start PostgreSQL manually (NOT via PM2)

```bash
export PATH="/home/z/my-project/runtime-applications/pgsql/bin:$PATH"
pg_ctl -D /home/z/my-project/runtime-applications/pgsql/data start -o "-p 5432" -w
```

### 7c. Start FreeRADIUS and Next.js via PM2

```bash
cd /home/z/my-project
npx pm2 start ecosystem.config.cjs --only cryptsk-freeradius
npx pm2 start ecosystem.config.cjs --only cryptsk-nextjs

# Start other services as needed
npx pm2 start ecosystem.config.cjs --only cryptsk-radius-service
npx pm2 start ecosystem.config.cjs --only cryptsk-billing-cron
npx pm2 start ecosystem.config.cjs --only cryptsk-network-monitor
npx pm2 start ecosystem.config.cjs --only cryptsk-session-engine
npx pm2 start ecosystem.config.cjs --only cryptsk-whatsapp-bot

# Save PM2 config
npx pm2 save
```

### 7d. Verify all services

```bash
npx pm2 status
```

Expected: 13/14 services online (cryptsk-diameter-service may show errored — that's OK for now).

---

## STEP 8: VERIFY EVERYTHING

### 8a. PostgreSQL
```bash
psql -h localhost -p 5432 -U z -d ispplatform -c "SELECT 1;"
# Should return: 1
```

### 8b. FreeRADIUS
```bash
npx pm2 logs cryptsk-freeradius --lines 5
# Should show "Ready to process requests"
```

### 8c. Next.js (wait 30s for compilation)
```bash
sleep 30 && curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
# Should return: 200
```

### 8d. Subscriber API
```bash
# Login first
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@cryptsk.com","password":"Admin@2026"}' | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))")

# Get subscribers
curl -s http://localhost:3000/api/subscribers \
  -H "Authorization: Bearer $TOKEN" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(f'Subscribers: {d[\"total\"]}')
print(f'Active: {d[\"stats\"][\"activeCount\"]}')
print(f'Suspended: {d[\"stats\"][\"suspendedCount\"]}')
"
# Should show: Subscribers: 15, Active: 11, Suspended: 1
```

### 8e. RADIUS tables
```bash
psql -h localhost -p 5432 -U z -d ispplatform -c "
SELECT 'radcheck' as tbl, count(*) FROM radcheck
UNION ALL SELECT 'radreply', count(*) FROM radreply
UNION ALL SELECT 'radgroupcheck', count(*) FROM radgroupcheck
UNION ALL SELECT 'radgroupreply', count(*) FROM radgroupreply
UNION ALL SELECT 'radusergroup', count(*) FROM radusergroup
UNION ALL SELECT 'radpostauth', count(*) FROM radpostauth
UNION ALL SELECT 'radacct', count(*) FROM radacct
UNION ALL SELECT 'nas', count(*) FROM nas;
"
```

### 8f. Database views
```bash
psql -h localhost -p 5432 -U z -d ispplatform -c "\dv"
# Should show: v_active_sessions, v_auth_summary_daily, v_nas_status, v_radius_user_status, v_subscriber_data_usage
```

### 8f. Database functions
```bash
psql -h localhost -p 5432 -U z -d ispplatform -c "\df public.*"
# Should show: fn_subscriber_total_usage_gb, fn_subscriber_active_sessions, fn_disconnect_subscriber, fn_refresh_daily_stats, etc.
```

---

## PROJECT ARCHITECTURE

### Tech Stack
- Next.js 16 with App Router (TypeScript)
- Tailwind CSS 4 with shadcn/ui (New York style) + Lucide icons
- PostgreSQL (bundled at runtime-applications/pgsql/)
- FreeRADIUS v3.2.7 (compiled from source at runtime-applications/freeradius/)
- PM2 for process management
- Zustand for client state, TanStack Query for server state
- Prisma 6.x ORM (PostgreSQL only — NO SQLite)

### Port Mapping
- 3000 — Next.js dev server (PM2)
- 1812 — FreeRADIUS auth (PM2)
- 1813 — FreeRADIUS acct (PM2)
- 3799 — FreeRADIUS CoA (PM2)
- 5432 — PostgreSQL (manual start via pg_ctl)

### Database Connection
```
postgresql://z:Cryptsk2026@localhost:5432/ispplatform
```

### Key Credentials
| Service | Username | Password |
|---------|----------|----------|
| Admin Login | admin@cryptsk.com | Admin@2026 |
| PostgreSQL (app) | z | Cryptsk2026 |
| PostgreSQL (superuser) | postgres | postgres |

---

## KEY DIRECTORIES

```
my-project/
├── src/                          # Next.js app
│   ├── app/                      # App Router pages & API routes
│   │   ├── api/                  # All API routes
│   │   │   ├── subscribers/      # Subscriber CRUD APIs
│   │   │   ├── radius/           # RADIUS management APIs
│   │   │   └── auth/             # Authentication
│   │   └── page.tsx              # Single-page app (SPA routing)
│   ├── components/               # React components
│   │   ├── layout/               # Sidebar, header, footer
│   │   ├── pages/                # Page components (subscribers, plans, etc.)
│   │   └── ui/                   # shadcn/ui components
│   ├── lib/                      # Utilities, DB client, services
│   ├── stores/                   # Zustand state stores
│   └── types/                    # TypeScript type definitions
├── prisma/
│   ├── schema.prisma             # Prisma schema (application tables)
│   └── seed.ts                   # Seed script (demo data)
├── pgsql-production/
│   └── complete-database.sql     # SOURCE OF TRUTH for RADIUS tables, views, functions
├── runtime-applications/
│   ├── pgsql/                    # PostgreSQL binaries & data
│   │   ├── bin/                  # pg_ctl, psql, etc.
│   │   └── data/                 # PG data directory
│   └── freeradius/               # FreeRADIUS compiled from source
│       ├── sbin/radiusd          # FreeRADIUS binary
│       └── etc/raddb/raddb/      # FreeRADIUS config
│           ├── mods-enabled/sql  # PostgreSQL connection config
│           └── sites-enabled/    # Virtual server configs
├── mini-services/                # Microservices (billing, radius, session-engine, etc.)
├── configs/templates/            # Network config templates (FreeRADIUS, accel-ppp, dnsmasq)
├── scripts/                      # Shell scripts (TC shaping, network ops)
├── docs/                         # Architecture documentation
├── ecosystem.config.cjs          # PM2 config (14 services)
└── .env                          # Environment variables (PostgreSQL URL)
```

---

## SERVICE MANAGEMENT COMMANDS

```bash
# PostgreSQL (manual start/stop)
export PATH="/home/z/my-project/runtime-applications/pgsql/bin:$PATH"
pg_ctl -D runtime-applications/pgsql/data status
pg_ctl -D runtime-applications/pgsql/data start -o "-p 5432" -w
pg_ctl -D runtime-applications/pgsql/data stop
pg_ctl -D runtime-applications/pgsql/data restart -o "-p 5432" -w

# PM2 (all other services)
export PATH="/home/z/my-project/node_modules/.bin:$PATH"
pm2 status                          # See all services
pm2 logs cryptsk-nextjs --lines 50  # Next.js logs
pm2 logs cryptsk-freeradius --lines 50 # FreeRADIUS logs
pm2 restart cryptsk-nextjs          # Restart Next.js
pm2 restart cryptsk-freeradius      # Restart FreeRADIUS
pm2 stop all                        # Stop all PM2 services
pm2 start ecosystem.config.cjs      # Start all services

# Seed data (re-run anytime, idempotent)
DATABASE_URL="postgresql://z:Cryptsk2026@127.0.0.1:5432/ispplatform" npx tsx prisma/seed.ts
```

---

## DATABASE RESET (If needed)

If you need to completely reset the database:

```bash
export PATH="/home/z/my-project/runtime-applications/pgsql/bin:$PATH"

# Stop all services that use the database
pm2 stop all

# Drop and recreate the database
psql -h localhost -p 5432 -U postgres -c "DROP DATABASE ispplatform;"
psql -h localhost -p 5432 -U postgres -c "CREATE DATABASE ispplatform OWNER z;"

# Reload production schema (RADIUS tables, views, functions)
psql -h localhost -p 5432 -U z -d ispplatform -f /home/z/my-project/pgsql-production/complete-database.sql

# Push Prisma schema (application tables)
export DATABASE_URL="postgresql://z:Cryptsk2026@127.0.0.1:5432/ispplatform"
npx prisma db push
npx prisma generate

# Run seed data
DATABASE_URL="postgresql://z:Cryptsk2026@127.0.0.1:5432/ispplatform" npx tsx prisma/seed.ts

# Restart services
pm2 start all
```

---

## GATEWAY (Caddy)

Only ONE port is exposed externally. For API requests to different ports, use `XTransformPort` query param:
- API: `fetch('/api/subscribers')` — goes to port 3000 (Next.js)
- NEVER write absolute URLs like `http://localhost:PORT`
- Always use relative paths with `XTransformPort` for non-3000 services
- WebSocket: `io('/?XTransformPort=3003')`

---

## HARD RULES

1. **PostgreSQL ONLY** — No SQLite. The `.env` must always have a `postgresql://` URL.
2. **NEVER run `bun run build`** — Always use `bun run dev` or PM2.
3. **Prisma db push** — Must have correct `DATABASE_URL` pointing to PostgreSQL.
4. **pgsql-production/complete-database.sql** — SOURCE OF TRUTH for RADIUS tables, views, functions. Any DB changes must update this file.
5. **FreeRADIUS** is compiled from source at `runtime-applications/freeradius/` — NOT installed via apt.
6. **PostgreSQL** starts manually via `pg_ctl` — NOT managed by PM2.
7. Always `git pull` before starting work to sync with other agents.

---

## GITHUB

- **Repo**: https://github.com/chiranjitk/CRYPTSKINTELLIGENT-ISP-PLATFORM.git
- **Token**: ${GITHUB_TOKEN}
- **Username**: chiranjitk
- **Email**: chiranjitk@outlook.com
