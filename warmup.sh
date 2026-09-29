#!/bin/bash
# Pre-compile dashboard routes to prevent OOM on first user visit
# Runs after PM2 starts the Next.js server

echo "[warmup] Waiting for Next.js to be ready..."

# Wait for server to respond
for i in $(seq 1 60); do
  if curl -s -o /dev/null -w '' http://localhost:3000/ 2>/dev/null; then
    break
  fi
  sleep 2
done

echo "[warmup] Server ready. Logging in..."

# Login and get token
LOGIN_RESP=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@cryptsk.com","password":"Admin@123"}' 2>/dev/null)

TOKEN=$(echo "$LOGIN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null)

if [ -z "$TOKEN" ] || [ "$TOKEN" = "" ]; then
  echo "[warmup] Login failed, skipping route warmup"
  exit 0
fi

echo "[warmup] Got token. Pre-compiling routes sequentially..."

# Pre-compile each route one at a time to avoid memory spike
ROUTES=(
  "/api/dashboard/stats"
  "/api/dashboard?range=7d"
  "/api/modules"
  "/api/subscribers/stats"
  "/api/activity-feed?limit=5"
  "/api/system/health"
  "/api/notifications/unread-count"
  "/api/complaints/open-count"
  "/api/subscribers/online-count"
  "/api/freeradius/sync-status"
)

for route in "${ROUTES[@]}"; do
  CODE=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOKEN" "http://localhost:3000${route}" 2>/dev/null)
  echo "[warmup] $route -> $CODE"
  sleep 1
done

echo "[warmup] Done. All dashboard routes pre-compiled."
