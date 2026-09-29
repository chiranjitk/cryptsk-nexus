#!/bin/bash
cd "$(dirname "$0")"
while true; do
    echo "[$(date)] Starting ndpi-service..."
    bun index.ts
    echo "[$(date)] ndpi-service exited, restarting in 2s..."
    sleep 2
done
