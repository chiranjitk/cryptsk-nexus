#!/usr/bin/env bash
###############################################################################
# CRYPTSKINTELLIGENT ISP Platform — ping-probe.sh
# ICMP ping, TCP connect probes, and auto-probe (ICMP with TCP fallback).
#
# Exit codes:  0 = success, 1 = error, 2 = dependency missing
#              3 = host unreachable (probe completed but host did not respond)
###############################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT_DIR

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

JSON_ERR_TPL='{"success":false,"error":"%s","code":%d}'

has_jq() { command -v jq &>/dev/null; }
has_ping() { command -v ping &>/dev/null; }
has_timeout() { command -v timeout &>/dev/null; }

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

validate_host() {
  local host="${1:-}"
  validate_not_empty "$host" "Host"
  if [[ "$host" =~ [[:space:]] ]]; then die "Invalid host (contains whitespace): $host" 1; fi
  if [[ "$host" =~ [\;\|\&\`\$\(\)\<\>] ]]; then die "Invalid host (contains shell metacharacters): $host" 1; fi
}

validate_number() {
  local val="${1:-}"
  local label="${2:-number}"
  validate_not_empty "$val" "$label"
  if [[ ! "$val" =~ ^[0-9]+$ ]]; then die "$label must be a positive integer: $val" 1; fi
}

# ---------------------------------------------------------------------------
# Parse ping output into JSON-friendly fields
# ---------------------------------------------------------------------------

parse_ping_summary() {
  local output="$1"
  local host="$2"
  local method="${3:-icmp}"

  local transmitted=0 received=0 loss=0 rtt_min=0 rtt_avg=0 rtt_max=0 rtt_mdev=0

  local t_match
  t_match=$(printf '%s' "$output" | grep -oP '\d+ packets transmitted' | grep -oP '\d+' || true)
  [[ -n "$t_match" ]] && transmitted="$t_match"

  local r_match
  r_match=$(printf '%s' "$output" | grep -oP ', \d+ received' | grep -oP '\d+' || true)
  [[ -n "$r_match" ]] && received="$r_match"

  local l_match
  l_match=$(printf '%s' "$output" | grep -oP '[0-9]+%' | head -1 | tr -d '%' || true)
  [[ -n "$l_match" ]] && loss="$l_match"

  local rtt_line
  rtt_line=$(printf '%s' "$output" | grep -oP 'rtt min/avg/max/mdev = [0-9.]+' || true)
  if [[ -n "$rtt_line" ]]; then
    local rtt_values
    rtt_values=$(printf '%s' "$rtt_line" | sed 's/rtt min\/avg\/max\/mdev = //' | tr '/' ' ')
    rtt_min=$(echo "$rtt_values" | awk '{print $1}')
    rtt_avg=$(echo "$rtt_values" | awk '{print $2}')
    rtt_max=$(echo "$rtt_values" | awk '{print $3}')
    rtt_mdev=$(echo "$rtt_values" | awk '{print $4}')
  fi

  local reachable="false"
  if [[ "$received" -gt 0 ]]; then
    reachable="true"
  fi

  if has_jq; then
    printf '{
      "host":"%s","method":"%s","reachable":%s,
      "packets":{"transmitted":%s,"received":%s,"loss_percent":%s},
      "rtt":{"min_ms":%s,"avg_ms":%s,"max_ms":%s,"mdev_ms":%s}
    }' \
      "$host" "$method" "$reachable" "$transmitted" "$received" "$loss" \
      "${rtt_min:-0}" "${rtt_avg:-0}" "${rtt_max:-0}" "${rtt_mdev:-0}" | jq -c .
  else
    printf '{"host":"%s","method":"%s","reachable":%s,"transmitted":%s,"received":%s,"loss_percent":%s,"rtt_avg_ms":%s}' \
      "$host" "$method" "$reachable" "$transmitted" "$received" "$loss" "${rtt_avg:-0}"
  fi
}

# ---------------------------------------------------------------------------
# Parse TCP probe results
# ---------------------------------------------------------------------------

parse_tcp_results() {
  local host="$1"
  local port="$2"
  local success_count="$3"
  local total_count="$4"
  local avg_time="$5"

  local loss=0
  if [[ "$total_count" -gt 0 ]]; then
    loss=$(( (total_count - success_count) * 100 / total_count ))
  fi

  local reachable="false"
  if [[ "$success_count" -gt 0 ]]; then
    reachable="true"
  fi

  if has_jq; then
    jq -n -c --arg host "$host" --arg method "tcp" --argjson reachable "$reachable" \
      --argjson transmitted "$total_count" --argjson received "$success_count" \
      --argjson loss "$loss" --argjson rtt_avg "$avg_time" --argjson port "$port" \
      '{
        host: $host, method: $method, reachable: $reachable,
        port: $port,
        packets: {transmitted: $transmitted, received: $received, loss_percent: $loss},
        rtt: {avg_ms: $rtt_avg}
      }'
  else
    printf '{"host":"%s","method":"tcp","reachable":%s,"port":%s,"transmitted":%s,"received":%s,"loss_percent":%s,"rtt_avg_ms":%s}' \
      "$host" "$reachable" "$port" "$total_count" "$success_count" "$loss" "$avg_time"
  fi
}

# ---------------------------------------------------------------------------
# ICMP ping
# ---------------------------------------------------------------------------

cmd_ping() {
  local host="${1:-}"
  local count="${2:-4}"
  local timeout="${3:-5}"

  validate_host "$host"
  validate_number "$count" "Count"
  validate_number "$timeout" "Timeout (seconds)"

  has_ping || die "ping command not found" 2

  local output=""
  local exit_code=0

  if has_timeout; then
    output=$(timeout $((count * timeout + 5)) ping -c "$count" -W "$timeout" "$host" 2>&1) || exit_code=$?
  else
    output=$(ping -c "$count" -W "$timeout" "$host" 2>&1) || exit_code=$?
  fi

  local data
  data=$(parse_ping_summary "$output" "$host" "icmp")

  if [[ "$exit_code" -eq 0 ]]; then
    ok "$data" "Ping to $host successful"
  elif [[ "$exit_code" -eq 1 ]]; then
    ok "$data" "Ping to $host completed with packet loss"
  else
    ok "$data" "Ping to $host completed (host may be unreachable)"
  fi
}

# ---------------------------------------------------------------------------
# TCP connect probe
# ---------------------------------------------------------------------------

cmd_tcp_probe() {
  local host="${1:-}"
  local port="${2:-53}"
  local count="${3:-3}"

  validate_host "$host"
  validate_number "$port" "Port"
  validate_number "$count" "Count"

  if [[ "$port" -lt 1 || "$port" -gt 65535 ]]; then
    die "Port must be between 1 and 65535" 1
  fi

  local tcp_tool=""
  if command -v bash &>/dev/null && [[ -e "/dev/tcp" ]]; then
    tcp_tool="bash_dev_tcp"
  elif command -v timeout &>/dev/null && command -v bash &>/dev/null; then
    tcp_tool="bash_timeout"
  else
    die "No TCP probe tool available (need /dev/tcp or timeout command)" 2
  fi

  local success=0
  local total_time_ms=0

  for ((i = 1; i <= count; i++)); do
    local start end elapsed_ms connected="false"

    start=$(date +%s%N 2>/dev/null || date +%s)

    if [[ "$tcp_tool" == "bash_dev_tcp" ]]; then
      if (echo "" > "/dev/tcp/$host/$port") 2>/dev/null; then
        connected="true"
      fi
    elif [[ "$tcp_tool" == "bash_timeout" ]]; then
      if timeout 5 bash -c "echo > /dev/tcp/$host/$port" 2>/dev/null; then
        connected="true"
      fi
    fi

    end=$(date +%s%N 2>/dev/null || date +%s)

    if [[ "$start" =~ ^[0-9]+$ ]] && [[ "$end" =~ ^[0-9]+$ ]]; then
      elapsed_ms=$(( (end - start) ))
      if [[ ${#start} -gt 13 ]]; then
        elapsed_ms=$(( elapsed_ms / 1000000 ))
      fi
    else
      elapsed_ms=0
    fi

    if [[ "$connected" == "true" ]]; then
      success=$((success + 1))
      total_time_ms=$((total_time_ms + elapsed_ms))
    fi
  done

  local avg_time=0
  if [[ "$success" -gt 0 ]]; then
    avg_time=$((total_time_ms / success))
  fi

  local data
  data=$(parse_tcp_results "$host" "$port" "$success" "$count" "$avg_time")

  if [[ "$success" -gt 0 ]]; then
    ok "$data" "TCP probe to $host:$port — $success/$count successful"
  else
    ok "$data" "TCP probe to $host:$port — host unreachable ($count/$count failed)"
  fi
}

# ---------------------------------------------------------------------------
# Auto probe (ICMP first, fallback TCP 53)
# ---------------------------------------------------------------------------

cmd_probe() {
  local host="${1:-}"
  local count="${2:-4}"

  validate_host "$host"
  validate_number "$count" "Count"

  # Try ICMP first
  if has_ping; then
    local output exit_code
    if has_timeout; then
      output=$(timeout $((count * 5 + 5)) ping -c "$count" -W 3 "$host" 2>&1) || exit_code=$?
    else
      output=$(ping -c "$count" -W 3 "$host" 2>&1) || exit_code=$?
    fi

    local r_match
    r_match=$(printf '%s' "$output" | grep -oP ', \d+ received' | grep -oP '\d+' || echo "0")

    if [[ "$r_match" -gt 0 ]]; then
      local data
      data=$(parse_ping_summary "$output" "$host" "icmp")
      ok "$data" "Auto-probe to $host: ICMP successful ($r_match/$count received)"
      return
    fi
  fi

  # Fallback to TCP probe on port 53
  local tcp_data
  tcp_data=$(cmd_tcp_probe "$host" 53 "$count")
  printf '%s\n' "$tcp_data"
}

# ---------------------------------------------------------------------------
# Usage
# ---------------------------------------------------------------------------

usage() {
  cat <<'EOF'
Usage: ping-probe.sh <subcommand> [args...]

Probe commands:
  ping <host> [count] [timeout_s]      ICMP ping (default: 4 pings, 5s timeout)
  tcp-probe <host> [port] [count]      TCP connect probe (default: port 53, 3 attempts)
  probe <host> [count]                 Auto: ICMP first, fallback TCP port 53
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
    ping)       cmd_ping "$@" ;;
    tcp-probe)  cmd_tcp_probe "$@" ;;
    probe)      cmd_probe "$@" ;;
    -h|--help|help) usage ;;
    "")              usage ;;
    *)               die "Unknown subcommand: $subcmd. Run with --help for usage." 1 ;;
  esac
}

main "$@"
