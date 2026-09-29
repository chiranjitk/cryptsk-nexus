#!/usr/bin/env bash
# Stop all Cryptsk mini-services
pkill -f "mini-services/.*/index.ts" 2>/dev/null || true
echo "All mini-services stopped."
