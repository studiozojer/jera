// Record the inputs used for the release that the web publisher will package.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const app = resolve(root, 'app');
const dir = process.argv[2] && resolve(process.argv[2]);
if (!dir || existsSync(dir)) throw new Error('Supply a new web build directory.');

function sourceRevision() {
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  if (git(['status', '--porcelain', '--untracked-files=normal'])) throw new Error('Build releases from a clean checkout.');
  return git(['rev-parse', 'HEAD']);
}

const origin = 'https://snapback.jera.ink';
const commit = sourceRevision();
execFileSync(process.env.BUN || 'bun', ['exact.mjs', 'web-build', '--out', dir], {
  cwd: app,
  env: { ...process.env, EXACT_BACKEND_ORIGIN: origin },
  stdio: 'inherit',
});
if (sourceRevision() !== commit) throw new Error('The source revision changed during the web build.');
const receipt = createHash('sha256').update(readFileSync(resolve(dir, '.exact-build.json'))).digest('hex');
writeFileSync(resolve(dir, 'jera-build.json'), JSON.stringify({ origin, commit, receipt }) + '\n');
