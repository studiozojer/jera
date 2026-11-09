#!/usr/bin/env python3
"""Activate an already-staged web artifact; restore routing on failed checks."""
import datetime
import pathlib
import re
import sys
import urllib.request

release = sys.argv[1]
if not re.fullmatch(r'[0-9a-f]{40}', release):
    raise SystemExit('Expected the full source commit SHA')
root = pathlib.Path('/opt/jera-web')
artifact = root / 'releases' / release
for name in ('index.html', 'app.js', '.exact/auth/callback', '.exact/auth/callback.js'):
    if not (artifact / name).is_file():
        raise SystemExit('Incomplete web artifact: ' + name)
config = pathlib.Path('/etc/caddy/Caddyfile')
fragment = pathlib.Path('/etc/caddy/jera-web.caddy')
current = root / 'current'
original = config.read_bytes()
old_fragment = fragment.read_bytes() if fragment.exists() else None
old_target = current.readlink() if current.is_symlink() else None
if current.exists() and not current.is_symlink():
    raise SystemExit('Refusing to replace a non-symlink web root')
stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
backup = config.with_name('Caddyfile.pre-jera-web-' + stamp)
backup.write_bytes(original)
backup.chmod(0o600)

def load(content):
    request = urllib.request.Request('http://127.0.0.1:2019/load', data=content,
        headers={'Content-Type': 'text/caddyfile'}, method='POST')
    with urllib.request.urlopen(request, timeout=30) as response:
        assert response.status == 200

def switch(target):
    temporary = root / '.current-next'
    temporary.unlink(missing_ok=True)
    temporary.symlink_to(target)
    temporary.replace(current)

try:
    fragment.write_bytes(pathlib.Path(__file__).with_name('web.caddy').read_bytes())
    fragment.chmod(0o644)
    line = b'import /etc/caddy/jera-web.caddy'
    if line not in original.splitlines():
        config.write_bytes(original.rstrip() + b'\n\n' + line + b'\n')
    switch(artifact)
    load(config.read_bytes())
    for path in ('/', '/app.js', '/.exact/auth/callback', '/.exact/auth/callback.js', '/thread/release-check', '/account', '/write', '/audience', '/earlier-drafts'):
        with urllib.request.urlopen('http://127.0.0.1:4421' + path, timeout=15) as response:
            assert response.status == 200
            assert response.headers['Cache-Control'] == 'no-store'
            if path == '/.exact/auth/callback' or path.startswith('/thread/') or path in ('/account', '/write', '/audience', '/earlier-drafts'):
                assert response.headers.get_content_type() == 'text/html'
    for url in ('https://snapback.jera.ink/oauth/health', 'https://pds.jera.ink/xrpc/_health'):
        with urllib.request.urlopen(url, timeout=20) as response:
            assert response.status == 200
except Exception:
    if old_target is None:
        current.unlink(missing_ok=True)
    else:
        switch(old_target)
    if old_fragment is None:
        fragment.unlink(missing_ok=True)
    else:
        fragment.write_bytes(old_fragment)
    config.write_bytes(original)
    load(original)
    raise
print('Web release activated and checked on loopback:', release)
print('Public DNS, TLS and interactive OAuth acceptance remain separate checks.')
