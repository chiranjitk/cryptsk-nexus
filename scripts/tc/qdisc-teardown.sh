#!/usr/bin/env bash
# ==============================================================================
# Cryptsk ISP Platform — QDisc Full Teardown
# ==============================================================================
# Removes all TC configuration: qdiscs on physical interfaces, the entire HTB
# tree on ifb0/ifb1, and finally deletes the IFB devices themselves.
#
# Usage:
#   ./qdisc-teardown.sh                          # teardown IFB devices only
#   ./qdisc-teardown.sh <wan_ifaces> <lan_ifaces>  # also clean physical ifaces
#
# Examples:
#   ./qdisc-teardown.sh
#   ./qdisc-teardown.sh eth0,bond0 eth1,br-lan
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

# ─── Parse optional arguments ──────────────────────────────────────────────────
WAN_IFACES="${1:-}"
LAN_IFACES="${2:-}"

if [[ -n "$WAN_IFACES" || -n "$LAN_IFACES" ]]; then
    if [[ -z "$WAN_IFACES" || -z "$LAN_IFACES" ]]; then
        log_error "Both WAN and LAN interface lists must be provided together, or neither"
        echo "ERROR:usage: $0 [wan_iface1,wan2,...] [lan_iface1,lan2,...]"
        exit 1
    fi

    IFS=',' read -r -a WAN_LIST <<< "$WAN_IFACES"
    IFS=',' read -r -a LAN_LIST <<< "$LAN_IFACES"
fi

# ─── Pre-flight ────────────────────────────────────────────────────────────────
require_root

# ─── 1. Remove clsact from physical interfaces (if provided) ──────────────────
if [[ -n "${WAN_LIST+x}" ]]; then
    ALL_IFACES=( "${WAN_LIST[@]}" "${LAN_LIST[@]}" )

    log_info "Removing clsact qdisc from physical interfaces..."
    for iface in "${ALL_IFACES[@]}"; do
        if ip link show "$iface" &>/dev/null; then
            tc qdisc del dev "$iface" clsact  2>/dev/null || true
            tc qdisc del dev "$iface" ingress 2>/dev/null || true
            log_info "  ${iface} — clsact/ingress removed"
        else
            log_warn "  ${iface} — does not exist, skipping"
        fi
    done
fi

# ─── 2. Remove root qdisc from IFB devices (destroys entire class tree) ──────
log_info "Removing root qdisc from ${IFB_DOWNLOAD}..."
tc qdisc del dev "$IFB_DOWNLOAD" root 2>/dev/null && log_info "  ${IFB_DOWNLOAD} root removed" \
    || log_warn "  ${IFB_DOWNLOAD} — no root qdisc to remove"

log_info "Removing root qdisc from ${IFB_UPLOAD}..."
tc qdisc del dev "$IFB_UPLOAD" root 2>/dev/null && log_info "  ${IFB_UPLOAD} root removed" \
    || log_warn "  ${IFB_UPLOAD} — no root qdisc to remove"

# ─── 3. Bring down IFB devices ─────────────────────────────────────────────────
log_info "Bringing down IFB devices..."
for dev in "$IFB_DOWNLOAD" "$IFB_UPLOAD"; do
    if ip link show "$dev" &>/dev/null; then
        ip link set "$dev" down 2>/dev/null && log_info "  ${dev} is DOWN" \
            || log_warn "  ${dev} — failed to bring down"
    else
        log_warn "  ${dev} — does not exist, skipping"
    fi
done

# ─── 4. Delete IFB devices ────────────────────────────────────────────────────
log_info "Deleting IFB devices..."
for dev in "$IFB_DOWNLOAD" "$IFB_UPLOAD"; do
    if ip link show "$dev" &>/dev/null; then
        ip link del "$dev" type ifb 2>/dev/null && log_info "  ${dev} deleted" \
            || log_warn "  ${dev} — failed to delete"
    else
        log_warn "  ${dev} — does not exist, skipping"
    fi
done

# ─── 5. Optionally remove sysctl tuning ───────────────────────────────────────
SYSTCTL_CONF="/etc/sysctl.d/99-cryptsk-tc.conf"
if [[ -f "$SYSTCTL_CONF" ]]; then
    log_info "Removing sysctl config ${SYSTCTL_CONF}..."
    rm -f "$SYSTCTL_CONF"
    log_info "  ${SYSTCTL_CONF} removed (run 'sysctl --system' to reload)"
fi

# ─── Done ──────────────────────────────────────────────────────────────────────
log_info "TC teardown complete — all qdiscs removed, IFB devices deleted"

echo "OK"
