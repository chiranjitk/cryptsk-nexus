#!/usr/bin/env bash
# ==============================================================================
# Cryptsk ISP Platform — IFB Device & Ingress Filter Initialisation
# ==============================================================================
# Creates IFB devices and sets up ingress redirect filters based on interface roles.
#
# Architecture:
#   WAN interfaces  → ingress redirect to ifb0 (download / egress shaping)
#   LAN interfaces  → ingress redirect to ifb1 (upload  / egress shaping)
#
# Usage:
#   ./ifb-init.sh <wan_iface1,wan2,...> <lan_iface1,lan2,...>
#
# Examples:
#   ./ifb-init.sh eth0 eth1
#   ./ifb-init.sh eth0,bond0 eth1,eth2,br0
#
# Stdout protocol:  "OK" on success,  "ERROR:message" on failure.
# All diagnostic output goes to stderr.
# ==============================================================================
set -euo pipefail

# ─── Resolve paths & source shared library ─────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=tc-common.sh
source "${SCRIPT_DIR}/tc-common.sh"

IFB_DOWNLOAD="ifb0"
IFB_UPLOAD="ifb1"

# ─── Parse arguments ───────────────────────────────────────────────────────────
WAN_IFACES="${1:-}"
LAN_IFACES="${2:-}"

if [[ -z "$WAN_IFACES" || -z "$LAN_IFACES" ]]; then
    log_error "Missing required arguments"
    echo "ERROR:usage: $0 <wan_iface1,wan2,...> <lan_iface1,lan2,...>"
    exit 1
fi

# Convert comma-separated lists into bash arrays
IFS=',' read -r -a WAN_LIST <<< "$WAN_IFACES"
IFS=',' read -r -a LAN_LIST <<< "$LAN_IFACES"

# ─── 1. Pre-flight checks & kernel modules ─────────────────────────────────────
require_root

for cmd in ip tc modprobe sysctl; do
    if ! command -v "$cmd" &>/dev/null; then
        die "Required command '${cmd}' not found — install iproute2 / kmod / procps"
    fi
done

log_info "Loading kernel modules..."
for mod in ifb sch_htb act_mirred cls_u32 cls_flower sch_fq_codel; do
    modprobe "$mod" 2>/dev/null || log_warn "Module '${mod}' not available (may be built-in)"
done
# Optional modules — non-fatal
for mod in sch_cake; do
    modprobe "$mod" 2>/dev/null && log_info "Module '${mod}' loaded" \
        || log_warn "Optional module '${mod}' not available"
done

# ─── 2. Create / recreate IFB devices ──────────────────────────────────────────
create_ifb() {
    local name="$1"
    local role="$2"

    # Tear down any previous instance
    ip link set "$name" down 2>/dev/null || true
    ip link del "$name" type ifb 2>/dev/null || true

    log_info "Creating ${name} (${role}) with numrxqueues=8 numtxqueues=8..."
    ip link add "$name" type ifb numrxqueues 8 numtxqueues 8
    ip link set "$name" up
    log_info "${name} is UP"
}

create_ifb "$IFB_DOWNLOAD" "download shaping"
create_ifb "$IFB_UPLOAD"  "upload shaping"

# ─── 3. Clear existing ingress/clsact on all physical interfaces ───────────────
log_info "Clearing existing qdiscs on physical interfaces..."

ALL_IFACES=( "${WAN_LIST[@]}" "${LAN_LIST[@]}" )

for iface in "${ALL_IFACES[@]}"; do
    if ! ip link show "$iface" &>/dev/null; then
        die "Interface '${iface}' does not exist"
    fi
    # Remove legacy ingress and modern clsact
    tc qdisc del dev "$iface" ingress  2>/dev/null || true
    tc qdisc del dev "$iface" clsact   2>/dev/null || true
    log_info "Cleared qdiscs on ${iface}"
done

# ─── 4. Attach clsact qdisc on all physical interfaces ─────────────────────────
log_info "Attaching clsact qdisc on physical interfaces..."

for iface in "${ALL_IFACES[@]}"; do
    tc qdisc add dev "$iface" clsact
    log_info "clsact attached to ${iface}"
done

# ─── 5. WAN → ifb0 redirect (download) ────────────────────────────────────────
log_info "Setting up WAN → ${IFB_DOWNLOAD} ingress redirect filters..."

for iface in "${WAN_LIST[@]}"; do
    # IPv4 — priority 1
    tc filter add dev "$iface" ingress protocol ip prio 1 \
        matchall \
        action mirred egress redirect dev "$IFB_DOWNLOAD"
    # IPv6 — priority 2
    tc filter add dev "$iface" ingress protocol ipv6 prio 2 \
        matchall \
        action mirred egress redirect dev "$IFB_DOWNLOAD"
    log_info "  ${iface} ingress → ${IFB_DOWNLOAD} (IPv4 prio 1, IPv6 prio 2)"
done

# ─── 6. LAN → ifb1 redirect (upload) ──────────────────────────────────────────
log_info "Setting up LAN → ${IFB_UPLOAD} ingress redirect filters..."

for iface in "${LAN_LIST[@]}"; do
    # IPv4 — priority 1
    tc filter add dev "$iface" ingress protocol ip prio 1 \
        matchall \
        action mirred egress redirect dev "$IFB_UPLOAD"
    # IPv6 — priority 2
    tc filter add dev "$iface" ingress protocol ipv6 prio 2 \
        matchall \
        action mirred egress redirect dev "$IFB_UPLOAD"
    log_info "  ${iface} ingress → ${IFB_UPLOAD} (IPv4 prio 1, IPv6 prio 2)"
done

# ─── 7. Sysctl tuning ──────────────────────────────────────────────────────────
SYSTCTL_CONF="/etc/sysctl.d/99-cryptsk-tc.conf"

log_info "Writing sysctl tuning to ${SYSTCTL_CONF}..."

cat > "$SYSTCTL_CONF" << 'SYSCTL'
# ==============================================================================
# Cryptsk ISP Platform — TC/QoS Kernel Tuning
# ==============================================================================

# Connection tracking — scale for 1 M+ concurrent sessions
net.netfilter.nf_conntrack_max            = 2097152
net.netfilter.nf_conntrack_buckets        = 524288
net.netfilter.nf_conntrack_tcp_timeout_established = 7200

# Socket buffer sizes (16 MiB max)
net.core.rmem_max    = 16777216
net.core.wmem_max    = 16777216
net.core.rmem_default = 1048576
net.core.wmem_default = 1048576
net.ipv4.tcp_rmem    = 4096 1048576 16777216
net.ipv4.tcp_wmem    = 4096 1048576 16777216

# Backlog & connection queues
net.core.netdev_max_backlog  = 10000
net.core.somaxconn           = 65535
net.ipv4.tcp_max_syn_backlog = 65535

# TCP tuning
net.ipv4.tcp_congestion_control     = bbr
net.core.default_qdisc              = fq
net.ipv4.tcp_slow_start_after_idle  = 0
net.ipv4.tcp_mtu_probing            = 1

# Reverse path filtering — disabled for ISP (asymmetric routing)
net.ipv4.conf.all.rp_filter      = 0
net.ipv4.conf.default.rp_filter  = 0

# ARP cache for large subnets
net.ipv4.neigh.default.gc_thresh1 = 4096
net.ipv4.neigh.default.gc_thresh2 = 8192
net.ipv4.neigh.default.gc_thresh3 = 16384
SYSCTL

sysctl -p "$SYSTCTL_CONF" >/dev/null 2>&1 \
    && log_info "Sysctl settings applied" \
    || log_warn "Some sysctl keys could not be applied (may not exist on this kernel)"

# ─── Done ──────────────────────────────────────────────────────────────────────
log_info "IFB initialisation complete"
log_info "  ${IFB_DOWNLOAD} (download) ← WAN: ${WAN_IFACES}"
log_info "  ${IFB_UPLOAD}  (upload)   ← LAN: ${LAN_IFACES}"
log_info "  Sysctl config: ${SYSTCTL_CONF}"

echo "OK"
