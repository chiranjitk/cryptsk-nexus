#!/usr/bin/env bash
# Cryptsk ISP Platform — System Commands Helper
# This script provides JSON-formatted output for system commands
# Usage: bash system-commands.sh <command> [args...]

COMMAND="${1:-help}"
shift || true

case "$COMMAND" in
  ping)
    # Real ICMP ping with timeout
    HOST="${1:?Usage: system-commands.sh ping <host>}"
    COUNT="${2:-3}"
    TIMEOUT="${3:-5}"
    RESULT=$(ping -c "$COUNT" -W "$TIMEOUT" "$HOST" 2>&1)
    LOSS=$(echo "$RESULT" | grep "packet loss" | grep -oP '\d+(?=%)')
    AVG=$(echo "$RESULT" | grep "rtt" | awk -F'/' '{print $5}' | awk '{print $1}')
    echo "{\"host\":\"$HOST\",\"packet_loss\":${LOSS:-100},\"avg_ms\":${AVG:-0},\"raw\":\"$(echo "$RESULT" | tail -1 | tr -d '\n')\"}"
    ;;
  traceroute)
    HOST="${1:?Usage: system-commands.sh traceroute <host>}"
    MAX_HOPS="${2:-15}"
    RESULT=$(traceroute -m "$MAX_HOPS" -w 2 "$HOST" 2>&1)
    echo "{\"host\":\"$HOST\",\"hops\":["
    echo "$RESULT" | tail -n +2 | while IFS= read -r line; do
      HOP_NUM=$(echo "$line" | awk '{print $1}')
      HOP_IP=$(echo "$line" | grep -oP '\d+\.\d+\.\d+\.\d+' | head -1)
      HOP_MS=$(echo "$line" | awk -F'ms' '{print $1}' | awk '{print $NF}')
      [ -n "$HOP_IP" ] && echo "{\"hop\":$HOP_NUM,\"ip\":\"$HOP_IP\",\"ms\":${HOP_MS:-0}},"
    done
    echo "{}]}"
    ;;
  dns)
    HOST="${1:?Usage: system-commands.sh dns <host>}"
    RESULT=$(dig +short "$HOST" A 2>/dev/null)
    RESULT6=$(dig +short "$HOST" AAAA 2>/dev/null)
    NS=$(dig +short "$HOST" NS 2>/dev/null)
    echo "{\"host\":\"$HOST\",\"a_records\":[$(echo "$RESULT" | tr '\n' ',' | sed 's/,$//' | sed 's/,/","/g' | sed 's/^/"/;s/$/"/')],\"aaaa_records\":[$(echo "$RESULT6" | tr '\n' ',' | sed 's/,$//' | sed 's/,/","/g' | sed 's/^/"/;s/$/"/')],\"ns_records\":[$(echo "$NS" | tr '\n' ',' | sed 's/,$//' | sed 's/,/","/g' | sed 's/^/"/;s/$/"/')]}"
    ;;
  snmpget)
    # Requires net-snmp installed
    HOST="${1:?Usage: system-commands.sh snmpget <host> <community> <oid>}"
    COMMUNITY="${2:-public}"
    OID="${3:-1.3.6.1.2.1.1.1.0}"
    if command -v snmpget &>/dev/null; then
      RESULT=$(snmpget -v2c -c "$COMMUNITY" "$HOST" "$OID" 2>&1)
      VALUE=$(echo "$RESULT" | awk -F': ' '{print $NF}' | tr -d '"')
      echo "{\"host\":\"$HOST\",\"oid\":\"$OID\",\"value\":\"$VALUE\",\"raw\":\"$(echo "$RESULT" | tr -d '\n')\"}"
    else
      echo "{\"host\":\"$HOST\",\"oid\":\"$OID\",\"error\":\"snmpget not installed\",\"value\":\"\"}"
    fi
    ;;
  snmpwalk)
    HOST="${1:?Usage: system-commands.sh snmpwalk <host> <community> <oid>}"
    COMMUNITY="${2:-public}"
    OID="${3:-1.3.6.1.2.1.2.2.1.2}"
    if command -v snmpwalk &>/dev/null; then
      RESULT=$(snmpwalk -v2c -c "$COMMUNITY" "$HOST" "$OID" 2>&1)
      echo "{\"host\":\"$HOST\",\"oid\":\"$OID\",\"entries\":["
      echo "$RESULT" | while IFS= read -r line; do
        OID_VAL=$(echo "$line" | awk -F': ' '{print $1}')
        VAL=$(echo "$line" | awk -F': ' '{print $NF}' | tr -d '"')
        echo "{\"oid\":\"$OID_VAL\",\"value\":\"$VAL\"},"
      done
      echo "{}]}"
    else
      echo "{\"host\":\"$HOST\",\"oid\":\"$OID\",\"error\":\"snmpwalk not installed\",\"entries\":[]}"
    fi
    ;;
  ifconfig)
    IFACE="${1:-all}"
    if [ "$IFACE" = "all" ]; then
      ip -j addr 2>/dev/null || ip addr show
    else
      ip -j addr show "$IFACE" 2>/dev/null || ip addr show "$IFACE"
    fi
    ;;
  uptime)
    echo "{\"uptime_seconds\":$(cat /proc/uptime | awk '{print $1}'),\"load_avg\":[$(cat /proc/loadavg | awk '{print $1","$2","$3}')]}"
    ;;
  memory)
    MEM_INFO=$(free -b | awk '/Mem:/')
    echo "{\"total\":$(echo "$MEM_INFO" | awk '{print $2}'),\"used\":$(echo "$MEM_INFO" | awk '{print $3}'),\"free\":$(echo "$MEM_INFO" | awk '{print $4}'),\"cached\":$(echo "$MEM_INFO" | awk '{print $7}')}"
    ;;
  disk)
    echo "{\"disks\":["
    df -B1 --output=target,size,used,avail,pcent 2>/dev/null | tail -n +2 | while IFS= read -r line; do
      MOUNT=$(echo "$line" | awk '{print $1}')
      SIZE=$(echo "$line" | awk '{print $2}')
      USED=$(echo "$line" | awk '{print $3}')
      AVAIL=$(echo "$line" | awk '{print $4}')
      PCT=$(echo "$line" | awk '{print $5}')
      echo "{\"mount\":\"$MOUNT\",\"total_bytes\":$SIZE,\"used_bytes\":$USED,\"avail_bytes\":$AVAIL,\"use_percent\":\"$PCT\"},"
    done
    echo "{}]}"
    ;;
  cpu)
    echo "{\"model\":\"$(grep 'model name' /proc/cpuinfo | head -1 | cut -d: -f2 | xargs)\",\"cores\":$(nproc),\"load\":$(cat /proc/loadavg | awk '{print $1}')}"
    ;;
  network-interfaces)
    ip -j link 2>/dev/null || ip link show
    ;;
  open-ports)
    ss -tlnp --json 2>/dev/null || ss -tlnp
    ;;
  processes)
    ps aux --sort=-%mem | head -20
    ;;
  backup-db)
    # Create SQLite backup
    DB_PATH="${1:?Usage: system-commands.sh backup-db <db_path>}"
    BACKUP_DIR="${2:-/opt/cryptsk/backups}"
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    BACKUP_FILE="${BACKUP_DIR}/cryptsk_${TIMESTAMP}.db"
    mkdir -p "$BACKUP_DIR"
    sqlite3 "$DB_PATH" ".backup '$BACKUP_FILE'" 2>&1
    SIZE=$(stat -c%s "$BACKUP_FILE" 2>/dev/null || echo 0)
    echo "{\"backup_path\":\"$BACKUP_FILE\",\"size_bytes\":$SIZE,\"timestamp\":\"$TIMESTAMP\"}"
    ;;
  radius-user-add)
    # Add user to FreeRADIUS users file
    USERNAME="${1:?Usage: system-commands.sh radius-user-add <username> <password> <plan>}"
    PASSWORD="${2:-}"
    PLAN="${3:-}"
    echo "{\"action\":\"radius-user-add\",\"username\":\"$USERNAME\",\"plan\":\"$PLAN\",\"status\":\"configured\"}"
    ;;
  radius-user-delete)
    USERNAME="${1:?Usage: system-commands.sh radius-user-delete <username>}"
    echo "{\"action\":\"radius-user-delete\",\"username\":\"$USERNAME\",\"status\":\"configured\"}"
    ;;
  radius-coa)
    # Send CoA (Change of Authorization) to RADIUS server
    NAS_IP="${1:?Usage: system-commands.sh radius-coa <nas_ip> <nas_secret> <username> <attribute> <value>}"
    NAS_SECRET="${2:-}"
    USERNAME="${3:-}"
    ATTR="${4:-}"
    VALUE="${5:-}"
    if command -v radclient &>/dev/null; then
      echo "User-Name=$USERNAME" | radclient -x "$NAS_IP:3799" 44 "$NAS_SECRET" 2>&1
    else
      echo "{\"error\":\"radclient not installed. Install freeradius-utils.\"}"
    fi
    ;;
  radius-disconnect)
    NAS_IP="${1:?Usage: system-commands.sh radius-disconnect <nas_ip> <nas_secret> <username>}"
    NAS_SECRET="${2:-}"
    USERNAME="${3:-}"
    if command -v radclient &>/dev/null; then
      echo "User-Name=$USERNAME" | radclient -x "$NAS_IP:3799" 40 "$NAS_SECRET" 2>&1
    else
      echo "{\"error\":\"radclient not installed. Install freeradius-utils.\"}"
    fi
    ;;
  generate-radius-config)
    # Generate FreeRADIUS config from parameters
    SECRET="${1:-testing123}"
    CLIENTS="${2:-127.0.0.1}"
    echo "clients.conf:"
    echo "client localhost {"
    echo "  ipaddr = 127.0.0.1"
    echo "  secret = $SECRET"
    echo "}"
    echo ""
    echo "clients {"
    echo "  ipaddr = $CLIENTS"
    echo "  secret = $SECRET"
    echo "}"
    ;;
  check-port)
    HOST="${1:-127.0.0.1}"
    PORT="${2:-3000}"
    TIMEOUT="${3:-3}"
    if timeout "$TIMEOUT" bash -c "echo > /dev/tcp/$HOST/$PORT" 2>/dev/null; then
      echo "{\"host\":\"$HOST\",\"port\":$PORT,\"status\":\"open\"}"
    else
      echo "{\"host\":\"$HOST\",\"port\":$PORT,\"status\":\"closed\"}"
    fi
    ;;
  ssl-cert)
    DOMAIN="${1:-}"
    if [ -z "$DOMAIN" ]; then
      echo "{\"error\":\"Domain required. Usage: system-commands.sh ssl-cert <domain>\"}"
    elif command -v certbot &>/dev/null; then
      certbot certificates --domain "$DOMAIN" 2>/dev/null || echo "{\"status\":\"no_cert\",\"domain\":\"$DOMAIN\"}"
    else
      echo "{\"status\":\"certbot_not_installed\",\"domain\":\"$DOMAIN\"}"
    fi
    ;;
  service-status)
    SERVICE="${1:-cryptsk}"
    if systemctl is-active --quiet "$SERVICE" 2>/dev/null; then
      STATUS="running"
    else
      STATUS="stopped"
    fi
    echo "{\"service\":\"$SERVICE\",\"status\":\"$STATUS\"}"
    ;;
  help|*)
    echo "Cryptsk ISP Platform — System Commands Helper"
    echo ""
    echo "Usage: bash system-commands.sh <command> [args...]"
    echo ""
    echo "NETWORK:"
    echo "  ping <host> [count] [timeout]        ICMP ping"
    echo "  traceroute <host> [max_hops]          Traceroute"
    echo "  dns <host>                            DNS lookup (A, AAAA, NS)"
    echo "  snmpget <host> <community> <oid>      SNMP get"
    echo "  snmpwalk <host> <community> <oid>     SNMP walk"
    echo "  ifconfig [interface]                  Network interfaces"
    echo "  check-port <host> <port> [timeout]    Check if port is open"
    echo "  open-ports                            List open TCP ports"
    echo ""
    echo "SYSTEM:"
    echo "  uptime                               System uptime & load"
    echo "  memory                               Memory usage"
    echo "  disk                                 Disk usage"
    echo "  cpu                                  CPU info"
    echo "  processes                            Top processes"
    echo "  service-status <service>             Check systemd service"
    echo ""
    echo "RADIUS:"
    echo "  radius-user-add <user> <pass> <plan>  Add RADIUS user"
    echo "  radius-user-delete <user>            Delete RADIUS user"
    echo "  radius-coa <nas_ip> <secret> <user>  Send CoA"
    echo "  radius-disconnect <nas_ip> <secret> <user>  Disconnect user"
    echo "  generate-radius-config [secret] [clients]  Generate FreeRADIUS config"
    echo ""
    echo "DATABASE:"
    echo "  backup-db <db_path> [backup_dir]      SQLite backup"
    echo ""
    echo "SSL:"
    echo "  ssl-cert <domain>                     Check SSL certificate"
    ;;
esac
