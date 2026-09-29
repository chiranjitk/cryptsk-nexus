#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# Cryptsk ISP Platform — Subnet HTB Class Creator
# ═══════════════════════════════════════════════════════════════════════════════
# Creates a subnet root HTB class with fq_codel leaf on both ifb0 (download)
# and ifb1 (upload). Idempotent — handles EEXIST gracefully.
#
# Usage:
#   ./subnet-add.sh <subnet_class_id> <down_mbps> <down_ceil_mbps> <up_mbps> <up_ceil_mbps>
#   ./subnet-add.sh 1000 2000 3000 1000 2000
#
# Exit codes:
#   0  Success (class created or already existed)
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
  echo "Usage: $0 <subnet_class_id> <down_mbps> <down_ceil_mbps> <up_mbps> <up_ceil_mbps>"
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

for pair in "down_mbps:$DOWN_RATE" "down_ceil_mbps:$DOWN_CEIL" "up_mbps:$UP_RATE" "up_ceil_mbps:$UP_CEIL"; do
  name="${pair%%:*}"
  val="${pair##*:}"
  validate_mbps "$name" "$val"
done

require_root

# ─── Functions ────────────────────────────────────────────────────────────────
add_subnet_class() {
  local dev="$1" rate="$2" ceil="$3" label="$4"

  # Add HTB class — idempotent: if class exists, just log and skip
  if tc class show dev "$dev" classid "1:${SN}" &>/dev/null; then
    log "[${label}] Class 1:${SN} already exists on ${dev}, skipping create"
  else
    if ! tc class add dev "$dev" parent 1:1 classid "1:${SN}" \
         htb rate "${rate}mbit" ceil "${ceil}mbit" 2>/dev/null; then
      log "[${label}] ERROR: Failed to add class 1:${SN} on ${dev}"
      echo "ERROR:tc_class_add_failed:${dev}"
      return 1
    fi
    log "[${label}] Created class 1:${SN} on ${dev} rate=${rate}mbit ceil=${ceil}mbit"
  fi

  # Attach fq_codel leaf — idempotent: if qdisc exists, remove and re-add
  if tc qdisc show dev "$dev" parent "1:${SN}" 2>/dev/null | grep -q "fq_codel"; then
    log "[${label}] fq_codel already attached at 1:${SN} on ${dev}, skipping"
  else
    # Remove stale leaf if present (different qdisc type)
    tc qdisc del dev "$dev" parent "1:${SN}" handle "${SN}:" 2>/dev/null || true
    if ! tc qdisc add dev "$dev" parent "1:${SN}" handle "${SN}:" fq_codel 2>/dev/null; then
      log "[${label}] ERROR: Failed to attach fq_codel at 1:${SN} on ${dev}"
      echo "ERROR:tc_qdisc_add_failed:${dev}"
      return 1
    fi
    log "[${label}] Attached fq_codel leaf ${SN}: on ${dev}"
  fi

  return 0
}

# ─── Execute ──────────────────────────────────────────────────────────────────
log "Adding subnet class SN=${SN} down=${DOWN_RATE}/${DOWN_CEIL}mbit up=${UP_RATE}/${UP_CEIL}mbit"

ERR=""

if ! add_subnet_class "$IFB_DOWNLOAD" "$DOWN_RATE" "$DOWN_CEIL" "DOWN"; then
  ERR="${ERR}ifb0 "
fi

if ! add_subnet_class "$IFB_UPLOAD" "$UP_RATE" "$UP_CEIL" "UP"; then
  ERR="${ERR}ifb1 "
fi

if [[ -n "$ERR" ]]; then
  log "ERROR: Failed on device(s): ${ERR}"
  echo "ERROR:partial_failure:${ERR}"
  exit 2
fi

log "Subnet class 1:${SN} ready on ${IFB_DOWNLOAD} and ${IFB_UPLOAD}"
echo "OK"
