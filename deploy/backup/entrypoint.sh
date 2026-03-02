#!/bin/sh
# Install crontab from BACKUP_CRON_SCHEDULE and run crond in foreground.
SCHEDULE="${BACKUP_CRON_SCHEDULE:-0 3 * * *}"
echo "$SCHEDULE /opt/backup.sh >> /var/log/backup.log 2>&1" > /etc/crontabs/root
echo "Cron schedule: $SCHEDULE"
exec crond -f -l 2
