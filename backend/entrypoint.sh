#!/bin/bash
set -e

# Strip the +asyncpg driver prefix so psql can use the URL
psql_url() {
    echo "${1/postgresql+asyncpg:\/\//postgresql:\/\/}"
}

MAIN_DB_URL=$(psql_url "$DATABASE_URL")
PHARMACY_DB_URL=$(psql_url "$PHARMACY_DATABASE_URL")
HAIRCUT_DB_URL=$(psql_url "$HAIRCUT_DATABASE_URL")

if [ -n "$DELIVERY_DATABASE_URL" ]; then
    DELIVERY_DB_URL=$(psql_url "$DELIVERY_DATABASE_URL")
else
    DELIVERY_DB_URL="$PHARMACY_DB_URL"
fi

run_migration() {
    local file="$1"
    local name
    name=$(basename "$file")

    # Detect target schema from the first SET search_path line
    local schema
    schema=$(grep -m 1 'SET search_path TO' "$file" 2>/dev/null \
        | sed 's/.*"\([A-Z][A-Z]*\)".*/\1/' || true)

    # Fall back to CREATE SCHEMA detection when SET search_path is absent
    if [ -z "$schema" ]; then
        if grep -q '"HC"' "$file"; then
            schema="HC"
        elif grep -q '"D"' "$file"; then
            schema="D"
        elif grep -q '"PH"' "$file"; then
            schema="PH"
        else
            schema="T"
        fi
    fi

    case "$schema" in
        HC) db_url="$HAIRCUT_DB_URL";   label="haircut"   ;;
        D)  db_url="$DELIVERY_DB_URL";  label="delivery"  ;;
        PH) db_url="$PHARMACY_DB_URL";  label="pharmacy"  ;;
        *)  db_url="$MAIN_DB_URL";      label="main"      ;;
    esac

    printf '  [%-8s] %s\n' "$label" "$name"
    # ON_ERROR_STOP=0 so re-running already-applied idempotent migrations doesn't abort
    psql "$db_url" -v ON_ERROR_STOP=0 --quiet -f "$file" 2>&1 \
        | grep -v '^$' | sed 's/^/             /' || true
}

echo "==> Running database migrations..."
for migration in $(ls /app/migrations/*.sql | sort); do
    run_migration "$migration"
done

echo "==> Migrations complete. Starting server on :8000"
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
