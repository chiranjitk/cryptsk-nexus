#!/usr/bin/env bash
#
# subscriber-stat.sh — Get per-user TC class stats in JSON format.
#
# Usage: ./subscriber-stat.sh <direction> <class_slot>
# Example: ./subscriber-stat.sh download 1003
#
# Output (JSON on stdout):
#   {"classId":"1:1003","bytes":54839204860,"packets":82345678,"drops":0,"overlimits":245,"rateBps":42350000,"backlogBytes":0}
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
        echo '{"error":"invalid_direction"}'
        exit 1
        ;;
esac

# ---------------------------------------------------------------------------
# Validate class_slot is numeric
# ---------------------------------------------------------------------------
if ! [[ "$CLASS_SLOT" =~ ^[0-9]+$ ]]; then
    log_error "class_slot must be numeric, got: $CLASS_SLOT"
    echo '{"error":"invalid_class_slot"}'
    exit 1
fi

FULL_CLASS_ID="1:${CLASS_SLOT}"

# ---------------------------------------------------------------------------
# Verify class exists
# ---------------------------------------------------------------------------
if ! tc class show dev "$DEV" classid "$FULL_CLASS_ID" &>/dev/null; then
    log_error "Class $FULL_CLASS_ID does not exist on $DEV"
    echo '{"error":"class_not_found"}'
    exit 1
fi

# ---------------------------------------------------------------------------
# Try JSON output first (tc -j available in iproute2 >= 5.8)
# ---------------------------------------------------------------------------
TC_JSON_OUTPUT=$(tc -s -j class show dev "$DEV" classid "$FULL_CLASS_ID" 2>/dev/null) && TC_JSON_RC=0 || TC_JSON_RC=$?

if [[ $TC_JSON_RC -eq 0 && -n "$TC_JSON_OUTPUT" ]]; then
    # Parse JSON with python3 (most portable)
    RESULT=$(echo "$TC_JSON_OUTPUT" | python3 -c "
import sys, json

data = json.load(sys.stdin)
if isinstance(data, list):
    obj = data[0]
else:
    obj = data

# Handle nested structure: obj.options or obj directly
if 'options' in obj:
    opts = obj['options']
else:
    opts = obj

bytes_val   = int(opts.get('bytes', 0))
packets_val = int(opts.get('packets', 0))
drops_val   = int(opts.get('drops', 0))
overlimits_val = int(opts.get('overlimits', 0))
rate_val    = int(opts.get('rate', 0))
backlog_val = int(opts.get('backlog', 0))

print(json.dumps({
    'classId':     '${FULL_CLASS_ID}',
    'bytes':       bytes_val,
    'packets':     packets_val,
    'drops':       drops_val,
    'overlimits':  overlimits_val,
    'rateBps':     rate_val,
    'backlogBytes': backlog_val
}, separators=(',', ':')))
" 2>/dev/null)

    if [[ -n "$RESULT" ]]; then
        echo "$RESULT"
        exit 0
    fi
    # Fall through to text parsing
    log_warn "Failed to parse JSON tc output — falling back to text parsing"
fi

# ---------------------------------------------------------------------------
# Fallback: parse text output from `tc -s class show`
# ---------------------------------------------------------------------------
TC_TEXT_OUTPUT=$(tc -s class show dev "$DEV" classid "$FULL_CLASS_ID" 2>&1) || true

if [[ -z "$TC_TEXT_OUTPUT" ]]; then
    log_error "No tc output for class $FULL_CLASS_ID on $DEV"
    echo '{"error":"no_data"}'
    exit 1
fi

# Parse key-value pairs from tc -s text output.
# Expected format includes lines like:
#   Sent 54839204860 bytes 82345678 pkts (dropped 0, overlimits 245 requeues 0)
#   rate 42350000bit 0pps backlog 0b 0p requeues 0
#   lended: 245 borrowed: 0 giants: 0 tokens: -12345 ctokens: -67890

BYTES=0
PACKETS=0
DROPS=0
OVERLIMITS=0
RATE_BPS=0
BACKLOG_BYTES=0

while IFS= read -r line; do
    # Sent line: "Sent <bytes> bytes <packets> pkts (dropped <drops>, overlimits <overlimits> ..."
    if [[ "$line" =~ Sent[[:space:]]+([0-9]+)[[:space:]]+bytes[[:space:]]+([0-9]+)[[:space:]]+pkts[[:space:]]*\(dropped[[:space:]]+([0-9]+),[[:space:]]*overlimits[[:space:]]+([0-9]+) ]]; then
        BYTES="${BASH_REMATCH[1]}"
        PACKETS="${BASH_REMATCH[2]}"
        DROPS="${BASH_REMATCH[3]}"
        OVERLIMITS="${BASH_REMATCH[4]}"
    fi

    # Rate line: "rate <rate>bit <pps>pps backlog <backlog>b ..."
    if [[ "$line" =~ rate[[:space:]]+([0-9]+)bit[[:space:]]+[0-9]+pps[[:space:]]+backlog[[:space:]]+([0-9]+)b ]]; then
        RATE_BPS="${BASH_REMATCH[1]}"
        BACKLOG_BYTES="${BASH_REMATCH[2]}"
    fi
done <<< "$TC_TEXT_OUTPUT"

log_info "Stats for $FULL_CLASS_ID on $DEV: bytes=$BYTES pkts=$PACKETS drops=$DROPS ovr=$OVERLIMITS rate=${RATE_BPS}bps backlog=${BACKLOG_BYTES}b"

# Output JSON (compact, single line)
printf '{"classId":"%s","bytes":%d,"packets":%d,"drops":%d,"overlimits":%d,"rateBps":%d,"backlogBytes":%d}\n' \
    "$FULL_CLASS_ID" \
    "$BYTES" "$PACKETS" "$DROPS" "$OVERLIMITS" "$RATE_BPS" "$BACKLOG_BYTES"
