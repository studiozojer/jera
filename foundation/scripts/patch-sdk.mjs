import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function patchSDK(sdk) {
  for (const name of ['exact2-xcode26.patch', 'exact2-auth-popup-coop.patch']) {
    const patch = fileURLToPath(new URL(`../patches/${name}`, import.meta.url));
    const git = args => spawnSync('git', ['-C', sdk, 'apply', ...args, patch], { encoding: 'utf8' });
    if (git(['--reverse', '--check']).status === 0) continue;
    const check = git(['--check']);
    if (check.status !== 0) throw new Error(`Exact compatibility patch ${name} does not match this checkout; review SDK drift before building.`);
    const result = git([]);
    if (result.status !== 0) throw new Error(`Cannot apply Exact compatibility patch ${name}: ${result.stderr}`);
    console.log(`Applied recorded Exact compatibility patch: ${name}`);
  }
}
