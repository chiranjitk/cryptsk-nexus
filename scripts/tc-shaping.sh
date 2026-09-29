#!/usr/bin/env bash
###############################################################################
# CRYPTSKINTELLIGENT ISP Platform — tc-shaping.sh
# Traffic control / QoS shaping using HTB (Hierarchy Token Bucket).
#
# Exit codes:  0 = success, 1 = error, 2 = dependency missing
###############################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT_DIR

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

JSON_ERR_TPL='{"success":false,"error":"%s","code":%d}'

has_jq() { command -v jq &>/dev/null; }
has_tc() { command -v tc &>/dev/null; }

die() {
  local msg="${1:-Unknown error}"
  local code="${2:-1}"
  local esc
  esc=$(printf '%s' "$msg" | sed 's/\\/\\\\/g; s/"/\\"/g' | tr '\n' ' ')
  printf '{"success":false,"error":"%s","code":%d}\n' "$esc" "$code"
  exit "$code"
}

ok() {
  local data="${1:-}"
  [[ -z "$data" ]] && data='{}'
  local message="${2:-OK}"
  if has_jq; then
    local d m
    d=$(printf '%s' "$data" | jq -c . 2>/dev/null || echo '{}')
    m=$(printf '%s' "$message" | jq -Rs .)
    printf '{"success":true,"data":%s,"message":%s}\n' "$d" "$m"
  else
    printf '{"success":true,"data":%s,"message":"%s"}\n' "$data" "$message"
  fi
  exit 0
}

validate_not_empty() {
  local val="${1:-}"
  local label="${2:-value}"
  if [[ -z "$val" ]]; then die "$label is required" 1; fi
}

validate_iface() {
  if [[ -z "${1:-}" ]]; then die "Interface name is required" 1; fi
  if [[ ! "$1" =~ ^[a-zA-Z0-9._-]+$ ]]; then die "Invalid interface name: $1" 1; fi
}

validate_number() {
  local val="${1:-}"
  local label="${2:-number}"
  validate_not_empty "$val" "$label"
  if [[ ! "$val" =~ ^[0-9]+(\.[0-9]+)?$ ]]; then die "$label must be a number: $val" 1; fi
}

validate_classid() {
  local cid="${1:-}"
  validate_not_empty "$cid" "Class ID"
  [[ ! "$cid" =~ ^[0-9a-fA-F]+:[0-9a-fA-F]+$ ]] && \
    die "Invalid class ID format (expected x:hex, e.g. 1:10): $cid" 1
}

ensure_tc() {
  has_tc || die "tc command not found. Install iproute2 package." 2
}

mbps_to_kbit() {
  local mbps="${1}"
  echo "$((mbps * 1000))"
}

# ---------------------------------------------------------------------------
# HTB enable
# ---------------------------------------------------------------------------

cmd_htb_enable() {
  ensure_tc
  local iface="${1:-}"
  local rate_mbps="${2:-}"
  local ceil_mbps="${3:-}"
  local burst_kbps="${4:-}"
  validate_iface "$iface"
  validate_number "$rate_mbps" "Rate (Mbps)"
  validate_number "$ceil_mbps" "Ceil (Mbps)"

  local rate_kbit ceil_kbit burst_kbit_val
  rate_kbit=$(mbps_to_kbit "${rate_mbps%.*}")
  ceil_kbit=$(mbps_to_kbit "${ceil_mbps%.*}")

  if [[ -n "$burst_kbps" ]]; then
    validate_number "$burst_kbps" "Burst (kbps)"
    burst_kbit_val="${burst_kbps%.*}"
  else
    burst_kbit_val=$((rate_kbit / 7))
  fi

  # Remove existing qdisc on this interface first (idempotent)
  tc qdisc del dev "$iface" root 2>/dev/null || true

  # Add HTB root qdisc
  tc qdisc add dev "$iface" root handle 1: htb default 10

  # Add root class
  tc class add dev "$iface" parent 1: classid 1:1 htb \
    rate "${rate_kbit}kbit" ceil "${ceil_kbit}kbit" burst "${burst_kbit_val}kbit" cburst "${burst_kbit_val}kbit"

  ok "{\"interface\":\"$iface\",\"rate_mbps\":${rate_mbps%.*},\"ceil_mbps\":${ceil_mbps%.*},\"rate_kbit\":$rate_kbit,\"ceil_kbit\":$ceil_kbit,\"burst_kbit\":$burst_kbit_val}" \
    "HTB qdisc enabled on $iface (rate=${rate_mbps}Mbps, ceil=${ceil_mbps}Mbps)"
}

# ---------------------------------------------------------------------------
# HTB disable
# ---------------------------------------------------------------------------

cmd_htb_disable() {
  ensure_tc
  local iface="${1:-}"
  validate_iface "$iface"

  tc qdisc del dev "$iface" root 2>/dev/null || \
    die "Failed to remove qdisc from $iface (may not exist or no permission)" 1

  ok "{\"interface\":\"$iface\"}" "HTB qdisc removed from $iface"
}

# ---------------------------------------------------------------------------
# HTB status
# ---------------------------------------------------------------------------

cmd_htb_status() {
  ensure_tc
  local iface="${1:-}"
  validate_iface "$iface"

  local qdisc_text
  qdisc_text=$(tc -j qdisc show dev "$iface" 2>/dev/null || echo "[]")

  local class_text
  class_text=$(tc -j class show dev "$iface" 2>/dev/null || echo "[]")

  if has_jq; then
    local qdisc_json
    qdisc_json=$(printf '%s' "$qdisc_text" | jq -c '.' 2>/dev/null || echo "[]")

    local class_json
    class_json=$(printf '%s' "$class_text" | jq -c '
      [.[] | {
        classid: .classid,
        parent: .parent,
        rate: .rate,
        ceil: .ceil,
        burst: .burst,
        cburst: .cburst,
        prio: .prio
      }]
    ' 2>/dev/null) || class_json="[]"

    ok "{\"interface\":\"$iface\",\"qdiscs\":$qdisc_json,\"classes\":$class_json}" \
      "HTB status for $iface"
  else
    local qdisc_plain
    qdisc_plain=$(tc qdisc show dev "$iface" 2>/dev/null || echo "No qdisc")
    local class_plain
    class_plain=$(tc class show dev "$iface" 2>/dev/null || echo "No classes")

    local combined
    combined=$(printf "QDISC:\n%s\n\nCLASSES:\n%s" "$qdisc_plain" "$class_plain" | tr '\n' '\\'n | sed 's/"/\\"/g')

    ok "{\"interface\":\"$iface\",\"text\":\"$combined\"}" \
      "HTB status for $iface (install jq for structured output)"
  fi
}

# ---------------------------------------------------------------------------
# HTB class add
# ---------------------------------------------------------------------------

cmd_htb_class_add() {
  ensure_tc
  local iface="${1:-}"
  local classid="${2:-}"
  local rate="${3:-}"
  local ceil="${4:-}"
  local prio="${5:-}"
  validate_iface "$iface"
  validate_classid "$classid"
  validate_not_empty "$rate" "Rate"
  validate_not_empty "$ceil" "Ceil"

  local rate_arg="$rate"
  local ceil_arg="$ceil"

  if [[ "$rate" =~ ^[0-9]+$ ]]; then
    rate_arg="${rate}kbit"
  fi
  if [[ "$ceil" =~ ^[0-9]+$ ]]; then
    ceil_arg="${ceil}kbit"
  fi

  local parent
  parent="${classid%:*}:"

  local existing
  existing=$(tc -j class show dev "$iface" 2>/dev/null | \
    jq -r --arg cid "$classid" '.[] | select(.classid == $cid) | .classid' 2>/dev/null || true)

  if [[ -n "$existing" ]]; then
    tc class replace dev "$iface" parent "$parent" classid "$classid" htb \
      rate "$rate_arg" ceil "$ceil_arg" ${prio:+prio "$prio"} 2>/dev/null || \
      die "Failed to replace HTB class $classid" 1
    ok "{\"interface\":\"$iface\",\"classid\":\"$classid\",\"rate\":\"$rate_arg\",\"ceil\":\"$ceil_arg\",\"prio\":\"${prio:-default}\"}" \
      "HTB class $classid replaced"
    return
  fi

  tc class add dev "$iface" parent "$parent" classid "$classid" htb \
    rate "$rate_arg" ceil "$ceil_arg" ${prio:+prio "$prio"} 2>/dev/null || \
    die "Failed to add HTB class $classid" 1

  ok "{\"interface\":\"$iface\",\"classid\":\"$classid\",\"rate\":\"$rate_arg\",\"ceil\":\"$ceil_arg\",\"prio\":\"${prio:-default}\"}" \
    "HTB class $classid added"
}

# ---------------------------------------------------------------------------
# HTB class del
# ---------------------------------------------------------------------------

cmd_htb_class_del() {
  ensure_tc
  local iface="${1:-}"
  local classid="${2:-}"
  validate_iface "$iface"
  validate_classid "$classid"

  tc class del dev "$iface" classid "$classid" 2>/dev/null || \
    die "Failed to delete HTB class $classid (may not exist or has children)" 1

  ok "{\"interface\":\"$iface\",\"classid\":\"$classid\"}" \
    "HTB class $classid deleted"
}

# ---------------------------------------------------------------------------
# Usage
# ---------------------------------------------------------------------------

usage() {
  cat <<'EOF'
Usage: tc-shaping.sh <subcommand> [args...]

HTB QoS:
  htb-enable <iface> <rate_mbps> <ceil_mbps> [burst_kbps]    Enable HTB qdisc
  htb-disable <iface>                                          Remove qdisc
  htb-status <iface>                                           Show qdisc/class config
  htb-class-add <iface> <classid> <rate> <ceil> [prio]       Add HTB class
  htb-class-del <iface> <classid>                             Remove HTB class

Rate/ceil format: plain number = kbit, or use suffix (kbit, mbit, gbit, mbps)
Class ID format: x:hex (e.g., 1:10, 1:20, 1:ff)
EOF
  exit 1
}

# ---------------------------------------------------------------------------
# Main dispatch
# ---------------------------------------------------------------------------

main() {
  local subcmd="${1:-}"
  shift || true

  case "$subcmd" in
    htb-enable)       cmd_htb_enable "$@" ;;
    htb-disable)      cmd_htb_disable "$@" ;;
    htb-status)       cmd_htb_status "$@" ;;
    htb-class-add)    cmd_htb_class_add "$@" ;;
    htb-class-del)    cmd_htb_class_del "$@" ;;
    -h|--help|help)   usage ;;
    "")               usage ;;
    *)                die "Unknown subcommand: $subcmd. Run with --help for usage." 1 ;;
  esac
}

main "$@"
