#!/bin/bash
# Additive schema adoption for an existing Jera deployment. Auth is unchanged.
set -euo pipefail
umask 077
cd /opt/jera-snapback
export PATH="/opt/jera-snapback/runtime/bin:$PATH"
incoming=${1:-/opt/jera-snapback/schema-incoming.q}
test -f "$incoming"
# Backup takes its own maintenance lock and snapshots deployment + auth together.
systemctl start jera-snapback-backup.service
exec 9>/run/lock/jera-snapback-maintenance.lock
flock -n 9
current=$(sha256sum snapback/schema.q | cut -d' ' -f1)
if [ -n "${EXPECTED_SCHEMA_SHA256:-}" ] && [ "$current" != "$EXPECTED_SCHEMA_SHA256" ]; then
  echo 'The live schema changed since inspection; adoption refused.' >&2
  exit 1
fi
stamp=$(date -u +%Y%m%dT%H%M%SZ)
previous="snapback/schema.q.before-$stamp"
cp -p snapback/schema.q "$previous"
adopted=0
cleanup() {
  result=$?
  if [ "$adopted" -eq 0 ]; then cp -p "$previous" snapback/schema.q; fi
  systemctl start jera-snapback
  exit "$result"
}
trap cleanup EXIT
install -m 0644 "$incoming" snapback/schema.q
runuser -u jera-snapback -- ./node_modules/.bin/snapback4 deploy /var/lib/jera-snapback/deployment --check
systemctl stop jera-snapback
runuser -u jera-snapback -- ./node_modules/.bin/snapback4 deploy /var/lib/jera-snapback/deployment
adopted=1
systemctl start jera-snapback
for attempt in $(seq 1 50); do
  if curl --silent --fail http://127.0.0.1:4417/auth/config >/dev/null; then break; fi
  sleep 0.2
done
curl --silent --show-error --fail http://127.0.0.1:4417/auth/config
systemctl is-active jera-snapback jera-atproto-auth
