#!/bin/bash
# Stage a source release (auth, contracts, scripts, snapback, ops) first.
# Preserve durable storage and old source; do not roll back data after adoption.
set -euo pipefail
umask 077
release=$(realpath "${1:?staged foundation directory required}")
test -f "$release/auth/server.mjs"
test -f "$release/contracts/lexicons/post.v1.json"
test -n "${EXPECTED_SCHEMA_SHA256:?inspect the current schema before release}"
export PATH="/opt/jera-snapback/runtime/bin:$PATH"
cd /opt/jera-snapback
(cd "$release/auth" && npm ci --omit=dev --ignore-scripts --no-audit --no-fund)
node --input-type=module -e 'await import(process.argv[1])' "file://$release/auth/service.mjs"
runuser -u jera-snapback -- ./node_modules/.bin/snapback4 deploy /var/lib/jera-snapback/deployment --schema "$release/snapback/schema.q" --check
systemctl start jera-snapback-backup.service
python3 "$release/ops/check-release.py" "$release/snapback/schema.q"
exec 9>/run/lock/jera-snapback-maintenance.lock
flock -n 9
test "$(sha256sum snapback/schema.q | cut -d' ' -f1)" = "$EXPECTED_SCHEMA_SHA256"
previous="/opt/jera-snapback/source-before-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -m 0700 "$previous"
for entry in auth contracts scripts snapback; do
  if [ -e "$entry" ]; then cp -a "$entry" "$previous/$entry"; fi
done
cp -p /etc/systemd/system/jera-atproto-auth.service "$previous/auth.service"
cp -p /etc/caddy/jera-snapback.caddy "$previous/snapback.caddy"
finished=0
recover() {
  result=$?
  if [ "$finished" -eq 0 ]; then
    systemctl stop jera-atproto-auth || true
    for entry in auth contracts scripts; do
      rm -rf "/opt/jera-snapback/$entry"
      if [ -e "$previous/$entry" ]; then cp -a "$previous/$entry" "$entry"; fi
    done
    # Keep the adopted additive store. Prior clients remain compatible.
    cp -p "$previous/auth.service" /etc/systemd/system/jera-atproto-auth.service
    cp -p "$previous/snapback.caddy" /etc/caddy/jera-snapback.caddy
    systemctl daemon-reload
    curl --silent --show-error --fail -H 'Content-Type: text/caddyfile' --data-binary @/etc/caddy/Caddyfile http://127.0.0.1:2019/load || true
    systemctl start jera-snapback
    systemctl start jera-atproto-auth
    echo "Release failed; prior service source restored. Inspect $previous and the deployed schema before retrying." >&2
  fi
  exit "$result"
}
trap recover EXIT
systemctl stop jera-atproto-auth
for entry in auth contracts scripts; do
  rm -rf "/opt/jera-snapback/$entry"
  cp -a "$release/$entry" "$entry"
  chown -R jera-snapback:jera-snapback "$entry"
done
install -m 0644 "$release/snapback/schema.q" snapback/schema.q
systemctl stop jera-snapback
runuser -u jera-snapback -- ./node_modules/.bin/snapback4 deploy /var/lib/jera-snapback/deployment
systemctl start jera-snapback
for attempt in {1..50}; do
  if curl --silent --fail http://127.0.0.1:4417/auth/config >/dev/null; then break; fi
  sleep 0.2
done
curl --silent --fail http://127.0.0.1:4417/auth/config >/dev/null
install -m 0644 "$release/ops/jera-atproto-auth.service" /etc/systemd/system/jera-atproto-auth.service
systemctl daemon-reload
systemctl start jera-atproto-auth
for attempt in {1..50}; do
  if curl --silent --fail http://127.0.0.1:4420/oauth/health >/dev/null; then break; fi
  sleep 0.2
done
curl --silent --fail http://127.0.0.1:4420/oauth/health >/dev/null
install -m 0644 "$release/ops/snapback.caddy" snapback.caddy
python3 "$release/ops/install-proxy.py"
finished=1
echo "Backend release verified; prior source retained at $previous"
