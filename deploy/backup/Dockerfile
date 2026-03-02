# Lightweight backup image: pg_dump + aws-cli + cron. S3-compatible (Selectel, AWS).
FROM alpine:3.19

RUN apk add --no-cache \
    postgresql-client \
    python3 \
    py3-pip \
    dcron \
    gzip \
    && pip3 install --no-cache-dir --break-system-packages awscli \
    && rm -rf /var/cache/apk/* /root/.cache

WORKDIR /opt
COPY backup.sh /opt/backup.sh
COPY crontab /etc/crontabs/root.bak

RUN chmod +x /opt/backup.sh \
    && touch /var/log/backup.log

# Write crontab from env at runtime (BACKUP_CRON_SCHEDULE)
COPY entrypoint.sh /opt/entrypoint.sh
RUN chmod +x /opt/entrypoint.sh

ENTRYPOINT ["/opt/entrypoint.sh"]
