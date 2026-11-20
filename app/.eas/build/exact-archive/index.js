// Standalone EAS function: Node builtins only, no compilation or npm install needed.
// Credentials arrive as typed inputs, never as interpolated shell source.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomBytes } = require('node:crypto');

exports.default = async function exactArchive(ctx, { inputs } = {}) {
  const unsigned = process.env.JERA_APPDROP_UNSIGNED === '1';
  const credentials = Object.values(inputs?.credentials?.value || {});
  if (!unsigned && (credentials.length !== 1 || !credentials[0].provisioningProfileBase64 || !credentials[0].distributionCertificate?.dataBase64)) {
    throw new Error('Expected one EAS-managed iOS signing target for studio.zojer.jera.exact.');
  }
  // EAS passes the checkout root as ctx.workingDirectory on its worker.
  // Anchor to this checked-in function so the app subdirectory is unambiguous.
  const app = path.resolve(__dirname, '../../..');
  const sdk = path.resolve(app, '../tooling/exact');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'jera-signing-'));
  fs.chmodSync(temp, 0o700);
  const keychain = path.join(temp, 'build.keychain-db');
  const profile = path.join(temp, 'app.mobileprovision');
  const certificate = path.join(temp, 'certificate.p12');
  const keychainPassword = randomBytes(32).toString('hex');
  const env = { ...process.env, PATH: `${path.join(os.homedir(), '.cargo/bin')}:${process.env.PATH}`, CARGO_NET_GIT_FETCH_WITH_CLI: 'true' };
  function run(command, args, { quiet = false, cwd = app, input } = {}) {
    const result = spawnSync(command, args, { cwd, env, encoding: 'utf8', input, stdio: quiet ? 'pipe' : ['pipe', 'inherit', 'inherit'] });
    // Never include argument lists or captured security output in errors.
    if (result.error || result.status !== 0) throw new Error(`${command} failed (${result.status ?? 'spawn'}).`);
    return result.stdout?.trim();
  }
  const originalKeychains = run('security', ['list-keychains', '-d', 'user'], { quiet: true }).match(/"([^"]+)"/g)?.map(s => s.slice(1, -1)) || [];
  let created = false;
  try {
    const { revision } = await import(require('node:url').pathToFileURL(path.resolve(app, '../scripts/ios.mjs')).href);
    // EAS may upload submodule files without usable Git metadata. Rehydrate
    // this disposable builder checkout from the pin, never from an outer HEAD.
    fs.rmSync(sdk, { recursive: true, force: true });
    fs.mkdirSync(sdk, { recursive: true });
    run('git', ['init', sdk]);
    run('git', ['-C', sdk, 'fetch', '--depth=1', 'https://github.com/expo/exact.git', revision]);
    run('git', ['-C', sdk, 'checkout', '--detach', 'FETCH_HEAD']);
    if (run('git', ['-C', sdk, 'rev-parse', 'HEAD'], { quiet: true }) !== revision) throw new Error('Unexpected Exact revision.');
    if (!fs.existsSync(path.join(os.homedir(), '.cargo/bin/rustup'))) {
      const installer = path.join(temp, 'rustup.sh');
      run('curl', ['--fail', '--silent', '--show-error', '--proto', '=https', '--tlsv1.2', 'https://sh.rustup.rs', '-o', installer]);
      run('sh', [installer, '-y', '--profile', 'minimal', '--default-toolchain', 'none']);
    }
    run('rustup', ['toolchain', 'install', '1.99.1', '--profile', 'minimal']);
    run('rustup', ['target', 'add', '--toolchain', '1.99.1', 'aarch64-apple-ios', 'wasm32-unknown-unknown']);
    run('bun', ['install', '--frozen-lockfile'], { cwd: sdk });
    run('bun', ['install', '--frozen-lockfile'], { cwd: path.resolve(app, '..') });
    const hermes = 'vendor/ibex/crates/hermes-lean-sys-installer/Cargo.toml';
    run('cargo', ['run', '--locked', '--manifest-path', hermes, '--', '--target', 'aarch64-apple-ios'], { cwd: sdk });
    if (unsigned) {
      run('node', ['../scripts/ios.mjs', 'unsigned']);
      return;
    }
    fs.writeFileSync(profile, Buffer.from(credentials[0].provisioningProfileBase64, 'base64'), { mode: 0o600 });
    fs.writeFileSync(certificate, Buffer.from(credentials[0].distributionCertificate.dataBase64, 'base64'), { mode: 0o600 });
    const plist = run('security', ['cms', '-D', '-i', profile], { quiet: true });
    const info = JSON.parse(run('python3', ['-c', 'import sys,plistlib,json,hashlib; p=plistlib.loads(sys.stdin.buffer.read()); print(json.dumps({"app":p["Entitlements"]["application-identifier"],"certs":[hashlib.sha1(c).hexdigest().upper() for c in p["DeveloperCertificates"]]}))'], { quiet: true, input: plist }));
    if (!info.app.endsWith('.studio.zojer.jera.exact')) throw new Error('Provisioning profile belongs to a different app.');
    run('security', ['create-keychain', '-p', keychainPassword, keychain], { quiet: true });
    created = true;
    run('security', ['set-keychain-settings', '-lut', '21600', keychain], { quiet: true });
    run('security', ['unlock-keychain', '-p', keychainPassword, keychain], { quiet: true });
    run('security', ['import', certificate, '-k', keychain, '-P', credentials[0].distributionCertificate.password, '-T', '/usr/bin/codesign', '-T', '/usr/bin/security'], { quiet: true });
    run('security', ['set-key-partition-list', '-S', 'apple-tool:,apple:,codesign:', '-s', '-k', keychainPassword, keychain], { quiet: true });
    run('security', ['list-keychains', '-d', 'user', '-s', ...originalKeychains, keychain], { quiet: true });
    const identities = run('security', ['find-identity', '-v', '-p', 'codesigning', keychain], { quiet: true });
    env.EXACT_IDENTITY = info.certs.find(sha => identities.includes(sha));
    if (!env.EXACT_IDENTITY) throw new Error('Imported certificate does not match the provisioning profile.');
    env.EXACT_PROFILE = profile;
    ctx.logger.info('Signing Jera with the EAS-managed identity.');
    run('node', ['../scripts/ios.mjs', 'archive']);
  } finally {
    try {
      if (created) {
        run('security', ['list-keychains', '-d', 'user', '-s', ...originalKeychains], { quiet: true });
        run('security', ['delete-keychain', keychain], { quiet: true });
      }
    } finally { fs.rmSync(temp, { recursive: true, force: true }); }
  }
};
