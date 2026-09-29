#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# Cryptsk ISP Platform — Health Check Script
# ═══════════════════════════════════════════════════════════════════════════════
# Verifies the TC hierarchy is intact after restore or during runtime.
# All diagnostics go to stderr; a structured JSON report goes to stdout.
#
# Usage:
#   ./health-check.sh                          # minimal check (IFB + hierarchy)
#   ./health-check.sh eth0,bond0 eth1,br-lan   # also verify redirect filters
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

# ─── Source common utilities ─────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/tc-common.sh"

# ─── Parse optional arguments ────────────────────────────────────────────────
WAN_IFACES="${1:-}"
LAN_IFACES="${2:-}"

if [[ -n "$WAN_IFACES" ]]; then
  IFS=',' read -ra WAN_LIST <<< "$WAN_IFACES"
else
  WAN_LIST=()
fi

if [[ -n "$LAN_IFACES" ]]; then
  IFS=',' read -ra LAN_LIST <<< "$LAN_IFACES"
else
  LAN_LIST=()
fi

# ─── State ───────────────────────────────────────────────────────────────────
WARNINGS=()

# ─── Logging ─────────────────────────────────────────────────────────────────
log()    { echo "[$(date '+%Y-%m-%d %H:%M:%S')] [HEALTH-CHECK] $*" >&2; }
warn()   { log "WARNING: $*"; WARNINGS+=("$*"); }

# ─── Helpers ─────────────────────────────────────────────────────────────────
# Check whether an IFB device exists
check_ifb_exists() {
  local dev="$1"
  ip link show "$dev" >/dev/null 2>&1
}

# Check whether the root HTB qdisc is attached
check_root_qdisc() {
  local dev="$1"
  tc qdisc show dev "$dev" 2>/dev/null | grep -q "htb"
}

# Check whether a specific class exists
check_class() {
  local dev="$1"
  local classid="$2"
  tc class show dev "$dev" classid "$classid" 2>/dev/null | grep -q .
}

# Count all HTB classes on a device
count_total_classes() {
  local dev="$1"
  tc class show dev "$dev" 2>/dev/null | grep -c "htb" || echo 0
}

# Count subnet classes: classids matching 1:<N>000 where N>=1
# These are multiples of 1000 representing subnet pools
count_subnet_classes() {
  local dev="$1"
  local count
  # Note: || true suppresses pipefail when grep finds no matches (exit 1)
  count=$(tc class show dev "$dev" 2>/dev/null \
    | grep -oP 'classid 1:\K[0-9]+' \
    | while read -r cid; do
        # Check if it's a multiple of 1000 and >= 1000, excluding 9999
        if [[ "$cid" -ge 1000 && $((cid % 1000)) -eq 0 && "$cid" -ne 9999 ]]; then
          echo "$cid"
        fi
      done \
    | wc -l \
    | tr -d ' ') || true
  echo "${count:-0}"
}

# Check clsact qdisc on a physical interface
check_clsact() {
  local iface="$1"
  tc qdisc show dev "$iface" 2>/dev/null | grep -q "clsact"
}

# Check ingress redirect filter on an interface (for a target device)
check_redirect_filter() {
  local iface="$1"
  local target="$2"
  tc filter show dev "$iface" ingress 2>/dev/null | grep -q "redirect.*dev ${target}"
}

# ─── Build per-device report ─────────────────────────────────────────────────
check_device() {
  local dev="$1"

  local exists=false
  local root_class=false
  local root_qdisc=false
  local default_class=false
  local subnet_classes=0
  local user_classes=0

  # 1. Device existence
  if check_ifb_exists "$dev"; then
    exists=true
  else
    warn "${dev}: device does not exist"
    jq -n \
      --arg dev "$dev" \
      '{exists: false, rootClass: false, rootQdisc: false, subnetClasses: 0, userClasses: 0, defaultClass: false}'
    return
  fi

  # 2. Root qdisc
  if check_root_qdisc "$dev"; then
    root_qdisc=true
  else
    warn "${dev}: no HTB root qdisc"
  fi

  # 3. Root class 1:1
  if check_class "$dev" "1:1"; then
    root_class=true
  else
    warn "${dev}: root class 1:1 missing"
  fi

  # 4. Total classes
  local total_classes
  total_classes=$(count_total_classes "$dev")

  # 5. Subnet classes
  subnet_classes=$(count_subnet_classes "$dev")

  # 6. Default class 1:9999
  if check_class "$dev" "1:9999"; then
    default_class=true
  else
    warn "${dev}: default class 1:9999 missing"
  fi

  # 7. User classes = total - subnet classes - root(1) - default(1)
  #    Only compute if we have a valid root qdisc
  if $root_qdisc; then
    local known_classes=$((subnet_classes + 2))  # subnets + root + default
    user_classes=$((total_classes - known_classes))
    if [[ "$user_classes" -lt 0 ]]; then
      user_classes=0
      warn "${dev}: class count inconsistency (total=${total_classes}, known=${known_classes})"
    fi
  fi

  jq -n \
    --arg dev "$dev" \
    --argjson exists "$exists" \
    --argjson rootClass "$root_class" \
    --argjson rootQdisc "$root_qdisc" \
    --argjson subnetClasses "$subnet_classes" \
    --argjson userClasses "$user_classes" \
    --argjson defaultClass "$default_class" \
    '{exists: $exists, rootClass: $rootClass, rootQdisc: $rootQdisc, subnetClasses: $subnetClasses, userClasses: $userClasses, defaultClass: $defaultClass}'
}

# ─── Main Checks ─────────────────────────────────────────────────────────────
log "Starting TC health check..."

# Check ifb0 (download) and ifb1 (upload)
IFB0_JSON=$(check_device "ifb0")
IFB1_JSON=$(check_device "ifb1")

# ─── Check physical interfaces ───────────────────────────────────────────────
# Only check if arguments were provided
if [[ ${#WAN_LIST[@]} -gt 0 || ${#LAN_LIST[@]} -gt 0 ]]; then
  log "Checking physical interface filters..."

  # WAN interfaces should have clsact + redirect to ifb0
  for iface in "${WAN_LIST[@]}"; do
    if ip link show "$iface" >/dev/null 2>&1; then
      if ! check_clsact "$iface"; then
        warn "No clsact qdisc on WAN interface ${iface}"
      fi
      if ! check_redirect_filter "$iface" "ifb0"; then
        warn "No WAN redirect filters on ${iface}"
      fi
    else
      warn "WAN interface ${iface} does not exist"
    fi
  done

  # LAN interfaces should have clsact + redirect to ifb1
  for iface in "${LAN_LIST[@]}"; do
    if ip link show "$iface" >/dev/null 2>&1; then
      if ! check_clsact "$iface"; then
        warn "No clsact qdisc on LAN interface ${iface}"
      fi
      if ! check_redirect_filter "$iface" "ifb1"; then
        warn "No LAN redirect filters on ${iface}"
      fi
    else
      warn "LAN interface ${iface} does not exist"
    fi
  done
fi

# ─── Determine overall health ────────────────────────────────────────────────
# Healthy if both IFBs exist with root class + root qdisc
IFB0_HEALTHY=$(echo "$IFB0_JSON" | jq -r '.exists and .rootClass and .rootQdisc')
IFB1_HEALTHY=$(echo "$IFB1_JSON" | jq -r '.exists and .rootClass and .rootQdisc')

if [[ "$IFB0_HEALTHY" == "true" && "$IFB1_HEALTHY" == "true" && ${#WARNINGS[@]} -eq 0 ]]; then
  HEALTHY=true
else
  HEALTHY=false
fi

# ─── Build warnings JSON array ───────────────────────────────────────────────
WARNINGS_JSON="[]"
if [[ ${#WARNINGS[@]} -gt 0 ]]; then
  WARNINGS_JSON=$(printf '%s\n' "${WARNINGS[@]}" | jq -R . | jq -s .)
fi

# ─── Output JSON report ─────────────────────────────────────────────────────
REPORT=$(jq -n \
  --argjson ifb0 "$IFB0_JSON" \
  --argjson ifb1 "$IFB1_JSON" \
  --argjson warnings "$WARNINGS_JSON" \
  --argjson healthy "$HEALTHY" \
  '{ifb0: $ifb0, ifb1: $ifb1, warnings: $warnings, healthy: $healthy}')

log "Health check complete: healthy=$HEALTHY, warnings=${#WARNINGS[@]}"

# JSON to stdout
echo "$REPORT"
