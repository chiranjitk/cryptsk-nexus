#!/usr/bin/env bash
###############################################################################
# CRYPTSKINTELLIGENT ISP Platform — multiwan-routing.sh
# Multi-WAN routing, policy routing, multipath default routes.
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
has_ip() { command -v ip &>/dev/null; }

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

validate_ip() {
  local addr="${1:-}"
  validate_not_empty "$addr" "IP address"
  if [[ ! "$addr" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then die "Invalid IPv4 address: $addr" 1; fi
}

validate_cidr() {
  local cidr="${1:-}"
  validate_not_empty "$cidr" "CIDR"
  if [[ ! "$cidr" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+(/[0-9]+)?$ ]]; then die "Invalid CIDR: $cidr" 1; fi
}

validate_number() {
  local val="${1:-}"
  local label="${2:-number}"
  validate_not_empty "$val" "$label"
  if [[ ! "$val" =~ ^[0-9]+$ ]]; then die "$label must be a number: $val" 1; fi
}

validate_gateway() {
  local gw="${1:-}"
  validate_not_empty "$gw" "Gateway"
  if [[ ! "$gw" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then die "Invalid gateway address: $gw" 1; fi
}

ensure_ip() {
  has_ip || die "ip command not found. Install iproute2 package." 2
}

# ---------------------------------------------------------------------------
# Multipath routing
# ---------------------------------------------------------------------------

cmd_multipath_apply() {
  ensure_ip
  local json_nexthops="${1:-}"
  validate_not_empty "$json_nexthops" "JSON nexthops"

  if has_jq; then
    if ! printf '%s' "$json_nexthops" | jq -e '. | type == "array"' &>/dev/null; then
      die "nexthops must be a JSON array" 1
    fi
    local entry_err
    entry_err=$(printf '%s' "$json_nexthops" | jq -e '
      if any(. == null or .via == null or .dev == null or .weight == null) then
        "Each nexthop must have via, dev, weight fields"
      else empty end
    ' 2>&1) || die "Invalid nexthop entries: $entry_err" 1
  else
    die "jq is required for multipath-apply JSON parsing" 2
  fi

  # Remove existing multipath default first (idempotent)
  ip route del default 2>/dev/null || true

  # Build nexthop arguments from JSON
  local nexthop_args=""
  local count
  count=$(printf '%s' "$json_nexthops" | jq 'length')
  local i
  for ((i = 0; i < count; i++)); do
    local via dev weight
    via=$(printf '%s' "$json_nexthops" | jq -r ".[$i].via")
    dev=$(printf '%s' "$json_nexthops" | jq -r ".[$i].dev")
    weight=$(printf '%s' "$json_nexthops" | jq -r ".[$i].weight")
    validate_gateway "$via"
    validate_iface "$dev"
    validate_number "$weight" "Weight"

    if [[ -n "$nexthop_args" ]]; then
      nexthop_args="$nexthop_args nexthop via $via dev $dev weight $weight"
    else
      nexthop_args="nexthop via $via dev $dev weight $weight"
    fi
  done

  ip route add default $nexthop_args
  ok "{\"nexthops\":$json_nexthops}" "Multipath default route applied"
}

cmd_multipath_remove() {
  ensure_ip

  if ! ip route show default 2>/dev/null | grep -q "default"; then
    ok '{}' "No default route to remove"
    return
  fi

  ip route del default 2>/dev/null || \
    die "Failed to remove default route" 1

  ok '{}' "Multipath default route removed"
}

cmd_multipath_status() {
  ensure_ip

  local raw
  raw=$(ip -j route show default 2>/dev/null) || raw="[]"

  if has_jq; then
    local json
    json=$(printf '%s' "$raw" | jq -c '
      if . == null or . == [] then
        {active: false, nexthops: []}
      else
        {
          active: true,
          nexthops: [.[0].nexthops[]? | {via: .gateway, dev: .dev, weight: .weight, flags: .flags}]
        }
      end
    ' 2>/dev/null) || json='{"active":false,"nexthops":[]}'

    ok "$json" "Multipath status"
  else
    if ip route show default 2>/dev/null | grep -q "nexthop"; then
      ok '{"active":true,"nexthops":"see_raw"}' "Multipath active (install jq for details)"
    else
      ok '{"active":false,"nexthops":[]}' "Multipath not active"
    fi
  fi
}

# ---------------------------------------------------------------------------
# Policy routing
# ---------------------------------------------------------------------------

cmd_policy_route_add() {
  ensure_ip
  local table_num="${1:-}"
  local gateway="${2:-}"
  local interface="${3:-}"
  validate_number "$table_num" "Table number"
  validate_gateway "$gateway"
  validate_iface "$interface"

  # Replace existing default route in the table (idempotent)
  ip route replace default via "$gateway" dev "$interface" table "$table_num" 2>/dev/null || \
    ip route add default via "$gateway" dev "$interface" table "$table_num"

  ok "{\"table\":$table_num,\"gateway\":\"$gateway\",\"interface\":\"$interface\"}" \
    "Policy route added to table $table_num"
}

cmd_policy_route_del() {
  ensure_ip
  local table_num="${1:-}"
  local gateway="${2:-}"
  validate_number "$table_num" "Table number"
  validate_gateway "$gateway"

  ip route del default via "$gateway" table "$table_num" 2>/dev/null || \
    die "Failed to delete route from table $table_num (gateway $gateway). Route may not exist." 1

  ok "{\"table\":$table_num,\"gateway\":\"$gateway\"}" \
    "Policy route deleted from table $table_num"
}

cmd_policy_rule_add() {
  ensure_ip
  local priority="${1:-}"
  local type="${2:-}"
  local value="${3:-}"
  local table_num="${4:-}"

  validate_number "$priority" "Priority"
  [[ "$type" != "mark" && "$type" != "from" ]] && \
    die "Rule type must be 'mark' or 'from', got: $type" 1

  if [[ "$type" == "from" ]]; then
    validate_ip "$value"
  else
    validate_number "$value" "Mark value"
  fi
  validate_number "$table_num" "Table number"

  # Check if rule already exists (idempotent)
  local existing
  if [[ "$type" == "mark" ]]; then
    existing=$(ip rule show 2>/dev/null | grep -E "^[0-9]+:.*fwmark\s+${value}\s+lookup\s+${table_num}" || true)
  else
    existing=$(ip rule show 2>/dev/null | grep -E "^[0-9]+:.*from\s+${value}\s+lookup\s+${table_num}" || true)
  fi

  if [[ -n "$existing" ]]; then
    ok "{\"priority\":$priority,\"type\":\"$type\",\"value\":\"$value\",\"table\":$table_num}" \
      "Policy rule already exists"
    return
  fi

  if [[ "$type" == "mark" ]]; then
    ip rule add priority "$priority" fwmark "$value" lookup "$table_num"
  else
    ip rule add priority "$priority" from "$value" lookup "$table_num"
  fi

  ok "{\"priority\":$priority,\"type\":\"$type\",\"value\":\"$value\",\"table\":$table_num}" \
    "Policy rule added"
}

cmd_policy_rule_del() {
  ensure_ip
  local priority="${1:-}"
  validate_number "$priority" "Priority"

  local rule_line
  rule_line=$(ip rule show 2>/dev/null | grep -E "^${priority}:" || true)

  if [[ -z "$rule_line" ]]; then
    ok "{\"priority\":$priority}" "No policy rule at priority $priority"
    return
  fi

  local prefmatch
  prefmatch=$(printf '%s' "$rule_line" | sed 's/^[0-9]*:[[:space:]]*//')

  ip rule del pref "$priority" 2>/dev/null || \
    die "Failed to delete policy rule at priority $priority" 1

  ok "{\"priority\":$priority,\"deleted\":\"$prefmatch\"}" \
    "Policy rule deleted at priority $priority"
}

cmd_policy_rule_flush() {
  ensure_ip
  local comment_prefix="${1:-}"
  validate_not_empty "$comment_prefix" "Comment prefix"

  local count=0
  local deleted_rules=""

  while IFS= read -r line; do
    local pref
    pref=$(printf '%s' "$line" | grep -oP '^\K[0-9]+' || true)
    [[ -z "$pref" ]] && continue

    # Skip well-known system priorities (0, 32766, 32767)
    [[ "$pref" -le 0 || "$pref" -ge 32766 ]] && continue

    if printf '%s' "$line" | grep -qi "$comment_prefix"; then
      ip rule del pref "$pref" 2>/dev/null || true
      count=$((count + 1))
      deleted_rules="$deleted_rules $pref"
    fi
  done < <(ip rule show 2>/dev/null || true)

  ok "{\"removed\":$count,\"priorities\":\"$deleted_rules\",\"prefix\":\"$comment_prefix\"}" \
    "Flushed $count policy rules matching '$comment_prefix'"
}

# ---------------------------------------------------------------------------
# Default gateway
# ---------------------------------------------------------------------------

cmd_default_gateway_set() {
  ensure_ip
  local gateway="${1:-}"
  local interface="${2:-}"
  local metric="${3:-100}"
  validate_gateway "$gateway"
  validate_iface "$interface"
  validate_number "$metric" "Metric"

  ip route replace default via "$gateway" dev "$interface" metric "$metric"

  ok "{\"gateway\":\"$gateway\",\"interface\":\"$interface\",\"metric\":$metric}" \
    "Default gateway set to $gateway via $interface"
}

cmd_default_gateway_remove() {
  ensure_ip

  local removed=0
  while ip route show default 2>/dev/null | grep -q "default"; do
    ip route del default 2>/dev/null || break
    removed=$((removed + 1))
  done

  ok "{\"removed\":$removed}" "Removed $removed default gateway(s)"
}

# ---------------------------------------------------------------------------
# Static routes
# ---------------------------------------------------------------------------

cmd_route_add() {
  ensure_ip
  local dest="${1:-}"
  local via="${2:-}"
  local dev="${3:-}"
  local metric="${4:-}"
  validate_cidr "$dest" "Destination"
  validate_gateway "$via"
  validate_iface "$dev"

  local args="route replace $dest via $via dev $dev"
  if [[ -n "$metric" ]]; then
    validate_number "$metric" "Metric"
    args="$args metric $metric"
  fi

  ip $args

  ok "{\"dest\":\"$dest\",\"via\":\"$via\",\"dev\":\"$dev\",\"metric\":${metric:-0}}" \
    "Route added: $dest via $via dev $dev"
}

cmd_route_del() {
  ensure_ip
  local dest="${1:-}"
  local via="${2:-}"
  local dev="${3:-}"
  validate_cidr "$dest" "Destination"
  validate_gateway "$via"
  validate_iface "$dev"

  ip route del "$dest" via "$via" dev "$dev" 2>/dev/null || \
    die "Failed to delete route $dest via $via dev $dev. Route may not exist." 1

  ok "{\"dest\":\"$dest\",\"via\":\"$via\",\"dev\":\"$dev\"}" \
    "Route deleted: $dest via $via dev $dev"
}

# ---------------------------------------------------------------------------
# Show routes / rules
# ---------------------------------------------------------------------------

cmd_route_show() {
  ensure_ip

  local raw
  if raw=$(ip -j route show 2>/dev/null); then
    if has_jq; then
      local json
      json=$(printf '%s' "$raw" | jq -c '.' 2>/dev/null) || json="[]"
      ok "{\"routes\":$json}" "Routes retrieved"
    else
      ok "{\"routes_text\":\"$raw\"}" "Routes retrieved (install jq for structured output)"
    fi
  else
    local text
    text=$(ip route show 2>/dev/null | tr '\n' '\\'n | sed 's/"/\\"/g')
    ok "{\"routes_text\":\"$text\"}" "Routes retrieved (text format)"
  fi
}

cmd_rule_show() {
  ensure_ip

  local raw
  if raw=$(ip -j rule show 2>/dev/null); then
    if has_jq; then
      local json
      json=$(printf '%s' "$raw" | jq -c '.' 2>/dev/null) || json="[]"
      ok "{\"rules\":$json}" "Policy rules retrieved"
    else
      ok "{\"rules_text\":\"$raw\"}" "Policy rules retrieved (install jq for structured output)"
    fi
  else
    local text
    text=$(ip rule show 2>/dev/null | tr '\n' '\\'n | sed 's/"/\\"/g')
    ok "{\"rules_text\":\"$text\"}" "Policy rules retrieved (text format)"
  fi
}

# ---------------------------------------------------------------------------
# Usage
# ---------------------------------------------------------------------------

usage() {
  cat <<'EOF'
Usage: multiwan-routing.sh <subcommand> [args...]

Multipath:
  multipath-apply <json_nexthops>         Apply multipath default route
  multipath-remove                        Remove multipath default route
  multipath-status                        Check multipath status

Policy routing:
  policy-route-add <table> <gw> <iface>   Add route to policy table
  policy-route-del <table> <gw>           Remove route from policy table
  policy-rule-add <prio> <mark|from> <val> <table>  Add ip rule
  policy-rule-del <priority>              Delete ip rule by priority
  policy-rule-flush <prefix>              Flush rules matching prefix

Gateway:
  default-gateway-set <gw> <iface> [metric]  Set default gateway
  default-gateway-remove                  Remove all default gateways

Static routes:
  route-add <dest> <via> <dev> [metric]   Add static route
  route-del <dest> <via> <dev>            Delete static route
  route-show                              Show all routes
  rule-show                               Show all policy rules
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
    multipath-apply)       cmd_multipath_apply "$@" ;;
    multipath-remove)      cmd_multipath_remove "$@" ;;
    multipath-status)      cmd_multipath_status "$@" ;;
    policy-route-add)      cmd_policy_route_add "$@" ;;
    policy-route-del)      cmd_policy_route_del "$@" ;;
    policy-rule-add)       cmd_policy_rule_add "$@" ;;
    policy-rule-del)       cmd_policy_rule_del "$@" ;;
    policy-rule-flush)     cmd_policy_rule_flush "$@" ;;
    default-gateway-set)   cmd_default_gateway_set "$@" ;;
    default-gateway-remove) cmd_default_gateway_remove "$@" ;;
    route-add)             cmd_route_add "$@" ;;
    route-del)             cmd_route_del "$@" ;;
    route-show)            cmd_route_show "$@" ;;
    rule-show)             cmd_rule_show "$@" ;;
    -h|--help|help)        usage ;;
    "")                    usage ;;
    *)                     die "Unknown subcommand: $subcmd. Run with --help for usage." 1 ;;
  esac
}

main "$@"
