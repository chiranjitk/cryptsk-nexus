#!/usr/bin/env bash
# Cryptsk ISP Platform — Deploy Script
# Run from the app directory as cryptsk user
set -euo pipefail

APP_DIR="/opt/cryptsk/app"
LOG_DIR="/opt/cryptsk/logs"

echo "=== Cryptsk ISP Platform Deployment ==="

# Check .env
if [ ! -f "$APP_DIR/.env" ]; then
  echo "ERROR: .env file not found. Copy .env.example to .env and configure."
  exit 1
fi

# Install dependencies
echo "[1/6] Installing dependencies..."
cd "$APP_DIR"
bun install --frozen-lockfile 2>/dev/null || bun install

# Setup database
echo "[2/6] Setting up database..."
bun run db:push 2>&1 || { echo "DB push failed"; exit 1; }

# Build Next.js (for production)
echo "[3/6] Building Next.js application..."
# bun run build  # Uncomment for production build

# Setup mini-services
echo "[4/6] Setting up mini-services..."
for SERVICE in billing-cron network-monitor radius-service whatsapp-bot; do
  if [ -d "$APP_DIR/mini-services/$SERVICE" ]; then
    cd "$APP_DIR/mini-services/$SERVICE"
    [ -f package.json ] && bun install 2>/dev/null || true
    echo "  ✓ $SERVICE ready"
  fi
done

# Set permissions
echo "[5/6] Setting permissions..."
chown -R cryptsk:cryptsk "$APP_DIR"
chmod +x "$APP_DIR/scripts/"*.sh
chmod +x "$APP_DIR/mini-services/"*.sh 2>/dev/null || true

# Setup systemd services
echo "[6/6] Setting up systemd services..."
sudo cp "$APP_DIR/scripts/cryptsk.service" /etc/systemd/system/
sudo cp "$APP_DIR/scripts/cryptsk-mini-services.service" /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable cryptsk cryptsk-mini-services 2>/dev/null || true

echo ""
echo "=== Deployment Complete ==="
echo "Start services:"
echo "  sudo systemctl start cryptsk-mini-services"
echo "  sudo systemctl start cryptsk"
echo ""
echo "View logs:"
echo "  journalctl -u cryptsk -f"
echo "  journalctl -u cryptsk-mini-services -f"
