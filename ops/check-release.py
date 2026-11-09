#!/usr/bin/env python3
"""Adopt an incoming schema on an on-host backup and verify old column values."""
import json
import os
import pathlib
import shutil
import sqlite3
import subprocess
import sys
import tempfile

schema = pathlib.Path(sys.argv[1]).resolve()
archive = max(pathlib.Path('/var/backups/jera-snapback').glob('*.tar.gz'), key=lambda p: p.stat().st_mtime)
subprocess.run(['sha256sum', '--check', str(archive) + '.sha256'], check=True)
directory = pathlib.Path(tempfile.mkdtemp(prefix='release-check-', dir='/var/lib/jera-snapback'))
env = dict(os.environ, PATH='/opt/jera-snapback/runtime/bin:' + os.environ['PATH'])
def inventory(path):
    with sqlite3.connect('file:' + str(path) + '?mode=ro', uri=True) as db:
        # Snapback 0.4.33 stores logical rows in r and table IDs in _catalog.
        # Rebuilt indexes and added default fields are expected to change.
        names = dict(db.execute('select num,name from _catalog'))
        return {(names[table], row_id): json.loads(data) for table, row_id, data in db.execute('select t,id,data from r')}

try:
    subprocess.run(['tar', '-xzf', str(archive), '-C', str(directory)], check=True)
    subprocess.run(['chown', '-R', 'jera-snapback:jera-snapback', str(directory)], check=True)
    store = directory / 'deployment/store.sqlite'
    before = inventory(store)
    if not before:
        raise RuntimeError('No application tables found; refusing an empty preservation check')
    subprocess.run(['runuser', '-u', 'jera-snapback', '--', '/opt/jera-snapback/node_modules/.bin/snapback4',
        'deploy', str(directory / 'deployment'), '--schema', str(schema)], cwd='/opt/jera-snapback', env=env, check=True)
    after = inventory(store)
    assert before.keys() == after.keys(), 'An application row was added or removed by adoption'
    for key, old in before.items():
        assert all(field in after[key] and after[key][field] == value for field, value in old.items()), 'An existing application field changed during adoption'
    print('PASS: all existing application columns and rows preserved across adoption.')
    print('Checked application rows:', len(before))
finally:
    shutil.rmtree(directory)
