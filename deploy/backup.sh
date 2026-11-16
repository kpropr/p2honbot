#!/usr/bin/env bash
set -euo pipefail
cd /opt/petuhon
install -d -m 700 /opt/petuhon-backups
target="/opt/petuhon-backups/$(date -u +%Y%m%d-%H%M%S).sql.gz"
umask 077
docker compose exec -T db pg_dump -U petuhon -d petuhon | gzip > "$target.partial"
mv "$target.partial" "$target"
find /opt/petuhon-backups -maxdepth 1 -type f -name '*.sql.gz' -mtime +7 -delete
