#!/usr/bin/env bash
# Validate all required environment variables before starting services
set -euo pipefail
ERRORS=0

check_env() {
  if [ -z "${!1:-}" ]; then
    echo "❌ Missing: $1 ($2)"
    ERRORS=$((ERRORS + 1))
  else
    echo "✅ $1 is set"
  fi
}

check_env "DATABASE_URL" "Database connection string"
check_env "SESSION_SECRET" "Session token signing secret"
check_env "NEXTAUTH_URL" "Base URL for the application (e.g., https://isp.example.com)"

if [ "$ERRORS" -gt 0 ]; then
  echo ""
  echo "⚠️  $ERRORS required environment variables are missing!"
  echo "Copy .env.example to .env and fill in all values."
  exit 1
fi

echo ""
echo "✅ All environment variables are set."
