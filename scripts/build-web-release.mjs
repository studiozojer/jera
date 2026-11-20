// Bind packaging to the actual inputs used for a fresh release build.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const app = fileURLToPath(new URL('../app/', import.meta.url));
const dir = process.argv[2] && resolve(process.argv[2]);
if (!dir || existsSync(dir)) throw new Error('Supply a new web build directory.');
const origin = 'https://snapback.jera.ink';
execFileSync(process.env.BUN || 'bun', ['exact.mjs','web-build','--out',dir], {cwd:app,env:{...process.env, EXACT_BACKEND_ORIGIN:origin},stdio:'inherit'});
writeFileSync(resolve(dir,'jera-build.json'),JSON.stringify({
  origin, commit:execFileSync('git',['rev-parse','HEAD'],{cwd:app,encoding:'utf8'}).trim(),
  receipt:createHash('sha256').update(readFileSync(resolve(dir,'.exact-build.json'))).digest('hex')
}));
