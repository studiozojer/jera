#!/bin/bash
set -euo pipefail
umask 077
exec 9>/run/lock/jera-snapback-maintenance.lock
flock -n 9 || exit 0
archive_dir=/var/backups/jera-snapback
install -d -m 0700 "$archive_dir"
backup_name="$(date -u +%Y%m%dT%H%M%SZ).tar.gz"
# Snapback 0.4.33 documents a whole-directory snapshot with serve stopped.
# Restart even if tar fails; no PDS or other service is stopped.
was_active=0
auth_active=0
if systemctl is-active --quiet jera-atproto-auth; then auth_active=1; fi
if systemctl is-active --quiet jera-snapback; then was_active=1; fi
restore_service() { if [ "$was_active" = 1 ]; then systemctl start jera-snapback; fi; if [ "$auth_active" = 1 ]; then systemctl start jera-atproto-auth; fi; }
trap restore_service EXIT
if [ "$auth_active" = 1 ]; then systemctl stop jera-atproto-auth; fi
systemctl stop jera-snapback
backup_parts=(deployment)
if [ -d /var/lib/jera-snapback/auth ]; then backup_parts+=(auth); fi
tar -C /var/lib/jera-snapback -czf "$archive_dir/$backup_name.partial" "${backup_parts[@]}"
mv "$archive_dir/$backup_name.partial" "$archive_dir/$backup_name"
sha256sum "$archive_dir/$backup_name" > "$archive_dir/$backup_name.sha256"
restore_service
trap - EXIT
# Keep 14 days locally. Off-host copying is a separate, documented operation.
find "$archive_dir" -maxdepth 1 -type f -name '*.tar.gz*' -mtime +14 -delete
