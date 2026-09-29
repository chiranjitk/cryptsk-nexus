#!/usr/bin/env bash
# Migrate data from SQLite to PostgreSQL
set -euo pipefail

SQLITE_DB="${1:?Usage: migrate-data.sh <sqlite_db_path>}"
PG_CONN="${2:-postgresql://cryptsk:cryptsk_secure_password@localhost:5432/cryptsk_isp}"

echo "=== Cryptsk ISP Platform — Data Migration ==="

# Get all tables from SQLite
TABLES=$(sqlite3 "$SQLITE_DB" ".tables" | tr ' ' '\n' | sort)

for TABLE in $TABLES; do
  ROW_COUNT=$(sqlite3 "$SQLITE_DB" "SELECT COUNT(*) FROM $TABLE;" 2>/dev/null || echo 0)
  if [ "$ROW_COUNT" -gt 0 ]; then
    echo "Migrating $TABLE ($ROW_COUNT rows)..."
    sqlite3 "$SQLITE_DB" ".mode csv" ".output /tmp/$TABLE.csv" "SELECT * FROM $TABLE;"

    # Get column names
    COLS=$(sqlite3 "$SQLITE_DB" ".mode csv" ".headers on" "SELECT * FROM $TABLE LIMIT 0;" | head -1)

    # Import into PostgreSQL
    psql "$PG_CONN" -c "TRUNCATE TABLE \"$TABLE\" CASCADE;" 2>/dev/null || true
    psql "$PG_CONN" -c "\copy \"$TABLE\"($COLS) FROM '/tmp/$TABLE.csv' WITH CSV HEADER;" 2>/dev/null || true
    rm -f "/tmp/$TABLE.csv"
  else
    echo "Skipping $TABLE (empty)"
  fi
done

echo ""
echo "=== Migration complete ==="
echo "Verify data: psql $PG_CONN -c 'SELECT count(*) FROM \"User\";'"
