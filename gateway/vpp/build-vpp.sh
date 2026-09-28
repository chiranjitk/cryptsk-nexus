#!/bin/bash
# ============================================================
# CRYPTSK Nexus — Build VPP from Source on Rocky 10
# Software mode (af_packet, no DPDK) — for development/testing
# ============================================================
set -e
LOG=/var/log/vpp-build.log
exec > >(tee -a "$LOG") 2>&1
echo "=== VPP Build Started $(date) ==="

# ─── 1. Install build dependencies ──────────────────────────
echo "=== 1. Installing build dependencies ==="
dnf groupinstall -y "Development Tools"
dnf install -y cmake openssl-devel libnl3-devel elfutils-libelf-devel \
    numactl-devel libuuid-devel libmnl-devel python3-pip \
    rdma-core-devel libffi-devel zlib-devel

# ─── 2. Clone VPP ─────────────────────────────────────────────
echo "=== 2. Cloning VPP source ==="
if [ ! -d /opt/vpp ]; then
    git clone https://github.com/FDio/vpp.git /opt/vpp
fi
cd /opt/vpp
git checkout v23.06  # stable release tag
echo "VPP source ready at /opt/vpp"

# ─── 3. Install VPP external dependencies ────────────────────
echo "=== 3. Installing VPP external deps (make install-ext-deps) ==="
make install-ext-deps 2>&1 | tail -20

# ─── 4. Build VPP (software mode — no DPDK) ──────────────────
echo "=== 4. Building VPP (this takes 15-25 min) ==="
make build 2>&1 | tail -30

# ─── 5. Install binaries ─────────────────────────────────────
echo "=== 5. Installing VPP binaries ==="
cp build/vpp/vpp /usr/bin/vpp
cp build/vpp/vpp_api_test /usr/bin/vpp_api_test
chmod +x /usr/bin/vpp /usr/bin/vpp_api_test

# ─── 6. Create directories ───────────────────────────────────
mkdir -p /etc/vpp /run/vpp /var/log/vpp

# ─── 7. Create software-mode startup config ──────────────────
echo "=== 6. Creating software-mode startup.conf ==="
cat > /etc/vpp/startup.conf << 'VPPEOF'
unix {
    cli-listen /run/vpp/cli.sock
    log /var/log/vpp/vpp.log
    nodaemon
}

# Software mode — no DPDK section
# af_packet interfaces are created via CLI after startup

# CPU
cpu {
    main-core 0
}

# Memory (no hugepages needed for af_packet mode)
memory {
    session-queue-memory 1024
}

# Plugins — enable essential, disable DPDK
plugins {
    plugin default { enable }
    plugin dpdk_plugin.so { disable }  # no DPDK hardware
    plugin nat_plugin.so { enable }
    plugin acl_plugin.so { enable }
    plugin qos_plugin.so { enable }
    plugin policer_plugin.so { enable }
}

# API socket (GoVPP connects here)
api {
    sock /run/vpp/api.sock
    queue-length 1024
}

# Stats socket
stats {
    socket /run/vpp/stats.sock
    interval 10
}
VPPEOF

# ─── 8. Start VPP ────────────────────────────────────────────
echo "=== 7. Starting VPP ==="
pkill vpp 2>/dev/null || true
/usr/bin/vpp -c /etc/vpp/startup.conf &
sleep 3

# ─── 9. Verify ───────────────────────────────────────────────
echo "=== 8. Verifying VPP ==="
if [ -S /run/vpp/api.sock ]; then
    echo "VPP API socket exists — VPP is running!"
    # Create af_packet interface for the main NIC
    MAIN_NIC=$(ip route get 8.8.8.8 2>/dev/null | awk '{print $5; exit}')
    if [ -n "$MAIN_NIC" ]; then
        echo "Creating af_packet interface on $MAIN_NIC"
        vppctl -s /run/vpp/cli.sock "create af_packet host-interface $MAIN_NIC" 2>/dev/null || true
        vppctl -s /run/vpp/cli.sock "show interfaces" 2>/dev/null || true
    fi
else
    echo "VPP API socket NOT found — VPP failed to start"
    tail -20 /var/log/vpp/vpp.log 2>/dev/null
fi

echo "=== VPP Build Complete $(date) ==="
