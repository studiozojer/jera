#!/usr/bin/env python3
"""Verify the newest backup in a disposable loopback instance; never overwrite live data."""
import os
import pathlib
import shutil
import signal
import subprocess
import tempfile
import time
import urllib.request

archives = list(pathlib.Path('/var/backups/jera-snapback').glob('*.tar.gz'))
archive = max(archives, key=lambda path: path.stat().st_mtime)
subprocess.run(['sha256sum', '--check', str(archive) + '.sha256'], check=True)
directory = tempfile.mkdtemp(prefix='restore-check-', dir='/var/lib/jera-snapback')
server = None
try:
    subprocess.run(['tar', '-xzf', str(archive), '-C', directory], check=True)
    subprocess.run(['chown', '-R', 'jera-snapback:jera-snapback', directory], check=True)
    server = subprocess.Popen(['runuser', '-u', 'jera-snapback', '--', '/opt/jera-snapback/node_modules/.bin/snapback4',
        'serve', directory + '/deployment', '--bind', '127.0.0.1', '--port', '4418'],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    for attempt in range(30):
        if server.poll() is not None:
            raise RuntimeError('Restore server exited')
        try:
            urllib.request.urlopen('http://127.0.0.1:4418/auth/config', timeout=2).close()
            break
        except OSError:
            time.sleep(1)
    subprocess.run(['python3', '/opt/jera-snapback/smoke.py', 'http://127.0.0.1:4418', '/root/jera-snapback-probe.json'], check=True)
    print('Backup restore passed; live deployment was not replaced.')
finally:
    if server and server.poll() is None:
        os.killpg(server.pid, signal.SIGTERM)
        server.wait(timeout=15)
    shutil.rmtree(directory)
