#!/usr/bin/env bash
#
# Nightly logical backup of the Supabase database.
#
#   SUPABASE_DB_URL='postgresql://postgres.<ref>:<password>@<host>:5432/postgres' \
#     BACKUP_DIR=/var/backups/vauto ./deploy/backup.sh
#
# Supabase gives you this URI under Project Settings -> Database -> Connection
# string. Use the direct connection or the session pooler, not the transaction
# pooler, so pg_dump can hold a session.
#
# Supabase Free has no point-in-time recovery, so this file is your recovery
# path. Install it on a daily cron and TEST A RESTORE before you need one:
#
#   gunzip -c vauto-YYYYMMDDTHHMMSSZ.sql.gz | psql "$SUPABASE_DB_URL"
#
# The client and server major versions should match - run this inside
# `docker run --rm postgres:15` if the host's pg_dump is older than the project.
set -euo pipefail

: "${SUPABASE_DB_URL:?set SUPABASE_DB_URL to the Postgres connection string}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETAIN_DAYS="${RETAIN_DAYS:-14}"

mkdir -p "$BACKUP_DIR"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
out="$BACKUP_DIR/vauto-$stamp.sql.gz"

echo "dumping to $out"
pg_dump "$SUPABASE_DB_URL" --no-owner --no-privileges --schema=public | gzip -9 > "$out"

# Prune old dumps.
find "$BACKUP_DIR" -name 'vauto-*.sql.gz' -type f -mtime "+$RETAIN_DAYS" -delete

echo "done: $(du -h "$out" | cut -f1)"
