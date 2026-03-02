#!/bin/sh
# Daily PostgreSQL dump: pg_dump -> gzip -> upload to S3.
# Requires: PGHOST, PGPASSWORD, POSTGRES_USER, POSTGRES_DB,
#           S3_BACKUP_BUCKET, S3_BACKUP_ACCESS_KEY, S3_BACKUP_SECRET_KEY
# Optional: S3_BACKUP_ENDPOINT (e.g. Selectel), S3_BACKUP_PREFIX, BACKUP_RETENTION_DAYS

set -e

export PGHOST="${PGHOST:-postgres}"
export PGPASSWORD="${POSTGRES_PASSWORD:?Set POSTGRES_PASSWORD}"
export PGUSER="${POSTGRES_USER:-smart_trainer}"
export PGDATABASE="${POSTGRES_DB:-smart_trainer}"

BUCKET="${S3_BACKUP_BUCKET:?Set S3_BACKUP_BUCKET}"
AWS_ACCESS_KEY="${S3_BACKUP_ACCESS_KEY:?Set S3_BACKUP_ACCESS_KEY}"
AWS_SECRET_ACCESS_KEY="${S3_BACKUP_SECRET_KEY:?Set S3_BACKUP_SECRET_KEY}"
PREFIX="${S3_BACKUP_PREFIX:-backups/postgres/}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-0}"

# Filename with UTC date/time for ordering
TIMESTAMP=$(date -u +%Y%m%d_%H%M)
DUMP_NAME="smart_trainer_${TIMESTAMP}.dump.gz"
S3_KEY="${PREFIX}${DUMP_NAME}"
TMP_FILE="/tmp/${DUMP_NAME}"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }

log "Starting backup to s3://${BUCKET}/${S3_KEY}"

if ! pg_dump -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" -Fc | gzip > "$TMP_FILE"; then
  log "ERROR: pg_dump failed"
  rm -f "$TMP_FILE"
  exit 1
fi

FILESIZE=$(wc -c < "$TMP_FILE")
log "Dump size: ${FILESIZE} bytes"

AWS_OPTS=""
if [ -n "$S3_BACKUP_ENDPOINT" ]; then
  AWS_OPTS="--endpoint-url $S3_BACKUP_ENDPOINT"
fi

export AWS_ACCESS_KEY_ID="$AWS_ACCESS_KEY"
export AWS_SECRET_ACCESS_KEY="$AWS_SECRET_ACCESS_KEY"

if ! aws s3 cp "$TMP_FILE" "s3://${BUCKET}/${S3_KEY}" $AWS_OPTS; then
  log "ERROR: aws s3 cp failed"
  rm -f "$TMP_FILE"
  exit 1
fi

rm -f "$TMP_FILE"
log "Backup completed: s3://${BUCKET}/${S3_KEY}"

# Optional: delete objects in the prefix older than RETENTION_DAYS
if [ "$RETENTION_DAYS" -gt 0 ]; then
  log "Pruning backups older than ${RETENTION_DAYS} days..."
  CUTOFF=$(python3 -c "from datetime import datetime, timedelta; print((datetime.utcnow() - timedelta(days=$RETENTION_DAYS)).strftime('%Y%m%d'))")
  aws s3 ls "s3://${BUCKET}/${PREFIX}" $AWS_OPTS | while read -r _ _ _ KEY; do
    [ -z "$KEY" ] && continue
    # Extract date from smart_trainer_YYYYMMDD_HHMM.dump.gz
    FILE_DATE=$(echo "$KEY" | sed -n 's/smart_trainer_\([0-9]\{8\}\)_.*/\1/p')
    if [ -n "$FILE_DATE" ] && [ "$FILE_DATE" -lt "$CUTOFF" ]; then
      log "Deleting old backup: $KEY"
      aws s3 rm "s3://${BUCKET}/${PREFIX}${KEY}" $AWS_OPTS || true
    fi
  done
fi

log "Done."
