#!/usr/bin/env python3
"""Exercise DID-principal storage only in a disposable restored deployment.
This uses trusted fixture identity; it does not prove ATproto OAuth.
"""
import json, pathlib, secrets, sys, urllib.request
origin, directory = sys.argv[1:]
assert origin == 'http://127.0.0.1:4418'
root = pathlib.Path(directory)
assert root.name.startswith('restore-check-')
service = (root/'auth/service-token').read_text().strip()
def request(path, payload, token):
 req = urllib.request.Request(origin+path, data=json.dumps(payload).encode(), headers={'Content-Type':'application/json','Authorization':'Bearer '+token}, method='POST')
 with urllib.request.urlopen(req, timeout=15) as res: data=json.load(res)
 assert not data.get('denied') and data.get('state') != 'failed'
 return data
principal = 'did:web:restore.invalid'
session = request('/auth/session', {'principal':principal, 'days':1}, service)['session']
assert session['principal'] == principal
token = session['token']
def mutate(name, args):
 alphabet='0123456789ABCDEFGHJKMNPQRSTVWXYZ'
 return request('/m/'+name, {'id':'0'+''.join(secrets.choice(alphabet) for _ in range(25)), 'args':args}, token)['result']
a = mutate('createArmillary', {'name':'Disposable restore verification'})
m = mutate('createModule', {'armillary':a['id'], 'name':'Private restore fixture'})
body = 'Restore fixture — ᛃ ♊ provenance.'
mutate('capture', {'module':m['id'], 'body':body, 'source':''})
rows = request('/q/artifactsList', {'args':{'module':m['id']}}, token)['data']
assert rows[0]['body'] == body and rows[0]['author'] == principal
assert request('/q/currentIdentity', {'args':{}}, token)['data']['did'] == principal
request('/auth/logout', {}, token)
print('PASS: isolated restored storage, trusted fixture DID ownership and capture. OAuth is not simulated as acceptance.')
