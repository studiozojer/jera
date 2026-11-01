#!/usr/bin/env python3
"""Create/recheck a clearly labelled private deployment probe. Never print credentials.

Usage: smoke.py https://snapback.jera.ink /root/jera-snapback-probe.json
Run again against a restored loopback deployment with the same private state file.
"""
import json
import os
import pathlib
import secrets
import sys
import urllib.error
import urllib.request

origin, state_path = sys.argv[1:]
state_file = pathlib.Path(state_path)
token = None

def request(route, body=None):
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    req = urllib.request.Request(origin + route, headers=headers,
        data=json.dumps(body).encode() if body is not None else None)
    with urllib.request.urlopen(req, timeout=30) as response:
        value = json.load(response)
    assert not value.get('denied') and value.get('state') != 'failed', 'API refused probe operation'
    return value

def mutation(name, args):
    alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
    intent = '0' + ''.join(secrets.choice(alphabet) for _ in range(25))
    return request('/m/' + name, {'id': intent, 'args': args})['result']

request('/auth/config')
for route, expected in [('/q/armillariesList', 401), ('/dev/reset', 403)]:
    try:
        request(route, {'args': {}})
        raise AssertionError('Unauthenticated/development operation unexpectedly allowed')
    except urllib.error.HTTPError as error:
        assert error.code == expected, (route, error.code)

if not state_file.exists():
    state = {'email': 'deployment-probe-' + secrets.token_hex(6) + '@example.invalid', 'password': secrets.token_urlsafe(32)}
    # Save credentials before mutation so failed runs can be inspected privately.
    fd = os.open(state_file, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as stream:
        json.dump(state, stream)
    token = request('/auth/signup', state)['session']['token']
    arm = mutation('createArmillary', {'name': 'Deployment verification (synthetic)'})
    module = mutation('createModule', {'armillary': arm['id'], 'name': 'Backup restore probe'})
    state['module'] = module['id']
    state['body'] = 'Synthetic recovery probe — ᛃ ideas keep their provenance.'
    mutation('capture', {'module': module['id'], 'body': state['body'], 'source': ''})
    state_file.write_text(json.dumps(state))
else:
    state = json.loads(state_file.read_text())
    token = request('/auth/login', {'email': state['email'], 'password': state['password']})['session']['token']
rows = request('/q/artifactsList', {'args': {'module': state['module']}})['data']
assert any(row['body'] == state['body'] for row in rows), 'Source artifact did not survive'
tasks = request('/q/tasksList', {'args': {'module': state['module']}})['data']
assert len(tasks) == 1, 'Capture task did not survive'
print('PASS: HTTPS/auth (or loopback restore), source artifact, task, auth denial, and disabled dev reset.')
