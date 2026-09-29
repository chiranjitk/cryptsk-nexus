#!/bin/bash
# Iterative Turbopack cache warming script
# Each route is compiled individually, then the server restarts with the cache.
# This allows the full app to work within 4GB RAM by leveraging the .next cache.

cd /home/z/my-project

ROUTES=(
  "/"
  "/api/auth/login:POST"
  "/api/auth/me"
  "/api/dashboard/stats"
  "/api/plans"
  "/api/subscribers"
  "/api/subscribers/online-count"
  "/api/freeradius/sync-status"
  "/api/system/health"
  "/api/payments"
  "/api/modules"
)

MAX_ROUNDS=5
WARMED=0

for ROUND in $(seq 1 $MAX_ROUNDS); do
  echo "=== Warming Round $ROUND ==="
  
  # Kill any existing server
  pkill -9 -f 'next' 2>/dev/null
  pkill -9 -f 'bun' 2>/dev/null
  pkill -9 -f 'tee' 2>/dev/null
  sleep 3
  
  # Start server
  nohup bun run dev > dev.log 2>&1 &
  disown
  
  # Wait for server
  for i in $(seq 1 30); do
    sleep 2
    if ss -tlnp 2>/dev/null | rg -q 3000; then
      echo "Server ready"
      break
    fi
  done
  
  if ! ss -tlnp 2>/dev/null | rg -q 3000; then
    echo "Server failed to start"
    continue
  fi
  
  ROUND_WARMED=0
  ALL_ALIVE=true
  
  for ROUTE in "${ROUTES[@]}"; do
    METHOD="GET"
    URL="$ROUTE"
    DATA=""
    
    if [[ "$ROUTE" == *:* ]]; then
      METHOD="${ROUTE##*:}"
      URL="${ROUTE%:*}"
    fi
    
    if [ "$METHOD" = "POST" ]; then
      DATA='-d {"email":"admin@cryptsk.com","password":"Admin@2026"} -H "Content-Type: application/json"'
    fi
    
    echo -n "  $METHOD $URL → "
    
    if [ "$METHOD" = "POST" ]; then
      HTTP=$(curl -4 -s -o /dev/null -w '%{http_code}' --max-time 90 -X POST http://127.0.0.1:3000$URL -H 'Content-Type: application/json' -d '{"email":"admin@cryptsk.com","password":"Admin@2026"}' 2>/dev/null)
    else
      HTTP=$(curl -4 -s -o /dev/null -w '%{http_code}' --max-time 90 http://127.0.0.1:3000$URL 2>/dev/null)
    fi
    
    if [ "$HTTP" = "000" ]; then
      echo "DEAD (route needs warming)"
      ALL_ALIVE=false
      break
    else
      echo "HTTP $HTTP ✓"
      ROUND_WARMED=$((ROUND_WARMED + 1))
    fi
    
    sleep 1
  done
  
  WARMED=$ROUND_WARMED
  MEM=$(free -m | rg Mem | awk '{print $3}')
  echo "  Round $ROUND: $ROUND_WARMED/${#ROUTES[@]} routes, ${MEM}MB used"
  
  if [ "$ALL_ALIVE" = true ]; then
    echo "=== ALL ROUTES WARMED! Server is stable. ==="
    echo "Memory: ${MEM}MB used"
    echo "Server running on port 3000"
    exit 0
  fi
  
  echo "  Server died, restarting for next round..."
  sleep 2
done

echo "=== Warning: Not all routes warmed after $MAX_ROUNDS rounds ==="
echo "Warmed $WARMED routes in last round"
