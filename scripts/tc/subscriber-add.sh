#!/usr/bin/env bash
#
# subscriber-add.sh — Add a per-user HTB class + IP filter under a subnet parent.
#
# Usage: ./subscriber-add.sh <direction> <parent_class_id> <class_slot> <ip> <rate_mbps> <ceil_mbps> [prio] [burst_kb]
# Example: ./subscriber-add.sh download 1000 3 10.10.0.5 50 75 3 15
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/tc-common.sh"
require_root

# ---------------------------------------------------------------------------
# Usage
# ---------------------------------------------------------------------------
usage() {
    echo "Usage: $0 <direction> <parent_class_id> <class_slot> <ip> <rate_mbps> <ceil_mbps> [prio] [burst_kb]" >&2
    exit 1
}

# ---------------------------------------------------------------------------
# Args
# ---------------------------------------------------------------------------
[[ $# -lt 6 ]] && usage

DIRECTION="$1"
PARENT_CLASS_ID="$2"
CLASS_SLOT="$3"
IP="$4"
RATE_MBPS="$5"
CEIL_MBPS="$6"
PRIO="${7:-5}"
BURST_KB="${8:-15}"

# ---------------------------------------------------------------------------
# Validate direction
# ---------------------------------------------------------------------------
case "$DIRECTION" in
    download) DEV="ifb0" ;;
    upload)   DEV="ifb1" ;;
    *)
        log_error "Invalid direction '$DIRECTION'. Must be 'download' or 'upload'."
        echo "ERROR:invalid_direction"
        exit 1
        ;;
esac

# ---------------------------------------------------------------------------
# Validate params using tc-common.sh helpers
# ---------------------------------------------------------------------------
if ! validate_ip "$IP"; then
    echo "ERROR:invalid_ip"
    exit 1
fi

if ! validate_mbps "$RATE_MBPS"; then
    echo "ERROR:invalid_rate"
    exit 1
fi

# ceil may be 0 (meaning "same as rate") or positive
if ! awk "BEGIN { exit !($CEIL_MBPS >= 0) }" 2>/dev/null; then
    log_error "ceil_mbps must be a non-negative number, got: $CEIL_MBPS"
    echo "ERROR:invalid_ceil"
    exit 1
fi

if ! [[ "$PRIO" =~ ^[0-9]+$ ]] || (( PRIO < 0 || PRIO > 7 )); then
    log_error "prio must be 0-7, got: $PRIO"
    echo "ERROR:invalid_prio"
    exit 1
fi

if ! [[ "$BURST_KB" =~ ^[0-9]+$ ]] || (( BURST_KB <= 0 )); then
    log_error "burst_kb must be a positive integer, got: $BURST_KB"
    echo "ERROR:invalid_burst"
    exit 1
fi

if ! [[ "$PARENT_CLASS_ID" =~ ^[0-9]+$ ]]; then
    log_error "parent_class_id must be numeric, got: $PARENT_CLASS_ID"
    echo "ERROR:invalid_parent_class_id"
    exit 1
fi

if ! [[ "$CLASS_SLOT" =~ ^[0-9]+$ ]]; then
    log_error "class_slot must be numeric, got: $CLASS_SLOT"
    echo "ERROR:invalid_class_slot"
    exit 1
fi

# ---------------------------------------------------------------------------
# Compute values
# ---------------------------------------------------------------------------
FULL_CLASS_ID="1:$((${PARENT_CLASS_ID} + CLASS_SLOT))"
RATE_KBIT=$(mbps_to_kbit "$RATE_MBPS")

if awk "BEGIN { exit !($CEIL_MBPS == 0) }" 2>/dev/null; then
    CEIL_KBIT="$RATE_KBIT"
else
    CEIL_KBIT=$(mbps_to_kbit "$CEIL_MBPS")
fi

log_info "Adding subscriber class $FULL_CLASS_ID on $DEV for $IP (rate=${RATE_KBIT}kbit ceil=${CEIL_KBIT}kbit)"

# ---------------------------------------------------------------------------
# Add HTB class (handle EEXIST)
# ---------------------------------------------------------------------------
if ! tc class add dev "$DEV" parent "1:${PARENT_CLASS_ID}" classid "$FULL_CLASS_ID" \
    htb rate "${RATE_KBIT}kbit" ceil "${CEIL_KBIT}kbit" prio "$PRIO" \
    burst "${BURST_KB}Kb" cburst "${BURST_KB}Kb" 2>/dev/null; then

    # Check if class already exists
    if tc class show dev "$DEV" classid "$FULL_CLASS_ID" &>/dev/null; then
        log_warn "Class $FULL_CLASS_ID already exists on $DEV — updating instead"
        tc class change dev "$DEV" parent "1:${PARENT_CLASS_ID}" classid "$FULL_CLASS_ID" \
            htb rate "${RATE_KBIT}kbit" ceil "${CEIL_KBIT}kbit" prio "$PRIO" \
            burst "${BURST_KB}Kb" cburst "${BURST_KB}Kb"
    else
        log_error "Failed to add class $FULL_CLASS_ID on $DEV"
        echo "ERROR:class_add_failed"
        exit 1
    fi
fi

# ---------------------------------------------------------------------------
# Add u32 filters (handle EEXIST gracefully)
# ---------------------------------------------------------------------------
if [[ "$DIRECTION" == "download" ]]; then
    # Download: dst = subscriber IP (inbound traffic to subscriber)
    if ! tc filter add dev "$DEV" protocol ip parent 1:0 prio 1 \
        u32 match ip dst "$IP" flowid "$FULL_CLASS_ID" 2>/dev/null; then
        log_warn "Filter (dst $IP) may already exist — skipping"
    fi

    # Also catch return traffic: src = subscriber IP
    if ! tc filter add dev "$DEV" protocol ip parent 1:0 prio 1 \
        u32 match ip src "$IP" flowid "$FULL_CLASS_ID" 2>/dev/null; then
        log_warn "Filter (src $IP) may already exist — skipping"
    fi
else
    # Upload: src = subscriber IP (outbound traffic from subscriber)
    if ! tc filter add dev "$DEV" protocol ip parent 1:0 prio 1 \
        u32 match ip src "$IP" flowid "$FULL_CLASS_ID" 2>/dev/null; then
        log_warn "Filter (src $IP) may already exist — skipping"
    fi

    # Also catch return traffic: dst = subscriber IP
    if ! tc filter add dev "$DEV" protocol ip parent 1:0 prio 1 \
        u32 match ip dst "$IP" flowid "$FULL_CLASS_ID" 2>/dev/null; then
        log_warn "Filter (dst $IP) may already exist — skipping"
    fi
fi

# ---------------------------------------------------------------------------
# Output full class ID (for caller)
# ---------------------------------------------------------------------------
echo "$FULL_CLASS_ID"
log_info "OK — class $FULL_CLASS_ID added on $DEV for $IP"
