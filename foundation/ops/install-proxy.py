#!/usr/bin/env python3
"""Add only the Snapback import; preserve the existing proxy and roll back on failure."""
import datetime
import pathlib
import subprocess
import time
import urllib.request

config = pathlib.Path('/etc/caddy/Caddyfile')
fragment = pathlib.Path('/etc/caddy/jera-snapback.caddy')
source = pathlib.Path('/opt/jera-snapback/snapback.caddy')
original = config.read_bytes()
old_fragment = fragment.read_bytes() if fragment.exists() else None
stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
backup = config.with_name('Caddyfile.pre-snapback-' + stamp)
backup.write_bytes(original)
backup.chmod(0o600)
line = b'import /etc/caddy/jera-snapback.caddy'

def public_health():
    with urllib.request.urlopen('https://pds.jera.ink/xrpc/_health', timeout=20) as response:
        return response.status

assert public_health() == 200
try:
    fragment.write_bytes(source.read_bytes())
    fragment.chmod(0o644)
    if line not in original.splitlines():
        config.write_bytes(original.rstrip() + b'\n\n# Jera Snapback API\n' + line + b'\n')
    # Caddy's service has DNS-provider environment secrets; its local
    # loopback admin API validates and atomically applies the Caddyfile using
    # the running process's environment. No service secrets enter this script.
    request = urllib.request.Request('http://127.0.0.1:2019/load', data=config.read_bytes(),
        headers={'Content-Type': 'text/caddyfile'}, method='POST')
    with urllib.request.urlopen(request, timeout=30) as response:
        assert response.status == 200
    assert public_health() == 200
    for attempt in range(30):
        try:
            with urllib.request.urlopen('https://snapback.jera.ink/auth/config', timeout=5) as response:
                assert response.status == 200
            break
        except Exception:
            if attempt == 29:
                raise
            time.sleep(2)
    assert public_health() == 200
except Exception:
    config.write_bytes(original)
    if old_fragment is None:
        fragment.unlink(missing_ok=True)
    else:
        fragment.write_bytes(old_fragment)
    request = urllib.request.Request('http://127.0.0.1:2019/load', data=original,
        headers={'Content-Type': 'text/caddyfile'}, method='POST')
    with urllib.request.urlopen(request, timeout=30):
        pass
    raise
print('Snapback HTTPS verified; PDS health preserved. Backup:', backup)
