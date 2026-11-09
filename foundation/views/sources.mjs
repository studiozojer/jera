import { constants } from 'node:fs';
import { open, readdir, realpath, lstat } from 'node:fs/promises';
import { resolve, join, relative, extname, isAbsolute, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { JeraClient } from '../scripts/client.mjs';
import { postEnvelope } from '../contracts/records.mjs';
import { digest, fields } from './definition.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const sameFile = (a, b) => a.ino === b.ino && a.dev === b.dev && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;
export const recordKey = (source, id) => JSON.stringify([source, id]);
export function sourceBinding(binding) {
  if (binding?.type === 'snapback') {
    fields(binding, ['type', 'origin', 'principal', 'tokenEnv']);
    const client = new JeraClient(binding.origin);
    if (binding.origin !== client.origin || !/^did:(plc|web):\S+$/.test(binding.principal) || !/^[A-Z][A-Z0-9_]{0,79}$/.test(binding.tokenEnv)) throw new Error('Invalid Snapback binding.');
  } else if (binding?.type === 'folder') {
    fields(binding, ['type', 'root']);
    if (typeof binding.root !== 'string' || !isAbsolute(binding.root) || resolve(binding.root) !== binding.root) throw new Error('Folder requires an explicit absolute root.');
  } else throw new Error('Unsupported source adapter.');
  return binding;
}
export const bindingScope = binding => digest(binding.type === 'snapback'
  ? { type: binding.type, origin: binding.origin, principal: binding.principal }
  : { type: binding.type, root: binding.root });

export async function snapbackSnapshot(source, binding, env = process.env) {
  const token = env[binding.tokenEnv];
  if (!token) throw new Error('Missing source credential.');
  const client = new JeraClient(binding.origin, token);
  const identity = async () => {
    const result = await client.query('currentIdentity');
    if (!result.complete || result.data?.did !== binding.principal) throw new Error('Source identity does not match its binding.');
  };
  await identity();
  const records = [], cursors = new Set(), ids = new Set(); let c = null;
  do {
    const page = await client.query('postsList', { c });
    if (!Array.isArray(page.data) || !page.complete) throw new Error('Incomplete source page.');
    for (const raw of page.data) {
      if (ids.has(raw.id) || records.length >= 1000) throw new Error('Source scan exceeded its bound or repeated a record.');
      ids.add(raw.id);
      const record = postEnvelope(raw);
      records.push({ key: recordKey(source, record.id), source, id: record.id, revision: digest(record),
        at: record.at, deleted: record.deleted, parent: record.parent ? recordKey(source, record.parent) : null,
        lexicon: record.lexicon ? { ref: record.lexicon, digest: record.lexiconDigest } : null,
        access: { type: 'snapback', principal: binding.principal, audience: record.audience, visibility: record.visibility },
        record });
    }
    c = page.next || null;
    if (c && cursors.has(c)) throw new Error('Repeated source cursor.');
    if (c) cursors.add(c);
  } while (c);
  await identity();
  return records;
}

export async function folderSnapshot(source, binding) {
  const root = binding.root, canonical = await realpath(root);
  if (canonical !== root || !(await lstat(root)).isDirectory()) throw new Error('Folder root must be a real directory, without symlinks.');
  const records = []; let entries = 0, bytes = 0;
  async function walk(directory, depth) {
    if (depth > 16) throw new Error('Folder nesting exceeds scan bound.');
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      if (++entries > 4000) throw new Error('Folder exceeds entry bound.');
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Folder scan refuses symlinks.');
      if (entry.isDirectory()) { await walk(path, depth + 1); continue; }
      if (!entry.isFile() || !['.md', '.yao', '.txt'].includes(extname(entry.name))) continue;
      if (records.length >= 1000 || await realpath(path) !== path) throw new Error('Folder exceeds file bound or changed paths.');
      const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const before = await file.stat();
        if (!before.isFile() || before.size > 262144 || bytes + before.size > 8388608) throw new Error('Folder exceeds content bound.');
        // Bound the read even if a writer grows the file after stat().
        const buffer = Buffer.alloc(262145); let length = 0;
        while (length < buffer.length) {
          const read = await file.read(buffer, length, buffer.length - length, null);
          if (!read.bytesRead) break;
          length += read.bytesRead;
        }
        if (length > 262144 || length !== before.size || !sameFile(before, await file.stat()) || !sameFile(before, await lstat(path)) || await realpath(path) !== path) throw new Error('File changed during scan.');
        bytes += length;
        const contents = buffer.subarray(0, length), body = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(contents);
        const id = relative(root, path).split(sep).join('/');
        records.push({ key: recordKey(source, id), source, id, revision: sha(contents), at: before.mtimeMs,
          deleted: false, parent: null, lexicon: null, access: { type: 'local', scope: bindingScope(binding) },
          record: { kind: 'file-observation', path: id, body } });
      } finally { await file.close(); }
    }
  }
  await walk(root, 0);
  if (await realpath(root) !== canonical) throw new Error('Folder moved during scan.');
  return records;
}
