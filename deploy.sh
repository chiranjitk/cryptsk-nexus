#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════╗
# ║  Cryptsk Enterprise Gateway — Full Deploy Script for Debian 12/13      ║
# ║  Rerunnable: cleans existing DB & files on re-run                     ║
# ║  No Caddy — Next.js UI runs directly on port 3000                    ║
# ║  App runs as root — no separate application user                      ║
# ╚══════════════════════════════════════════════════════════════════════════╝

set -euo pipefail

# ─── Configuration ──────────────────────────────────────────────────────
INSTALL_DIR="/opt/cryptsk-gateway"
GITHUB_REPO="https://${GITHUB_TOKEN}@github.com/chiranjitk/CRYPTSKINTELLIGENT-ISP-PLATFORM.git"
DB_NAME="cryptskdb"
DB_USER="cryptsk"
DB_PASS="Cryptsk2026"
DB_PORT="5432"
PG_VERSION="17"
NODE_MAJOR="22"
BUN_VERSION="1.2.4"
SESSION_SECRET="cryptsk_session_secret_key_2026_enterprise_gateway"

# ─── Colors ─────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
fail()  { echo -e "${RED}[FAIL]${NC}  $*"; exit 1; }

# ─── Pre-flight Checks ──────────────────────────────────────────────────
if [ "$(id -u)" -ne 0 ]; then
  fail "This script must be run as root. Use: sudo bash deploy.sh"
fi

# ─── Step 0: Clean Previous Installation (rerunnable) ─────────────────
clean_previous() {
  info "Cleaning previous installation (if any)..."
  
  # Stop PM2 processes
  pm2 delete all 2>/dev/null || true
  
  # Drop old database and user if they exist
  if command -v psql &>/dev/null; then
    sudo -u postgres psql -c "DROP DATABASE IF EXISTS ${DB_NAME};" 2>/dev/null || true
    sudo -u postgres psql -c "DROP USER IF EXISTS ${DB_USER};" 2>/dev/null || true
  fi
  
  # Remove old install dir
  if [ -d "$INSTALL_DIR" ]; then
    warn "Removing ${INSTALL_DIR}..."
    rm -rf "$INSTALL_DIR"
  fi
  
  ok "Cleanup complete"
}

# ─── Step 1: System Dependencies ───────────────────────────────────────
install_system_deps() {
  info "Installing system dependencies..."
  
  export DEBIAN_FRONTEND=noninteractive
  
  # CRITICAL: Remove stale third-party repo files BEFORE any apt-get update
  # (leftover from previous runs break apt on Debian 13)
  rm -f /etc/apt/sources.list.d/nodesource.list /etc/apt/keyrings/nodesource.gpg \
        /etc/apt/sources.list.d/pgdg.list /usr/share/keyrings/postgresql-keyring.gpg \
        /etc/apt/sources.list.d/pgdg-${PG_VERSION}* 2>/dev/null || true
  
  # Base packages first (git, curl, unzip, build tools, etc.)
  info "Installing base packages..."
  apt-get update -y
  apt-get install -y \
    gnupg lsb-release wget ca-certificates curl apt-transport-https \
    build-essential git libssl-dev pkg-config \
    libvips-dev python3 python3-pip python3-venv unzip ripgrep
  
  # ── NodeSource: use official setup script (handles GPG correctly on Debian 13) ──
  info "Adding NodeSource repository for Node.js ${NODE_MAJOR}..."
  rm -f /etc/apt/sources.list.d/nodesource.list /etc/apt/keyrings/nodesource.gpg 2>/dev/null || true
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  
  # ── PostgreSQL: use proper signed-by keyring for Debian 13 ──
  info "Adding PostgreSQL APT repository..."
  rm -f /etc/apt/sources.list.d/pgdg.list /usr/share/keyrings/postgresql-keyring.gpg 2>/dev/null || true
  curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | \
    gpg --dearmor -o /usr/share/keyrings/postgresql-keyring.gpg
  echo "deb [signed-by=/usr/share/keyrings/postgresql-keyring.gpg] http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
    > /etc/apt/sources.list.d/pgdg.list
  
  apt-get update -y
  
  # Install PostgreSQL
  info "Installing PostgreSQL ${PG_VERSION}..."
  apt-get install -y \
    postgresql-${PG_VERSION} \
    postgresql-client-${PG_VERSION} \
    postgresql-contrib-${PG_VERSION}
  
  # Install Node.js 22 (from NodeSource, includes npm)
  info "Installing Node.js ${NODE_MAJOR}..."
  apt-get install -y nodejs
  
  # Verify npm is available
  command -v npm &>/dev/null || fail "npm not found after Node.js install"
  node -v
  npm -v
  
  # Install PM2 globally
  info "Installing PM2..."
  npm install -g pm2@latest
  
  # Install tsx for seed script
  info "Installing tsx..."
  npm install -g tsx@latest
  
  ok "System dependencies installed"
}

# ─── Step 2: Install Bun ────────────────────────────────────────────────
install_bun() {
  # Ensure unzip is available (required by bun installer)
  apt-get install -y unzip ca-certificates 2>/dev/null || true
  
  BUN_BIN="/root/.bun/bin/bun"
  
  if [ -x "$BUN_BIN" ]; then
    ok "Bun already installed: $($BUN_BIN --version)"
  else
    info "Installing Bun runtime..."
    # Install without pinning version — get latest stable
    curl -fsSL https://bun.sh/install | BUN_INSTALL="/root/.bun" bash -s "bun" \
      || fail "Bun installer failed — check network or disk space"
    
    # Verify the binary actually exists
    [ -x "$BUN_BIN" ] || fail "Bun binary not found at $BUN_BIN after install"
  fi
  
  # Symlink to /usr/local/bin so ALL contexts (pm2, cron, ssh) can find it
  ln -sf "$BUN_BIN" /usr/local/bin/bun
  
  # Also add to profile for interactive shells
  echo 'export BUN_INSTALL="/root/.bun"' > /etc/profile.d/bun.sh
  echo 'export PATH="$BUN_INSTALL/bin:/usr/local/bin:$PATH"' >> /etc/profile.d/bun.sh
  chmod +x /etc/profile.d/bun.sh
  
  # Final verification
  bun --version &>/dev/null || fail "Bun not accessible after install"
  ok "Bun $(bun --version) installed at /usr/local/bin/bun"
}

# ─── Step 3: Clone Application from GitHub ────────────────────────────
setup_app_files() {
  info "Cloning application from GitHub..."
  
  # Clone to a temp dir first, then move (cleaner for re-runs)
  CLONE_TEMP="/tmp/cryptsk-gateway-clone"
  rm -rf "$CLONE_TEMP"
  
  git clone --depth 1 "$GITHUB_REPO" "$CLONE_TEMP" \
    || fail "Failed to clone repository from GitHub"
  
  # Move to install location
  mkdir -p "$(dirname "$INSTALL_DIR")"
  mv "$CLONE_TEMP" "$INSTALL_DIR"
  
  # Clean up sandbox-only artifacts that came from the repo
  rm -rf "$INSTALL_DIR/runtime-applications" \
         "$INSTALL_DIR/tool-results" \
         "$INSTALL_DIR/.logs" \
         "$INSTALL_DIR/dev.log" \
         "$INSTALL_DIR/upload" \
         "$INSTALL_DIR/source-code" \
         "$INSTALL_DIR/test_results" \
         "$INSTALL_DIR/e2e_results.json" \
         "$INSTALL_DIR/download" \
         "$INSTALL_DIR/"*.bak \
         "$INSTALL_DIR/"*.bak2 \
         "$INSTALL_DIR/"*.db 2>/dev/null || true
  
  # Verify clone succeeded
  [ -f "$INSTALL_DIR/package.json" ] || fail "Clone succeeded but package.json not found"
  
  ok "Application cloned to ${INSTALL_DIR}"
}

# ─── Step 4: Configure PostgreSQL ───────────────────────────────────────
configure_postgresql() {
  info "Configuring PostgreSQL..."
  
  # Ensure PostgreSQL is running
  systemctl enable postgresql
  systemctl start postgresql
  
  # Wait for PostgreSQL to be ready
  for i in $(seq 1 30); do
    if sudo -u postgres pg_isready -q; then
      break
    fi
    sleep 1
  done
  
  sudo -u postgres pg_isready -q || fail "PostgreSQL failed to start"
  
  # Create user and database
  info "Creating database user: ${DB_USER}..."
  sudo -u postgres psql -c "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}' SUPERUSER;" 2>/dev/null || \
    sudo -u postgres psql -c "ALTER USER ${DB_USER} WITH PASSWORD '${DB_PASS}' SUPERUSER;"
  
  info "Creating database: ${DB_NAME}..."
  sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};" 2>/dev/null || \
    sudo -u postgres psql -c "ALTER DATABASE ${DB_NAME} OWNER TO ${DB_USER};"
  
  # Install extensions
  info "Installing PostgreSQL extensions..."
  for ext in pgcrypto pg_stat_statements citext btree_gin btree_gist pg_trgm; do
    sudo -u postgres psql -d "$DB_NAME" -c "CREATE EXTENSION IF NOT EXISTS $ext;" > /dev/null 2>&1
  done
  
  # Configure pg_hba.conf for password auth
  PG_HBA="/etc/postgresql/${PG_VERSION}/main/pg_hba.conf"
  if [ -f "$PG_HBA" ]; then
    info "Configuring pg_hba.conf for md5 authentication..."
    # Backup original
    cp "$PG_HBA" "${PG_HBA}.bak"
    # Write new config
    cat > "$PG_HBA" << 'HBAEOF'
# PostgreSQL Client Authentication Configuration
# TYPE  DATABASE        USER            ADDRESS                 METHOD
local   all             all                                     md5
host    all             all             127.0.0.1/32            md5
host    all             all             ::1/128                 md5
host    all             all             0.0.0.0/0               md5
host    all             all             ::/0                    md5
HBAEOF
    
    # Allow peer auth for local postgres user (maintenance)
    sed -i '1i local   all             postgres                                peer' "$PG_HBA"
    
    systemctl reload postgresql
  fi
  
  # Configure postgresql.conf
  PG_CONF="/etc/postgresql/${PG_VERSION}/main/postgresql.conf"
  if [ -f "$PG_CONF" ]; then
    # Increase shared buffers and work mem for enterprise workload
    grep -q 'shared_buffers.*256MB' "$PG_CONF" 2>/dev/null || echo "shared_buffers = 256MB" >> "$PG_CONF"
    grep -q 'work_mem.*64MB' "$PG_CONF" 2>/dev/null || echo "work_mem = 64MB" >> "$PG_CONF"
    grep -q 'effective_cache_size.*1GB' "$PG_CONF" 2>/dev/null || echo "effective_cache_size = 1GB" >> "$PG_CONF"
    systemctl reload postgresql
  fi
  
  # Test connection
  PGPASSWORD="$DB_PASS" psql -U "$DB_USER" -d "$DB_NAME" -h 127.0.0.1 -c "SELECT 1;" > /dev/null 2>&1 \
    || fail "Database connection test failed"
  
  ok "PostgreSQL configured (${DB_NAME} on port ${DB_PORT})"
}

# ─── Step 5: Create Environment File ─────────────────────────────────────
create_env_file() {
  info "Creating .env file..."
  cat > "$INSTALL_DIR/.env" << ENVEOF
DATABASE_URL=postgresql://${DB_USER}:${DB_PASS}@127.0.0.1:${DB_PORT}/${DB_NAME}
SESSION_SECRET=${SESSION_SECRET}
NODE_ENV=production
ENVEOF
  
  chmod 600 "$INSTALL_DIR/.env"
  ok ".env file created"
}

# ─── Step 6: Install Node.js Dependencies ────────────────────────────────
install_node_deps() {
  info "Installing main application dependencies..."
  cd "$INSTALL_DIR"
  
  npm install --legacy-peer-deps
  
  # Verify critical binaries exist
  [ -f "node_modules/.bin/next" ] || fail "npm install completed but 'next' binary not found in node_modules/.bin/"
  
  ok "Node.js dependencies installed (next: $(node_modules/.bin/next --version))"
}

# ─── Step 7: Install Mini-Service Dependencies ───────────────────────────
install_mini_service_deps() {
  info "Installing mini-service dependencies..."
  cd "$INSTALL_DIR"
  
  # Install shared deps first
  if [ -d "mini-services/shared" ]; then
    cd mini-services/shared
    npm install --legacy-peer-deps 2>/dev/null || true
    cd "$INSTALL_DIR"
  fi
  
  # Install deps for each mini-service
  for svc_dir in mini-services/*/; do
    [ -f "$svc_dir/package.json" ] || continue
    svc_name=$(basename "$svc_dir")
    [ "$svc_name" = "shared" ] && continue
    
    info "  Installing ${svc_name}..."
    cd "$svc_dir"
    # Generate Prisma client for services that use it
    if grep -q '@prisma/client' package.json 2>/dev/null; then
      npm install --legacy-peer-deps 2>&1 | tail -2
      # Generate Prisma client using the main schema
      npx prisma generate --schema="$INSTALL_DIR/prisma/schema.prisma" 2>&1 | tail -2
    else
      npm install --legacy-peer-deps 2>&1 | tail -2
    fi
    cd "$INSTALL_DIR"
  done
  
  ok "Mini-service dependencies installed"
}

# ─── Step 8: Push Prisma Schema & Seed ───────────────────────────────────
setup_database() {
  info "Pushing Prisma schema to database..."
  cd "$INSTALL_DIR"
  
  # Push schema (creates 100+ tables)
  DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@127.0.0.1:${DB_PORT}/${DB_NAME}" \
    npx prisma db push --skip-generate 2>&1 | tail -5
  
  # Generate Prisma client
  DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@127.0.0.1:${DB_PORT}/${DB_NAME}" \
    npx prisma generate 2>&1 | tail -3
  
  ok "Schema pushed to database"
  
  # Seed data
  info "Seeding database (600+ records)..."
  DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@127.0.0.1:${DB_PORT}/${DB_NAME}" \
    npx tsx prisma/seed.ts 2>&1 | tail -10
  
  ok "Database seeded"
}

# ─── Step 9: Build Next.js for Production ───────────────────────────────
build_nextjs() {
  info "Building Next.js for production..."
  cd "$INSTALL_DIR"
  
  # Verify next binary exists before building
  [ -f "node_modules/.bin/next" ] || fail "Cannot build — 'next' binary missing. npm install may have failed."
  
  DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@127.0.0.1:${DB_PORT}/${DB_NAME}" \
    SESSION_SECRET="$SESSION_SECRET" \
    npx next build
  
  # Verify build output
  [ -d ".next/standalone" ] || warn "Standalone output not found — build may need output: 'standalone' in next.config.ts"
  
  ok "Next.js build complete"
}

# ─── Step 10: Create PM2 Ecosystem Config ───────────────────────────────
create_ecosystem_config() {
  info "Creating PM2 ecosystem config..."
  
  BUN_PATH=$(which bun 2>/dev/null || echo "/usr/local/bin/bun")
  # Verify bun exists
  [ -x "$BUN_PATH" ] || warn "Bun not found at $BUN_PATH — mini-services will fail to start"
  
  cat > "$INSTALL_DIR/ecosystem.config.cjs" << ECOSEOF
module.exports = {
  apps: [
    // ─── 1. Main Next.js Application (Port 3000) ─────────────
    {
      name: 'cryptsk-gateway',
      script: 'npx',
      args: 'next start -H 0.0.0.0 -p 3000',
      cwd: '${INSTALL_DIR}',
      env: {
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://${DB_USER}:${DB_PASS}@127.0.0.1:${DB_PORT}/${DB_NAME}',
        SESSION_SECRET: '${SESSION_SECRET}',
        PORT: '3000',
        HOSTNAME: '0.0.0.0',
      },
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '4G',
      restart_delay: 5000,
      exp_backoff_restart_delay: 5000,
      max_restarts: 50,
      listen_timeout: 120000,
      kill_timeout: 15000,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '${INSTALL_DIR}/.logs/cryptsk-gateway-error.log',
      out_file: '${INSTALL_DIR}/.logs/cryptsk-gateway-out.log',
      merge_logs: true,
      time: true,
      autorestart: true,
    },

    // ─── 2. RADIUS Service (Port 3799) ──────────────────────
    {
      name: 'cryptsk-radius-service',
      script: 'index.ts',
      interpreter: '${BUN_PATH}',
      cwd: '${INSTALL_DIR}/mini-services/radius-service',
      env: {
        DATABASE_URL: 'postgresql://${DB_USER}:${DB_PASS}@127.0.0.1:${DB_PORT}/${DB_NAME}',
      },
      watch: false,
      restart_delay: 5000,
      max_restarts: 30,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '${INSTALL_DIR}/.logs/radius-service-error.log',
      out_file: '${INSTALL_DIR}/.logs/radius-service-out.log',
      merge_logs: true,
      time: true,
    },

    // ─── 3. IPS Daemon (Port 3030) ───────────────────────────
    {
      name: 'cryptsk-ips-daemon',
      script: 'index.ts',
      interpreter: '${BUN_PATH}',
      cwd: '${INSTALL_DIR}/mini-services/ips-daemon',
      env: {
        DATABASE_URL: 'postgresql://${DB_USER}:${DB_PASS}@127.0.0.1:${DB_PORT}/${DB_NAME}',
      },
      watch: false,
      restart_delay: 5000,
      max_restarts: 30,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '${INSTALL_DIR}/.logs/ips-daemon-error.log',
      out_file: '${INSTALL_DIR}/.logs/ips-daemon-out.log',
      merge_logs: true,
      time: true,
    },

    // ─── 4. nDPI Service (Port 3031) ─────────────────────────
    {
      name: 'cryptsk-ndpi-service',
      script: 'index.ts',
      interpreter: '${BUN_PATH}',
      cwd: '${INSTALL_DIR}/mini-services/ndpi-service',
      env: {
        DATABASE_URL: 'postgresql://${DB_USER}:${DB_PASS}@127.0.0.1:${DB_PORT}/${DB_NAME}',
      },
      watch: false,
      restart_delay: 5000,
      max_restarts: 30,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '${INSTALL_DIR}/.logs/ndpi-service-error.log',
      out_file: '${INSTALL_DIR}/.logs/ndpi-service-out.log',
      merge_logs: true,
      time: true,
    },

    // ─── 5. Gateway Service (Port 3005) ───────────────────────
    {
      name: 'cryptsk-gateway-service',
      script: 'index.ts',
      interpreter: '${BUN_PATH}',
      cwd: '${INSTALL_DIR}/mini-services/gateway-service',
      env: {
        DATABASE_URL: 'postgresql://${DB_USER}:${DB_PASS}@127.0.0.1:${DB_PORT}/${DB_NAME}',
      },
      watch: false,
      restart_delay: 5000,
      max_restarts: 30,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '${INSTALL_DIR}/.logs/gateway-service-error.log',
      out_file: '${INSTALL_DIR}/.logs/gateway-service-out.log',
      merge_logs: true,
      time: true,
    },

    // ─── 6. Multi-WAN Monitor (Port 3006) ────────────────────
    {
      name: 'cryptsk-multiwan-monitor',
      script: 'index.ts',
      interpreter: '${BUN_PATH}',
      cwd: '${INSTALL_DIR}/mini-services/multiwan-monitor',
      env: {
        DATABASE_URL: 'postgresql://${DB_USER}:${DB_PASS}@127.0.0.1:${DB_PORT}/${DB_NAME}',
      },
      watch: false,
      restart_delay: 5000,
      max_restarts: 30,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '${INSTALL_DIR}/.logs/multiwan-monitor-error.log',
      out_file: '${INSTALL_DIR}/.logs/multiwan-monitor-out.log',
      merge_logs: true,
      time: true,
    },

    // ─── 7. Syslog Service (UDP Port 1514) ───────────────────
    {
      name: 'cryptsk-syslog-service',
      script: 'index.ts',
      interpreter: '${BUN_PATH}',
      cwd: '${INSTALL_DIR}/mini-services/syslog-service',
      env: {
        DATABASE_URL: 'postgresql://${DB_USER}:${DB_PASS}@127.0.0.1:${DB_PORT}/${DB_NAME}',
      },
      watch: false,
      restart_delay: 5000,
      max_restarts: 30,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '${INSTALL_DIR}/.logs/syslog-service-error.log',
      out_file: '${INSTALL_DIR}/.logs/syslog-service-out.log',
      merge_logs: true,
      time: true,
    },

    // ─── 8. Diameter Service (Port 3870) ─────────────────────
    {
      name: 'cryptsk-diameter-service',
      script: 'index.ts',
      interpreter: '${BUN_PATH}',
      cwd: '${INSTALL_DIR}/mini-services/diameter-service',
      env: {},
      watch: false,
      restart_delay: 5000,
      max_restarts: 30,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '${INSTALL_DIR}/.logs/diameter-service-error.log',
      out_file: '${INSTALL_DIR}/.logs/diameter-service-out.log',
      merge_logs: true,
      time: true,
    },

    // ─── 9. SNMP Service (Port 3020) ──────────────────────────
    {
      name: 'cryptsk-snmp-service',
      script: 'index.ts',
      interpreter: '${BUN_PATH}',
      cwd: '${INSTALL_DIR}/mini-services/snmp-service',
      env: {},
      watch: false,
      restart_delay: 5000,
      max_restarts: 30,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '${INSTALL_DIR}/.logs/snmp-service-error.log',
      out_file: '${INSTALL_DIR}/.logs/snmp-service-out.log',
      merge_logs: true,
      time: true,
    },

    // ─── 10. Network Monitor (no port, polling only) ────────
    {
      name: 'cryptsk-network-monitor',
      script: 'index.ts',
      interpreter: '${BUN_PATH}',
      cwd: '${INSTALL_DIR}/mini-services/network-monitor',
      env: {
        DATABASE_URL: 'postgresql://${DB_USER}:${DB_PASS}@127.0.0.1:${DB_PORT}/${DB_NAME}',
      },
      watch: false,
      restart_delay: 5000,
      max_restarts: 30,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '${INSTALL_DIR}/.logs/network-monitor-error.log',
      out_file: '${INSTALL_DIR}/.logs/network-monitor-out.log',
      merge_logs: true,
      time: true,
    },

    // ─── 11. Billing Cron (no port, scheduled tasks) ────────
    {
      name: 'cryptsk-billing-cron',
      script: 'index.ts',
      interpreter: '${BUN_PATH}',
      cwd: '${INSTALL_DIR}/mini-services/billing-cron',
      env: {
        DATABASE_URL: 'postgresql://${DB_USER}:${DB_PASS}@127.0.0.1:${DB_PORT}/${DB_NAME}',
      },
      watch: false,
      restart_delay: 5000,
      max_restarts: 30,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '${INSTALL_DIR}/.logs/billing-cron-error.log',
      out_file: '${INSTALL_DIR}/.logs/billing-cron-out.log',
      merge_logs: true,
      time: true,
    },

    // ─── 12. WhatsApp Bot (no port, webhook receiver) ────────
    {
      name: 'cryptsk-whatsapp-bot',
      script: 'index.ts',
      interpreter: '${BUN_PATH}',
      cwd: '${INSTALL_DIR}/mini-services/whatsapp-bot',
      env: {
        DATABASE_URL: 'postgresql://${DB_USER}:${DB_PASS}@127.0.0.1:${DB_PORT}/${DB_NAME}',
      },
      watch: false,
      restart_delay: 5000,
      max_restarts: 30,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '${INSTALL_DIR}/.logs/whatsapp-bot-error.log',
      out_file: '${INSTALL_DIR}/.logs/whatsapp-bot-out.log',
      merge_logs: true,
      time: true,
    },

    // ─── 13. Session Engine (no port, internal) ──────────────
    {
      name: 'cryptsk-session-engine',
      script: 'index.ts',
      interpreter: '${BUN_PATH}',
      cwd: '${INSTALL_DIR}/mini-services/session-engine',
      env: {
        DATABASE_URL: 'postgresql://${DB_USER}:${DB_PASS}@127.0.0.1:${DB_PORT}/${DB_NAME}',
      },
      watch: false,
      restart_delay: 5000,
      max_restarts: 30,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '${INSTALL_DIR}/.logs/session-engine-error.log',
      out_file: '${INSTALL_DIR}/.logs/session-engine-out.log',
      merge_logs: true,
      time: true,
    },
  ],
};
ECOSEOF
  
  ok "PM2 ecosystem config created (13 services)"
}

# ─── Step 11: Create Log Directory & Start Services ─────────────────────
start_services() {
  info "Creating log directory..."
  mkdir -p "$INSTALL_DIR/.logs"
  
  info "Starting all services with PM2..."
  cd "$INSTALL_DIR"
  
  # Start all services
  pm2 start ecosystem.config.cjs 2>&1 | tail -20
  
  # Save PM2 process list for auto-restart on reboot
  pm2 save 2>/dev/null
  pm2 startup systemd -u root --hp /root 2>/dev/null || true
  
  ok "All services started"
}

# ─── Step 12: Verify Installation ───────────────────────────────────────
verify() {
  echo ""
  echo -e "${CYAN}═══════════════════════════════════════════════════════════════════${NC}"
  echo -e "${GREEN}  CRYPTSK ENTERPRISE GATEWAY — Deployment Complete!${NC}"
  echo -e "${CYAN}═══════════════════════════════════════════════════════════════════${NC}"
  echo ""
  
  # Show service status
  pm2 status 2>/dev/null
  
  echo ""
  echo -e "${CYAN}── Access Information ──────────────────────────────────────${NC}"
  echo -e "  UI:            ${GREEN}http://<server-ip>:3000${NC}"
  echo -e "  Login Email:    ${GREEN}admin@cryptsk.com${NC}"
  echo -e "  Login Password: ${GREEN}Admin@2026${NC}"
  echo -e "  Database:       PostgreSQL ${PG_VERSION} (${DB_NAME})"
  echo -e "  DB User:        ${DB_USER}"
  echo -e "  Install Dir:    ${INSTALL_DIR}"
  echo -e "  Run As:        root"
  echo ""
  echo -e "${CYAN}── Service Ports ────────────────────────────────────────────${NC}"
  echo "  :3000  — Next.js UI (Main Application)"
  echo "  :3005  — Gateway Service (TC/QoS, DHCP, DNS, Firewall)"
  echo "  :3006  — Multi-WAN Monitor"
  echo "  :3020  — SNMP Service"
  echo "  :3030  — IPS Daemon (Intrusion Prevention)"
  echo "  :3031  — nDPI Service (Traffic Classification)"
  echo "  :3799  — RADIUS Service (Authentication)"
  echo "  :3870  — Diameter Service (Wi-Fi Offload)"
  echo "  :1514  — Syslog Server (UDP)"
  echo ""
  echo -e "${CYAN}── Useful Commands ──────────────────────────────────────────${NC}"
  echo "  pm2 status                           # View all services"
  echo "  pm2 logs                              # Tail all logs"
  echo "  pm2 logs cryptsk-gateway              # Tail main app logs"
  echo "  pm2 restart all                       # Restart all services"
  echo "  pm2 stop all                          # Stop all services"
  echo "  sudo -u postgres psql -d ${DB_NAME}    # Connect to database"
  echo ""
}

# ─── Main ───────────────────────────────────────────────────────────────
main() {
  # CRITICAL: cd to /root immediately so clean_previous can safely
  # delete INSTALL_DIR even if the script is located inside it.
  cd /root
  
  echo ""
  echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║  Cryptsk Enterprise Gateway — Full Deploy Script           ║${NC}"
  echo -e "${CYAN}║  OS: Debian 12/13  |  DB: PostgreSQL ${PG_VERSION}  |  Runtime: Bun + Node  ║${NC}"
  echo -e "${CYAN}║  App runs as root — no separate application user           ║${NC}"
  echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
  echo ""
  
  STEP=1
  TOTAL=12
  
  clean_previous && echo "[$STEP/$TOTAL] Done" && STEP=$((STEP+1))
  install_system_deps && echo "[$STEP/$TOTAL] Done" && STEP=$((STEP+1))
  install_bun && echo "[$STEP/$TOTAL] Done" && STEP=$((STEP+1))
  setup_app_files && echo "[$STEP/$TOTAL] Done" && STEP=$((STEP+1))
  configure_postgresql && echo "[$STEP/$TOTAL] Done" && STEP=$((STEP+1))
  create_env_file && echo "[$STEP/$TOTAL] Done" && STEP=$((STEP+1))
  install_node_deps && echo "[$STEP/$TOTAL] Done" && STEP=$((STEP+1))
  install_mini_service_deps && echo "[$STEP/$TOTAL] Done" && STEP=$((STEP+1))
  setup_database && echo "[$STEP/$TOTAL] Done" && STEP=$((STEP+1))
  build_nextjs && echo "[$STEP/$TOTAL] Done" && STEP=$((STEP+1))
  create_ecosystem_config && echo "[$STEP/$TOTAL] Done" && STEP=$((STEP+1))
  start_services && echo "[$STEP/$TOTAL] Done" && STEP=$((STEP+1))
  verify
  
  echo -e "${GREEN}Deploy complete! Access the gateway at http://<server-ip>:3000${NC}"
}

# Run main
main "$@"