#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# Cryptsk ISP Platform — Batch Restore Script
# ═══════════════════════════════════════════════════════════════════════════════
# Full reboot recovery — rebuilds the entire TC state from DB.
# Called by gateway-service at boot with restore data on stdin.
#
# CRITICAL PROPERTIES:
#   - Idempotent: safe to run multiple times
#   - Partial-failure tolerant: continues on non-fatal errors
#   - Structured output: JSON summary on stdout, logs on stderr
#
# Usage:
#   cat restore-data.json | ./batch-restore.sh
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

# ─── Source common utilities ─────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/tc-common.sh"

# ─── Runtime state ───────────────────────────────────────────────────────────
ERRORS=()
SUBNETS_CREATED=0
SESSIONS_RESTORED=0
IFB_INIT_OK=false
QDISC_SETUP_OK=false

# ─── Logging ─────────────────────────────────────────────────────────────────
log()  { echo "[$(date '+%Y-%m-%d %H:%M:%S')] [BATCH-RESTORE] $*" >&2; }
err()  { log "ERROR: $*"; ERRORS+=("$*"); }

# ─── Pre-flight ──────────────────────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
  echo '{"status":"error","message":"Must run as root","errors":["not_root"]}' >&2
  echo '{"status":"error","message":"Must run as root","errors":["not_root"]}'
  exit 1
fi

if ! command -v jq &>/dev/null; then
  echo '{"status":"error","message":"jq is required","errors":["missing_jq"]}' >&2
  echo '{"status":"error","message":"jq is required","errors":["missing_jq"]}'
  exit 1
fi

# ─── 1. Read JSON from stdin ─────────────────────────────────────────────────
INPUT_JSON=""
if [[ ! -t 0 ]]; then
  INPUT_JSON=$(cat)
fi

if [[ -z "$INPUT_JSON" ]]; then
  echo '{"status":"error","message":"No JSON data on stdin","errors":["empty_input"]}' >&2
  echo '{"status":"error","message":"No JSON data on stdin","errors":["empty_input"]}'
  exit 1
fi

# Validate JSON is parseable
if ! echo "$INPUT_JSON" | jq -e '.' >/dev/null 2>&1; then
  echo '{"status":"error","message":"Invalid JSON on stdin","errors":["invalid_json"]}' >&2
  echo '{"status":"error","message":"Invalid JSON on stdin","errors":["invalid_json"]}'
  exit 1
fi

log "Received restore data ($(echo "$INPUT_JSON" | jq -r '.activeSessions | length') sessions, $(echo "$INPUT_JSON" | jq -r '.subnets | length') subnets)"

# ─── Extract top-level fields ────────────────────────────────────────────────
WAN_IFACES=$(echo "$INPUT_JSON" | jq -r '.wanInterfaces | join(",")')
LAN_IFACES=$(echo "$INPUT_JSON" | jq -r '.lanInterfaces | join(",")')
ROOT_DOWN_MBPS=$(echo "$INPUT_JSON" | jq -r '.rootBandwidthDownMbps // 10000')
ROOT_UP_MBPS=$(echo "$INPUT_JSON" | jq -r '.rootBandwidthUpMbps // 10000')

if [[ -z "$WAN_IFACES" || "$WAN_IFACES" == "null" || -z "$LAN_IFACES" || "$LAN_IFACES" == "null" ]]; then
  err "Missing wanInterfaces or lanInterfaces in input JSON"
  echo "{\"status\":\"error\",\"errors\":$(printf '%s\n' "${ERRORS[@]}" | jq -R . | jq -s .)}" >&2
  echo "{\"status\":\"error\",\"errors\":$(printf '%s\n' "${ERRORS[@]}" | jq -R . | jq -s .)}"
  exit 1
fi

# ─── 2. IFB Init (FATAL — abort on failure) ─────────────────────────────────
log "Step 1/5: Initializing IFB devices (WAN=${WAN_IFACES}, LAN=${LAN_IFACES})..."
if ! "$SCRIPT_DIR/ifb-init.sh" "$WAN_IFACES" "$LAN_IFACES" >/dev/null 2>"${TMPDIR:-/tmp}/batch-restore-ifb-$$"; then
  IFB_ERR=$(cat "${TMPDIR:-/tmp}/batch-restore-ifb-$$" 2>/dev/null || echo "unknown")
  # Sanitize: truncate to 200 chars and strip control characters
  IFB_ERR=$(echo "$IFB_ERR" | tr -dc '[:print:][:space:]' | head -c 200)
  log "FATAL: ifb-init.sh failed: $IFB_ERR"
  IFB_ERR_JSON=$(echo "$IFB_ERR" | jq -Rs '.')
  echo "{\"status\":\"error\",\"ifbInit\":false,\"errors\":["ifb-init failed: ${IFB_ERR_JSON}"],\"subnetsCreated\":0,\"sessionsRestored\":0}" >&2
  echo "{\"status\":\"error\",\"ifbInit\":false,\"errors\":["ifb-init failed: ${IFB_ERR_JSON}"],\"subnetsCreated\":0,\"sessionsRestored\":0}"
  rm -f "${TMPDIR:-/tmp}/batch-restore-ifb-$$"
  exit 1
fi
rm -f "${TMPDIR:-/tmp}/batch-restore-ifb-$$"
IFB_INIT_OK=true
log "  ✓ IFB init complete"

# ─── 3. Qdisc Setup ──────────────────────────────────────────────────────────
log "Step 2/5: Setting up root qdiscs (down=${ROOT_DOWN_MBPS}Mbps, up=${ROOT_UP_MBPS}Mbps)..."
if ! "$SCRIPT_DIR/qdisc-setup.sh" "$ROOT_DOWN_MBPS" "$ROOT_UP_MBPS" >/dev/null 2>"${TMPDIR:-/tmp}/batch-restore-qdisc-$$"; then
  QDISC_ERR=$(cat "${TMPDIR:-/tmp}/batch-restore-qdisc-$$" 2>/dev/null || echo "unknown")
  err "qdisc-setup.sh failed: $QDISC_ERR"
else
  QDISC_SETUP_OK=true
  log "  ✓ Qdisc setup complete"
fi
rm -f "${TMPDIR:-/tmp}/batch-restore-qdisc-$$"

# ─── 4. Create Subnets ───────────────────────────────────────────────────────
SUBNET_COUNT=$(echo "$INPUT_JSON" | jq -r '.subnets | length')
log "Step 3/5: Creating ${SUBNET_COUNT} subnet(s)..."

for i in $(seq 0 $((SUBNET_COUNT - 1))); do
  SUBNET_JSON=$(echo "$INPUT_JSON" | jq -c ".subnets[$i]")
  SUBNET_INDEX=$(echo "$SUBNET_JSON" | jq -r '.tcSubnetIndex')
  POOL_DOWN=$(echo "$SUBNET_JSON" | jq -r '.bandwidthPoolDownMbps // 100')
  BURST_DOWN=$(echo "$SUBNET_JSON" | jq -r '.bandwidthBurstDownMbps // 150')
  POOL_UP=$(echo "$SUBNET_JSON" | jq -r '.bandwidthPoolUpMbps // 50')
  BURST_UP=$(echo "$SUBNET_JSON" | jq -r '.bandwidthBurstUpMbps // 75')

  CLASS_ID=$((SUBNET_INDEX * 1000))

  if [[ "$CLASS_ID" -lt 1000 || "$CLASS_ID" -gt 99000 ]]; then
    err "subnet ${SUBNET_INDEX}: invalid classid ${CLASS_ID} (out of range)"
    continue
  fi

  log "  → Subnet ${SUBNET_INDEX} (classid 1:${CLASS_ID}, down=${POOL_DOWN}/${BURST_DOWN}, up=${POOL_UP}/${BURST_UP})"
  if ! "$SCRIPT_DIR/subnet-add.sh" "$CLASS_ID" "$POOL_DOWN" "$BURST_DOWN" "$POOL_UP" "$BURST_UP" >/dev/null 2>"${TMPDIR:-/tmp}/batch-restore-subnet-${SUBNET_INDEX}-$$"; then
    SUBNET_ERR=$(cat "${TMPDIR:-/tmp}/batch-restore-subnet-${SUBNET_INDEX}-$$" 2>/dev/null || echo "unknown")
    err "subnet ${SUBNET_INDEX} (classid ${CLASS_ID}): subnet-add.sh failed: $SUBNET_ERR"
  else
    SUBNETS_CREATED=$((SUBNETS_CREATED + 1))
  fi
  rm -f "${TMPDIR:-/tmp}/batch-restore-subnet-${SUBNET_INDEX}-$$"
done
log "  ✓ Subnets created: ${SUBNETS_CREATED}/${SUBNET_COUNT}"

# ─── 5. Restore Sessions ─────────────────────────────────────────────────────
SESSION_COUNT=$(echo "$INPUT_JSON" | jq -r '.activeSessions | length')
log "Step 4/5: Restoring ${SESSION_COUNT} session(s)..."

for i in $(seq 0 $((SESSION_COUNT - 1))); do
  SESSION_JSON=$(echo "$INPUT_JSON" | jq -c ".activeSessions[$i]")
  SUB_ID=$(echo "$SESSION_JSON" | jq -r '.subscriberId')
  SUBNET_IDX=$(echo "$SESSION_JSON" | jq -r '.subnetIndex')
  SLOT=$(echo "$SESSION_JSON" | jq -r '.classSlot')
  IP=$(echo "$SESSION_JSON" | jq -r '.ipAddress')
  DL_RATE=$(echo "$SESSION_JSON" | jq -r '.downloadRateKbps')
  DL_CEIL=$(echo "$SESSION_JSON" | jq -r '.downloadCeilKbps')
  UL_RATE=$(echo "$SESSION_JSON" | jq -r '.uploadRateKbps')
  UL_CEIL=$(echo "$SESSION_JSON" | jq -r '.uploadCeilKbps')
  PRIORITY=$(echo "$SESSION_JSON" | jq -r '.priority // 3')
  DIRECTION=$(echo "$SESSION_JSON" | jq -r '.direction // "both"')
  QUANTUM=$(echo "$SESSION_JSON" | jq -r '.quantum // 15')

  PARENT_CLASS=$((SUBNET_IDX * 1000))

  # Convert kbps to mbps (integer division, floor)
  DL_RATE_MBPS=$((DL_RATE / 1000))
  DL_CEIL_MBPS=$((DL_CEIL / 1000))
  UL_RATE_MBPS=$((UL_RATE / 1000))
  UL_CEIL_MBPS=$((UL_CEIL / 1000))

  # Ensure minimum of 1 Mbps to avoid zero-rate classes
  [[ "$DL_RATE_MBPS" -lt 1 ]] && DL_RATE_MBPS=1
  [[ "$DL_CEIL_MBPS" -lt 1 ]] && DL_CEIL_MBPS=1
  [[ "$UL_RATE_MBPS" -lt 1 ]] && UL_RATE_MBPS=1
  [[ "$UL_CEIL_MBPS" -lt 1 ]] && UL_CEIL_MBPS=1

  SESSION_OK=true

  # Download direction
  if [[ "$DIRECTION" == "both" || "$DIRECTION" == "download" ]]; then
    if ! "$SCRIPT_DIR/subscriber-add.sh" download "$PARENT_CLASS" "$SLOT" "$IP" "$DL_RATE_MBPS" "$DL_CEIL_MBPS" "$PRIORITY" "$QUANTUM" >/dev/null 2>"${TMPDIR:-/tmp}/batch-restore-sess-$$"; then
      SESS_ERR=$(cat "${TMPDIR:-/tmp}/batch-restore-sess-$$" 2>/dev/null || echo "unknown")
      err "session ${SUB_ID} download: subscriber-add.sh failed: $SESS_ERR"
      SESSION_OK=false
    fi
    rm -f "${TMPDIR:-/tmp}/batch-restore-sess-$$"
  fi

  # Upload direction
  if [[ "$DIRECTION" == "both" || "$DIRECTION" == "upload" ]]; then
    if ! "$SCRIPT_DIR/subscriber-add.sh" upload "$PARENT_CLASS" "$SLOT" "$IP" "$UL_RATE_MBPS" "$UL_CEIL_MBPS" "$PRIORITY" "$QUANTUM" >/dev/null 2>"${TMPDIR:-/tmp}/batch-restore-sess-$$"; then
      SESS_ERR=$(cat "${TMPDIR:-/tmp}/batch-restore-sess-$$" 2>/dev/null || echo "unknown")
      err "session ${SUB_ID} upload: subscriber-add.sh failed: $SESS_ERR"
      SESSION_OK=false
    fi
    rm -f "${TMPDIR:-/tmp}/batch-restore-sess-$$"
  fi

  if $SESSION_OK; then
    SESSIONS_RESTORED=$((SESSIONS_RESTORED + 1))
  fi

  # Progress logging every 100 sessions
  if (( i > 0 && i % 100 == 0 )); then
    log "  → Progress: ${i}/${SESSION_COUNT} sessions processed..."
  fi
done
log "  ✓ Sessions restored: ${SESSIONS_RESTORED}/${SESSION_COUNT}"

# ─── 6. Health Check ─────────────────────────────────────────────────────────
log "Step 5/5: Running health check..."
HEALTH_JSON=""
if [[ -x "$SCRIPT_DIR/health-check.sh" ]]; then
  HEALTH_JSON=$("$SCRIPT_DIR/health-check.sh" "$WAN_IFACES" "$LAN_IFACES" 2>/dev/null || echo '{}')
  HEALTHY=$(echo "$HEALTH_JSON" | jq -r '.healthy // true')
  if [[ "$HEALTHY" == "false" ]]; then
    WARNINGS=$(echo "$HEALTH_JSON" | jq -r '.warnings // [] | join("; ")')
    err "Health check failed: $WARNINGS"
  fi
  log "  ✓ Health check complete"
else
  log "  ⚠ health-check.sh not found — skipping"
fi

# ─── 7. Output Summary ───────────────────────────────────────────────────────
if [[ ${#ERRORS[@]} -eq 0 ]]; then
  STATUS="ok"
else
  STATUS="partial"
  log "Completed with ${#ERRORS[@]} error(s)"
fi

# Build errors JSON array safely
ERRORS_JSON="[]"
if [[ ${#ERRORS[@]} -gt 0 ]]; then
  ERRORS_JSON=$(printf '%s\n' "${ERRORS[@]}" | jq -R . | jq -s .)
fi

SUMMARY=$(jq -n \
  --arg status "$STATUS" \
  --argjson ifbInit "$IFB_INIT_OK" \
  --argjson qdiscSetup "$QDISC_SETUP_OK" \
  --argjson subnetsCreated "$SUBNETS_CREATED" \
  --argjson sessionsRestored "$SESSIONS_RESTORED" \
  --argjson errors "$ERRORS_JSON" \
  '{status: $status, ifbInit: $ifbInit, qdiscSetup: $qdiscSetup, subnetsCreated: $subnetsCreated, sessionsRestored: $sessionsRestored, errors: $errors}')

log "════════════════════════════════════════════════════════"
log "Batch restore complete: $STATUS"
log "  IFB init:      $IFB_INIT_OK"
log "  Qdisc setup:   $QDISC_SETUP_OK"
log "  Subnets:       ${SUBNETS_CREATED}"
log "  Sessions:      ${SESSIONS_RESTORED}"
log "  Errors:        ${#ERRORS[@]}"
log "════════════════════════════════════════════════════════"

# JSON to stdout
echo "$SUMMARY"
