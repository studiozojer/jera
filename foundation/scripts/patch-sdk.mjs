import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function patchSDK(sdk) {
  const patch = fileURLToPath(new URL('../patches/exact2-xcode26.patch', import.meta.url));
  const git = args => spawnSync('git', ['-C', sdk, 'apply', ...args, patch], { encoding: 'utf8' });
  if (git(['--reverse', '--check']).status === 0) return;
  const check = git(['--check']);
  if (check.status !== 0) throw new Error('Exact compatibility patch does not match this checkout; review SDK drift before building.');
  const result = git([]);
  if (result.status !== 0) throw new Error(`Cannot apply Exact compatibility patch: ${result.stderr}`);
  console.log('Applied the recorded Exact Xcode 26 compatibility patch.');
}
