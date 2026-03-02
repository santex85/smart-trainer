#!/usr/bin/env bash
# Restore PostgreSQL from a backup stored in S3.
# Usage: ./restore-from-s3.sh [S3_KEY|latest] [--dry-run]
#   S3_KEY: full key in bucket (e.g. backups/postgres/smart_trainer_20250301_0300.dump.gz), or "latest"
#   --dry-run: only download and show info, do not restore
# Requires: .env in project root with POSTGRES_*, S3_BACKUP_* (or S3_*), and docker compose.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

if [ ! -f .env ]; then
  echo "ERROR: .env not found in $PROJECT_ROOT"
  exit 1
fi

# shellcheck source=/dev/null
set -a
source .env
set +a

COMPOSE_CMD="docker compose -f docker-compose.yml -f docker-compose.prod.yml"
if [ -f docker-compose.override.yml ]; then
  COMPOSE_CMD="$COMPOSE_CMD -f docker-compose.override.yml"
fi

DRY_RUN=false
S3_KEY_ARG=""
for arg in "$@"; do
  if [ "$arg" = "--dry-run" ]; then
    DRY_RUN=true
  else
    S3_KEY_ARG="$arg"
  fi
done

if [ -z "$S3_KEY_ARG" ]; then
  echo "Usage: $0 [S3_KEY|latest] [--dry-run]"
  echo "  S3_KEY: object key in bucket (e.g. backups/postgres/smart_trainer_20250301_0300.dump.gz)"
  echo "  latest: use the most recent backup by filename timestamp"
  exit 1
fi

BUCKET="${S3_BACKUP_BUCKET:-$S3_BUCKET}"
AWS_ACCESS_KEY="${S3_BACKUP_ACCESS_KEY:-$S3_ACCESS_KEY}"
AWS_SECRET_ACCESS_KEY="${S3_BACKUP_SECRET_KEY:-$S3_SECRET_KEY}"
export AWS_ACCESS_KEY_ID="$AWS_ACCESS_KEY"
export AWS_SECRET_ACCESS_KEY="$AWS_SECRET_ACCESS_KEY"

AWS_OPTS=()
if [ -n "${S3_BACKUP_ENDPOINT}" ]; then
  AWS_OPTS+=(--endpoint-url "$S3_BACKUP_ENDPOINT")
fi

if [ -z "$BUCKET" ] || [ -z "$AWS_ACCESS_KEY" ] || [ -z "$AWS_SECRET_ACCESS_KEY" ]; then
  echo "ERROR: Set S3_BACKUP_BUCKET (or S3_BUCKET), S3_BACKUP_ACCESS_KEY, S3_BACKUP_SECRET_KEY in .env"
  exit 1
fi

list_s3() {
  aws s3 ls "s3://${BUCKET}/${S3_BACKUP_PREFIX:-backups/postgres/}" "${AWS_OPTS[@]}" 2>/dev/null || true
}

if [ "$S3_KEY_ARG" = "latest" ]; then
  echo "Listing backups to find latest..."
  PREFIX="${S3_BACKUP_PREFIX:-backups/postgres/}"
  [[ "$PREFIX" != */ ]] && PREFIX="${PREFIX}/"
  LAST=""
  while read -r line; do
    # Format: 2025-03-01 03:00:00  12345 smart_trainer_20250301_0300.dump.gz
    KEY=$(echo "$line" | awk '{print $4}')
    [ -z "$KEY" ] && continue
    if [[ "$KEY" =~ smart_trainer_[0-9]{8}_[0-9]{4}\.dump\.gz ]]; then
      LAST="${PREFIX}${KEY}"
    fi
  done < <(list_s3 | sort -k4)
  if [ -z "$LAST" ]; then
    echo "ERROR: No backups found in s3://${BUCKET}/${PREFIX}"
    exit 1
  fi
  S3_KEY="$LAST"
  echo "Latest backup: $S3_KEY"
else
  S3_KEY="$S3_KEY_ARG"
fi

RESTORE_FILE="/tmp/smart_trainer_restore_$$.dump.gz"
cleanup() { rm -f "$RESTORE_FILE"; }
trap cleanup EXIT

echo "Downloading s3://${BUCKET}/${S3_KEY} ..."
if ! aws s3 cp "s3://${BUCKET}/${S3_KEY}" "$RESTORE_FILE" "${AWS_OPTS[@]}"; then
  echo "ERROR: Download failed"
  exit 1
fi

SIZE=$(wc -c < "$RESTORE_FILE")
echo "Downloaded ${SIZE} bytes to $RESTORE_FILE"

if [ "$DRY_RUN" = true ]; then
  echo "Dry run: not restoring. Remove --dry-run to restore."
  exit 0
fi

echo "WARNING: This will restore into the running database (--clean --if-exists)."
echo "Ensure backend is stopped or users are aware of brief inconsistency."
read -r -p "Continue? [y/N] " ans
case "$ans" in
  [yY]|[yY][eE][sS]) ;;
  *) echo "Aborted."; exit 0 ;;
esac

POSTGRES_USER="${POSTGRES_USER:-smart_trainer}"
POSTGRES_DB="${POSTGRES_DB:-smart_trainer}"

echo "Copying dump into postgres container..."
$COMPOSE_CMD cp "$RESTORE_FILE" postgres:/tmp/restore.dump.gz

echo "Restoring (pg_restore --clean --if-exists)..."
$COMPOSE_CMD exec -T postgres sh -c "gunzip -c /tmp/restore.dump.gz | pg_restore -U $POSTGRES_USER -d $POSTGRES_DB --clean --if-exists --no-owner || true"
$COMPOSE_CMD exec -T postgres rm -f /tmp/restore.dump.gz

echo "Restore finished. Verify data and restart backend if needed."
