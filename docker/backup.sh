#!/bin/sh
# Nightly backup for the production compose (docs/DEPLOY.md section 8).
# 1. PostgreSQL dump to /backups/kampus-<date>.sql.gz, the last BACKUP_KEEP_DAYS days kept.
# 2. Uploaded files and lesson recordings mirrored to /backups/uploads. Files are
#    written once under random names, so only new ones are copied. A file deleted
#    in Kampus moves to /backups/uploads-deleted and is dropped after
#    BACKUP_KEEP_DAYS days, so a mistaken delete can still be undone.
set -eu
: "${BACKUP_KEEP_DAYS:=14}"
# Leave at least this much disk free (KiB); the mirror pauses below it.
: "${BACKUP_MIN_FREE_KB:=2097152}"

dump_database() {
  stamp=$(date +%Y-%m-%d-%H%M)
  if pg_dump --no-owner --no-privileges | gzip > "/backups/kampus-$stamp.sql.gz.part"; then
    mv "/backups/kampus-$stamp.sql.gz.part" "/backups/kampus-$stamp.sql.gz"
    echo "backup written: kampus-$stamp.sql.gz"
    find /backups -maxdepth 1 -name 'kampus-*.sql.gz' -mtime "+$BACKUP_KEEP_DAYS" -delete
  else
    rm -f "/backups/kampus-$stamp.sql.gz.part"
    echo "backup failed" >&2
  fi
}

mirror_uploads() {
  [ -d /uploads ] || return 0
  mirror=/backups/uploads
  deleted=/backups/uploads-deleted
  mkdir -p "$mirror" "$deleted"
  find "$mirror" -name '*.part' -type f -delete
  copied=0
  skipped=0
  # Skip files still being written (a recording upload in progress).
  for f in $(cd /uploads && find . -type f -mmin +10); do
    [ -e "$mirror/$f" ] && continue
    size_kb=$(( $(stat -c %s "/uploads/$f") / 1024 + 1 ))
    free_kb=$(df -Pk /backups | awk 'NR==2 {print $4}')
    if [ "$free_kb" -lt $(( size_kb + BACKUP_MIN_FREE_KB )) ]; then
      skipped=$((skipped + 1))
      continue
    fi
    mkdir -p "$mirror/$(dirname "$f")"
    if cp -p "/uploads/$f" "$mirror/$f.part"; then
      mv "$mirror/$f.part" "$mirror/$f"
      copied=$((copied + 1))
    else
      rm -f "$mirror/$f.part"
    fi
  done
  moved=0
  for f in $(cd "$mirror" && find . -type f); do
    [ -e "/uploads/$f" ] && continue
    mkdir -p "$deleted/$(dirname "$f")"
    mv "$mirror/$f" "$deleted/$f"
    touch "$deleted/$f"
    moved=$((moved + 1))
  done
  find "$deleted" -type f -mtime "+$BACKUP_KEEP_DAYS" -delete
  echo "uploads mirrored: $copied new, $moved deleted in Kampus kept for $BACKUP_KEEP_DAYS days"
  if [ "$skipped" -gt 0 ]; then
    echo "uploads mirror: $skipped file(s) not copied, disk almost full" >&2
  fi
}

while true; do
  dump_database
  mirror_uploads || echo "uploads mirror failed" >&2
  sleep 86400
done
