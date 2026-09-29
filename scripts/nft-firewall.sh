#!/usr/bin/env bash
###############################################################################
# CRYPTSKINTELLIGENT ISP Platform — nft-firewall.sh
# All nftables-based firewall / NAT / mangle / forwarding operations.
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
has_nft() { command -v nft &>/dev/null; }

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

validate_iface() {
  if [[ -z "${1:-}" ]]; then die "Interface name is required" 1; fi
  if [[ ! "$1" =~ ^[a-zA-Z0-9._-]+$ ]]; then die "Invalid interface name: $1" 1; fi
}

validate_not_empty() {
  local val="${1:-}"
  local label="${2:-value}"
  if [[ -z "$val" ]]; then die "$label is required" 1; fi
}

validate_subnet() {
  local sub="${1:-}"
  validate_not_empty "$sub" "Subnet"
  [[ ! "$sub" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+/[0-9]+$ ]] && \
    die "Invalid subnet CIDR: $sub" 1
}

validate_mark() {
  local mark="${1:-}"
  validate_not_empty "$mark" "Mark number"
  if [[ ! "$mark" =~ ^[0-9]+$ ]]; then die "Mark must be a number: $mark" 1; fi
}

validate_number() {
  local val="${1:-}"
  local label="${2:-number}"
  validate_not_empty "$val" "$label"
  if [[ ! "$val" =~ ^[0-9]+$ ]]; then die "$label must be a number: $val" 1; fi
}

validate_comment() {
  local comment="${1:-}"
  validate_not_empty "$comment" "Comment"
  local invalid_chars='["\;]'
  if [[ "$comment" =~ $invalid_chars ]]; then die "Invalid characters in comment: $comment" 1; fi
  if [[ ${#comment} -gt 128 ]]; then die "Comment too long (max 128 chars)" 1; fi
}

ensure_nft() {
  has_nft || die "nft command not found. Install nftables package." 2
}

# ---------------------------------------------------------------------------
# NAT commands
# ---------------------------------------------------------------------------

cmd_nat_enable() {
  ensure_nft
  local iface="${1:-}"
  validate_iface "$iface"
  local comment="CRYPTSKIN_nat_${iface}"

  nft list tables 2>/dev/null | grep -q "ip cryptsk_nat" || \
    nft add table ip cryptsk_nat

  nft list table ip cryptsk_nat 2>/dev/null | grep -q "chain postrouting" || \
    nft 'add chain ip cryptsk_nat postrouting { type nat hook postrouting priority 100 ; }'

  if nft list chain ip cryptsk_nat postrouting 2>/dev/null | grep -q "oifname \"$iface\".*masquerade.*$comment"; then
    ok '{}' "NAT masquerade already active for $iface"
    return
  fi

  nft add rule ip cryptsk_nat postrouting oifname "\"$iface\"" masquerade comment "\"$comment\""
  ok "{\"interface\":\"$iface\"}" "NAT masquerade enabled for $iface"
}

cmd_nat_disable() {
  ensure_nft
  local iface="${1:-}"
  validate_iface "$iface"
  local comment="CRYPTSKIN_nat_${iface}"

  if ! nft list chain ip cryptsk_nat postrouting 2>/dev/null | grep -q "oifname \"$iface\""; then
    ok '{}' "NAT masquerade not active for $iface — nothing to remove"
    return
  fi

  nft delete rule ip cryptsk_nat postrouting oifname "\"$iface\"" masquerade comment "\"$comment\"" 2>/dev/null || \
    nft delete rule ip cryptsk_nat postrouting oifname "\"$iface\"" masquerade

  ok "{\"interface\":\"$iface\"}" "NAT masquerade disabled for $iface"
}

cmd_nat_status() {
  ensure_nft
  local raw
  if ! raw=$(nft list table ip cryptsk_nat 2>/dev/null); then
    ok '{"rules":[]}' "No cryptsk_nat table found (NAT not configured)"
    return
  fi

  local rules
  if has_jq; then
    rules=$(nft -j list table ip cryptsk_nat 2>/dev/null | \
      jq -r '
        .nftables[]? | select(.rule != null) |
        .rule | {
          chain: .chain,
          expr: [
            .expr[]? | select(.match != null or .mangle != null or .masq != null) |
            if .match then .match else .mangle // .masq end
          ]
        } | tostring
      ' 2>/dev/null) || rules=""
  fi

  if [[ -z "$rules" ]]; then
    ok '{"rules":[]}' "No NAT masquerade rules"
    return
  fi

  if has_jq; then
    local json
    json=$(printf '%s\n' "$rules" | jq -R -s 'split("\n") | map(select(length > 0)) | {rules: .}')
    ok "$json" "NAT status retrieved"
  else
    ok "{\"rules\":[\"$rules\"]}" "NAT status retrieved"
  fi
}

# ---------------------------------------------------------------------------
# Mangle commands
# ---------------------------------------------------------------------------

cmd_mangle_mark_add() {
  ensure_nft
  local subnet="${1:-}"
  local mark="${2:-}"
  local comment="${3:-}"
  validate_subnet "$subnet"
  validate_mark "$mark"
  validate_not_empty "$comment" "Comment"
  validate_comment "$comment"
  local full_comment="CRYPTSKIN_mangle_${comment}"

  nft list tables 2>/dev/null | grep -q "ip cryptsk_mangle" || \
    nft add table ip cryptsk_mangle
  nft list table ip cryptsk_mangle 2>/dev/null | grep -q "chain prerouting" || \
    nft 'add chain ip cryptsk_mangle prerouting { type filter hook prerouting priority mangle ; }'

  if nft list chain ip cryptsk_mangle prerouting 2>/dev/null | \
    grep -q "saddr $subnet.*mark set $mark"; then
    ok "{\"subnet\":\"$subnet\",\"mark\":$mark}" "Mangle mark rule already exists"
    return
  fi

  nft add rule ip cryptsk_mangle prerouting ip saddr "$subnet" mark set "$mark" comment "\"$full_comment\""
  ok "{\"subnet\":\"$subnet\",\"mark\":$mark,\"comment\":\"$comment\"}" "Mangle mark rule added"
}

cmd_mangle_mark_del() {
  ensure_nft
  local mark="${1:-}"
  local comment="${2:-}"
  validate_mark "$mark"
  validate_not_empty "$comment" "Comment"
  validate_comment "$comment"
  local full_comment="CRYPTSKIN_mangle_${comment}"

  # Try delete by handle-based approach for reliability
  local handle
  handle=$(nft -a list chain ip cryptsk_mangle prerouting 2>/dev/null | \
    grep "CRYPTSKIN_mangle_${comment}" | grep "mark set $mark" | head -1 | grep -oP 'handle \K[0-9]+') || true

  if [[ -n "$handle" ]]; then
    nft delete rule ip cryptsk_mangle prerouting handle "$handle" 2>/dev/null || \
      die "Could not delete mangle mark rule (mark=$mark, comment=$comment)." 1
  else
    # Fallback: try direct delete
    nft delete rule ip cryptsk_mangle prerouting ip saddr . mark set "$mark" comment "\"$full_comment\"" 2>/dev/null || \
      die "Could not delete mangle mark rule (mark=$mark, comment=$comment). Rule may not exist." 1
  fi

  ok "{\"mark\":$mark,\"comment\":\"$comment\"}" "Mangle mark rule removed"
}

cmd_mangle_mark_flush() {
  ensure_nft
  local prefix="${1:-}"
  validate_not_empty "$prefix" "Comment prefix"
  local full_prefix="CRYPTSKIN_mangle_${prefix}"

  if ! nft list table ip cryptsk_mangle 2>/dev/null | grep -q "$full_prefix"; then
    ok '{"removed":0}' "No mangle rules matching prefix '$prefix'"
    return
  fi

  local count=0
  while nft list chain ip cryptsk_mangle prerouting 2>/dev/null | grep -q "$full_prefix"; do
    local handle
    handle=$(nft -a list chain ip cryptsk_mangle prerouting 2>/dev/null | \
      grep "$full_prefix" | head -1 | grep -oP 'handle \K[0-9]+') || true
    if [[ -n "$handle" ]]; then
      nft delete rule ip cryptsk_mangle prerouting handle "$handle" 2>/dev/null || break
      count=$((count + 1))
    else
      break
    fi
  done

  ok "{\"removed\":$count,\"prefix\":\"$prefix\"}" "Flushed $count mangle rules"
}

cmd_mangle_status() {
  ensure_nft
  if ! nft list tables 2>/dev/null | grep -q "ip cryptsk_mangle"; then
    ok '{"rules":[]}' "No cryptsk_mangle table found"
    return
  fi

  local json_raw
  json_raw=$(nft -j list table ip cryptsk_mangle 2>/dev/null) || \
    die "Failed to list mangle table" 1

  local rules
  if has_jq; then
    rules=$(printf '%s' "$json_raw" | jq -c '
      [.nftables[]? | select(.rule != null) | .rule | {
        expr: [.expr[]? | select(.match != null or .mangle != null) |
          if .match then .match else .mangle end]
      }]
    ' 2>/dev/null) || rules="[]"
  else
    rules=$(nft list table ip cryptsk_mangle 2>/dev/null | tr '\n' '\\'n | sed 's/"/\\"/g' || echo "[]")
  fi

  ok "{\"rules\":$rules}" "Mangle status retrieved"
}

# ---------------------------------------------------------------------------
# Forward commands
# ---------------------------------------------------------------------------

cmd_forward_enable() {
  ensure_nft
  local in_iface="${1:-}"
  local out_iface="${2:-}"
  validate_iface "$in_iface"
  validate_iface "$out_iface"
  local comment="CRYPTSKIN_forward_${in_iface}_to_${out_iface}"

  nft list tables 2>/dev/null | grep -q "ip cryptsk_filter" || \
    nft add table ip cryptsk_filter
  nft list table ip cryptsk_filter 2>/dev/null | grep -q "chain forward" || \
    nft 'add chain ip cryptsk_filter forward { type filter hook forward priority 0 ; }'

  if nft list chain ip cryptsk_filter forward 2>/dev/null | \
    grep -q "iifname \"$in_iface\".*oifname \"$out_iface\".*accept"; then
    ok "{\"in\":\"$in_iface\",\"out\":\"$out_iface\"}" "Forward rule already exists"
    return
  fi

  nft add rule ip cryptsk_filter forward iifname "\"$in_iface\"" oifname "\"$out_iface\"" accept comment "\"$comment\""
  ok "{\"in\":\"$in_iface\",\"out\":\"$out_iface\"}" "Forward rule enabled: $in_iface → $out_iface"
}

cmd_forward_disable() {
  ensure_nft
  local in_iface="${1:-}"
  local out_iface="${2:-}"
  validate_iface "$in_iface"
  validate_iface "$out_iface"
  local comment="CRYPTSKIN_forward_${in_iface}_to_${out_iface}"

  local handle
  handle=$(nft -a list chain ip cryptsk_filter forward 2>/dev/null | \
    grep "$comment" | head -1 | grep -oP 'handle \K[0-9]+') || true

  if [[ -n "$handle" ]]; then
    nft delete rule ip cryptsk_filter forward handle "$handle" 2>/dev/null || \
      die "Could not delete forward rule ($in_iface → $out_iface)." 1
  else
    die "Could not find forward rule ($in_iface → $out_iface). Rule may not exist." 1
  fi

  ok "{\"in\":\"$in_iface\",\"out\":\"$out_iface\"}" "Forward rule disabled: $in_iface → $out_iface"
}

cmd_forward_status() {
  ensure_nft
  if ! nft list tables 2>/dev/null | grep -q "ip cryptsk_filter"; then
    ok '{"rules":[]}' "No cryptsk_filter table found"
    return
  fi

  local json_raw
  json_raw=$(nft -j list table ip cryptsk_filter 2>/dev/null) || \
    die "Failed to list filter table" 1

  local rules
  if has_jq; then
    rules=$(printf '%s' "$json_raw" | jq -c '
      [.nftables[]? | select(.rule != null) | .rule | {
        expr: [.expr[]? | select(.match != null or .verdict != null) |
          if .match then .match else .verdict end]
      }]
    ' 2>/dev/null) || rules="[]"
  else
    rules=$(nft list table ip cryptsk_filter 2>/dev/null | tr '\n' '\\'n | sed 's/"/\\"/g' || echo "[]")
  fi

  ok "{\"rules\":$rules}" "Forward status retrieved"
}

# ---------------------------------------------------------------------------
# Full status
# ---------------------------------------------------------------------------

cmd_status() {
  ensure_nft
  local tables_json="[]"

  if has_jq; then
    tables_json=$(nft -j list ruleset 2>/dev/null | jq -c '
      [.nftables[]? | select(.table != null) | .table | select(.name | startswith("cryptsk_"))] |
      if . == null then [] else . end
    ' 2>/dev/null) || tables_json="[]"
  fi

  local text_output
  text_output=$(nft list ruleset 2>/dev/null | grep -A1000 "table ip cryptsk_" || echo "No CRYPTSKIN tables found")
  local safe_text
  safe_text=$(printf '%s' "$text_output" | tr '\n' '\\'n | sed 's/"/\\"/g')

  ok "{\"tables\":$tables_json,\"text\":\"$safe_text\"}" "Full firewall status"
}

# ---------------------------------------------------------------------------
# Usage
# ---------------------------------------------------------------------------

usage() {
  cat <<'EOF'
Usage: nft-firewall.sh <subcommand> [args...]

Subcommands:
  nat-enable <interface>                              Enable NAT masquerade
  nat-disable <interface>                             Disable NAT masquerade
  nat-status                                          List NAT masquerade rules

  mangle-mark-add <subnet> <mark> <comment>           Add packet marking rule
  mangle-mark-del <mark> <comment>                    Remove marking rule
  mangle-mark-flush <comment_prefix>                  Flush rules by comment prefix
  mangle-status                                       List mangle rules

  forward-enable <in_iface> <out_iface>               Enable forwarding
  forward-disable <in_iface> <out_iface>              Disable forwarding
  forward-status                                      List forward rules

  status                                              Full firewall status
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
    nat-enable)      cmd_nat_enable "$@" ;;
    nat-disable)     cmd_nat_disable "$@" ;;
    nat-status)      cmd_nat_status "$@" ;;
    mangle-mark-add)    cmd_mangle_mark_add "$@" ;;
    mangle-mark-del)    cmd_mangle_mark_del "$@" ;;
    mangle-mark-flush)  cmd_mangle_mark_flush "$@" ;;
    mangle-status)      cmd_mangle_status "$@" ;;
    forward-enable)   cmd_forward_enable "$@" ;;
    forward-disable)  cmd_forward_disable "$@" ;;
    forward-status)   cmd_forward_status "$@" ;;
    status)           cmd_status "$@" ;;
    -h|--help|help)   usage ;;
    "")               usage ;;
    *)                die "Unknown subcommand: $subcmd. Run with --help for usage." 1 ;;
  esac
}

main "$@"
