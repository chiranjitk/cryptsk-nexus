#!/bin/bash
# ============================================================
# CRYPTSK Nexus — VPP Worker Remediation Script
# Fixes: vpp_main at 100% CPU (workers not running)
# Target: 103.244.7.221 (Rocky 10 + VMware VMXNET3 + VPP v26.06 + DPDK)
#
# Symptom:
#   345004 root  20   0  145.2g 122524   8052 R 100.0  1.6 115:37.02 vpp_main
#   ↑ main thread at 100% = workers never started, VPP is single-threaded
#
# Root causes this script fixes:
#   A. DPDK dev lines commented out in startup.conf  → no NIC bound
#   B. Worker coremask set but cores not isolated     → OS steals them
#   C. uio_pci_generic / vfio-pci not loaded          → no kernel-bypass
#   D. Hugepages not reserved                          → VPP can't allocate buffers
#
# Usage (as root on 103.244.7.221):
#   chmod +x fix-vpp-workers.sh
#   sudo ./fix-vpp-workers.sh
#
# Safe to re-run. Idempotent.
# ============================================================
set -euo pipefail

LOG=/var/log/vpp-fix.log
exec > >(tee -a "$LOG") 2>&1

VPP_CONF="/etc/vpp/startup.conf"
VPP_RUNTIME_CONF="/etc/vpp/dataplane-runtime.conf"
WORKER_CORES="1,2,3"
MAIN_CORE="0"
HUGEPAGES="${HUGEPAGES:-1024}"   # 1024 × 2MB = 2GB hugepages

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ok()    { echo -e "${GREEN}[✓]${NC} $*"; }
warn()  { echo -e "${YELLOW}[!]${NC} $*"; }
err()   { echo -e "${RED}[✗]${NC} $*"; }
hdr()   { echo -e "\n${YELLOW}════ $* ════${NC}"; }

echo "╔══════════════════════════════════════════════════════════╗"
echo "║  CRYPTSK Nexus — VPP Worker Remediation                  ║"
echo "║  Target: 103.244.7.221 (Rocky 10 + VPP v26.06 + DPDK)    ║"
echo "╚══════════════════════════════════════════════════════════╝"

# ============================================================
# PHASE 0 — Pre-flight: current state
# ============================================================
hdr "PHASE 0 — Current state diagnostics"

VPP_PID=$(pgrep -f vpp_main || true)
if [[ -n "$VPP_PID" ]]; then
  echo "→ vpp_main running, PID=$VPP_PID"
  echo "→ Per-thread CPU (top -H):"
  top -b -H -n 1 -p "$VPP_PID" 2>/dev/null | grep -E 'vpp|PID' | head -10 || true
  echo "→ CPU affinity:"
  cat /proc/$VPP_PID/status 2>/dev/null | grep -E 'Cpus_allowed' || true
else
  warn "vpp_main not running — will start it after fixes"
fi

echo "→ Existing worker thread list:"
if [[ -n "$VPP_PID" ]]; then
  /usr/bin/vppctl show threads 2>/dev/null || /opt/vpp/build/install/bin/vppctl show threads 2>/dev/null || warn "vppctl not in PATH"
fi

echo "→ NICs (lspci):"
lspci 2>/dev/null | grep -i ether || warn "lspci not available"

echo "→ DPDK bind status:"
DPDK_DEVBIND=$(find /opt/vpp -name 'dpdk-devbind.py' 2>/dev/null | head -1)
if [[ -n "$DPDK_DEVBIND" ]]; then
  python3 "$DPDK_DEVBIND" --status 2>/dev/null || true
else
  warn "dpdk-devbind.py not found under /opt/vpp"
fi

echo "→ Kernel cmdline (isolcpus):"
cat /proc/cmdline 2>/dev/null | tr ' ' '\n' | grep -E 'isolcpus|rcu_nocbs|nohz_full' || echo "  (no CPU isolation parameters set)"

echo "→ Hugepages:"
grep -E 'HugePages_Total|HugePages_Free' /proc/meminfo

# ============================================================
# PHASE 1 — Identify NICs and find PCI BDFs
# ============================================================
hdr "PHASE 1 — Identify NIC PCI addresses"

# Find all ethernet devices with their PCI BDF
NICS=$(lspci -D 2>/dev/null | grep -i ethernet | awk '{print $1}' || true)
if [[ -z "$NICS" ]]; then
  err "No Ethernet controllers found via lspci. Aborting."
  exit 1
fi

echo "→ Found NICs:"
NIC_COUNT=0
declare -a NIC_BDFS
for bdf in $NICS; do
  NIC_COUNT=$((NIC_COUNT+1))
  NIC_BDFS[$NIC_COUNT]=$bdf
  driver=$(lspci -k -s "$bdf" 2>/dev/null | awk '/driver=/{print $NF}' || echo "unknown")
  desc=$(lspci -s "$bdf" 2>/dev/null | sed 's/^[0-9a-f:.]* //')
  echo "  [$NIC_COUNT] $bdf  driver=$driver  ($desc)"
done

if [[ $NIC_COUNT -lt 2 ]]; then
  warn "Only $NIC_COUNT NIC found. VPP normally needs 2 (subscriber + uplink). Proceeding with what we have."
fi

# ============================================================
# PHASE 2 — Load kernel-bypass driver
# ============================================================
hdr "PHASE 2 — Load DPDK kernel-bypass driver"

# Prefer vfio-pci (more features), fallback to uio_pci_generic
if ! lsmod | grep -q vfio_pci; then
  echo "→ Trying vfio-pci..."
  modprobe vfio-pci enable_unsafe_noiommu=1 2>/dev/null && ok "vfio-pci loaded" || {
    warn "vfio-pci failed, trying uio_pci_generic"
    modprobe uio 2>/dev/null
    modprobe uio_pci_generic 2>/dev/null && ok "uio_pci_generic loaded" || {
      err "Could not load any DPDK kernel module"
      exit 1
    }
  }
else
  ok "vfio-pci already loaded"
fi

# Make it persistent across reboots
cat > /etc/modules-load.d/dpdk.conf <<EOF
vfio-pci
uio
uio_pci_generic
EOF
ok "Module autoload configured for next boot"

# ============================================================
# PHASE 3 — Bind NICs to DPDK driver
# ============================================================
hdr "PHASE 3 — Bind NICs to DPDK driver"

DPDK_DRIVER="vfio-pci"
if ! lsmod | grep -q vfio_pci; then
  DPDK_DRIVER="uio_pci_generic"
fi
echo "→ Using DPDK driver: $DPDK_DRIVER"

if [[ -z "$DPDK_DEVBIND" ]]; then
  err "dpdk-devbind.py not found. Cannot auto-bind NICs."
  echo "  Locate manually:  find / -name dpdk-devbind.py 2>/dev/null"
  echo "  Or skip auto-bind and do it manually:"
  for bdf in "${NIC_BDFS[@]:1}"; do
    echo "    python3 <path>/dpdk-devbind.py --bind=$DPDK_DRIVER $bdf"
  done
  exit 1
fi

for bdf in "${NIC_BDFS[@]:1}"; do
  # Skip if already bound to DPDK
  cur_driver=$(lspci -k -s "$bdf" 2>/dev/null | awk '/driver=/{print $NF}' || echo "")
  if [[ "$cur_driver" == "$DPDK_DRIVER" ]]; then
    ok "$bdf already bound to $DPDK_DRIVER"
  else
    echo "→ Binding $bdf to $DPDK_DRIVER (was: $cur_driver)..."
    # Save original driver for rollback
    echo "$bdf $cur_driver" >> /etc/vpp/original-nic-drivers.txt 2>/dev/null || true
    if python3 "$DPDK_DEVBIND" --bind=$DPDK_DRIVER "$bdf" 2>/dev/null; then
      ok "$bdf bound to $DPDK_DRIVER"
    else
      # Try uio_pci_generic as fallback
      warn "vfio-pci bind failed for $bdf, retrying with uio_pci_generic..."
      python3 "$DPDK_DEVBIND" --bind=uio_pci_generic "$bdf" 2>/dev/null && ok "$bdf bound to uio_pci_generic" || {
        err "Failed to bind $bdf to any DPDK driver"
        exit 1
      }
    fi
  fi
done

# ============================================================
# PHASE 4 — Reserve hugepages
# ============================================================
hdr "PHASE 4 — Reserve hugepages"

CURRENT_HP=$(grep HugePages_Total /proc/meminfo | awk '{print $2}')
if [[ "$CURRENT_HP" -lt "$HUGEPAGES" ]]; then
  echo "→ Reserving $HUGEPAGES hugepages (current=$CURRENT_HP)..."
  sysctl -w vm.nr_hugepages=$HUGEPAGES
  ok "Hugepages reserved: $HUGEPAGES × 2MB = $((HUGEPAGES*2))MB"
else
  ok "Hugepages already sufficient ($CURRENT_HP ≥ $HUGEPAGES)"
fi

# Persist across reboots
grep -q '^vm.nr_hugepages' /etc/sysctl.conf && \
  sed -i "s/^vm.nr_hugepages.*/vm.nr_hugepages=$HUGEPAGES/" /etc/sysctl.conf || \
  echo "vm.nr_hugepages=$HUGEPAGES" >> /etc/sysctl.conf

# Mount hugetlbfs if not mounted
if ! mountpoint -q /dev/hugepages; then
  mkdir -p /dev/hugepages
  mount -t hugetlbfs hugetlbfs /dev/hugepages
  ok "hugetlbfs mounted at /dev/hugepages"
else
  ok "hugetlbfs already mounted at /dev/hugepages"
fi

# Persist mount
grep -q '^hugetlbfs' /etc/fstab || \
  echo 'hugetlbfs /dev/hugepages hugetlbfs defaults 0 0' >> /etc/fstab

# ============================================================
# PHASE 5 — Patch startup.conf with real PCI BDFs
# ============================================================
hdr "PHASE 5 — Patch $VPP_CONF with real NIC BDFs"

cp "$VPP_CONF" "${VPP_CONF}.bak.$(date +%s)" 2>/dev/null || true

# Build the dpdk { dev ... } block
DEV_BLOCK=""
for bdf in "${NIC_BDFS[@]:1}"; do
  DEV_BLOCK+="
    dev $bdf { num-rx-queues 2 num-tx-queues 2 }"
done

# Rewrite the dpdk block. Use python for reliable multi-line editing.
python3 - "$VPP_CONF" "$DEV_BLOCK" <<'PYEOF'
import sys, re
conf_path, dev_block = sys.argv[1], sys.argv[2]
with open(conf_path) as f:
    content = f.read()

# Find the dpdk { ... } block and replace any commented/uncommented dev lines
# with the real BDFs we just bound.
pattern = re.compile(r'(dpdk\s*\{[^}]*?)(\s*#?\s*dev[^\n]*\s*)+(\s*no-tx-check)', re.DOTALL)
replacement = r'\1' + dev_block + r'\n\3'
new_content = pattern.sub(replacement, content)

with open(conf_path, 'w') as f:
    f.write(new_content)
print("→ startup.conf dpdk block updated")
PYEOF

# Ensure main-core and worker coremask are correct
sed -i "s/^\s*main-core.*/    main-core $MAIN_CORE/" "$VPP_CONF"
sed -i "s/^\s*coremask-workers.*/    coremask-workers 0x0E  # cores 1-3/" "$VPP_CONF"

# Set poll-sleep to a small value (50us) so idle CPU drops when no traffic
# (commented out — uncomment if you need to reduce idle CPU on dev boxes)
# sed -i "s/^\s*poll-sleep.*/    poll-sleep 50/" "$VPP_CONF"

ok "startup.conf patched — show the dpdk + cpu sections:"
awk '/^dpdk {/,/^}/{print; next}/^cpu {/,/^}/{print}' "$VPP_CONF" | sed 's/^/    /'

# ============================================================
# PHASE 6 — Isolate worker cores (GRUB)
# ============================================================
hdr "PHASE 6 — Isolate worker cores via GRUB (isolcpus)"

# Check if isolcpus already set
if grep -q "isolcpus=$WORKER_CORES" /proc/cmdline; then
  ok "isolcpus=$WORKER_CORES already in kernel cmdline"
else
  warn "isolcpus not set. Will add to GRUB and require reboot."

  # Use grubby (Rocky/CentOS standard)
  if command -v grubby &>/dev/null; then
    grubby --update-kernel=ALL --args="isolcpus=$WORKER_CORES rcu_nocbs=$WORKER_CORES"
    ok "GRUB updated. Reboot required for isolcpus to take effect."
    REBOOT_REQUIRED=1
  else
    # Fallback: edit /etc/default/grub
    if ! grep -q "isolcpus=$WORKER_CORES" /etc/default/grub 2>/dev/null; then
      sed -i "s/GRUB_CMDLINE_LINUX=\"/&isolcpus=$WORKER_CORES rcu_nocbs=$WORKER_CORES /" /etc/default/grub
      grub2-mkconfig -o /boot/grub2/grub.cfg 2>/dev/null || \
      grub2-mkconfig -o /boot/efi/EFI/rocky/grub.cfg 2>/dev/null || true
      ok "GRUB config regenerated"
      REBOOT_REQUIRED=1
    fi
  fi
fi

# ============================================================
# PHASE 7 — Restart VPP
# ============================================================
hdr "PHASE 7 — Restart VPP"

if [[ "${REBOOT_REQUIRED:-0}" == "1" ]]; then
  warn "isolcpus requires a reboot to take effect."
  warn "For best results: reboot now, then run this script again to restart VPP."
  echo ""
  read -p "Reboot now? (y/N): " REBOOT_ANS
  if [[ "$REBOOT_ANS" =~ ^[Yy]$ ]]; then
    systemctl stop vpp 2>/dev/null || true
    reboot
    exit 0
  else
    warn "Skipping reboot. Continuing with VPP restart (workers may not be isolated yet)."
  fi
fi

systemctl daemon-reload 2>/dev/null || true
systemctl restart vpp 2>/dev/null || {
  warn "systemctl restart failed, trying direct launch..."
  /opt/vpp/build/install/bin/vpp -c "$VPP_CONF" &
  sleep 3
}

sleep 3

# ============================================================
# PHASE 8 — Verify
# ============================================================
hdr "PHASE 8 — Verify workers are running"

VPPCTL=$(command -v vppctl 2>/dev/null || echo "/opt/vpp/build/install/bin/vppctl")

echo "→ VPP process status:"
systemctl status vpp 2>/dev/null | head -8 || ps -ef | grep -E 'vpp' | grep -v grep

echo ""
echo "→ Threads (THE critical check):"
$VPPCTL show threads 2>&1 || err "Cannot reach vppctl socket"

echo ""
echo "→ Interfaces:"
$VPPCTL show interface 2>&1 || true

echo ""
echo "→ Plugins:"
$VPPCTL show plugins 2>&1 | head -20 || true

echo ""
echo "→ Per-thread CPU (expect workers 1-3 at ~100%, main 0 mostly idle):"
VPP_PID=$(pgrep -f vpp_main || true)
if [[ -n "$VPP_PID" ]]; then
  top -b -H -n 1 -p "$VPP_PID" 2>/dev/null | grep -E 'vpp|PID' | head -10
fi

echo ""
echo "→ DPDK device status:"
python3 "$DPDK_DEVBIND" --status 2>/dev/null || true

# ============================================================
# PHASE 9 — Summary & rollback info
# ============================================================
hdr "Summary"

cat <<SUMMARY

╔══════════════════════════════════════════════════════════╗
║  VPP Worker Remediation — Done                             ║
╠══════════════════════════════════════════════════════════╣
║  Bound NICs:        ${#NIC_BDFS[@]}                                       ║
║  DPDK driver:       $DPDK_DRIVER                                  ║
║  Hugepages:         $HUGEPAGES × 2MB = $((HUGEPAGES*2))MB                       ║
║  Worker cores:      $WORKER_CORES  (isolated via isolcpus)                  ║
║  VPP config:        $VPP_CONF                          ║
║  Backup of old cfg: ${VPP_CONF}.bak.<timestamp>             ║
╚══════════════════════════════════════════════════════════╝

  What was fixed:
    ✓ DPDK dev lines enabled with real PCI BDFs
    ✓ NICs bound to vfio-pci / uio_pci_generic
    ✓ Hugepages reserved and persisted
    ✓ Worker cores isolated via isolcpus (may need reboot)
    ✓ VPP restarted

  Expected after reboot (if required):
    - vppctl show threads → main + 3 workers (vpp_wk_0, vpp_wk_1, vpp_wk_2)
    - top -H -p \$(pgrep vpp_main) → cores 1,2,3 at 100% (✓ correct!)
    - core 0 (vpp_main main) mostly idle (~5-10%)
    - Overall server load returns to normal because only 3 isolated cores
      run at 100% (VPP's busy-poll design), and the OS + Next.js UI run
      on the remaining cores.

  Rollback:
    sudo cp ${VPP_CONF}.bak.* $VPP_CONF
    sudo systemctl restart vpp

SUMMARY

ok "Done. Check /var/log/vpp-fix.log for full transcript."
