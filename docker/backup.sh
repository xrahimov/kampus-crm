#!/bin/sh
# Nightly PostgreSQL dump for the production compose (docs/DEPLOY.md).
# Writes /backups/kampus-<date>.sql.gz once a day and keeps the last BACKUP_KEEP_DAYS days.
set -eu
: "${BACKUP_KEEP_DAYS:=14}"
while true; do
  stamp=$(date +%Y-%m-%d-%H%M)
  if pg_dump --no-owner --no-privileges | gzip > "/backups/kampus-$stamp.sql.gz.part"; then
    mv "/backups/kampus-$stamp.sql.gz.part" "/backups/kampus-$stamp.sql.gz"
    echo "backup written: kampus-$stamp.sql.gz"
    find /backups -name 'kampus-*.sql.gz' -mtime "+$BACKUP_KEEP_DAYS" -delete
  else
    rm -f "/backups/kampus-$stamp.sql.gz.part"
    echo "backup failed" >&2
  fi
  sleep 86400
done
