import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { JeraClient, intentId } from '../scripts/client.mjs';

const root = new URL('../', import.meta.url).pathname;
const cli = resolve(root, 'node_modules/.bin/snapback4');
async function start(dir, extra = []) {
  const child = spawn(cli, ['dev', '--port', '0', '--no-watch', ...extra], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '', stdout = '';
  child.stderr.on('data', data => { stderr += data; });
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error(`Server readiness timeout: ${stderr}`)); }, 30_000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited ${code}: ${stderr}`)); });
    child.stdout.on('data', data => {
      stdout += data;
      const match = stdout.match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match) { clearTimeout(timer); resolve(match[0]); }
    });
  });
  return { url, async stop() { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; } };
}
async function account(origin, email) {
  const anonymous = new JeraClient(origin);
  const { session } = await anonymous.request('/auth/signup', { email, password: 'jera integration correct horse battery' });
  assert.ok(session?.token, 'real server must issue a password session');
  return { principal: session.principal, client: new JeraClient(origin, session.token) };
}
async function denied(promise, code) { await assert.rejects(promise.then(result => { throw Object.assign(new Error(JSON.stringify(result)), { code: 'UNEXPECTED_SUCCESS' }); }), error => { assert.equal(error.code, code, error.message); return true; }); }
const rows = response => response.data;

test('real Snapback: capture, organize, query, isolate, replay and recover', { timeout: 120_000 }, async t => {
  const dir = await mkdtemp(resolve(tmpdir(), 'jera-foundation-'));
  await mkdir(resolve(dir, 'snapback'));
  await copyFile(resolve(root, 'snapback/schema.q'), resolve(dir, 'snapback/schema.q'));
  let server;
  t.after(async () => { if (server) await server.stop(); await rm(dir, { recursive: true, force: true }); });
  server = await start(dir);
  const alice = await account(server.url, 'alice@jera.test');
  const operator = await account(server.url, 'operator@jera.test');
  const reader = await account(server.url, 'reader@jera.test');
  const outsider = await account(server.url, 'outsider@jera.test');
  const a = alice.client, op = operator.client, r = reader.client, out = outsider.client;
  const first = (await a.mutate('createArmillary', { name: 'Studio' })).result;
  const second = (await a.mutate('createArmillary', { name: 'Independent armillary' })).result;
  assert.notEqual(first.id, second.id);
  const mod = (await a.mutate('createModule', { armillary: first.id, name: 'Jera ideas' })).result;
  const privateMod = (await a.mutate('createModule', { armillary: second.id, name: 'Private ideas' })).result;
  await a.mutate('setMember', { module: mod.id, principal: operator.principal, access: 'write' });
  await a.mutate('setMember', { module: mod.id, principal: reader.principal, access: 'read' });
  assert.equal(rows(await op.query('armillariesList', {})).length, 1);
  assert.deepEqual(rows(await out.query('armillariesList', {})), []);
  const original = 'A tentative idea\n:virgo: ♍ ♍︎ ♍️ ᛃ — keep each form.\n  whitespace matters  ';
  const args = { module: mod.id, body: original, source: 'https://example.test/original' };
  const writeId = intentId();
  const artifact = (await a.mutate('capture', args, writeId)).result;
  await a.mutate('capture', args, writeId);
  assert.equal(rows(await a.query('artifactsList', { module: mod.id })).length, 1, 'retry must not duplicate the source');
  assert.equal(rows(await r.query('artifactsList', { module: mod.id }))[0].body, original);
  assert.deepEqual(rows(await out.query('artifactsList', { module: mod.id })), []);
  assert.deepEqual(rows(await op.query('modulesList', { armillary: second.id })), []);
  await denied(r.mutate('capture', args), 'E_RULE');
  await denied(op.mutate('capture', { ...args, module: privateMod.id }), 'E_RULE');
  const task = rows(await op.query('tasksList', { module: mod.id }))[0];
  assert.equal(task.artifact, artifact.id);
  await denied(r.mutate('claim', { task: task.id }), 'E_RULE');
  const claims = await Promise.allSettled([op.mutate('claim', { task: task.id }), a.mutate('claim', { task: task.id })]);
  assert.equal(claims.filter(x => x.status === 'fulfilled').length, 1, 'one worker wins a concurrent claim');
  assert.equal(claims.filter(x => x.status === 'rejected')[0].reason.code, 'NOT_AVAILABLE');
  const winner = claims[0].status === 'fulfilled' ? op : a;
  const loser = winner === op ? a : op;
  await denied(loser.mutate('complete', { task: task.id, title: 'Wrong worker', body: 'Not my claim' }), 'NOT_CLAIMED');
  const node = (await winner.mutate('complete', { task: task.id, title: 'Symbol-aware idea capture', body: 'Investigate exact representation; this is a suggestion.' })).result;
  assert.equal(node.artifact, artifact.id);
  assert.equal(node.author, winner === op ? operator.principal : alice.principal);
  assert.equal(rows(await a.query('artifactsList', { module: mod.id }))[0].body, original);
  assert.equal(rows(await a.query('tasksList', { module: mod.id }))[0].status, 'done');
  await denied(winner.mutate('claim', { task: task.id }), 'NOT_AVAILABLE');
  // Loss of membership must also remove visibility from indexes and work queues.
  await a.mutate('removeMember', { module: mod.id, principal: operator.principal });
  for (const query of ['artifactsList', 'nodesList', 'tasksList', 'edgesList']) assert.deepEqual(rows(await op.query(query, { module: mod.id })), []);
  await a.mutate('setMember', { module: mod.id, principal: operator.principal, access: 'write' });
  const other = (await a.mutate('capture', { ...args, body: 'A second idea' })).result;
  const next = rows(await op.query('tasksList', { module: mod.id })).find(x => x.artifact === other.id);
  await op.mutate('claim', { task: next.id });
  await server.stop(); server = null;
  server = await start(dir, ['--clock-offset', '+6m']);
  for (const c of [a, op, r, out]) c.origin = server.url;
  assert.equal(rows(await a.query('nodesList', { module: mod.id }))[0].id, node.id, 'graph survives a server restart');
  await a.mutate('claim', { task: next.id });
  await denied(op.mutate('complete', { task: next.id, title: 'Late worker', body: 'Stale lease' }), 'NOT_CLAIMED');
  const otherNode = (await a.mutate('complete', { task: next.id, title: 'Second idea', body: 'Connected after recovery' })).result;
  const edge = (await a.mutate('connect', { source: node.id, target: otherNode.id, relation: 'relates', reason: 'Both concern capture' })).result;
  assert.equal(edge.author, alice.principal);
  assert.equal(rows(await r.query('edgesList', { module: mod.id })).length, 1);
  await denied(r.mutate('connect', { source: node.id, target: otherNode.id, relation: 'supports', reason: 'Read-only member' }), 'E_RULE');
  // A read/write grant may be narrowed without changing the original artifact.
  await a.mutate('setMember', { module: mod.id, principal: operator.principal, access: 'read' });
  await denied(op.mutate('capture', args), 'E_RULE');
  assert.equal(rows(await op.query('nodesList', { module: mod.id })).length, 2);
});
