// Publish Exact's public-file inventory, never its .gen source/build scratch.
import { readFile, mkdir, copyFile, lstat, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const [sourceArg, outputArg] = process.argv.slice(2);
if (!sourceArg || !outputArg) throw new Error('Usage: node scripts/package-web.mjs <web-build-output> <new-public-directory>');
const source = resolve(sourceArg), output = resolve(outputArg);
const receiptBytes = await readFile(resolve(source, '.exact-build.json'));
const receipt = JSON.parse(receiptBytes);
const built = JSON.parse(await readFile(resolve(source, 'jera-build.json')));
if (!receipt.release || built.origin !== 'https://snapback.jera.ink' ||
    createHash('sha256').update(receiptBytes).digest('hex') !== built.receipt) throw new Error('Expected a production-origin release receipt.');
const commit = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: new URL('..', import.meta.url), encoding:'utf8'}).trim();
if (commit !== built.commit) throw new Error('Package the web build from its original checkout revision.');
const files = [...receipt.files, ...['.exact/auth/callback', '.exact/auth/callback.js'].map(name => ({ name }))];
await mkdir(output); // Refuse to mix releases or overwrite an existing directory.
const hashes = [];
for (const file of files) {
  if (!file.name || file.name.startsWith('/') || file.name.split('/').some(part => !part || part === '..' || part === '.')) throw new Error('Unsafe artifact path');
  if (file.name.startsWith('.') && !['.exact/auth/callback', '.exact/auth/callback.js'].includes(file.name)) throw new Error('Unexpected private artifact');
  const path = resolve(source, file.name), target = resolve(output, file.name);
  if (!(await lstat(path)).isFile()) throw new Error('Artifact must be a regular file');
  const data = await readFile(path), sha256 = createHash('sha256').update(data).digest('hex');
  if (file.sha256 && (sha256 !== file.sha256 || data.length !== file.bytes)) throw new Error('Artifact changed after build: ' + file.name);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(path, target);
  hashes.push({ name: file.name, sha256, bytes: data.length });
}
const routes = JSON.parse(await readFile(resolve(source, 'routes.json')));
const entry = routes.files['app.js'];
if (!/^app-[\w-]+\.js$/.test(entry)) throw new Error('Unexpected web entry');
const bootstrap = await readFile(new URL('./web-upgrade.mjs', import.meta.url), 'utf8');
const start = bootstrap + '\ntry { await upgradeBrowserStore(); await import(' + JSON.stringify('./' + entry) +
  '); } catch (error) { document.body.textContent = "Jera could not open its local data. Reload to try again."; throw error; }\n';
await writeFile(resolve(output, 'jera-start.js'), start);
hashes.push({name:'jera-start.js', bytes:Buffer.byteLength(start), sha256:createHash('sha256').update(start).digest('hex')});
for (const file of hashes.filter(file => ['index.html','shell.html'].includes(file.name))) {
  const path = resolve(output,file.name);
  const html = await readFile(path,'utf8');
  const before = 'data-entry src="./' + entry + '"';
  if (!html.includes(before)) throw new Error('Missing Exact entry in ' + file.name);
  const next = html.replace(before, 'data-entry src="./jera-start.js"');
  await writeFile(path,next);
  file.bytes = Buffer.byteLength(next);
  file.sha256 = createHash('sha256').update(next).digest('hex');
}
await writeFile(resolve(output, 'release.json'), JSON.stringify({ commit, backend: 'https://snapback.jera.ink', files: hashes }, null, 2) + '\n');
console.log(`Packaged ${hashes.length} public files from ${commit}; build scratch excluded.`);
