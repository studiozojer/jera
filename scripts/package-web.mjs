// Publish Exact's public-file inventory, never its .gen source/build scratch.
import { readFile, mkdir, copyFile, lstat, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const [sourceArg, outputArg] = process.argv.slice(2);
if (!sourceArg || !outputArg) throw new Error('Usage: node scripts/package-web.mjs <web-build-output> <new-public-directory>');
const source = resolve(sourceArg), output = resolve(outputArg);
const receipt = JSON.parse(await readFile(resolve(source, '.exact-build.json'), 'utf8'));
if (receipt.inputs?.EXACT_BACKEND_ORIGIN !== 'https://snapback.jera.ink') throw new Error('Expected a production-origin web build');
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
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
await writeFile(resolve(output, 'release.json'), JSON.stringify({ commit, backend: 'https://snapback.jera.ink', files: hashes }, null, 2) + '\n');
console.log(`Packaged ${hashes.length} public files from ${commit}; build scratch excluded.`);
