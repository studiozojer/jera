#!/usr/bin/env python3
"""Offline consumer receipt check; needs Python stdlib, never the source repo."""
import hashlib,json,re
from pathlib import Path
app=Path(__file__).resolve().parent.parent
receipt=json.loads((app/'dao/provenance.json').read_text()); bad=[]
def sha(b): return hashlib.sha256(b).hexdigest()
for name,expected in receipt['files'].items():
    p=app/name
    if not p.is_file() or sha(p.read_bytes())!=expected: bad.append(name)
for name,expected in receipt['tamberBlocks'].items():
    match=re.search(r'// daoUI:'+name+r':begin\n(.*?)\n// daoUI:'+name+r':end',(app/'app.tamber').read_text(),re.S)
    if not match or sha(match[1].encode())!=expected: bad.append('app.tamber:'+name)
# Additional files in dao/ could silently shadow a copied module.
known=set(receipt['files'])|{'dao/provenance.json'}
for p in (app/'dao').rglob('*'):
    if p.is_file() and p.relative_to(app).as_posix() not in known: bad.append('unreceipted '+str(p.relative_to(app)))
if bad: raise SystemExit('daoUI drift: '+', '.join(bad))
print(f'daoUI receipt verified: {len(receipt["files"])} files; source {receipt["sourceRevision"]}; dirty={receipt["sourceDirty"]}')
