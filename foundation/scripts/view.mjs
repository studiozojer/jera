#!/usr/bin/env node
import { readFile, open, rename, unlink, realpath } from 'node:fs/promises';
import { resolve, dirname, basename, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { evaluateView } from '../views/evaluate.mjs';

// One read-only observation. The checkpoint contains identities/digests only;
// private content is emitted to this caller, never stored in the checkpoint.
async function main() {
  if (process.argv.length !== 5) throw new Error('Usage: node scripts/view.mjs view.json local-bindings.json checkpoint.json');
  const [viewFile, bindingFile, target] = process.argv.slice(2);
  const definition = JSON.parse(await readFile(viewFile, 'utf8')), config = JSON.parse(await readFile(bindingFile, 'utf8'));
  const path = join(await realpath(dirname(resolve(target))), basename(target)), lock = path + '.lock';
  const handle = await open(lock, 'wx', 0o600);
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    let previous = null;
    try { previous = JSON.parse(await readFile(path, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const result = await evaluateView(definition, config, previous);
    const file = await open(temporary, 'wx', 0o600);
    try { await file.writeFile(JSON.stringify(result.checkpoint)); await file.sync(); } finally { await file.close(); }
    await rename(temporary, path);
    process.stdout.write(JSON.stringify(result.output) + '\n');
  } finally {
    await handle.close(); await unlink(lock);
    await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
}
main().catch(() => { console.error('View observation failed. Check the definition, bindings, checkpoint and lock; no content was published.'); process.exitCode = 1; });
