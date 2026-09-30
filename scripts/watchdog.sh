#!/usr/bin/env bash
# cryptsk-nexus watchdog v3: keeps core services alive (cwd-based detection)
export DATABASE_URL="postgresql://cryptsknexus:nexus_pg_2026@127.0.0.1:5432/cryptsknexus"
export PGROOT_BIN="/home/z/my-project/runtime-applications/pgsql/bin"
export FR="/home/z/my-project/runtime-applications/freeradius"
export LD_LIBRARY_PATH="$FR/lib:/home/z/runtime-apps/deps/lib"
export RDB="$FR/etc/raddb/raddb/raddb"
LOG=/home/z/my-project/.logs/watchdog.log
ts() { date '+%Y-%m-%d %H:%M:%S'; }

# Returns 0 if a process whose cwd == $1 is running
cwd_running() {
  local target="$1" pid cwd
  for pid in $(pgrep -f "index.ts|next dev" 2>/dev/null); do
    cwd=$(readlink /proc/$pid/cwd 2>/dev/null)
    [ "$cwd" = "$target" ] && return 0
  done
  return 1
}

# 1. PostgreSQL
if ! $PGROOT_BIN/pg_ctl -D /home/z/my-project/runtime-applications/pgsql/data status > /dev/null 2>&1; then
  echo "$(ts) PG down → starting" >> $LOG
  $PGROOT_BIN/pg_ctl -D /home/z/my-project/runtime-applications/pgsql/data start -o "-p 5432" -w >> $LOG 2>&1
fi

# 2. Next.js (port 3000) — double-check before starting
if ! curl -s -m 5 -o /dev/null http://localhost:3000; then
  sleep 3
  if ! curl -s -m 5 -o /dev/null http://localhost:3000 && ! pgrep -f "next dev" > /dev/null 2>&1; then
    echo "$(ts) Next.js down → restarting" >> $LOG
    pkill -f "next-server" 2>/dev/null; sleep 1
    cd /home/z/my-project && setsid nohup bun run dev > /dev/null 2>&1 < /dev/null &
    echo "$(ts) Next.js restart issued" >> $LOG
  fi
fi

# 3. Core mini-services (cwd-based check — single instance each)
for SVC in radius-service session-engine billing-cron network-monitor gateway-service; do
  if ! cwd_running "/home/z/my-project/mini-services/$SVC"; then
    echo "$(ts) $SVC down → restarting" >> $LOG
    cd /home/z/my-project/mini-services/$SVC && setsid nohup bun run dev > /home/z/my-project/.logs/${SVC}.log 2>&1 < /dev/null &
    echo "$(ts) $SVC restart issued" >> $LOG
  fi
done

# 4. FreeRADIUS
if ! pgrep -f "radiusd" > /dev/null 2>&1; then
  echo "$(ts) FreeRADIUS down → restarting" >> $LOG
  cd / && setsid nohup env LD_LIBRARY_PATH="$LD_LIBRARY_PATH" $FR/sbin/radiusd -d $RDB >> /home/z/my-project/.logs/freeradius.log 2>&1 < /dev/null &
  echo "$(ts) FreeRADIUS restart issued" >> $LOG
fi
