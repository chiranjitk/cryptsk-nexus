#!/usr/bin/env bash
# ============================================================================
# CryptSK Nexus — Fresh Sandbox One-Command Setup
# Run this after a container recycle:  bash scripts/fresh-setup.sh
# Provisions: PostgreSQL 16.4 portable → schema → seed → pm2 (13 services)
# Code itself comes from git (already cloned). This restores the RUNTIME only.
# ============================================================================
set -e
cd /home/z/my-project
PG_ROOT=/home/z/my-project/runtime-applications/pgsql
PGDATA=$PG_ROOT/data
DB_URL="postgresql://cryptsknexus:CryptskNexus2026@127.0.0.1:5432/cryptsknexus"

echo "═══ STEP 0: .env sanity (PostgreSQL only, never SQLite) ═══"
grep -q "^DATABASE_URL=postgresql://" .env 2>/dev/null || \
  printf 'DATABASE_URL=%s\nSESSION_SECRET=cryptsk_session_secret_key_2026_isp_platform\n' "$DB_URL" > .env

echo "═══ STEP 1: dependencies ═══"
[ -d node_modules ] || bun install
mkdir -p .logs

echo "═══ STEP 2: PostgreSQL 16.4 portable binaries ═══"
if [ ! -x "$PG_ROOT/bin/initdb" ]; then
  echo "downloading portable PG binaries (~15MB)..."
  curl -sSL -o /tmp/pgbin.jar "https://repo1.maven.org/maven2/io/zonky/test/postgres/embedded-postgres-binaries-linux-amd64/16.4.0/embedded-postgres-binaries-linux-amd64-16.4.0.jar"
  python3 -c "import zipfile; zipfile.ZipFile('/tmp/pgbin.jar').extract('postgres-linux-x86_64.txz','/tmp')"
  mkdir -p "$PG_ROOT"
  tar -xJf /tmp/postgres-linux-x86_64.txz -C "$PG_ROOT"
  rm -f /tmp/pgbin.jar /tmp/postgres-linux-x86_64.txz
fi
export PATH="$PG_ROOT/bin:$PATH"

echo "═══ STEP 3: start/initialize PostgreSQL ═══"
if pg_ctl -D "$PGDATA" status >/dev/null 2>&1; then
  echo "PG already running"
else
  if [ ! -f "$PGDATA/PG_VERSION" ]; then
    echo "initializing cluster (trust auth)..."
    initdb -D "$PGDATA" --auth-local=trust --auth-host=trust -U postgres >/dev/null
  fi
  pg_ctl -D "$PGDATA" -o "-p 5432 -h 127.0.0.1" -l "$PG_ROOT/pg.log" start
  sleep 2
fi

echo "═══ STEP 4: users + database ═══"
python3 - <<'PYEOF'
import psycopg2, os
conn = psycopg2.connect(host='127.0.0.1', port=5432, user='postgres', dbname='postgres')
conn.autocommit = True; cur = conn.cursor()
for sql in ["CREATE USER z WITH PASSWORD 'CryptskNexus2026' SUPERUSER",
            "CREATE USER cryptsknexus WITH PASSWORD 'CryptskNexus2026' SUPERUSER",
            "CREATE DATABASE cryptsknexus OWNER cryptsknexus"]:
    try: cur.execute(sql); print("OK:", sql[:44])
    except Exception as e: print("skip:", str(e).split("\n")[0][:60])
cur.close(); conn.close()
PYEOF

echo "═══ STEP 5: schema (skip if already provisioned) ═══"
TABLES=$(psql "$DB_URL" -t -A -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'" 2>/dev/null || echo 0)
if [ "${TABLES:-0}" -ge 230 ]; then
  echo "schema already present ($TABLES tables) — skipping push/seed"
else
  echo "pushing Prisma schema..."
  DATABASE_URL="$DB_URL" npx prisma db push --skip-generate >/dev/null
  DATABASE_URL="$DB_URL" npx prisma generate >/dev/null
  echo "loading RADIUS production schema (241 tables target)..."
  DATABASE_URL="$DB_URL" python3 -c "
import psycopg2, os
sql=open('pgsql-production/complete-database.sql').read()
conn=psycopg2.connect(os.environ['DATABASE_URL']); conn.autocommit=True
cur=conn.cursor(); cur.execute(sql); print('loaded OK')
conn.close()"
  echo "seeding demo data..."
  DATABASE_URL="$DB_URL" bun prisma/seed.ts | tail -3
fi

echo "═══ STEP 6: services via pm2 ═══"
# next.config.ts is UNTRACKED (local-only, per user order 2026-10-01 — avoids
# parallel-agent conflicts). Recreate a working default if missing after clone.
if [ ! -f next.config.ts ]; then
  cat > next.config.ts << 'NEXTCFG'
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: { ignoreBuildErrors: true },
  reactStrictMode: false,
  allowedDevOrigins: ["*.space-z.ai", "127.0.0.1", "localhost"],
  // 256 OOM-crash-looped cold compile of the full page-loaders graph in the
  // 4GB sandbox; 1536 fits alongside the 12 mini-services.
  experimental: { turbopackMemoryLimit: 1536 },
  serverExternalPackages: [
    "ssh2", "net-snmp", "ros-client", "pg", "pg-native",
    "bcryptjs", "bcrypt", "nodemailer", "@prisma/client", "canvas", "jsdom",
  ],
};

export default nextConfig;
NEXTCFG
  echo "recreated next.config.ts (gitignored by design — tune locally)"
fi
# ecosystem.config.cjs is gitignored (secrets policy) but a sanitized tracked
# template lives at scripts/ecosystem.config.cjs.template — restore from it.
if [ ! -f ecosystem.config.cjs ] && [ -f scripts/ecosystem.config.cjs.template ]; then
  cp scripts/ecosystem.config.cjs.template ecosystem.config.cjs
  echo "restored ecosystem.config.cjs from tracked template"
fi
if [ -f ecosystem.config.cjs ]; then
  echo "starting main app only (memory discipline — 6 daemons stay stopped):"
  npx pm2 startOrRestart ecosystem.config.cjs --only cryptsk-isp
  echo "(remaining 12 services registered but stopped — start selectively if needed:"
  echo " npx pm2 start ecosystem.config.cjs --only cryptsk-gateway-service,cryptsk-billing-cron,cryptsk-session-engine )"
else
  echo "⚠ ecosystem.config.cjs missing (gitignored by design) — start app manually:"
  echo "  DATABASE_URL='$DB_URL' NODE_OPTIONS=--max-old-space-size=1024 setsid nohup npx next dev -p 3000 -H 0.0.0.0 >> dev.log 2>&1 &"
fi

echo "═══ STEP 7: mini-service deps that ship their own package.json ═══"
for d in mini-services/*/; do
  [ -f "$d/package.json" ] && [ ! -d "$d/node_modules" ] && (cd "$d" && bun install >/dev/null 2>&1 && echo "deps: $d")
done
true

echo "═══ STEP 8: verify ═══"
sleep 8
curl -s -o /dev/null -w "app  :3000 → %{http_code}\n" --max-time 60 http://127.0.0.1:3000/ || true
curl -s -o /dev/null -w "cron :3004 → %{http_code} (401=alive)\n" --max-time 10 http://127.0.0.1:3004/api/jobs || true
psql "$DB_URL" -t -A -c "SELECT 'subscribers: '||count(*) FROM \"Subscriber\"" || true
npx pm2 status 2>/dev/null | head -20 || true
echo "✅ fresh-setup complete (login: admin@cryptsk.com / Admin@2026)"
