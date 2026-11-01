import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { patchSDK } from './patch-sdk.mjs';

const app = resolve(dirname(fileURLToPath(import.meta.url)), '../app');
const sdk = resolve(app, '../../tooling/exact2');
export const revision = '4e9000abbdaa8315ae864cdb8253af143aac510c';
const bun = process.env.BUN || (process.env.npm_execpath?.endsWith('/bun') ? process.env.npm_execpath : 'bun');
function run(command, args, options = {}) {
  const r = spawnSync(command, args, { cwd: app, encoding: 'utf8', ...options });
  if (r.error || r.status !== 0) throw new Error(`${command} failed: ${r.error?.message || r.stderr || r.status}`);
  return r.stdout?.trim();
}

export function buildArgs(mode, args) {
  if (!['local', 'archive', 'unsigned'].includes(mode)) throw new Error('Use check, local, archive or unsigned.');
  if (mode === 'local') {
    if (args.length && (args.length !== 2 || args[0] !== '--phone' || !args[1])) throw new Error('local accepts only --phone <name-or-UDID>');
    return ['app-apple', '--device', '--release', '--run', ...args];
  }
  if (args.length) throw new Error('Archive output is app/artifacts/jera.ipa; no extra arguments.');
  return ['app-apple', '--device', '--archive', resolve(app, 'artifacts/jera.ipa'), ...(mode === 'unsigned' ? ['--unsigned'] : [])];
}

function main() {
  const [mode = 'check', ...args] = process.argv.slice(2);
  const origin = process.env.EXACT_BACKEND_ORIGIN || 'https://snapback.jera.ink';
  if (origin !== 'https://snapback.jera.ink') throw new Error('Phone builds require https://snapback.jera.ink. Local web tests use loopback separately.');
  if (!existsSync(resolve(sdk, 'scripts/app.mjs'))) throw new Error('Run git submodule update --init tooling/exact2 from the repository root.');
  if (run('git', ['-C', sdk, 'rev-parse', 'HEAD']) !== revision) throw new Error('Exact checkout differs from the pinned Jera revision.');
  if (run(bun, ['--version']) !== '1.4.2') throw new Error('Use Bun 1.4.2; BUN can name its executable.');
  if (process.platform !== 'darwin') throw new Error('iPhone builds require macOS with Xcode.');
  console.log(`Exact ${revision}; backend ${origin}`);
  console.log(run('xcrun', ['--sdk', 'iphoneos', '--show-sdk-version']));
  const targets = run('rustup', ['target', 'list', '--installed', '--toolchain', '1.97.0']);
  const identities = run('security', ['find-identity', '-v', '-p', 'codesigning']);
  const problems = [];
  if (!targets.split('\n').includes('aarch64-apple-ios')) problems.push('rustup target add --toolchain 1.97.0 aarch64-apple-ios');
  if (!/[A-F0-9]{40}/.test(identities) && mode !== 'unsigned') problems.push('Install an Apple signing certificate/private key and a provisioning profile covering studio.zojer.jera.exact and your phone.');
  if (mode === 'archive' && (!process.env.EXACT_IDENTITY || !process.env.EXACT_PROFILE)) problems.push('Set EXACT_IDENTITY and EXACT_PROFILE for the signed archive.');
  if (problems.length) throw new Error(problems.join('\n'));
  if (mode === 'check') { console.log('Toolchain and signing identity found. The build will validate the selected phone and profile.'); return; }
  const nativeArgs = buildArgs(mode, args);
  patchSDK(sdk);
  // A fresh checkout has neither generated API types nor the device wasm.
  // Build the device first; schema check deliberately refuses a missing device.
  run(bun, ['exact.mjs', 'snapback', '--rebuild', '--artifact-only'], { stdio: 'inherit' });
  run(bun, ['run', 'check'], { cwd: resolve(app, '..'), stdio: 'inherit' });
  mkdirSync(resolve(app, 'artifacts'), { recursive: true });
  run(bun, [resolve(sdk, 'host/apple/build.mjs'), ...nativeArgs], {
    cwd: sdk, stdio: 'inherit', env: { ...process.env, EXACT_APP_DIR: app, EXACT_BACKEND_ORIGIN: origin },
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
