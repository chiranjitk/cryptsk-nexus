#!/usr/bin/env bash
# Switch from SQLite to PostgreSQL
# Run this on the production Debian 13 server
set -euo pipefail

APP_DIR="/opt/cryptsk/app"
ENV_FILE="$APP_DIR/.env"

echo "=== Cryptsk ISP Platform — Switch to PostgreSQL ==="

# Check PostgreSQL is running
if ! systemctl is-active --quiet postgresql; then
  echo "Starting PostgreSQL..."
  systemctl start postgresql
fi

# Create database and user
echo "Creating PostgreSQL database..."
su - postgres -c "psql -c \"CREATE USER cryptsk WITH PASSWORD 'cryptsk_secure_password';\"" 2>/dev/null || true
su - postgres -c "psql -c \"CREATE DATABASE cryptsk_isp OWNER cryptsk;\"" 2>/dev/null || true
su - postgres -c "psql -c \"GRANT ALL PRIVILEGES ON DATABASE cryptsk_isp TO cryptsk;\"" 2>/dev/null || true

# Update .env
echo "Updating .env..."
sed -i 's|DATABASE_URL=.*|DATABASE_URL="postgresql://cryptsk:cryptsk_secure_password@localhost:5432/cryptsk_isp"|g' "$ENV_FILE"

# Generate Prisma client for PostgreSQL
echo "Generating Prisma client..."
cd "$APP_DIR"
bunx prisma generate
bunx prisma db push

echo ""
echo "=== PostgreSQL switch complete ==="
echo "Run: sudo systemctl restart cryptsk"
