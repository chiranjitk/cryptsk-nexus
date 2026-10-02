#!/usr/bin/env bash
# ============================================================
# CRYPTSK Nexus — VPP + DPDK Only Quick Installer
# ============================================================
# Use this script when you want to install ONLY VPP + DPDK on a
# fresh OS (for a dedicated dataplane box that won't run the app).
# This is a stripped-down version of setup-new-os.sh that skips
# PostgreSQL, Node.js, Next.js, mini-services, FreeRADIUS.
#
# Installs:
#   - DPDK 25.11 (from package manager)
#   - VPP v26.06 (built from source with DPDK support)
#   - 1024 hugepages (2GB for DPDK)
#   - VPP systemd service (auto-start on boot)
#   - VPP startup.conf with DPDK NIC binding + TAP fallback
#
# Supported OS:
#   - Rocky Linux 10 / RHEL 10 / CentOS Stream 10
#   - Debian 12/13 / Ubuntu 22.04/24.04
#
# Usage (as root):
#   curl -fsSL https://raw.githubusercontent.com/chiranjitk/cryptsk-nexus/main/scripts/setup-vpp-dpdk-only.sh | bash
#
# Customizable env vars (set before running):
#   VPP_VERSION=stable/2606            # VPP release branch
#   DPDK_NIC_PCI=0000:13:00.0          # PCI address of NIC for DPDK
#   CONFIGURE_DPDK_NIC=true             # Set false to use TAP fallback only
#   NR_HUGEPAGES=1024                   # Number of 2MB hugepages
#
# Log: /var/log/cryptsk-vpp-setup.log
# ============================================================

set -o pipefail

VPP_VERSION="${VPP_VERSION:-stable/2606}"
DPDK_NIC_PCI="${DPDK_NIC_PCI:-}"
CONFIGURE_DPDK_NIC="${CONFIGURE_DPDK_NIC:-true}"
NR_HUGEPAGES="${NR_HUGEPAGES:-1024}"

LOG=/var/log/cryptsk-vpp-setup.log
mkdir -p "$(dirname "$LOG")"
exec > >(tee -a "$LOG") 2>&1

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; MAGENTA='\033[0;35m'; BOLD='\033[1m'; NC='\033[0m'

step() { echo -e "\n${MAGENTA}${BOLD}[STEP]${NC} ${BOLD}$1${NC}"; }
ok()   { echo -e "  ${GREEN}✓${NC} $1"; }
info() { echo -e "  ${CYAN}ℹ${NC} $1"; }
warn() { echo -e "  ${YELLOW}⚠${NC} $1"; }
fail() { echo -e "  ${RED}✗ $1${NC}"; exit 1; }
has()  { command -v "$1" >/dev/null 2>&1; }

[ "$(id -u)" -eq 0 ] || fail "Run as root (sudo bash $0)"

# ─── Detect OS ───────────────────────────────────────────────
if [ -f /etc/os-release ]; then
  . /etc/os-release
  case "$ID" in
    rocky|rhel|centos|fedora|almalinux)
      OS_FAMILY="rhel"; PKG_MGR="dnf" ;;
    debian|ubuntu|linuxmint)
      OS_FAMILY="debian"; PKG_MGR="apt" ;;
    *) fail "Unsupported OS: $ID" ;;
  esac
  info "Detected: $PRETTY_NAME (family=$OS_FAMILY)"
else
  fail "Cannot detect OS — /etc/os-release missing"
fi

# ─── Step 1: System update + base packages ────────────────────
step "1. System update + build tools"
if [ "$PKG_MGR" = "dnf" ]; then
  dnf update -y
  dnf install -y git curl wget tar unzip vim make gcc gcc-c++ \
    autoconf automake libtool pkg-config pixman-devel libcap-devel \
    openssl-devel numactl-devel libmnl-devel cmake ninja-build \
    python3-pip libuuid-devel elfutils-libelf-devel json-c-devel \
    chrpath libffi-devel xmlto graphviz compat-openssl11-devel \
    firewalld chrony bash-completion htop jq
  dnf install -y epel-release || true
  dnf config-manager --set-enabled crb 2>/dev/null || true
else
  apt update -y
  apt install -y git curl wget tar unzip vim make gcc g++ \
    autoconf automake libtool pkg-config pixman-libs libcap-dev \
    libssl-dev libnuma-dev libmnl-dev cmake ninja-build \
    python3-pip uuid-dev libelf-dev libjson-c-dev chrpath \
    libffi-dev xmlto graphviz ca-certificates gnupg lsb-release \
    htop jq
fi
ok "Build tools installed"

# ─── Step 2: Install DPDK ─────────────────────────────────────
step "2. Install DPDK"
if [ "$OS_FAMILY" = "rhel" ]; then
  dnf install -y dpdk dpdk-devel dpdk-tools
else
  apt install -y dpdk dpdk-dev libdpdk-dev
fi
ok "DPDK installed"

# ─── Step 3: Configure hugepages ──────────────────────────────
step "3. Configure hugepages"
CURRENT=$(grep HugePages_Total /proc/meminfo | awk '{print $2}')
if [ "$CURRENT" -lt "$NR_HUGEPAGES" ]; then
  sysctl -w "vm.nr_hugepages=$NR_HUGEPAGES"
  echo "vm.nr_hugepages=$NR_HUGEPAGES" > /etc/sysctl.d/99-hugepages.conf
  ok "Hugepages set to $NR_HUGEPAGES × 2MB"
else
  ok "Hugepages already set: $CURRENT pages"
fi

if ! mountpoint -q /dev/hugepages; then
  mkdir -p /dev/hugepages
  mount -t hugetlbfs nodev /dev/hugepages
  echo "nodev /dev/hugepages hugetlbfs defaults 0 0" >> /etc/fstab
  ok "Hugetlbfs mounted at /dev/hugepages"
else
  ok "Hugetlbfs already mounted"
fi

# ─── Step 4: Build VPP from source ───────────────────────────
step "4. Build VPP v26.06 from source"

if has vpp && has vppctl; then
  ok "VPP already installed: $(vppctl show version 2>&1 | head -1)"
else
  # FD.io packagecloud repos (provides pre-built RPMs)
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

  info "Building VPP (10-20 minutes)..."
  make install-dep 2>&1 | tail -5
  make pkg-rpm 2>&1 | tail -5 || true

  if ls build/vpp_rpmbuild/RPMS/x86_64/*.rpm 2>/dev/null; then
    if [ "$OS_FAMILY" = "rhel" ]; then
      dnf install -y build/vpp_rpmbuild/RPMS/x86_64/*.rpm
    else
      # Convert RPMs to DEBs using alien (or use direct binary install)
      apt install -y alien
      cd build/vpp_rpmbuild/RPMS/x86_64/
      for r in *.rpm; do alien -i "$r" 2>&1 | tail -1; done
    fi
  else
    # Fallback: build directly + copy binaries
    make build 2>&1 | tail -5
    cp build-install/vpp/bin/vpp /usr/bin/vpp
    cp build-install/vpp/bin/vppctl /usr/bin/vppctl
    mkdir -p /usr/lib64/vpp_plugins
    cp -r build-install/vpp/lib/vpp_plugins/* /usr/lib64/vpp_plugins/ 2>/dev/null || true
    cp build-install/vpp/lib/libvppinfra.so* /usr/lib64/ 2>/dev/null || true
    ldconfig
  fi

  has vpp || fail "VPP build/install failed — see $LOG"
  ok "VPP installed: $(vppctl show version 2>&1 | head -1)"
fi

# ─── Step 5: Auto-detect NIC PCI address ──────────────────────
NIC_PCI="$DPDK_NIC_PCI"
if [ "$CONFIGURE_DPDK_NIC" = "true" ] && [ -z "$NIC_PCI" ]; then
  # Pick first non-loopback ethernet PCI device
  NIC_PCI=$(lspci -D | grep -i 'ethernet controller' | head -1 | awk '{print $1}')
  if [ -n "$NIC_PCI" ]; then
    info "Auto-detected NIC PCI: $NIC_PCI"
  else
    warn "No Ethernet PCI device detected — will use TAP fallback only"
  fi
fi

# ─── Step 6: Configure VPP startup.conf ──────────────────────
step "5. Configure VPP (startup.conf + systemd)"

mkdir -p /etc/vpp /run/vpp /var/log/vpp

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

# Fallback af_packet for VMs / when DPDK NIC not bound
tapcli {
    enable
}

plugins {
    plugin default { enable }
}

memory {
    main-heap-size 1G
}
VPPCONF
ok "VPP startup.conf written"

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

# ─── Verify ───────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${BLUE}═══ VPP Status ═══${NC}"
if systemctl is-active --quiet vpp; then
  ok "vpp.service: active"
else
  warn "vpp.service: failed to start — check 'journalctl -u vpp -n 50'"
fi

if has vppctl; then
  echo ""
  vppctl show version 2>&1 | head -1
  echo ""
  echo "Interfaces:"
  vppctl show interface 2>&1 | head -8
  echo ""
  echo "Plugins loaded:"
  vppctl show plugins 2>&1 | wc -l | xargs -I{} echo "  {} plugins loaded"
  echo ""
  echo "Hugepages:"
  grep -E 'HugePages_Total|HugePages_Free|Hugepagesize' /proc/meminfo
fi

echo ""
echo -e "${BOLD}${GREEN}═══ VPP + DPDK Setup Complete! ═══${NC}"
echo ""
echo -e "${BOLD}Test commands:${NC}"
echo -e "  vppctl show interface              # List VPP interfaces"
echo -e "  vppctl show policer               # List policers"
echo -e "  vppctl show nat44 addresses       # List NAT pool addresses"
echo -e "  vppctl show acl                   # List ACLs"
echo -e "  vppctl show api clients           # List binary API clients"
echo ""
echo -e "${BOLD}Log:${NC} $LOG"
echo -e "${BOLD}Live log:${NC} journalctl -u vpp -f"
echo ""
