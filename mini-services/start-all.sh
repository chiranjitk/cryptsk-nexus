#!/usr/bin/env bash
# Start all Cryptsk mini-services
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="${SCRIPT_DIR}/../.logs"
mkdir -p "$LOG_DIR"

for SERVICE in billing-cron network-monitor radius-service whatsapp-bot ndpi-service; do
  echo "Starting $SERVICE..."
  cd "$SCRIPT_DIR/$SERVICE"
  ENV_VARS=""
  [ "$SERVICE" = "ndpi-service" ] && ENV_VARS="DATABASE_URL=postgresql://cryptsk:Cryptsk2026@localhost:5432/ispplatform"
  [ "$SERVICE" = "syslog-service" ] && ENV_VARS="DATABASE_URL=postgresql://cryptsk:Cryptsk2026@localhost:5432/ispplatform"
  nohup env $ENV_VARS bun --hot index.ts > "${LOG_DIR}/${SERVICE}.log" 2>&1 &
  echo "$SERVICE started (PID: $!)"
done
echo "All mini-services started."
