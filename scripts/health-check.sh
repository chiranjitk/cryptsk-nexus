#!/usr/bin/env bash
# Cryptsk ISP Platform — Health Check Script
# Usage: bash health-check.sh [--json]
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
JSON_OUTPUT="${1:-}"
ERRORS=0

check() {
  local NAME="$1" URL="$2" EXPECTED="${3:-200}"
  local STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$URL" 2>/dev/null || echo "000")
  if [ "$STATUS" = "$EXPECTED" ]; then
    [ -z "$JSON_OUTPUT" ] && echo "✅ $NAME → $STATUS"
  else
    echo "❌ $NAME → $STATUS (expected $EXPECTED)"
    ERRORS=$((ERRORS + 1))
  fi
}

if [ "$JSON_OUTPUT" = "--json" ]; then
  echo "{"
  echo "  \"timestamp\":\"$(date -Iseconds)\","
  echo "  \"checks\":{"
fi

check "Next.js App" "$BASE_URL/"
check "Dashboard API" "$BASE_URL/api/dashboard"
check "Auth Me API" "$BASE_URL/api/auth/me" 401
check "System Health" "$BASE_URL/api/system/health"
check "Complaints Open" "$BASE_URL/api/complaints/open-count"

# Check mini-services
check "RADIUS Service" "$BASE_URL/api/radius/users?XTransformPort=3001"
check "Network Monitor" "$BASE_URL/?XTransformPort=3002"
check "WhatsApp Bot" "$BASE_URL/?XTransformPort=3003"
check "Billing Cron" "$BASE_URL/?XTransformPort=3004"

if [ "$JSON_OUTPUT" = "--json" ]; then
  echo "  },"
  echo "  \"errors\":$ERRORS"
  echo "}"
fi

exit $ERRORS
