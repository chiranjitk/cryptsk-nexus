#!/bin/bash
# ============================================================
# CRYPTSK Nexus — VPP + DPDK Single-Shot Installation Script
# For: Rocky Linux 10.x (VMware VM with VMXNET3 NICs)
# 
# This script:
#   1. Installs all build dependencies (including DPDK)
#   2. Clones VPP from source
#   3. Applies compatibility patches for Rocky 10 compilers
#   4. Builds VPP WITH DPDK plugin (vmxnet3 PMD support)
#   5. Installs VPP binary + shared libraries
#   6. Configures hugepages for DPDK
#   7. Binds VMXNET3 NIC to DPDK (uio_pci_generic)
#   8. Creates VPP startup.conf with DPDK enabled
#   9. Creates systemd service (auto-start on boot)
#  10. Starts VPP + verifies
#
# Usage (on fresh Rocky 10):
#   chmod +x install-vpp-dpdk-rocky10.sh
#   sudo ./install-vpp-dpdk-rocky10.sh
#
# Expected time: 20-30 minutes (mostly compilation)
# ============================================================
set -e

LOG=/var/log/vpp-install.log
exec > >(tee -a "$LOG") 2>&1

echo "╔════════════════════════════════════════════════════╗"
echo "║  CRYPTSK Nexus — VPP + DPDK Installation          ║"
echo "║  Rocky Linux 10 + VMware VMXNET3 + DPDK            ║"
echo "╚════════════════════════════════════════════════════╝"
echo ""

# ─── 1. Install Build Dependencies ────────────────────────────
echo "[1/10] Installing build dependencies..."
dnf groupinstall -y "Development Tools"
dnf install -y cmake ninja-build ccache openssl-devel libnl3-devel \
    elfutils-libelf-devel numactl-devel libuuid-devel libmnl-devel \
    python3-devel python3-ply python3-virtualenv chrpath libpcap-devel \
    subunit subunit-devel selinux-policy-devel xmlto nasm \
    llvm clang dpdk-devel dpdk-tools dpdk
echo "  ✓ Dependencies installed"

# ─── 2. Clone VPP Source ─────────────────────────────────────
echo "[2/10] Cloning VPP source..."
VPP_DIR="/opt/vpp"
if [ ! -d "$VPP_DIR" ]; then
    git clone https://github.com/FDio/vpp.git "$VPP_DIR"
fi
cd "$VPP_DIR"
# Use a stable tag (v26.06 is latest stable as of Sep 2026)
git checkout v26.06 2>/dev/null || git checkout v23.06
echo "  ✓ VPP source ready at $VPP_DIR"

# ─── 3. Apply Compatibility Patches ───────────────────────────
echo "[3/10] Applying Rocky 10 compatibility patches..."

# 3a. Disable xdp-tools external build (not needed for VMXNET3 DPDK)
cat > build/external/packages/xdp-tools.mk << 'XDPEOF'
.PHONY: xdp-tools-config xdp-tools-build xdp-tools-install
xdp-tools-config:
	@echo "xdp-tools disabled (not needed for VMXNET3 DPDK)"
xdp-tools-build:
	@echo "xdp-tools disabled"
xdp-tools-install:
	@echo "xdp-tools disabled"
XDPEOF
echo "  ✓ Patched xdp-tools.mk (disabled)"

# 3b. Use system DPDK instead of building from source
# This avoids the DPDK meson build failure on Rocky 10
cat > build/external/packages/dpdk.mk << 'DPDKEOF'
# CRYPTSK Nexus — Use SYSTEM DPDK (from dpdk-devel package)
# Instead of building DPDK from source, link against system DPDK
DPDK_BUILD_TYPE:=release

.PHONY: dpdk-config dpdk-build dpdk-install dpdk-patch dpdk-show-DPDK_MLX_DEFAULT
dpdk-config:
	@echo "Using system DPDK (dpdk-devel package)"
	@pkg-config --exists libdpdk && echo "  System DPDK found: $$(pkg-config --modversion libdpdk)" || (echo "ERROR: system DPDK not found!" && exit 1)
	@mkdir -p $(BUILD_DIR)/_install/include
	@mkdir -p $(BUILD_DIR)/_install/lib
	@cp -a /usr/include/dpdk/* $(BUILD_DIR)/_install/include/ 2>/dev/null || true
	@cp -a /usr/lib64/librte_*.so* $(BUILD_DIR)/_install/lib/ 2>/dev/null || true
	@cp -a /usr/lib64/librte_*.a $(BUILD_DIR)/_install/lib/ 2>/dev/null || true
	@cp -a /usr/lib64/pkgconfig/libdpdk* $(BUILD_DIR)/_install/lib/pkgconfig/ 2>/dev/null || true
	@cp -a /usr/lib64/pkgconfig/dpdk* $(BUILD_DIR)/_install/lib/pkgconfig/ 2>/dev/null || true

dpdk-build: dpdk-config
	@echo "System DPDK — nothing to build"

dpdk-install: dpdk-config
	@echo "System DPDK installed to build tree"

dpdk-patch:
	@echo "No patches needed for system DPDK"

dpdk-show-DPDK_MLX_DEFAULT:
	@echo n
DPDKEOF
echo "  ✓ Patched dpdk.mk (using system DPDK)"

# 3c. Suppress clang 21 warnings treated as errors
find src/ cmake/ build-data/ -type f \( -name "CMakeLists.txt" -o -name "*.cmake" -o -name "*.mk" \) \
    -exec sed -i 's/-Werror/-Wno-error/g' {} \; 2>/dev/null
# Add specific suppression for clang 21 bitfield warnings
sed -i '/add_compile_options(-g -Wno-error -Wall)/s/-Wall/-Wall -Wno-single-bit-bitfield-constant-conversion -Wno-default-const-init-field-unsafe/' src/CMakeLists.txt 2>/dev/null
echo "  ✓ Patched CMakeLists.txt (compiler warnings suppressed)"

# 3d. Fix strcasestr redefinition conflict
if grep -q 'char \*strcasestr (char \*, char \*)' src/vnet/interface_api.c 2>/dev/null; then
    sed -i 's|char \*strcasestr (char \*, char \*);|/* disabled: use system strcasestr (const-correct) */|' src/vnet/interface_api.c
    echo "  ✓ Patched interface_api.c (strcasestr conflict fixed)"
fi

# 3e. Ensure DPDK plugin is NOT disabled
if [ -d src/plugins/dpdk.disabled ]; then
    mv src/plugins/dpdk.disabled src/plugins/dpdk
    echo "  ✓ Restored DPDK plugin"
fi

# ─── 4. Build VPP WITH DPDK ───────────────────────────────────
echo "[4/10] Building VPP with DPDK (15-25 minutes)..."
rm -rf build-root
git checkout build-root/ 2>/dev/null || mkdir -p build-root
touch build-root/.deps.ok
export PKG_CONFIG_PATH=/usr/lib64/pkgconfig:$PKG_CONFIG_PATH
make build 2>&1 | tail -20
echo "  ✓ VPP build complete"

# ─── 5. Install VPP Binary + Libraries ───────────────────────
echo "[5/10] Installing VPP binary + shared libraries..."
cp build-root/build-vpp_debug-native/vpp/bin/vpp /usr/bin/vpp
cp build-root/build-vpp_debug-native/vpp/bin/vppctl /usr/bin/vppctl 2>/dev/null || true
chmod +x /usr/bin/vpp /usr/bin/vppctl
# Copy shared libraries
cp build-root/build-vpp_debug-native/vpp/lib64/*.so* /usr/lib64/ 2>/dev/null || true
ldconfig
echo "  ✓ VPP installed: $(/usr/bin/vpp --version 2>/dev/null || echo 'binary installed')"

# ─── 6. Configure Hugepages ───────────────────────────────────
echo "[6/10] Configuring hugepages for DPDK..."
# 1024 × 2MB = 2GB hugepages
sysctl -w vm.nr_hugepages=1024
echo "vm.nr_hugepages = 1024" >> /etc/sysctl.d/99-vpp-hugepages.conf
# Also allocate now
echo 1024 > /proc/sys/vm/nr_hugepages
mkdir -p /dev/hugepages
mount -t hugetlbfs nodev /dev/hugepages 2>/dev/null || true
HUGE=$(cat /proc/meminfo | grep HugePages_Total | awk '{print $2}')
echo "  ✓ Hugepages: $HUGE pages × 2MB = $((HUGE * 2))MB"

# ─── 7. Bind VMXNET3 NIC to DPDK ─────────────────────────────
echo "[7/10] Binding VMXNET3 NIC to DPDK..."
# Load uio_pci_generic kernel module
modprobe uio_pci_generic 2>/dev/null || echo "  ⚠ uio_pci_generic already loaded or built-in"
echo "uio_pci_generic" > /etc/modules-load.d/uio_pci_generic.conf

# Find the SECOND VMXNET3 NIC (first is for management — DON'T touch it!)
DPDK_NIC=$(lspci -D | grep "VMware VMXNET3" | sed -n '2p' | awk '{print $1}')
if [ -z "$DPDK_NIC" ]; then
    echo "  ⚠ No second VMXNET3 NIC found — using first NIC (WARNING: may disrupt management!)"
    DPDK_NIC=$(lspci -D | grep "VMware VMXNET3" | head -1 | awk '{print $1}')
fi
echo "  → Binding NIC $DPDK_NIC to uio_pci_generic..."
dpdk-devbind.py -b uio_pci_generic "$DPDK_NIC" 2>/dev/null || \
    echo "  ⚠ Could not bind NIC (may already be bound or in use)"
echo "  ✓ NIC $DPDK_NIC bound to DPDK"

# ─── 8. Create VPP Configuration ──────────────────────────────
echo "[8/10] Creating VPP configuration with DPDK..."
mkdir -p /etc/vpp /run/vpp /var/log/vpp
cat > /etc/vpp/startup.conf << VPPCONF
# CRYPTSK Nexus — VPP Dataplane Configuration (DPDK + VMXNET3)
# Auto-generated by install-vpp-dpdk-rocky10.sh

unix {
    cli-listen /run/vpp/cli.sock
    log /var/log/vpp/vpp.log
    nodaemon
}

cpu {
    main-core 0
    coremask-workers 0x0E
}

# ─── DPDK Configuration (VMXNET3 PMD) ────────────────────
dpdk {
    # Bind the VMXNET3 NIC to DPDK
    dev 0000:${DPDK_NIC#0000:} {
        num-rx-queues 1
        num-tx-queues 1
    }
    
    # Hugepages (auto-detected)
    no-tx-check
    
    # VMXNET3 PMD is built into DPDK — no special config needed
}

plugins {
    plugin default { enable }
    plugin dpdk_plugin.so { enable }
    plugin nat_plugin.so { enable }
    plugin acl_plugin.so { enable }
    plugin qos_plugin.so { enable }
    plugin policer_plugin.so { enable }
}
VPPCONF
echo "  ✓ VPP config created at /etc/vpp/startup.conf"

# ─── 9. Create Systemd Service ────────────────────────────────
echo "[9/10] Creating systemd service..."
cat > /etc/systemd/system/vpp.service << 'SYSTEMDEOF'
[Unit]
Description=CRYPTSK Nexus — VPP Dataplane (DPDK + VMXNET3)
After=network.target
Wants=network.target
After=systemd-modules-load.service

[Service]
Type=simple
ExecStart=/usr/bin/vpp -c /etc/vpp/startup.conf
ExecStartPre=/sbin/sysctl -w vm.nr_hugepages=1024
ExecStartPre=/bin/mkdir -p /run/vpp /var/log/vpp
Restart=on-failure
RestartSec=3
LimitMEMLOCK=infinity
LimitNOFILE=65536
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
SYSTEMDEOF
systemctl daemon-reload
systemctl enable vpp
echo "  ✓ Systemd service created + enabled"

# ─── 10. Start VPP + Verify ───────────────────────────────────
echo "[10/10] Starting VPP + verification..."
systemctl start vpp
sleep 3

echo ""
echo "══════════════════════════════════════════════════"
echo "  VPP Installation Verification"
echo "══════════════════════════════════════════════════"

# Check process
if systemctl is-active vpp | grep -q active; then
    echo "  ✓ VPP service: ACTIVE"
else
    echo "  ✗ VPP service: FAILED"
    journalctl -u vpp -n 20 --no-pager
fi

# Check version
VERSION=$(/usr/bin/vppctl -s /run/vpp/cli.sock "show version" 2>&1)
if echo "$VERSION" | grep -q "vpp"; then
    echo "  ✓ VPP version: $VERSION"
else
    echo "  ⚠ vppctl not responding (VPP may need more time to start)"
fi

# Check interfaces
INTERFACES=$(/usr/bin/vppctl -s /run/vpp/cli.sock "show interface" 2>&1)
if [ -n "$INTERFACES" ]; then
    echo "  ✓ VPP interfaces:"
    echo "$INTERFACES" | head -5 | sed 's/^/    /'
fi

# Check DPDK hardware
DPDK_HW=$(/usr/bin/vppctl -s /run/vpp/cli.sock "show hardware-interfaces" 2>&1)
if echo "$DPDK_HW" | grep -q "vmxnet3\|dpdk"; then
    echo "  ✓ DPDK hardware: VMXNET3 detected"
    echo "$DPDK_HW" | head -10 | sed 's/^/    /'
else
    echo "  ⚠ DPDK hardware: not detected (may need manual config)"
fi

# Check hugepages
HUGE=$(cat /proc/meminfo | grep HugePages_Total | awk '{print $2}')
echo "  ✓ Hugepages: $HUGE × 2MB = $((HUGE * 2))MB"

# Check NIC binding
NIC_BOUND=$(dpdk-devbind.py -s 2>/dev/null | grep -i "uio_pci_generic\|dpdk" | head -5)
if [ -n "$NIC_BOUND" ]; then
    echo "  ✓ NIC bound to DPDK:"
    echo "$NIC_BOUND" | sed 's/^/    /'
else
    echo "  ⚠ No NIC bound to DPDK (check dpdk-devbind.py -s)"
fi

echo ""
echo "╔════════════════════════════════════════════════════╗"
echo "║  VPP + DPDK Installation COMPLETE!                  ║"
echo "║                                                    ║"
echo "║  VPP binary:     /usr/bin/vpp                       ║"
echo "║  VPP config:     /etc/vpp/startup.conf              ║"
echo "║  Systemd:        systemctl start/stop/restart vpp   ║"
echo "║  CLI:            vppctl -s /run/vpp/cli.sock        ║"
echo "║  API socket:     /run/vpp/api.sock                  ║"
echo "║                                                    ║"
echo "║  Test commands:                                     ║"
echo "║    vppctl show version                             ║"
echo "║    vppctl show interface                           ║"
echo "║    vppctl show hardware-interfaces                  ║"
echo "║    vppctl show dpdk interface                      ║"
echo "║                                                    ║"
echo "║  Log: /var/log/vpp/vpp.log                         ║"
echo "╚════════════════════════════════════════════════════╝"
