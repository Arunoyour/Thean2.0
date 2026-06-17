#!/bin/bash
# Creates the three additional databases on first container start.
# The primary database (thean) is created by POSTGRES_DB in docker-compose.
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    SELECT 'CREATE DATABASE thean_pharmacy'
        WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'thean_pharmacy')\gexec
    SELECT 'CREATE DATABASE thean_delivery'
        WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'thean_delivery')\gexec
    SELECT 'CREATE DATABASE thean_haircut'
        WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'thean_haircut')\gexec
EOSQL
