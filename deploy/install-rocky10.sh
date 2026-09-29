#!/bin/bash
# ============================================================
# CRYPTSK Nexus — Rocky Linux 10 Production Installer
# ============================================================
# Installs: Node.js 22 LTS, Bun, PM2, PostgreSQL 18,
#           FreeRADIUS 3.2.10, Caddy, git, base tools
# Clones:  https://github.com/chiranjitk/cryptsk-nexus.git -> /opt/cryptsk-nexus
#
# Usage (from sandbox):
#   node rsh.js 'bash /opt/install-rocky10.sh'
#
# Usage (on VM directly):
#   bash /opt/install-rocky10.sh
#
# Log: /var/log/cryptsk-install.log
# ============================================================

set -o pipefail
LOG=/var/log/cryptsk-install.log
exec > >(tee -a "$LOG") 2>&1
echo "============================================================"
echo "CRYPTSK Nexus — Rocky 10 Install started $(date)"
echo "============================================================"

# ─── 0. Helpers ───────────────────────────────────────────────
step() { echo -e "\n\033[1;36m[$1] $2\033[0m"; }
ok()   { echo -e "  \033[32m✓ $1\033[0m"; }
warn() { echo -e "  \033[33m⚠ $1\033[0m"; }
fail() { echo -e "  \033[31m✗ $1\033[0m"; }
has()  { command -v "$1" >/dev/null 2>&1; }

# ─── 1. System update + base packages ──────────────────────────
step 1 "System update + base packages"
dnf update -y
dnf install -y git curl wget tar unzip vim make gcc firewalld \
    policycoreutils-python-utils chrony bash-completion
ok "base packages installed"

# ─── 2. Node.js 22 LTS (NodeSource) ────────────────────────────
step 2 "Node.js 22 LTS"
if has node && node -v | grep -q 'v2[2-9]'; then
  ok "Node.js already installed: $(node -v)"
else
  curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
  dnf install -y nodejs
  ok "Node.js installed: $(node -v)"
fi

# ─── 3. Bun ───────────────────────────────────────────────────
step 3 "Bun"
if has bun; then
  ok "Bun already installed: $(bun --version)"
else
  curl -fsSL https://bun.sh/install | bash
  # Source bun so it's available in this session
  export BUN_INSTALL="$HOME/.bun"
  export PATH="$BUN_INSTALL/bin:$PATH"
  # Add to PATH for all future shells
  grep -q '.bun/bin' ~/.bashrc || echo 'export BUN_INSTALL="$HOME/.bun"' >> ~/.bashrc
  grep -q '.bun/bin' ~/.bashrc || echo 'export PATH="$BUN_INSTALL/bin:$PATH"' >> ~/.bashrc
  ok "Bun installed: $(bun --version)"
fi

# ─── 4. PM2 ───────────────────────────────────────────────────
step 4 "PM2 (process manager for Next.js plane)"
if has pm2; then
  ok "PM2 already installed: $(pm2 -v)"
else
  npm install -g pm2
  ok "PM2 installed: $(pm2 -v)"
  # Configure PM2 to start on boot
  pm2 startup systemd -u root --hp /root | tail -1 | bash 2>/dev/null || warn "PM2 startup script needs manual run"
  pm2 save
  ok "PM2 startup configured"
fi

# ─── 5. PostgreSQL 18 ─────────────────────────────────────────
step 5 "PostgreSQL 18 (latest stable)"
if has psql && psql --version | grep -q '18'; then
  ok "PostgreSQL 18 already installed: $(psql --version)"
else
  # Install PGDG repo for Rocky 10
  dnf install -y https://download.postgresql.org/pub/repos/yum/reporpms/EL-10/x86_64/pgdg-rockylinux-10-release.rpm 2>/dev/null || \
  dnf install -y https://download.postgresql.org/pub/repos/yum/reporpms/EL-9/x86_64/pgdg-redhat-repo-latest.noarch.rpm
  dnf install -y postgresql18-server postgresql18-contrib
  ok "PostgreSQL 18 packages installed"

  # Initialize the database
  if [ ! -f /var/lib/pgsql/18/data/PG_VERSION ]; then
    /usr/pgsql-18/bin/postgresql-18-setup initdb
    ok "PostgreSQL 18 initialized"
  else
    ok "PostgreSQL 18 already initialized"
  fi

  # Start + enable
  systemctl enable postgresql-18
  systemctl start postgresql-18
  ok "PostgreSQL 18 started + enabled"

  # Configure password authentication (md5 for cryptsk)
  PG_HBA=/var/lib/pgsql/18/data/pg_hba.conf
  if ! grep -q 'cryptsknexus' "$PG_HBA" 2>/dev/null; then
    cp "$PG_HBA" "${PG_HBA}.orig.$(date +%s)"
    # Allow local + host connections with md5
    sed -i 's/ident$/md5/g' "$PG_HBA" 2>/dev/null
    sed -i 's/peer$/md5/g' "$PG_HBA" 2>/dev/null
    systemctl restart postgresql-18
    ok "pg_hba.conf configured for md5 auth"
  fi
fi

# Create cryptsk database + user
step 5.1 "Create cryptsknexus database + user"
if sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='cryptsknexus'" | grep -q 1; then
  ok "DB user 'cryptsknexus' already exists"
else
  sudo -u postgres psql -c "CREATE USER cryptsknexus WITH PASSWORD 'CryptskNexus2026';" 2>/dev/null
  ok "DB user 'cryptsknexus' created"
fi
if sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='cryptsknexus'" | grep -q 1; then
  ok "Database 'cryptsknexus' already exists"
else
  sudo -u postgres createdb -O cryptsknexus cryptsknexus
  ok "Database 'cryptsknexus' created"
fi

# ─── 6. FreeRADIUS 3.2.10 ────────────────────────────────────
step 6 "FreeRADIUS 3.2.x (latest stable — spec says 3.2.10)"
if has radiusd || has freeradius; then
  ok "FreeRADIUS already installed: $(radiusd -v 2>/dev/null || freeradius -v 2>/dev/null | head -1)"
else
  # Rocky 10 ships FreeRADIUS 3.2.x in AppStream
  dnf install -y freeradius freeradius-utils freeradius-postgresql freeradius-perl
  ok "FreeRADIUS installed"
  # Don't start yet — Phase 3 will configure it
  systemctl enable radiusd 2>/dev/null
  ok "FreeRADIUS enabled (will configure + start in Phase 3)"
fi

# ─── 7. Caddy (reverse proxy) ────────────────────────────────
step 7 "Caddy (reverse proxy / TLS)"
if has caddy; then
  ok "Caddy already installed: $(caddy version 2>/dev/null | head -1)"
else
  dnf install -y caddy 2>/dev/null || {
    # Fallback: official Caddy repo
    dnf install -y 'dnf-command(copr)'
    dnf copr enable -y @caddy/caddy
    dnf install -y caddy
  }
  ok "Caddy installed"
  systemctl enable caddy
  ok "Caddy enabled (will configure in Phase 0+)"
fi

# ─── 8. Firewall ──────────────────────────────────────────────
step 8 "Firewall configuration"
systemctl enable --now firewalld
# SSH (already open — don't lock ourselves out)
firewall-cmd --permanent --add-service=ssh
# HTTP + HTTPS (Caddy will proxy to :3000)
firewall-cmd --permanent --add-service=http
firewall-cmd --permanent --add-service=https
# RADIUS auth + accounting (for Phase 3)
firewall-cmd --permanent --add-service=radius 2>/dev/null || \
  firewall-cmd --permanent --add-port=1812/udp
firewall-cmd --permanent --add-port=1813/udp
# Reload
firewall-cmd --reload
ok "Firewall configured: ssh + http + https + radius(1812/1813)"

# ─── 9. Clone the repo ────────────────────────────────────────
step 9 "Clone cryptsk-nexus repo"
if [ -d /opt/cryptsk-nexus/.git ]; then
  ok "Repo already cloned at /opt/cryptsk-nexus"
  cd /opt/cryptsk-nexus && git pull origin main 2>/dev/null
  ok "Repo updated to latest"
else
  rm -rf /opt/cryptsk-nexus 2>/dev/null
  git clone https://github.com/chiranjitk/cryptsk-nexus.git /opt/cryptsk-nexus
  ok "Repo cloned to /opt/cryptsk-nexus"
fi

# ─── 10. Install npm dependencies ──────────────────────────────
step 10 "Install npm dependencies (bun install)"
cd /opt/cryptsk-nexus
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"
if has bun; then
  bun install 2>&1 | tail -5
  ok "Dependencies installed"
else
  warn "Bun not in PATH yet — run 'source ~/.bashrc' or re-login, then 'cd /opt/cryptsk-nexus && bun install'"
fi

# ─── 11. Summary ──────────────────────────────────────────────
step 11 "Summary"
echo "============================================================"
echo "INSTALL COMPLETE — $(date)"
echo "============================================================"
echo "Node.js:   $(node -v 2>/dev/null || echo 'NOT FOUND')"
echo "Bun:       $(bun --version 2>/dev/null || echo 'run: source ~/.bashrc')"
echo "PM2:       $(pm2 -v 2>/dev/null || echo 'NOT FOUND')"
echo "PostgreSQL: $(psql --version 2>/dev/null || echo 'NOT FOUND')"
echo "  DB:      cryptsknexus (owner: cryptsknexus)"
echo "FreeRADIUS: $(radiusd -v 2>/dev/null | head -1 || freeradius -v 2>/dev/null | head -1 || echo 'NOT FOUND')"
echo "Caddy:     $(caddy version 2>/dev/null | head -1 || echo 'NOT FOUND')"
echo "Repo:      /opt/cryptsk-nexus"
echo "Firewall:  ssh + http + https + radius(1812/1813)"
echo ""
echo "Next steps:"
echo "  1. Configure .env on prod: /opt/cryptsk-nexus/.env"
echo "  2. Run Prisma migrations:  cd /opt/cryptsk-nexus && bun run db:push"
echo "  3. Build Next.js:          cd /opt/cryptsk-nexus && npx next build"
echo "  4. Start with PM2:          cd /opt/cryptsk-nexus && pm2 start ecosystem.config.cjs"
echo "============================================================"
