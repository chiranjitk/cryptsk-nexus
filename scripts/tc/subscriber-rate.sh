#!/usr/bin/env bash
#
# subscriber-rate.sh — Change a subscriber's HTB rate (FUP trigger/restore, plan change).
#
# Usage: ./subscriber-rate.sh <direction> <class_slot> <new_rate_mbps> [new_ceil_mbps]
# Example: ./subscriber-rate.sh download 1003 10
#          ./subscriber-rate.sh download 1003 10 15
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/tc-common.sh"
require_root

# ---------------------------------------------------------------------------
# Usage
# ---------------------------------------------------------------------------
usage() {
    echo "Usage: $0 <direction> <class_slot> <new_rate_mbps> [new_ceil_mbps]" >&2
    exit 1
}

# ---------------------------------------------------------------------------
# Args
# ---------------------------------------------------------------------------
[[ $# -lt 3 ]] && usage

DIRECTION="$1"
CLASS_SLOT="$2"
NEW_RATE_MBPS="$3"
NEW_CEIL_MBPS="${4:-0}"

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
if ! [[ "$CLASS_SLOT" =~ ^[0-9]+$ ]]; then
    log_error "class_slot must be numeric, got: $CLASS_SLOT"
    echo "ERROR:invalid_class_slot"
    exit 1
fi

if ! validate_mbps "$NEW_RATE_MBPS"; then
    echo "ERROR:invalid_rate"
    exit 1
fi

# ceil may be 0 (meaning "same as rate") or positive
if ! awk "BEGIN { exit !($NEW_CEIL_MBPS >= 0) }" 2>/dev/null; then
    log_error "new_ceil_mbps must be a non-negative number, got: $NEW_CEIL_MBPS"
    echo "ERROR:invalid_ceil"
    exit 1
fi

# ---------------------------------------------------------------------------
# Compute kbit values using tc-common.sh mbps_to_kbit
# ---------------------------------------------------------------------------
FULL_CLASS_ID="1:${CLASS_SLOT}"
RATE_KBIT=$(mbps_to_kbit "$NEW_RATE_MBPS")

if awk "BEGIN { exit !($NEW_CEIL_MBPS == 0) }" 2>/dev/null; then
    CEIL_KBIT="$RATE_KBIT"
else
    CEIL_KBIT=$(mbps_to_kbit "$NEW_CEIL_MBPS")
fi

# ---------------------------------------------------------------------------
# Verify class exists
# ---------------------------------------------------------------------------
if ! tc class show dev "$DEV" classid "$FULL_CLASS_ID" &>/dev/null; then
    log_error "Class $FULL_CLASS_ID does not exist on $DEV"
    echo "ERROR:class_not_found"
    exit 1
fi

log_info "Changing rate for $FULL_CLASS_ID on $DEV to ${RATE_KBIT}kbit/${CEIL_KBIT}kbit"

# ---------------------------------------------------------------------------
# Change class rate (children preserved)
# ---------------------------------------------------------------------------
if tc class change dev "$DEV" classid "$FULL_CLASS_ID" \
    htb rate "${RATE_KBIT}kbit" ceil "${CEIL_KBIT}kbit"; then
    echo "OK"
    log_info "OK — rate changed for $FULL_CLASS_ID to ${RATE_KBIT}kbit/${CEIL_KBIT}kbit"
else
    log_error "Failed to change rate for $FULL_CLASS_ID on $DEV"
    echo "ERROR:rate_change_failed"
    exit 1
fi
