#!/usr/bin/env bash
###############################################################################
# CRYPTSKINTELLIGENT ISP Platform — network-ops.sh
# Interface management, IP address operations, ARP, traffic counters.
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

validate_cidr() {
  local cidr="${1:-}"
  validate_not_empty "$cidr" "CIDR"
  [[ ! "$cidr" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+/[0-9]+$ ]] && \
    die "Invalid CIDR address: $cidr (expected format: x.x.x.x/y)" 1
}

ensure_ip() {
  has_ip || die "ip command not found. Install iproute2 package." 2
}

# ---------------------------------------------------------------------------
# Interface list
# ---------------------------------------------------------------------------

cmd_interface_list() {
  ensure_ip

  local raw
  raw=$(ip -j link show 2>/dev/null) || \
    die "Failed to list interfaces" 1

  if has_jq; then
    local json
    json=$(printf '%s' "$raw" | jq -c '
      [.[] | {
        name: .ifname,
        index: .ifindex,
        state: (.operstate // "UNKNOWN"),
        type: (.link_type // "unknown"),
        mtu: .mtu,
        mac: (.address // "00:00:00:00:00:00"),
        flags: .flags,
        master: .master
      }]
    ' 2>/dev/null) || json="[]"

    ok "{\"interfaces\":$json}" "Interface list retrieved"
  else
    ok "{\"interfaces_raw\":\"$raw\"}" "Interface list (install jq for structured output)"
  fi
}

# ---------------------------------------------------------------------------
# Interface IP
# ---------------------------------------------------------------------------

cmd_interface_ip() {
  ensure_ip
  local iface="${1:-}"
  validate_iface "$iface"

  local raw
  raw=$(ip -j addr show dev "$iface" 2>/dev/null) || \
    die "Failed to get IP config for $iface" 1

  if has_jq; then
    local count
    count=$(printf '%s' "$raw" | jq 'length' 2>/dev/null)
    if [[ "$count" -eq 0 ]]; then
      die "Interface $iface not found" 1
    fi
  fi

  if has_jq; then
    local json
    json=$(printf '%s' "$raw" | jq -c '
      [.[] | {
        name: .ifname,
        index: .ifindex,
        state: (.operstate // "UNKNOWN"),
        mtu: .mtu,
        mac: (.address // "00:00:00:00:00:00"),
        addresses: [.addr_info[]? | {
          family: .family,
          local: .local,
          prefixlen: .prefixlen,
          broadcast: .broadcast,
          scope: .scope,
          label: .label
        }]
      }]
    ' 2>/dev/null) || json="[]"

    ok "$json" "IP config for $iface"
  else
    ok "{\"raw\":\"$raw\"}" "IP config for $iface (install jq for structured output)"
  fi
}

# ---------------------------------------------------------------------------
# Interface up/down
# ---------------------------------------------------------------------------

cmd_interface_up() {
  ensure_ip
  local iface="${1:-}"
  validate_iface "$iface"

  ip link set "$iface" up 2>/dev/null || \
    die "Failed to bring interface $iface up" 1

  local state
  state=$(ip -j link show dev "$iface" 2>/dev/null | jq -r '.[0].operstate' 2>/dev/null || echo "UNKNOWN")
  ok "{\"interface\":\"$iface\",\"state\":\"$state\"}" "Interface $iface brought up"
}

cmd_interface_down() {
  ensure_ip
  local iface="${1:-}"
  validate_iface "$iface"

  ip link set "$iface" down 2>/dev/null || \
    die "Failed to bring interface $iface down" 1

  ok "{\"interface\":\"$iface\",\"state\":\"DOWN\"}" "Interface $iface brought down"
}

# ---------------------------------------------------------------------------
# IP address add/del/flush/set
# ---------------------------------------------------------------------------

cmd_ip_add() {
  ensure_ip
  local iface="${1:-}"
  local cidr="${2:-}"
  validate_iface "$iface"
  validate_cidr "$cidr"

  ip addr add "$cidr" dev "$iface" 2>/dev/null || \
    die "Failed to add IP $cidr to $iface" 1

  ok "{\"interface\":\"$iface\",\"cidr\":\"$cidr\"}" "IP $cidr added to $iface"
}

cmd_ip_del() {
  ensure_ip
  local iface="${1:-}"
  local cidr="${2:-}"
  validate_iface "$iface"
  validate_cidr "$cidr"

  ip addr del "$cidr" dev "$iface" 2>/dev/null || \
    die "Failed to delete IP $cidr from $iface. It may not exist." 1

  ok "{\"interface\":\"$iface\",\"cidr\":\"$cidr\"}" "IP $cidr removed from $iface"
}

cmd_ip_flush() {
  ensure_ip
  local iface="${1:-}"
  validate_iface "$iface"

  ip addr flush dev "$iface" 2>/dev/null || \
    die "Failed to flush IPs from $iface" 1

  ok "{\"interface\":\"$iface\"}" "All IPs flushed from $iface"
}

cmd_ip_set() {
  ensure_ip
  local iface="${1:-}"
  local cidr="${2:-}"
  validate_iface "$iface"
  validate_cidr "$cidr"

  ip addr flush dev "$iface" 2>/dev/null || true
  ip addr add "$cidr" dev "$iface" 2>/dev/null || \
    die "Failed to set IP $cidr on $iface after flush" 1

  ok "{\"interface\":\"$iface\",\"cidr\":\"$cidr\"}" "IP set to $cidr on $iface (atomic)"
}

# ---------------------------------------------------------------------------
# ARP table
# ---------------------------------------------------------------------------

cmd_arp_table() {
  ensure_ip

  local raw
  raw=$(ip -j neigh show 2>/dev/null) || \
    die "Failed to retrieve ARP table" 1

  if has_jq; then
    local json
    json=$(printf '%s' "$raw" | jq -c '
      [.[] | {
        dst: .dst,
        dev: .dev,
        lladdr: .lladdr,
        state: .state // "FAILED",
        family: .family
      }]
    ' 2>/dev/null) || json="[]"

    ok "{\"arp_entries\":$json}" "ARP table retrieved"
  else
    ok "{\"arp_raw\":\"$raw\"}" "ARP table (install jq for structured output)"
  fi
}

# ---------------------------------------------------------------------------
# Traffic counters from /proc/net/dev
# ---------------------------------------------------------------------------

cmd_traffic_counters() {
  if [[ ! -r /proc/net/dev ]]; then
    die "/proc/net/dev not readable" 1
  fi

  local interfaces="[]"

  if has_jq; then
    interfaces=$(tail -n +3 /proc/net/dev | \
      awk '{
        gsub(/:/, "", $1);
        printf "{\"interface\":\"%s\",\"rx_bytes\":%s,\"rx_packets\":%s,\"rx_errors\":%s,\"rx_drop\":%s,\"tx_bytes\":%s,\"tx_packets\":%s,\"tx_errors\":%s,\"tx_drop\":%s}\n",
          $1, $2, $3, $4, $5, $10, $11, $12, $13
      }' | jq -c -s '.' 2>/dev/null) || interfaces="[]"
  else
    local text
    text=$(tail -n +3 /proc/net/dev | tr '\n' '\\'n | sed 's/"/\\"/g')
    ok "{\"counters_text\":\"$text\"}" "Traffic counters (install jq for structured output)"
    return
  fi

  ok "{\"interfaces\":$interfaces}" "Traffic counters retrieved"
}

# ---------------------------------------------------------------------------
# Interface speed
# ---------------------------------------------------------------------------

cmd_interface_speed() {
  local iface="${1:-}"
  validate_iface "$iface"

  if command -v ethtool &>/dev/null; then
    local speed
    speed=$(ethtool "$iface" 2>/dev/null | grep -oP 'Speed:\s*\K[0-9]+' || true)
    if [[ -n "$speed" ]]; then
      ok "{\"interface\":\"$iface\",\"speed_mbps\":$speed,\"source\":\"ethtool\"}" \
        "Interface speed: ${speed} Mbps"
      return
    fi
  fi

  local sys_path="/sys/class/net/$iface/speed"
  if [[ -r "$sys_path" ]]; then
    local speed
    speed=$(cat "$sys_path" 2>/dev/null || true)
    if [[ -n "$speed" && "$speed" != "-1" ]]; then
      ok "{\"interface\":\"$iface\",\"speed_mbps\":$speed,\"source\":\"sysfs\"}" \
        "Interface speed: ${speed} Mbps (from sysfs)"
      return
    fi
  fi

  local operstate="UNKNOWN"
  local oper_path="/sys/class/net/$iface/operstate"
  if [[ -r "$oper_path" ]]; then
    operstate=$(cat "$oper_path" 2>/dev/null || echo "UNKNOWN")
  fi

  ok "{\"interface\":\"$iface\",\"speed_mbps\":null,\"source\":null,\"operstate\":\"$operstate\"}" \
    "Could not determine speed for $iface (operstate: $operstate)"
}

# ---------------------------------------------------------------------------
# Usage
# ---------------------------------------------------------------------------

usage() {
  cat <<'EOF'
Usage: network-ops.sh <subcommand> [args...]

Interface management:
  interface-list                  List all interfaces (JSON)
  interface-ip <interface>        Get IP config (JSON)
  interface-up <interface>        Bring interface up
  interface-down <interface>      Bring interface down

IP address operations:
  ip-add <interface> <cidr>       Add IP address
  ip-del <interface> <cidr>       Remove IP address
  ip-flush <interface>            Flush all IPs from interface
  ip-set <interface> <cidr>       Atomic: flush + add new IP

Network info:
  arp-table                       Get ARP table (JSON)
  traffic-counters                Per-interface traffic counters
  interface-speed <interface>     Get interface speed (ethtool/sysfs)
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
    interface-list)      cmd_interface_list "$@" ;;
    interface-ip)        cmd_interface_ip "$@" ;;
    interface-up)        cmd_interface_up "$@" ;;
    interface-down)      cmd_interface_down "$@" ;;
    ip-add)              cmd_ip_add "$@" ;;
    ip-del)              cmd_ip_del "$@" ;;
    ip-flush)            cmd_ip_flush "$@" ;;
    ip-set)              cmd_ip_set "$@" ;;
    arp-table)           cmd_arp_table "$@" ;;
    traffic-counters)    cmd_traffic_counters "$@" ;;
    interface-speed)     cmd_interface_speed "$@" ;;
    -h|--help|help)      usage ;;
    "")                  usage ;;
    *)                   die "Unknown subcommand: $subcmd. Run with --help for usage." 1 ;;
  esac
}

main "$@"
