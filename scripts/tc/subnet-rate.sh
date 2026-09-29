#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# Cryptsk ISP Platform — Subnet Rate Modifier
# ═══════════════════════════════════════════════════════════════════════════════
# Changes the bandwidth pool (rate/ceil) of an existing subnet HTB class on
# both ifb0 (download) and ifb1 (upload). Uses `tc class change` so all
# child classes and their qdiscs are preserved in-place.
#
# Usage:
#   ./subnet-rate.sh <subnet_class_id> <new_down_mbps> <new_down_ceil_mbps> <new_up_mbps> <new_up_ceil_mbps>
#   ./subnet-rate.sh 1000 3000 4000 1500 2500
#
# Exit codes:
#   0  Success
#   1  Argument error
#   2  TC operation failure
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/tc-common.sh"

IFB_DOWNLOAD="ifb0"
IFB_UPLOAD="ifb1"

# ─── Validate Arguments ───────────────────────────────────────────────────────
if [[ $# -ne 5 ]]; then
  echo "ERROR: Expected 5 arguments, got $#"
  echo "Usage: $0 <subnet_class_id> <new_down_mbps> <new_down_ceil_mbps> <new_up_mbps> <new_up_ceil_mbps>"
  exit 1
fi

SN="$1"
DOWN_RATE="$2"
DOWN_CEIL="$3"
UP_RATE="$4"
UP_CEIL="$5"

# Validate class ID range
if ! [[ "$SN" =~ ^[0-9]+$ ]] || [[ "$SN" -lt 1000 ]] || [[ "$SN" -gt 999000 ]]; then
  echo "ERROR: subnet_class_id must be an integer in range 1000-999000, got '$SN'"
  exit 1
fi

# Validate bandwidth values
validate_mbps() {
  local name="$1" val="$2"
  if ! [[ "$val" =~ ^[0-9]+(\.[0-9]+)?$ ]] || [[ $(echo "$val <= 0" | bc -l) -eq 1 ]]; then
    echo "ERROR: ${name} must be a positive number, got '$val'"
    exit 1
  fi
}

for pair in "new_down_mbps:$DOWN_RATE" "new_down_ceil_mbps:$DOWN_CEIL" "new_up_mbps:$UP_RATE" "new_up_ceil_mbps:$UP_CEIL"; do
  name="${pair%%:*}"
  val="${pair##*:}"
  validate_mbps "$name" "$val"
done

require_root

# ─── Functions ────────────────────────────────────────────────────────────────
change_subnet_rate() {
  local dev="$1" rate="$2" ceil="$3" label="$4"

  # Verify class exists before attempting change
  if ! tc class show dev "$dev" classid "1:${SN}" &>/dev/null; then
    log "[${label}] ERROR: Class 1:${SN} does not exist on ${dev}"
    echo "ERROR:class_not_found:${dev}"
    return 1
  fi

  if ! tc class change dev "$dev" classid "1:${SN}" \
       htb rate "${rate}mbit" ceil "${ceil}mbit" 2>/dev/null; then
    log "[${label}] ERROR: Failed to change class 1:${SN} on ${dev}"
    echo "ERROR:tc_class_change_failed:${dev}"
    return 1
  fi

  log "[${label}] Updated class 1:${SN} on ${dev} rate=${rate}mbit ceil=${ceil}mbit"
  return 0
}

# ─── Execute ──────────────────────────────────────────────────────────────────
log "Changing subnet rate SN=${SN} down=${DOWN_RATE}/${DOWN_CEIL}mbit up=${UP_RATE}/${UP_CEIL}mbit"

ERR=""

if ! change_subnet_rate "$IFB_DOWNLOAD" "$DOWN_RATE" "$DOWN_CEIL" "DOWN"; then
  ERR="${ERR}ifb0 "
fi

if ! change_subnet_rate "$IFB_UPLOAD" "$UP_RATE" "$UP_CEIL" "UP"; then
  ERR="${ERR}ifb1 "
fi

if [[ -n "$ERR" ]]; then
  log "ERROR: Failed on device(s): ${ERR}"
  echo "ERROR:partial_failure:${ERR}"
  exit 2
fi

log "Subnet class 1:${SN} rate updated on ${IFB_DOWNLOAD} and ${IFB_UPLOAD}"
echo "OK"
