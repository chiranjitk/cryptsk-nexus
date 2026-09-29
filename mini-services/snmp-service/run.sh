#!/bin/bash
# SNMP service wrapper with auto-restart
cd "$(dirname "$0")"
while true; do
  echo "[$(date)] Starting SNMP service..."
  node --experimental-strip-types index.ts
  EXIT_CODE=$?
  echo "[$(date)] SNMP service exited with code $EXIT_CODE, restarting in 2s..."
  sleep 2
done
