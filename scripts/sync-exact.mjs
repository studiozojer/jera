// Exact source distribution: builds/checks use the committed local copy.
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const repo=resolve(fileURLToPath(new URL('..',import.meta.url)));
const preview=resolve(repo,'foundation/design-preview');
const check=process.argv.includes('--check');
const source=process.env.DAOUI_REPO;
if(!check&&!source)throw new Error('Set DAOUI_REPO to the canonical daoUI checkout to synchronize Exact components');
const args=check?[resolve(preview,'dao/check.py')]:[resolve(source,'exact/scripts/sync.py'),preview];
const result=spawnSync('python3',args,{stdio:'inherit'});process.exit(result.status??1);
