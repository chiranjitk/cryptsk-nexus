#!/usr/bin/env bash
#
# subscriber-del.sh — Remove a per-user HTB class and its IP filters.
#
# Usage: ./subscriber-del.sh <direction> <class_slot> <ip>
# Example: ./subscriber-del.sh download 1003 10.10.0.5
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/tc-common.sh"
require_root

# ---------------------------------------------------------------------------
# Usage
# ---------------------------------------------------------------------------
usage() {
    echo "Usage: $0 <direction> <class_slot> <ip>" >&2
    exit 1
}

# ---------------------------------------------------------------------------
# Args
# ---------------------------------------------------------------------------
[[ $# -lt 3 ]] && usage

DIRECTION="$1"
CLASS_SLOT="$2"
IP="$3"

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

if ! [[ "$CLASS_SLOT" =~ ^[0-9]+$ ]]; then
    log_error "class_slot must be numeric, got: $CLASS_SLOT"
    echo "ERROR:invalid_class_slot"
    exit 1
fi

# ---------------------------------------------------------------------------
# Full class ID
# ---------------------------------------------------------------------------
FULL_CLASS_ID="1:${CLASS_SLOT}"

log_info "Removing subscriber class $FULL_CLASS_ID on $DEV for $IP"

# ---------------------------------------------------------------------------
# Check class exists first
# ---------------------------------------------------------------------------
if ! tc class show dev "$DEV" classid "$FULL_CLASS_ID" &>/dev/null; then
    log_warn "Class $FULL_CLASS_ID does not exist on $DEV — nothing to remove"
    echo "OK"
    exit 0
fi

# ---------------------------------------------------------------------------
# Remove filters (handle ENOENT gracefully — filter may already be gone)
# ---------------------------------------------------------------------------
# Remove dst filter
if tc filter del dev "$DEV" protocol ip parent 1:0 prio 1 \
    u32 match ip dst "$IP" flowid "$FULL_CLASS_ID" 2>/dev/null; then
    log_info "Removed dst filter for $IP -> $FULL_CLASS_ID"
else
    log_warn "dst filter for $IP -> $FULL_CLASS_ID not found or already removed"
fi

# Remove src filter
if tc filter del dev "$DEV" protocol ip parent 1:0 prio 1 \
    u32 match ip src "$IP" flowid "$FULL_CLASS_ID" 2>/dev/null; then
    log_info "Removed src filter for $IP -> $FULL_CLASS_ID"
else
    log_warn "src filter for $IP -> $FULL_CLASS_ID not found or already removed"
fi

# ---------------------------------------------------------------------------
# Remove class (cascades fq_codel leaf qdisc automatically)
# ---------------------------------------------------------------------------
if tc class del dev "$DEV" classid "$FULL_CLASS_ID" 2>/dev/null; then
    log_info "Removed class $FULL_CLASS_ID on $DEV"
else
    log_error "Failed to remove class $FULL_CLASS_ID on $DEV"
    echo "ERROR:class_del_failed"
    exit 1
fi

echo "OK"
log_info "OK — subscriber $IP ($FULL_CLASS_ID) removed from $DEV"
