#!/usr/bin/env bash
#
# subscriber-block.sh — Hard-block a subscriber by setting HTB rate to 1kbit.
#
# Usage: ./subscriber-block.sh <direction> <class_slot>
# Example: ./subscriber-block.sh download 1003
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/tc-common.sh"
require_root

# ---------------------------------------------------------------------------
# Usage
# ---------------------------------------------------------------------------
usage() {
    echo "Usage: $0 <direction> <class_slot>" >&2
    exit 1
}

# ---------------------------------------------------------------------------
# Args
# ---------------------------------------------------------------------------
[[ $# -lt 2 ]] && usage

DIRECTION="$1"
CLASS_SLOT="$2"

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
# Validate class_slot is numeric
# ---------------------------------------------------------------------------
if ! [[ "$CLASS_SLOT" =~ ^[0-9]+$ ]]; then
    log_error "class_slot must be numeric, got: $CLASS_SLOT"
    echo "ERROR:invalid_class_slot"
    exit 1
fi

# ---------------------------------------------------------------------------
# Full class ID
# ---------------------------------------------------------------------------
FULL_CLASS_ID="1:${CLASS_SLOT}"

# ---------------------------------------------------------------------------
# Verify class exists
# ---------------------------------------------------------------------------
if ! tc class show dev "$DEV" classid "$FULL_CLASS_ID" &>/dev/null; then
    log_error "Class $FULL_CLASS_ID does not exist on $DEV"
    echo "ERROR:class_not_found"
    exit 1
fi

log_info "Blocking subscriber $FULL_CLASS_ID on $DEV (rate -> 1kbit)"

# ---------------------------------------------------------------------------
# Set rate to near-zero
# ---------------------------------------------------------------------------
if tc class change dev "$DEV" classid "$FULL_CLASS_ID" \
    htb rate 1kbit ceil 1kbit; then
    echo "OK"
    log_info "OK — subscriber $FULL_CLASS_ID blocked on $DEV"
else
    log_error "Failed to block subscriber $FULL_CLASS_ID on $DEV"
    echo "ERROR:block_failed"
    exit 1
fi
