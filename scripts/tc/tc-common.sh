#!/usr/bin/env bash
# ==============================================================================
# Cryptsk ISP Platform — TC/QoS Shared Library
# ==============================================================================
# Sourced by ifb-init.sh, qdisc-setup.sh, qdisc-teardown.sh and any
# future per-subscriber or per-plan scripts.
# ==============================================================================

# Guard against double-sourcing
[[ -n "${_TC_COMMON_LOADED}" ]] && return 0
_TC_COMMON_LOADED=1

# Resolve the name of the *calling* script for log prefixing.
# When sourced, $0 is the caller; BASH_SOURCE[0] is this file.
_TC_CALLER="$(basename "${BASH_SOURCE[1]:-$0}")"

# ------------------------------------------------------------------------------
# log <level> <message...>
#   Writes timestamped log lines to stderr.
#   Format: [YYYY-MM-DD HH:MM:SS] [CALLER] <level> message
# ------------------------------------------------------------------------------
log() {
    local level="$1"; shift
    local ts
    ts="$(date '+%Y-%m-%d %H:%M:%S')"
    printf '[%s] [%s] %s: %s\n' "$ts" "$_TC_CALLER" "$level" "$*" >&2
}

log_info()  { log INFO  "$@"; }
log_warn()  { log WARN  "$@"; }
log_error() { log ERROR "$@"; }

# ------------------------------------------------------------------------------
# die <message...>
#   Logs an ERROR and exits the calling script with code 1.
# ------------------------------------------------------------------------------
die() {
    log_error "$@"
    exit 1
}

# ------------------------------------------------------------------------------
# require_root
#   Ensures the script is running as root (EUID 0).
# ------------------------------------------------------------------------------
require_root() {
    if (( EUID != 0 )); then
        die "Root privileges required — run with sudo or as root (EUID=$EUID)"
    fi
}

# ------------------------------------------------------------------------------
# mbps_to_kbit <mbps>
#   Converts Megabits-per-second to kilobits-per-second.
#   Example:  50 → 50000   1.5 → 1500
# ------------------------------------------------------------------------------
mbps_to_kbit() {
    local mbps="$1"
    local kbit
    # Use awk for reliable floating-point arithmetic
    kbit="$(awk "BEGIN { printf \"%.0f\", ($mbps) * 1000 }")"
    printf '%s' "$kbit"
}

# ------------------------------------------------------------------------------
# validate_class_id <class_id>
#   Ensures the string matches the TC class-id format  Major:Minor
#   where Major and Minor are non-negative integers and Major >= 1.
#   Examples of valid:  1:10  1:9999  800:3
# ------------------------------------------------------------------------------
validate_class_id() {
    local class_id="$1"
    if [[ ! "$class_id" =~ ^[1-9][0-9]*:[0-9]+$ ]]; then
        log_error "Invalid class ID '${class_id}' — expected format N:NNNN (major:minor, major >= 1)"
        return 1
    fi
    return 0
}

# ------------------------------------------------------------------------------
# validate_ip <address>
#   Basic IPv4 dotted-quad format check (0.0.0.0 – 255.255.255.255).
# ------------------------------------------------------------------------------
validate_ip() {
    local ip="$1"
    local octet
    # Split on dots — must have exactly 4 octets
    IFS='.' read -r -a octets <<< "$ip"
    if (( ${#octets[@]} != 4 )); then
        log_error "Invalid IPv4 address '${ip}' — must be dotted quad"
        return 1
    fi
    for octet in "${octets[@]}"; do
        if [[ ! "$octet" =~ ^[0-9]+$ ]] || (( octet > 255 )); then
            log_error "Invalid IPv4 address '${ip}' — octet '${octet}' out of range"
            return 1
        fi
    done
    return 0
}

# ------------------------------------------------------------------------------
# validate_mbps <value>
#   Ensures the value is a positive number (integer or float, > 0).
# ------------------------------------------------------------------------------
validate_mbps() {
    local val="$1"
    if [[ -z "$val" ]] || ! awk "BEGIN { exit !($val > 0) }"; then
        log_error "Invalid bandwidth '${val}' — must be a positive number (Mbps)"
        return 1
    fi
    return 0
}

# ------------------------------------------------------------------------------
# validate_port <port>
#   Ensures the port is an integer in the valid range 1-65535.
# ------------------------------------------------------------------------------
validate_port() {
    local port="$1"
    if [[ ! "$port" =~ ^[0-9]+$ ]] || (( port < 1 || port > 65535 )); then
        log_error "Invalid port '${port}' — must be an integer between 1 and 65535"
        return 1
    fi
    return 0
}
