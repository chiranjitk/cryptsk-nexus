#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# Cryptsk ISP Platform — Subnet HTB Class Removal
# ═══════════════════════════════════════════════════════════════════════════════
# Removes a subnet root HTB class and its fq_codel leaf from both ifb0 and ifb1.
# Removing the class auto-cascades and destroys all child classes/qdiscs.
# Idempotent — handles ENOENT gracefully.
#
# Usage:
#   ./subnet-del.sh <subnet_class_id>
#   ./subnet-del.sh 1000
#
# Exit codes:
#   0  Success (class removed or didn't exist)
#   1  Argument error
#   2  TC operation failure (unexpected error, not ENOENT)
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/tc-common.sh"

IFB_DOWNLOAD="ifb0"
IFB_UPLOAD="ifb1"

# ─── Validate Arguments ───────────────────────────────────────────────────────
if [[ $# -ne 1 ]]; then
  echo "ERROR: Expected 1 argument, got $#"
  echo "Usage: $0 <subnet_class_id>"
  exit 1
fi

SN="$1"

if ! [[ "$SN" =~ ^[0-9]+$ ]] || [[ "$SN" -lt 1000 ]] || [[ "$SN" -gt 999000 ]]; then
  echo "ERROR: subnet_class_id must be an integer in range 1000-999000, got '$SN'"
  exit 1
fi

require_root

# ─── Functions ────────────────────────────────────────────────────────────────
del_subnet_class() {
  local dev="$1" label="$2"
  local had_work=0

  # Remove leaf qdisc first (graceful — detaches all children)
  if tc qdisc show dev "$dev" parent "1:${SN}" &>/dev/null; then
    if tc qdisc del dev "$dev" parent "1:${SN}" handle "${SN}:" 2>/dev/null; then
      log "[${label}] Removed qdisc ${SN}: from ${dev}"
      had_work=1
    else
      log "[${label}] WARN: qdisc ${SN}: existed but del failed on ${dev}"
    fi
  else
    log "[${label}] No leaf qdisc at 1:${SN} on ${dev}, skipping"
  fi

  # Remove the HTB class itself
  if tc class show dev "$dev" classid "1:${SN}" &>/dev/null; then
    if tc class del dev "$dev" classid "1:${SN}" 2>/dev/null; then
      log "[${label}] Removed class 1:${SN} from ${dev}"
      had_work=1
    else
      log "[${label}] WARN: class 1:${SN} existed but del failed on ${dev}"
      return 1
    fi
  else
    log "[${label}] Class 1:${SN} not found on ${dev}, skipping"
  fi

  return 0
}

# ─── Execute ──────────────────────────────────────────────────────────────────
log "Removing subnet class SN=${SN}"

ERR=""

if ! del_subnet_class "$IFB_DOWNLOAD" "DOWN"; then
  ERR="${ERR}ifb0 "
fi

if ! del_subnet_class "$IFB_UPLOAD" "UP"; then
  ERR="${ERR}ifb1 "
fi

if [[ -n "$ERR" ]]; then
  log "ERROR: Failed on device(s): ${ERR}"
  echo "ERROR:partial_failure:${ERR}"
  exit 2
fi

log "Subnet class 1:${SN} removed from ${IFB_DOWNLOAD} and ${IFB_UPLOAD}"
echo "OK"
