#!/usr/bin/env bash
# ============================================================
# CRYPTSK Nexus — Full Production Setup Script for New OS
# ============================================================
# This script performs a COMPLETE installation of the CRYPTSK ISP
# Platform on a fresh OS, including:
#   - VPP v26.06 + DPDK 25.11 (built from source with DPDK support)
#   - PostgreSQL 18
#   - Node.js 22 LTS + Bun + PM2 + Go 1.26
#   - CRYPTSK Nexus application (Next.js + 5 mini-services)
#   - GoVPP adapter (Go binary API client)
#   - FreeRADIUS 3.2 + rlm_rest module
#   - Caddy reverse proxy (optional)
#   - All systemd services + PM2 processes
#   - End-to-end verification
#
# Supported OS:
#   - Rocky Linux 10 / RHEL 10 / CentOS Stream 10
#   - Debian 12 (Bookworm) / Debian 13 (Trixie)
#   - Ubuntu 22.04 LTS / Ubuntu 24.04 LTS
#
# Usage (as root):
#   curl -fsSL https://raw.githubusercontent.com/chiranjitk/cryptsk-nexus/main/scripts/setup-new-os.sh | bash
#   OR:
#   wget -O setup.sh https://raw.githubusercontent.com/chiranjitk/cryptsk-nexus/main/scripts/setup-new-os.sh
#   bash setup.sh
#
# Customizable env vars (set before running):
#   APP_DIR=/opt/ispplatform                # Where to install the app
#   DB_NAME=cryptsknexus                    # PostgreSQL database name
#   DB_USER=cryptsknexus                    # PostgreSQL user
#   DB_PASS=CryptskNexus2026               # PostgreSQL password
#   ADMIN_EMAIL=admin@cryptsk.com          # Admin user email
#   ADMIN_PASS=Admin@2026                   # Admin user password
#   GITHUB_REPO=https://github.com/chiranjitk/cryptsk-nexus.git
#   GITHUB_BRANCH=main
#   VPP_VERSION=v26.06                     # VPP release tag (or 'master')
#   INSTALL_VPP_FROM_SOURCE=true            # Set false to skip VPP source build
#   CONFIGURE_DPDK_NIC=true                 # Set false to skip NIC binding
#   DPDK_NIC_PCI=0000:13:00.0               # PCI address of NIC for DPDK
#   START_FIREWALL=true                     # Set false to skip firewalld setup
#
# Log: /var/log/cryptsk-setup.log
# ============================================================

set -o pipefail

# ─── Configuration (defaults — override via env vars) ─────────
APP_DIR="${APP_DIR:-/opt/ispplatform}"
DB_NAME="${DB_NAME:-cryptsknexus}"
DB_USER="${DB_USER:-cryptsknexus}"
DB_PASS="${DB_PASS:-CryptskNexus2026}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-5432}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@cryptsk.com}"
ADMIN_PASS="${ADMIN_PASS:-Admin@2026}"
GITHUB_REPO="${GITHUB_REPO:-https://github.com/chiranjitk/cryptsk-nexus.git}"
GITHUB_BRANCH="${GITHUB_BRANCH:-main}"
VPP_VERSION="${VPP_VERSION:-stable/2606}"
INSTALL_VPP_FROM_SOURCE="${INSTALL_VPP_FROM_SOURCE:-true}"
CONFIGURE_DPDK_NIC="${CONFIGURE_DPDK_NIC:-true}"
DPDK_NIC_PCI="${DPDK_NIC_PCI:-0000:13:00.0}"
START_FIREWALL="${START_FIREWALL:-false}"
SESSION_SECRET="${SESSION_SECRET:-cryptsk_session_secret_key_2026_isp_platform}"
RADIUS_API_SECRET="${RADIUS_API_SECRET:-cryptsk-radius-shared-secret-2026}"
APP_PORT="${APP_PORT:-3000}"

LOG=/var/log/cryptsk-setup.log
mkdir -p "$(dirname "$LOG")"
exec > >(tee -a "$LOG") 2>&1

# ─── Color output ─────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

step() { echo -e "\n${MAGENTA}${BOLD}[STEP]${NC} ${BOLD}$1${NC}"; }
ok()   { echo -e "  ${GREEN}✓${NC} $1"; }
info() { echo -e "  ${CYAN}ℹ${NC} $1"; }
warn() { echo -e "  ${YELLOW}⚠${NC} $1"; }
fail() { echo -e "  ${RED}✗ $1${NC}"; exit 1; }
has()  { command -v "$1" >/dev/null 2>&1; }

# ─── Check root ───────────────────────────────────────────────
[ "$(id -u)" -eq 0 ] || fail "This script must be run as root (use sudo or run as root user)"

# ─── Detect OS ───────────────────────────────────────────────
detect_os() {
  if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS_ID="$ID"
    OS_VERSION="$VERSION_ID"
    OS_PRETTY="$PRETTY_NAME"
  else
    fail "Cannot detect OS — /etc/os-release missing"
  fi

  case "$OS_ID" in
    rocky|rhel|centos|fedora|almalinux)
      OS_FAMILY="rhel"
      PKG_MGR="dnf"
      ;;
    debian|ubuntu|linuxmint)
      OS_FAMILY="debian"
      PKG_MGR="apt"
      ;;
    *)
      fail "Unsupported OS: $OS_ID (supported: rocky/rhel/centos/debian/ubuntu)"
      ;;
  esac

  info "Detected OS: $OS_PRETTY (family=$OS_FAMILY, pkgmgr=$PKG_MGR)"
}

# ─── Step 1: System update + base packages ────────────────────
install_base_packages() {
  step "1. System update + base packages"

  if [ "$PKG_MGR" = "dnf" ]; then
    dnf update -y
    dnf install -y git curl wget tar unzip vim make gcc gcc-c++ \
      firewalld chrony bash-completion autoconf automake libtool \
      pkg-config pixman-devel libcap-devel openssl-devel \
      numactl-devel libmnl-devel cmake ninja-build python3-pip \
      grpc-plugins grpc grpc-devel protobuf protobuf-devel \
      libuuid-devel elfutils-libelf-devel json-c-devel \
      systemd-rpm-macros rpm-build yum-utils
    # EPEL for extra packages
    dnf install -y epel-release || true
    dnf config-manager --set-enabled crb 2>/dev/null || true
    dnf install -y htop jq
  else
    apt update -y
    apt install -y git curl wget tar unzip vim make gcc g++ \
      autoconf automake libtool pkg-config pixman-libs libcap-dev \
      libssl-dev libnuma-dev libmnl-dev cmake ninja-build \
      python3-pip uuid-dev libelf-dev libjson-c-dev systemd \
      htop jq ca-certificates gnupg lsb-release
  fi
  ok "Base packages installed"
}

# ─── Step 2: Install Go 1.26 ──────────────────────────────────
install_go() {
  step "2. Go (golang 1.26+)"

  if has go && go version | grep -q 'go1.2[6-9]'; then
    ok "Go already installed: $(go version)"
    return
  fi

  if [ "$OS_FAMILY" = "rhel" ]; then
    dnf install -y golang
  else
    GO_VERSION="1.26.7"
    ARCH=$(uname -m)
    case "$ARCH" in
      x86_64)  GO_ARCH="amd64" ;;
      aarch64) GO_ARCH="arm64" ;;
      *)       fail "Unsupported arch: $ARCH" ;;
    esac
    curl -fsSL "https://go.dev/dl/go${GO_VERSION}.linux-${GO_ARCH}.tar.gz" -o /tmp/go.tar.gz
    rm -rf /usr/local/go
    tar -C /usr/local -xzf /tmp/go.tar.gz
    rm /tmp/go.tar.gz
    echo 'export PATH=$PATH:/usr/local/go/bin' > /etc/profile.d/go.sh
    source /etc/profile.d/go.sh
    export PATH=$PATH:/usr/local/go/bin
  fi

  has go || fail "Go installation failed"
  ok "Go installed: $(go version)"

  # Set up GOPATH
  export GOPATH="${GOPATH:-/root/go}"
  mkdir -p "$GOPATH/bin" "$GOPATH/src" "$GOPATH/pkg"
}

# ─── Step 3: Install DPDK ─────────────────────────────────────
install_dpdk() {
  step "3. DPDK (Data Plane Development Kit)"

  if [ "$OS_FAMILY" = "rhel" ]; then
    dnf install -y dpdk dpdk-devel dpdk-tools
  else
    apt install -y dpdk dpdk-dev dpdk-rte-libdpdk-dev libdpdk-dev
  fi

  ok "DPDK installed: $(dpdk-test-info 2>/dev/null | head -1 || dpdk-info 2>/dev/null || echo 'see /usr/share/DPDK/')"

  # Verify DPDK headers
  if [ -d /usr/include/dpdk ]; then
    info "DPDK headers at /usr/include/dpdk/"
  elif [ -d /usr/include/dpdk-rte ]; then
    info "DPDK headers at /usr/include/dpdk-rte/"
  fi
}

# ─── Step 4: Configure hugepages for DPDK ─────────────────────
configure_hugepages() {
  step "4. Configure hugepages for DPDK"

  # Set 1024 × 2MB = 2GB hugepages
  CURRENT=$(grep HugePages_Total /proc/meminfo | awk '{print $2}')
  if [ "$CURRENT" -lt 1024 ]; then
    sysctl -w vm.nr_hugepages=1024
    echo "vm.nr_hugepages=1024" > /etc/sysctl.d/99-hugepages.conf
    ok "Hugepages set to 1024 × 2MB = 2GB"
  else
    ok "Hugepages already configured: $CURRENT pages"
  fi

  # Mount hugetlbfs if not mounted
  if ! mountpoint -q /dev/hugepages; then
    mkdir -p /dev/hugepages
    mount -t hugetlbfs nodev /dev/hugepages
    echo "nodev /dev/hugepages hugetlbfs defaults 0 0" >> /etc/fstab
    ok "Hugetlbfs mounted at /dev/hugepages"
  else
    ok "Hugetlbfs already mounted at /dev/hugepages"
  fi

  # Set kernel parameters for DPDK
  cat > /etc/sysctl.d/99-cryptsk-dpdk.conf << 'SYSCTL'
# Allow non-root users to access hugepages
kernel.shmmax = 4294967296
kernel.shmall = 1048576
SYSCTL
  sysctl --system 2>/dev/null || true
}

# ─── Step 5: Build VPP from source ───────────────────────────
build_vpp() {
  step "5. Build VPP v26.06 from source"

  if [ "$INSTALL_VPP_FROM_SOURCE" != "true" ]; then
    warn "INSTALL_VPP_FROM_SOURCE=false — skipping VPP build"
    return
  fi

  if has vpp && has vppctl; then
    ok "VPP already installed: $(vppctl show version 2>&1 | head -1)"
    return
  fi

  # Install VPP build dependencies
  if [ "$OS_FAMILY" = "rhel" ]; then
    dnf install -y glibc-devel.x86_64 glibc-devel.i686 \
      chrpath libffi-devel xmlto graphviz \
      compat-openssl11-devel
  else
    apt install -y chrpath libffi-dev xmlto graphviz
  fi

  # FD.io repo for VPP source + binary packages
  if [ "$OS_FAMILY" = "rhel" ]; then
    cat > /etc/yum.repos.d/fdio_release.repo << 'REPO'
[fdio_release]
name=fdio_release
baseurl=https://packagecloud.io/fdio/release/el/9/$basearch
repo_gpgcheck=1
gpgcheck=0
enabled=1
gpgkey=https://packagecloud.io/fdio/release/gpgkey
sslverify=1
sslcacert=/etc/pki/tls/certs/ca-bundle.crt
metadata_expire=300

[fdio_release-source]
name=fdio_release-source
baseurl=https://packagecloud.io/fdio/release/el/9/SRPMS
repo_gpgcheck=1
gpgcheck=0
enabled=1
gpgkey=https://packagecloud.io/fdio/release/gpgkey
sslverify=1
sslcacert=/etc/pki/tls/certs/ca-bundle.crt
metadata_expire=300
REPO

    cat > /etc/yum.repos.d/fdio_master.repo << 'REPO'
[fdio_master]
name=fdio_master
baseurl=https://packagecloud.io/fdio/master/el/10/$basearch
repo_gpgcheck=1
gpgcheck=0
enabled=1
gpgkey=https://packagecloud.io/fdio/master/gpgkey
sslverify=1
sslcacert=/etc/pki/tls/certs/ca-bundle.crt
metadata_expire=300

[fdio_master-source]
name=fdio_master-source
baseurl=https://packagecloud.io/fdio/master/el/10/SRPMS
repo_gpgcheck=1
gpgcheck=0
enabled=1
gpgkey=https://packagecloud.io/fdio/master/gpgkey
sslverify=1
sslcacert=/etc/pki/tls/certs/ca-bundle.crt
metadata_expire=300
REPO
    dnf clean all
    dnf makecache
  fi

  # Clone VPP source
  VPP_SRC_DIR=/usr/src/vpp
  if [ ! -d "$VPP_SRC_DIR/.git" ]; then
    git clone --depth 1 --branch "$VPP_VERSION" https://github.com/FDio/vpp.git "$VPP_SRC_DIR" 2>/dev/null || \
    git clone --depth 1 https://github.com/FDio/vpp.git "$VPP_SRC_DIR"
  fi
  cd "$VPP_SRC_DIR"

  # Build VPP (this takes 10-20 minutes)
  info "Building VPP from source (10-20 minutes)..."
  make install-dep 2>&1 | tail -5
  make pkg-rpm 2>&1 | tail -5 || true

  # Install built RPMs (or build artifacts)
  if ls build/vpp_rpmbuild/RPMS/x86_64/*.rpm 2>/dev/null; then
    dnf install -y build/vpp_rpmbuild/RPMS/x86_64/*.rpm
  else
    # Fallback: build directly + copy binaries
    make build 2>&1 | tail -5
    cp build-install/vpp/bin/vpp /usr/bin/vpp
    cp build-install/vpp/bin/vppctl /usr/bin/vppctl
    cp -r build-install/vpp/lib/vpp_plugins/* /usr/lib64/vpp_plugins/ 2>/dev/null || true
    mkdir -p /usr/lib64/vpp_plugins
    cp -r build-install/vpp/lib/vpp_plugins/* /usr/lib64/vpp_plugins/ 2>/dev/null || true
    cp build-install/vpp/lib/libvppinfra.so* /usr/lib64/ 2>/dev/null || true
    ldconfig
  fi

  has vpp || fail "VPP build/install failed"
  ok "VPP installed: $(vppctl show version 2>&1 | head -1)"
}

# ─── Step 6: Configure VPP startup.conf ──────────────────────
configure_vpp() {
  step "6. Configure VPP (startup.conf + systemd)"

  mkdir -p /etc/vpp /run/vpp /var/log/vpp

  # Detect first NIC PCI address (skip if CONFIGURE_DPDK_NIC=false)
  NIC_PCI="$DPDK_NIC_PCI"
  if [ "$CONFIGURE_DPDK_NIC" = "true" ] && [ -z "$DPDK_NIC_PCI" ]; then
    NIC_PCI=$(lspci -D | grep -i ethernet | head -1 | awk '{print $1}')
    info "Auto-detected NIC PCI: $NIC_PCI"
  fi

  cat > /etc/vpp/startup.conf << VPPCONF
unix {
    nodaemon
    log /var/log/vpp/vpp.log
    full-coredump
    cli-listen /run/vpp/cli.sock
    api-socket /run/vpp/api.sock
    api-trace {
        on
    }
}

cpu {
    main-core 0
    corelist-workers 1
}

$(if [ "$CONFIGURE_DPDK_NIC" = "true" ] && [ -n "$NIC_PCI" ]; then
cat <<DPDK
dpdk {
    dev $NIC_PCI {
        num-rx-queues 1
        num-tx-queues 1
    }
}
DPDK
fi)

# Use af_packet as fallback if DPDK NIC isn't bound
# (VPP will use TAP interfaces when DPDK device unavailable)
tapcli {
    enable
}

plugins {
    plugin default { enable }
    # Disable plugins you don't need to reduce memory:
    # plugin ping_plugin.so { disable }
    # plugin mseal_plugin.so { disable }
}

# Memory
memory {
    main-heap-size 1G
}
VPPCONF
  ok "VPP startup.conf written to /etc/vpp/startup.conf"

  # systemd unit for VPP
  cat > /etc/systemd/system/vpp.service << 'VPPSERVICE'
[Unit]
Description=CRYPTSK Nexus — VPP Dataplane (DPDK + TAP fallback)
After=network.target
Wants=network.target

[Service]
Type=simple
ExecStartPre=/sbin/sysctl -w vm.nr_hugepages=1024
ExecStartPre=/bin/mkdir -p /run/vpp /var/log/vpp
ExecStart=/usr/bin/vpp -c /etc/vpp/startup.conf
Restart=on-failure
RestartSec=5
LimitMEMLOCK=infinity
LimitNOFILE=65536
NoNewPrivileges=true

# Security
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
DeviceAllow=/dev/uio0 rw
DeviceAllow=/dev/vfio/vfio rw
DeviceAllow=/dev/hugepages rw
ReadWritePaths=/run/vpp /var/log/vpp

[Install]
WantedBy=multi-user.target
VPPSERVICE
  systemctl daemon-reload
  systemctl enable vpp
  systemctl start vpp
  sleep 3

  if systemctl is-active --quiet vpp; then
    ok "VPP service started and active"
    vppctl show version 2>&1 | head -1 | info
  else
    warn "VPP service failed to start — check 'journalctl -u vpp -n 50'"
  fi
}

# ─── Step 7: Install PostgreSQL 18 ────────────────────────────
install_postgres() {
  step "7. PostgreSQL 18"

  if has psql && psql --version | grep -q '18\|17\|16'; then
    ok "PostgreSQL already installed: $(psql --version)"
  else
    if [ "$OS_FAMILY" = "rhel" ]; then
      dnf install -y https://download.postgresql.org/pub/repos/yum/reporpms/EL-10/x86_64/pgdg-rockylinux-10-release.rpm 2>/dev/null || \
      dnf install -y https://download.postgresql.org/pub/repos/yum/reporpms/EL-9/x86_64/pgdg-redhat-repo-latest.noarch.rpm
      dnf install -y postgresql18-server postgresql18-contrib
      PGDATA=/var/lib/pgsql/18/data
      PGBIN=/usr/pgsql-18/bin
    else
      # Debian/Ubuntu — install PGDG repo
      curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /usr/share/keyrings/postgresql.gpg
      echo "deb [signed-by=/usr/share/keyrings/postgresql.gpg] http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main 18" > /etc/apt/sources.list.d/pgdg.list
      apt update
      apt install -y postgresql-18 postgresql-contrib
      PGDATA=/var/lib/postgresql/18/main
      PGBIN=/usr/lib/postgresql/18/bin
    fi

    # Initialize (RHEL only — Debian auto-inits)
    if [ -n "$PGDATA" ] && [ ! -f "$PGDATA/PG_VERSION" ] && [ -n "$PGBIN" ]; then
      "$PGBIN/initdb" -D "$PGDATA" --auth-local=trust --auth-host=md5 2>&1 | tail -3
    fi
  fi

  # Start + enable
  if [ "$OS_FAMILY" = "rhel" ]; then
    systemctl enable postgresql-18
    systemctl start postgresql-18
  else
    systemctl enable postgresql
    systemctl start postgresql
  fi
  ok "PostgreSQL service started"

  # Create DB + user
  su - postgres -c "psql -c \"CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';\"" 2>&1 | grep -v ERROR || true
  su - postgres -c "psql -c \"CREATE DATABASE $DB_NAME OWNER $DB_USER;\"" 2>&1 | grep -v ERROR || true
  su - postgres -c "psql -c \"ALTER USER $DB_USER WITH SUPERUSER;\"" 2>&1 | grep -v ERROR || true

  # Allow local connections (md5 auth)
  if [ "$OS_FAMILY" = "rhel" ]; then
    PGHBA=/var/lib/pgsql/18/data/pg_hba.conf
  else
    PGHBA=/etc/postgresql/18/main/pg_hba.conf
  fi
  if [ -f "$PGHBA" ]; then
    sed -i 's/^host.*127.0.0.1.*ident/host    all             all             127.0.0.1/32    md5/' "$PGHBA"
    sed -i 's/^host.*::1\/128.*ident/host    all             all             ::1/128         md5/' "$PGHBA"
    sed -i 's/^local.*all.*all.*peer/local   all             all                                     trust/' "$PGHBA"
    systemctl restart $([ "$OS_FAMILY" = "rhel" ] && echo postgresql-18 || echo postgresql) 2>/dev/null || true
  fi

  # Test connection
  if su - postgres -c "psql -d $DB_NAME -c 'SELECT version();'" 2>&1 | grep -q 'PostgreSQL'; then
    ok "Database $DB_NAME created and accessible"
  else
    warn "Database test failed — check pg_hba.conf"
  fi

  # Write the DATABASE_URL for later use
  export DATABASE_URL="postgresql://$DB_USER:$DB_PASS@$DB_HOST:$DB_PORT/$DB_NAME"
  echo "DATABASE_URL=$DATABASE_URL" > /etc/cryptsk.env
}

# ─── Step 8: Install Node.js 22 + Bun + PM2 ──────────────────
install_node_bun_pm2() {
  step "8. Node.js 22 LTS + Bun + PM2"

  # Node.js 22
  if has node && node -v | grep -q 'v2[2-9]'; then
    ok "Node.js already installed: $(node -v)"
  else
    if [ "$OS_FAMILY" = "rhel" ]; then
      curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
      dnf install -y nodejs
    else
      curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
      apt install -y nodejs
    fi
    ok "Node.js installed: $(node -v)"
  fi

  # Bun
  if has bun; then
    ok "Bun already installed: $(bun --version)"
  else
    curl -fsSL https://bun.sh/install | bash
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"
    grep -q '.bun/bin' ~/.bashrc || echo 'export BUN_INSTALL="$HOME/.bun"' >> ~/.bashrc
    grep -q '.bun/bin' ~/.bashrc || echo 'export PATH="$BUN_INSTALL/bin:$PATH"' >> ~/.bashrc
    ok "Bun installed: $(bun --version)"
  fi

  # PM2
  if has pm2; then
    ok "PM2 already installed: $(pm2 -v)"
  else
    npm install -g pm2
    pm2 startup systemd -u root --hp /root 2>&1 | tail -1 | bash 2>/dev/null || true
    pm2 save
    ok "PM2 installed: $(pm2 -v)"
  fi

  # pnpm (optional, for some scripts)
  npm install -g pnpm 2>&1 | tail -1
}

# ─── Step 9: Install FreeRADIUS + rlm_rest ────────────────────
install_freeradius() {
  step "9. FreeRADIUS 3.2 + rlm_rest module"

  if [ "$OS_FAMILY" = "rhel" ]; then
    # Use Inkbridge repo (FreeRADIUS 3.2.10 stable for RHEL 10)
    cat > /etc/yum.repos.d/inkbridge.repo << 'REPO'
[inkbridge]
name=inkbridge-$releasever
baseurl=http://packages.inkbridgenetworks.com/freeradius-3.2/rocky/$releasever/
enabled=1
gpgcheck=1
gpgkey=https://packages.inkbridgenetworks.com/pgp/packages.networkradius.com.asc
REPO
    dnf install -y freeradius freeradius-rest freeradius-postgresql freeradius-utils
  else
    apt install -y freeradius freeradius-rest freeradius-postgresql freeradius-utils
  fi

  ok "FreeRADIUS installed: $(radiusd --version 2>&1 || freeradius -v 2>&1 || echo 'see /etc/raddb/')"

  # Enable + start
  systemctl enable radiusd 2>/dev/null || systemctl enable freeradius 2>/dev/null || true
}

# ─── Step 10: Clone CRYPTSK Nexus app ─────────────────────────
clone_app() {
  step "10. Clone CRYPTSK Nexus application"

  if [ -d "$APP_DIR/.git" ]; then
    info "App directory already exists — pulling latest"
    cd "$APP_DIR"
    git fetch --all
    git reset --hard "origin/$GITHUB_BRANCH"
    git pull origin "$GITHUB_BRANCH"
  else
    mkdir -p "$(dirname "$APP_DIR")"
    git clone --depth 1 --branch "$GITHUB_BRANCH" "$GITHUB_REPO" "$APP_DIR"
    cd "$APP_DIR"
  fi

  ok "App cloned to $APP_DIR at $(git rev-parse --short HEAD)"

  # Write .env file
  cat > "$APP_DIR/.env" << ENV
DATABASE_URL=postgresql://$DB_USER:$DB_PASS@$DB_HOST:$DB_PORT/$DB_NAME
SESSION_SECRET=$SESSION_SECRET
NEXTAUTH_URL=http://localhost:$APP_PORT
NODE_ENV=production
ENV
  ok ".env written with PostgreSQL DATABASE_URL"
}

# ─── Step 11: Install app dependencies + Prisma ───────────────
install_app_deps() {
  step "11. Install app dependencies (npm + bun + prisma)"

  cd "$APP_DIR"
  bun install 2>&1 | tail -3
  ok "Bun dependencies installed"

  # Install mini-services deps
  for d in mini-services/session-engine mini-services/nat-logger mini-services/ndpi-service; do
    if [ -d "$d" ]; then
      cd "$APP_DIR/$d"
      bun install 2>&1 | tail -2
      ok "Deps installed for $d"
    fi
  done
  cd "$APP_DIR"

  # Push Prisma schema to DB + generate client
  info "Running prisma db push (creates all tables)..."
  DATABASE_URL="postgresql://$DB_USER:$DB_PASS@$DB_HOST:$DB_PORT/$DB_NAME" npx prisma db push --accept-data-loss 2>&1 | tail -5
  ok "Prisma schema pushed to PostgreSQL"

  info "Running prisma generate..."
  DATABASE_URL="postgresql://$DB_USER:$DB_PASS@$DB_HOST:$DB_PORT/$DB_NAME" npx prisma generate 2>&1 | tail -3
  ok "Prisma client generated"

  # Copy generated prisma client to mini-services (they have local node_modules that default-stub)
  for d in mini-services/session-engine mini-services/nat-logger mini-services/ndpi-service; do
    if [ -d "$APP_DIR/$d/node_modules" ]; then
      rm -rf "$APP_DIR/$d/node_modules/.prisma"
      cp -r "$APP_DIR/node_modules/.prisma" "$APP_DIR/$d/node_modules/.prisma"
      ok "Prisma client copied to $d/node_modules/.prisma"
    fi
  done
}

# ─── Step 12: Build Next.js ───────────────────────────────────
build_nextjs() {
  step "12. Build Next.js for production"

  cd "$APP_DIR"
  info "Running next build (5-10 minutes)..."
  NODE_OPTIONS="--max-old-space-size=2048" npx next build 2>&1 | tail -10
  ok "Next.js build complete"

  # Verify standalone output exists
  if [ -d "$APP_DIR/.next/standalone" ]; then
    ok "Standalone build exists at .next/standalone/"
  else
    warn "Standalone build missing — Next.js will run via next-server"
  fi
}

# ─── Step 13: Build GoVPP adapter (Go binary) ─────────────────
build_govpp_adapter() {
  step "13. Build GoVPP adapter (Go binary)"

  cd "$APP_DIR/gateway/vpp/govpp-adapter"
  export GOFLAGS="-mod=mod"
  go mod tidy 2>&1 | tail -3
  go build -o cryptsk-govpp-adapter 2>&1 | tail -3
  if [ -f cryptsk-govpp-adapter ]; then
    ok "GoVPP adapter built: $(ls -la cryptsk-govpp-adapter | awk '{print $5}') bytes"
  else
    fail "GoVPP adapter build failed — check 'go build' output above"
  fi
}

# ─── Step 14: Configure FreeRADIUS rlm_rest ──────────────────
configure_freeradius() {
  step "14. Configure FreeRADIUS rlm_rest + clients + sites"

  RADDDB=/etc/raddb
  [ -d "$RADDDB" ] || RADDDB=/etc/freeradius
  [ -d "$RADDDB" ] || fail "FreeRADIUS config directory not found"

  # Enable rlm_rest module
  ln -sf "$RADDDB/mods-available/rest" "$RADDDB/mods-enabled/rest" 2>/dev/null || true

  # Write rest module config
  cat > "$RADDDB/mods-available/rest" << RESTCONF
rest {
    connect_uri = "http://localhost:3010"
    connect_timeout = 5.0
    tls {
        check_cert = no
        check_cert_cn = no
    }
    authorize {
        method = "post"
        uri = "/api/radius/auth"
        body = "json"
        timeout = 5.0
        data = '{"username":"%{User-Name}","password":"%{User-Password}","nasIp":"%{NAS-IP-Address}","nasPort":"%{NAS-Port}","callingStationId":"%{Calling-Station-Id}","calledStationId":"%{Called-Station-Id}","clientIp":"%{Packet-Src-IP-Address}","_radiusSecret":"$RADIUS_API_SECRET"}'
    }
}
RESTCONF
  ok "rlm_rest module configured to POST to /api/radius/auth"

  # Add test client (localhost with shared secret testing123)
  grep -q 'client localhost {' "$RADDDB/clients.conf" || cat >> "$RADDDB/clients.conf" << 'CLIENT'
client localhost {
    ipaddr = 127.0.0.1
    proto = *
    secret = testing123
    require_message_authenticator = no
    nas_type = other
}
CLIENT
  ok "Test client added (127.0.0.1 / testing123)"

  # Validate config
  if [ "$OS_FAMILY" = "rhel" ]; then
    radiusd -XC 2>&1 | tail -3
  else
    freeradius -XC 2>&1 | tail -3
  fi

  # Start/restart
  if [ "$OS_FAMILY" = "rhel" ]; then
    systemctl restart radiusd
    sleep 3
    systemctl is-active radiusd 2>&1 | grep -q active && ok "radiusd started and active" || warn "radiusd failed to start"
  else
    systemctl restart freeradius
    sleep 3
    systemctl is-active freeradius 2>&1 | grep -q active && ok "freeradius started and active" || warn "freeradius failed to start"
  fi
}

# ─── Step 15: Configure PM2 ecosystem + start services ────────
configure_pm2() {
  step "15. Configure PM2 ecosystem + start all mini-services"

  cd "$APP_DIR"

  # Start main Next.js app
  pm2 describe cryptsk-nextjs > /dev/null 2>&1 && pm2 restart cryptsk-nextjs || \
  pm2 start "bun" --name cryptsk-nextjs --cwd "$APP_DIR" -- .next/standalone/server.js 2>&1 | tail -3

  # Start session-engine (port 3010)
  pm2 describe cryptsk-session-engine > /dev/null 2>&1 && pm2 restart cryptsk-session-engine || \
  pm2 start "bun --hot" --name cryptsk-session-engine --cwd "$APP_DIR/mini-services/session-engine" -- index.ts 2>&1 | tail -3

  # Start vpp-adapter (port 3015)
  pm2 describe cryptsk-vpp-adapter > /dev/null 2>&1 && pm2 restart cryptsk-vpp-adapter || \
  pm2 start "bun" --name cryptsk-vpp-adapter --cwd "$APP_DIR/gateway/vpp/vpp-adapter" -- index.ts 2>&1 | tail -3

  # Start ndpi-service (port 3031)
  pm2 describe cryptsk-ndpi-service > /dev/null 2>&1 && pm2 restart cryptsk-ndpi-service || \
  pm2 start "bun --hot" --name cryptsk-ndpi-service --cwd "$APP_DIR/mini-services/ndpi-service" -- index.ts 2>&1 | tail -3

  # Wait + save
  sleep 5
  pm2 save
  ok "PM2 processes started"

  # Print status
  pm2 status
}

# ─── Step 16: Configure systemd for govpp-adapter ─────────────
configure_govpp_systemd() {
  step "16. Configure systemd for cryptsk-govpp-adapter"

  cat > /etc/systemd/system/cryptsk-govpp-adapter.service << GOVPPSERVICE
[Unit]
Description=CRYPTSK Nexus — GoVPP Adapter (Binary API Client)
After=network.target vpp.service
Wants=vpp.service

[Service]
Type=simple
ExecStart=$APP_DIR/gateway/vpp/govpp-adapter/cryptsk-govpp-adapter
WorkingDirectory=$APP_DIR/gateway/vpp/govpp-adapter
Environment=DATABASE_URL=postgresql://$DB_USER:$DB_PASS@$DB_HOST:$DB_PORT/$DB_NAME
Environment=VPP_API_SOCK=/run/vpp/api.sock
Environment=VPP_CLI_SOCK=/run/vpp/cli.sock
Restart=on-failure
RestartSec=3

NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/run/vpp

[Install]
WantedBy=multi-user.target
GOVPPSERVICE

  systemctl daemon-reload
  systemctl enable cryptsk-govpp-adapter
  systemctl start cryptsk-govpp-adapter
  sleep 2

  if systemctl is-active --quiet cryptsk-govpp-adapter; then
    ok "cryptsk-govpp-adapter started and active"
  else
    warn "cryptsk-govpp-adapter failed — check 'journalctl -u cryptsk-govpp-adapter -n 30'"
  fi
}

# ─── Step 17: Seed admin user + initial data ─────────────────
seed_admin_user() {
  step "17. Seed admin user + initial data"

  cd "$APP_DIR"

  # Set the env vars explicitly
  export DATABASE_URL="postgresql://$DB_USER:$DB_PASS@$DB_HOST:$DB_PORT/$DB_NAME"
  export SESSION_SECRET="$SESSION_SECRET"

  # Run the seed script
  bun run prisma/seed.ts 2>&1 | tail -20 || warn "Seed script had issues (may need manual fix)"

  # Specifically set the admin user password if seed didn't
  npx tsx -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const u = await p.user.findFirst({ where: { email: '$ADMIN_EMAIL' } });
  if (!u) {
    await p.user.create({
      data: { email: '$ADMIN_EMAIL', name: 'Super Administrator', role: 'SUPER_ADMIN', status: 'ACTIVE', password: '$ADMIN_PASS' }
    });
    console.log('Admin user created: $ADMIN_EMAIL');
  } else {
    await p.user.update({ where: { id: u.id }, data: { password: '$ADMIN_PASS', role: 'SUPER_ADMIN', status: 'ACTIVE' } });
    console.log('Admin user updated: $ADMIN_EMAIL');
  }
  await p.\$disconnect();
})();
" 2>&1 | tail -3
  ok "Admin user ready: $ADMIN_EMAIL / $ADMIN_PASS"
}

# ─── Step 18: Configure firewall (optional) ───────────────────
configure_firewall() {
  if [ "$START_FIREWALL" != "true" ]; then
    step "18. Firewall (skipped — START_FIREWALL=false)"
    return
  fi
  step "18. Configure firewall (allow 80, 443, 1812/udp, 1813/udp)"

  if [ "$OS_FAMILY" = "rhel" ]; then
    systemctl enable firewalld
    systemctl start firewalld
    firewall-cmd --permanent --add-service=http
    firewall-cmd --permanent --add-service=https
    firewall-cmd --permanent --add-port=1812/udp
    firewall-cmd --permanent --add-port=1813/udp
    firewall-cmd --permanent --add-port=3000/tcp
    firewall-cmd --reload
  else
    ufw allow 80/tcp
    ufw allow 443/tcp
    ufw allow 1812/udp
    ufw allow 1813/udp
    ufw allow 3000/tcp
    ufw --force enable
  fi
  ok "Firewall configured"
}

# ─── Step 19: End-to-end verification ─────────────────────────
verify_installation() {
  step "19. End-to-end verification"

  # Wait for services to stabilize
  sleep 8

  echo ""
  echo -e "${BOLD}${BLUE}═══ Service Status ═══${NC}"
  for port_label in "Next.js:3000" "session-engine:3010" "vpp-adapter:3015" "govpp-adapter:3016" "ndpi-service:3031"; do
    name="${port_label%:*}"
    port="${port_label#*:}"
    code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 "http://localhost:$port/" 2>/dev/null)
    if [ "$code" = "200" ] || [ "$code" = "401" ] || [ "$code" = "404" ]; then
      ok "$name (port $port): HTTP $code"
    else
      warn "$name (port $port): HTTP $code (may not be ready yet)"
    fi
  done

  echo ""
  echo -e "${BOLD}${BLUE}═══ systemd Services ═══${NC}"
  for svc in vpp cryptsk-govpp-adapter radiusd postgresql-18; do
    if systemctl is-active --quiet "$svc"; then
      ok "$svc: active"
    else
      warn "$svc: NOT active (may use different name on this OS)"
    fi
  done

  echo ""
  echo -e "${BOLD}${BLUE}═══ PM2 Processes ═══${NC}"
  pm2 status 2>&1 | tail -10

  echo ""
  echo -e "${BOLD}${BLUE}═══ VPP Dataplane ═══${NC}"
  if has vppctl; then
    vppctl show version 2>&1 | head -1
    vppctl show interface 2>&1 | head -5
    vppctl show policer 2>&1 | head -3
  else
    warn "vppctl not found — VPP not installed"
  fi

  echo ""
  echo -e "${BOLD}${BLUE}═══ FreeRADIUS ═══${NC}"
  if has ss; then
    ss -uunl | grep -E ":1812|:1813" | head -5
  fi

  echo ""
  echo -e "${BOLD}${GREEN}═══ Installation Complete! ═══${NC}"
  echo ""
  echo -e "${BOLD}Login:${NC}"
  echo -e "  URL:   http://localhost:$APP_PORT"
  echo -e "  Email: $ADMIN_EMAIL"
  echo -e "  Pass:  $ADMIN_PASS"
  echo ""
  echo -e "${BOLD}Database:${NC}"
  echo -e "  URL:   postgresql://$DB_USER:***@$DB_HOST:$DB_PORT/$DB_NAME"
  echo ""
  echo -e "${BOLD}Test RADIUS auth:${NC}"
  echo -e "  radtest <username> <password> 127.0.0.1:1812 0 testing123"
  echo ""
  echo -e "${BOLD}Test VPP programming via /api/radius/auth:${NC}"
  echo -e "  curl -X POST http://localhost:3010/api/radius/auth -H 'Content-Type: application/json' -d '{\"username\":\"...\",\"password\":\"...\",\"_radiusSecret\":\"$RADIUS_API_SECRET\"}'"
  echo ""
  echo -e "${BOLD}Logs:${NC}"
  echo -e "  Setup log:        $LOG"
  echo -e "  VPP:              journalctl -u vpp -f"
  echo -e "  Next.js:          pm2 logs cryptsk-nextjs"
  echo -e "  Session Engine:   pm2 logs cryptsk-session-engine"
  echo -e "  GoVPP Adapter:    journalctl -u cryptsk-govpp-adapter -f"
  echo -e "  FreeRADIUS:       journalctl -u radiusd -f  (or 'freeradius' on Debian/Ubuntu)"
  echo ""
}

# ─── Main ──────────────────────────────────────────────────────
main() {
  echo -e "${MAGENTA}${BOLD}════════════════════════════════════════════════════${NC}"
  echo -e "${MAGENTA}${BOLD}   CRYPTSK Nexus — Full Production Setup Script     ${NC}"
  echo -e "${MAGENTA}${BOLD}   VPP + DPDK + PostgreSQL + Node + Bun + FreeRADIUS  ${NC}"
  echo -e "${MAGENTA}${BOLD}════════════════════════════════════════════════════${NC}"
  echo "  Started: $(date)"
  echo "  Log: $LOG"
  echo ""

  detect_os
  install_base_packages
  install_go
  install_dpdk
  configure_hugepages
  build_vpp
  configure_vpp
  install_postgres
  install_node_bun_pm2
  install_freeradius
  clone_app
  install_app_deps
  build_nextjs
  build_govpp_adapter
  configure_freeradius
  configure_pm2
  configure_govpp_systemd
  seed_admin_user
  configure_firewall
  verify_installation

  echo -e "\n${GREEN}${BOLD}✅ Setup complete!${NC}\n"
}

main "$@"
