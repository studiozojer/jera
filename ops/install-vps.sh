#!/bin/bash
# Run as root on the selected VPS after copying this directory and schema.q
# into /opt/jera-snapback. Does not edit the reverse proxy.
set -euo pipefail
cd /opt/jera-snapback
exec 9>/run/lock/jera-snapback-maintenance.lock
flock -n 9 || { echo 'Another Snapback maintenance operation is running.' >&2; exit 1; }
if ! id jera-snapback >/dev/null 2>&1; then
  useradd --system --home-dir /var/lib/jera-snapback --shell /usr/sbin/nologin jera-snapback
fi
install -d -o jera-snapback -g jera-snapback -m 0700 /var/lib/jera-snapback
bash runtime.sh
export PATH="/opt/jera-snapback/runtime/bin:$PATH"
npm ci --omit=dev --ignore-scripts --no-audit --no-fund
./node_modules/.bin/snapback4 --version
# Preserve the deployment directory: deploy performs adoption; never reset it.
runuser -u jera-snapback -- ./node_modules/.bin/snapback4 deploy /var/lib/jera-snapback/deployment --check
# PrivateTmp isolates the service's local adoption socket. Stop for adoption;
# preserve the existing store and restart the previous service on failure.
was_active=0
if systemctl is-active --quiet jera-snapback; then
  was_active=1
  systemctl stop jera-snapback
fi
restart_previous() { if [ "$was_active" = 1 ]; then systemctl start jera-snapback; fi; }
trap restart_previous EXIT
runuser -u jera-snapback -- ./node_modules/.bin/snapback4 deploy /var/lib/jera-snapback/deployment
install -m 0644 jera-snapback.service /etc/systemd/system/jera-snapback.service
install -m 0644 jera-snapback-backup.service /etc/systemd/system/jera-snapback-backup.service
install -m 0644 jera-snapback-backup.timer /etc/systemd/system/jera-snapback-backup.timer
systemctl daemon-reload
systemctl enable --now jera-snapback.service jera-snapback-backup.timer
systemctl restart jera-snapback.service
trap - EXIT
for attempt in {1..30}; do
  if curl --silent --fail http://127.0.0.1:4417/auth/config >/dev/null; then
    echo 'Jera Snapback is ready on loopback port 4417.'
    exit 0
  fi
  sleep 1
done
journalctl -u jera-snapback -n 20 --no-pager
exit 1
