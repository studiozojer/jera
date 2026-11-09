#!/bin/bash
# Run after staging auth/, schema and unit files under /opt/jera-snapback.
# Existing data remains in place; no ownership is inferred from emails.
set -euo pipefail
umask 077
cd /opt/jera-snapback
export PATH="/opt/jera-snapback/runtime/bin:$PATH"
(cd auth && npm ci --omit=dev --ignore-scripts --no-audit --no-fund)
chown -R jera-snapback:jera-snapback auth/node_modules
runuser -u jera-snapback -- ./node_modules/.bin/snapback4 deploy /var/lib/jera-snapback/deployment --check
# A consistent on-host backup precedes adoption; do not copy private data away.
bash backup.sh
exec 9>/run/lock/jera-snapback-maintenance.lock
flock -n 9
install -d -o jera-snapback -g jera-snapback -m 0700 /var/lib/jera-snapback/auth
systemctl stop jera-atproto-auth 2>/dev/null || true
systemctl stop jera-snapback
trap 'systemctl start jera-snapback' EXIT
runuser -u jera-snapback -- ./node_modules/.bin/snapback4 deploy /var/lib/jera-snapback/deployment
if [ ! -s /var/lib/jera-snapback/auth/service-token ]; then
  runuser -u jera-snapback -- ./node_modules/.bin/snapback4 token --service atproto-auth --release /var/lib/jera-snapback/deployment > /var/lib/jera-snapback/auth/service-token
  chown jera-snapback:jera-snapback /var/lib/jera-snapback/auth/service-token
  chmod 0600 /var/lib/jera-snapback/auth/service-token
fi
systemctl start jera-snapback
for attempt in {1..30}; do
  if curl --silent --fail http://127.0.0.1:4417/auth/config >/dev/null; then break; fi
  sleep 1
done
curl --silent --fail http://127.0.0.1:4417/auth/config >/dev/null
trap - EXIT
# Password sessions cannot keep acting after the identity migration. Preserve
# their records for deliberate attribution; never infer an ATproto account.
python3 - <<'PY'
import json, pathlib, sqlite3, urllib.request
root = pathlib.Path('/var/lib/jera-snapback')
token = (root/'auth/service-token').read_text().strip()
c = sqlite3.connect('file:'+str(root/'deployment/store.sqlite')+'?mode=ro', uri=True)
principals = [row[0] for row in c.execute("select distinct principal from _sessions where principal not like 'did:%' and principal not like 'service:%'")]
for principal in principals:
 req = urllib.request.Request('http://127.0.0.1:4417/auth/revoke', data=json.dumps({'principal':principal}).encode(), headers={'Content-Type':'application/json','Authorization':'Bearer '+token}, method='POST')
 with urllib.request.urlopen(req, timeout=15) as res: assert res.status == 200
print('Retired legacy session principals:', len(principals), '; stored records preserved.')
PY
install -m 0644 jera-atproto-auth.service /etc/systemd/system/jera-atproto-auth.service
systemctl daemon-reload
systemctl enable --now jera-atproto-auth
systemctl restart jera-atproto-auth
for attempt in {1..30}; do
  if curl --silent --fail http://127.0.0.1:4420/oauth/health >/dev/null; then break; fi
  sleep 1
done
curl --silent --fail http://127.0.0.1:4420/oauth/health
python3 install-proxy.py
