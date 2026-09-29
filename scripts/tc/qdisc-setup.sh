#!/usr/bin/env bash
# ==============================================================================
# Cryptsk ISP Platform — QDisc Root Hierarchy Setup
# ==============================================================================
# Creates the root HTB hierarchy on ifb0 (download) and ifb1 (upload).
#
# After this script runs, per-subscriber HTB classes can be added as children
# of the root 1:1 class on the appropriate IFB device.
#
# Usage:
#   ./qdisc-setup.sh <root_down_mbps> <root_up_mbps>
#
# Examples:
#   ./qdisc-setup.sh 10000 5000
#   ./qdisc-setup.sh 10000 5000
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
DEFAULT_CLASS="9999"

# ─── Parse arguments ───────────────────────────────────────────────────────────
ROOT_DOWN_MBPS="${1:-}"
ROOT_UP_MBPS="${2:-}"

if [[ -z "$ROOT_DOWN_MBPS" || -z "$ROOT_UP_MBPS" ]]; then
    log_error "Missing required arguments"
    echo "ERROR:usage: $0 <root_down_mbps> <root_up_mbps>"
    exit 1
fi

validate_mbps "$ROOT_DOWN_MBPS" || die "Invalid download bandwidth"
validate_mbps "$ROOT_UP_MBPS"   || die "Invalid upload bandwidth"

ROOT_DOWN_KBIT="$(mbps_to_kbit "$ROOT_DOWN_MBPS")"
ROOT_UP_KBIT="$(mbps_to_kbit "$ROOT_UP_MBPS")"

log_info "Download root bandwidth: ${ROOT_DOWN_MBPS} Mbps (${ROOT_DOWN_KBIT} kbit)"
log_info "Upload root bandwidth:   ${ROOT_UP_MBPS} Mbps (${ROOT_UP_KBIT} kbit)"

# ─── Pre-flight ────────────────────────────────────────────────────────────────
require_root

for iface in "$IFB_DOWNLOAD" "$IFB_UPLOAD"; do
    if ! ip link show "$iface" &>/dev/null; then
        die "IFB device '${iface}' does not exist — run ifb-init.sh first"
    fi
done

# ─── Helper: set up HTB hierarchy on a single IFB device ──────────────────────
setup_ifb() {
    local dev="$1"       # e.g. ifb0
    local direction="$2" # "download" or "upload"
    local rate_kbit="$3" # root bandwidth in kbit

    log_info "Clearing existing qdisc on ${dev}..."
    tc qdisc del dev "$dev" root 2>/dev/null || true

    log_info "Creating root HTB on ${dev} (${direction})..."
    # Root qdisc — unclassified traffic falls to default class 9999
    tc qdisc add dev "$dev" root handle 1: htb default "$DEFAULT_CLASS"

    # Root class — shapes total available bandwidth
    tc class add dev "$dev" parent 1: classid 1:1 \
        htb rate "${rate_kbit}kbit" ceil "${rate_kbit}kbit" \
        burst 32k cburst 32k

    # Default class — fair-share leaf for unclassified traffic
    # Rate limited to 100 Mbps to prevent unclassified flows from consuming the root
    local default_rate_kbit
    default_rate_kbit="$(mbps_to_kbit 100)"
    tc class add dev "$dev" parent 1:1 classid "1:${DEFAULT_CLASS}" \
        htb rate "${default_rate_kbit}kbit" ceil "${rate_kbit}kbit" \
        burst 32k cburst 32k

    # Attach fq_codel to the default leaf for bufferbloat mitigation
    tc qdisc add dev "$dev" parent "1:${DEFAULT_CLASS}" handle "${DEFAULT_CLASS}:" \
        fq_codel noecn

    log_info "  ${dev} root HTB: 1:1 rate=${rate_kbit}kbit ceil=${rate_kbit}kbit"
    log_info "  ${dev} default class 1:${DEFAULT_CLASS} (100 Mbps min, fq_codel)"
}

# ─── Build hierarchy ───────────────────────────────────────────────────────────
setup_ifb "$IFB_DOWNLOAD" "download" "$ROOT_DOWN_KBIT"
setup_ifb "$IFB_UPLOAD"   "upload"   "$ROOT_UP_KBIT"

# ─── Done ──────────────────────────────────────────────────────────────────────
log_info "QDisc hierarchy ready on ${IFB_DOWNLOAD} and ${IFB_UPLOAD}"

echo "OK"
