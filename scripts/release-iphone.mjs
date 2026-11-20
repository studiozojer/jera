import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const link = 'https://appdrop.app/d/vyau9rfizz';
const bundleId = 'studio.zojer.jera.exact';
const backend = 'https://snapback.jera.ink';
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const checksum = path => createHash('sha256').update(readFileSync(path)).digest('hex');

export function verifyWeb(manifest, commit) {
  assert.equal(manifest.commit, commit, 'Publish the matching web release before the iPhone update.');
  assert.equal(manifest.backend, backend, 'The web release must use the Jera production gateway.');
}

export function publicReceipt(result, candidate) {
  assert.equal(result.updated, true, 'AppDrop did not confirm an update.');
  assert.equal(result.url, link, 'AppDrop returned an unexpected destination.');
  assert.equal(result.bundleId, bundleId);
  assert.equal(String(result.version), candidate.buildNumber);
  assert.ok(Number.isSafeInteger(result.revision) && result.revision > 1, 'Missing AppDrop revision.');
  // AppDrop also returns its private manage key. Keep only the public fields.
  return { ...candidate, url: link, revision: result.revision };
}

async function main(mode) {
  if (!['prepare', 'publish'].includes(mode) || process.argv.length !== 3)
    throw new Error('Usage: bun run release:iphone prepare|publish');
  const commit = git('rev-parse', 'HEAD');
  const parent = join(root, '.local', 'appdrop');
  const dir = join(parent, commit);
  const ipa = 'Jera.ipa';
  if (mode === 'prepare' && !existsSync(dir)) {
    assert.equal(git('status', '--porcelain', '--ignore-submodules=dirty'), '', 'Commit the release checkout before building.');
    assert.equal(git('rev-parse', '--is-shallow-repository'), 'false', 'Fetch full history to assign a stable build number.');
    const buildNumber = git('rev-list', '--first-parent', '--count', 'HEAD');
    mkdirSync(parent, { recursive: true });
    const stage = mkdtempSync(join(parent, 'preparing-'));
    try {
      const archive = join(stage, ipa);
      execFileSync(process.execPath, [join(root, 'scripts/ios.mjs'), 'unsigned'], {
        cwd: root, stdio: 'inherit', env: { ...process.env, EXACT_BUILD_NUMBER: buildNumber, JERA_IOS_ARCHIVE: archive },
      });
      const plist = execFileSync('unzip', ['-p', archive, 'Payload/Jera.app/Info.plist']);
      const field = name => execFileSync('plutil', ['-extract', name, 'raw', '-o', '-', '-'], { input: plist, encoding: 'utf8' }).trim();
      assert.equal(field('CFBundleIdentifier'), bundleId);
      assert.equal(field('CFBundleVersion'), buildNumber);
      assert.equal(git('rev-parse', 'HEAD'), commit, 'The checkout changed while building.');
      writeFileSync(join(stage, 'candidate.json'), JSON.stringify({ commit, buildNumber, sha256: checksum(archive) }, null, 2) + '\n');
      renameSync(stage, dir);
    } finally {
      rmSync(stage, { recursive: true, force: true });
    }
  }
  if (!existsSync(dir)) throw new Error('Run prepare for this release first.');
  const candidate = json(join(dir, 'candidate.json'));
  assert.equal(candidate.commit, commit);
  assert.equal(checksum(join(dir, ipa)), candidate.sha256, 'The prepared IPA changed.');
  if (mode === 'prepare') return console.log('Ready:', dir);
  const receipt = join(dir, 'published.json');
  if (existsSync(receipt)) return console.log('Already published:', json(receipt).url);
  const response = await fetch('https://jera.ink/release.json', { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('Could not verify the current Jera web release.');
  verifyWeb(await response.json(), commit);
  const upload = spawnSync('npx', ['--yes', 'appdrop@0.9.0', join(dir, ipa), '--update', link, '--json',
    '--label', 'Jera ' + commit.slice(0, 7)], { encoding: 'utf8', env: { ...process.env, APPDROP_ORIGIN: 'https://appdrop.app' } });
  if (upload.status !== 0) {
    let code;
    try { code = JSON.parse(upload.stdout).code; } catch { /* CLI or transport failure */ }
    const detail = typeof code === 'string' && /^[a-z_]{1,60}$/.test(code) ? ' (' + code + ')' : '';
    throw new Error('AppDrop update was not confirmed' + detail + '. Check the current link revision and publishing credentials before retrying.');
  }
  let result;
  try { result = JSON.parse(upload.stdout); } catch { throw new Error('Unreadable AppDrop receipt. Check the update on the install link.'); }
  const published = publicReceipt(result, candidate);
  const pending = receipt + '.' + process.pid;
  writeFileSync(pending, JSON.stringify(published, null, 2) + '\n');
  renameSync(pending, receipt);
  console.log('Published revision', published.revision, 'at', link);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv[2]).catch(error => { console.error(error.message); process.exitCode = 1; });
}
