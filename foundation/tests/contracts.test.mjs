import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, appendFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawn, execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { JeraClient, intentId } from '../scripts/client.mjs';
import { createHandler } from '../auth/service.mjs';
import { lexicons, validateRecord } from '../contracts/registry.mjs';
import { checkSchema, validatePayload } from '../contracts/validate.mjs';

const root = new URL('../', import.meta.url).pathname;
const cli = resolve(root, 'node_modules/.bin/snapback4');
const definition = lexicons[0];
const lexicon = { ref: definition.ref, digest: definition.digest };
const payload = { purpose: 'reflect', body: '  ♍︎ ♍️ :virgo: ᛃ\nKeep my wording.  ', references: [{ uri: 'repo:notes/one.yao', revision: 'abc123' }] };

test('published lexicon stays immutable; the bounded vocabulary rejects invalid data without coercion', () => {
  assert.equal(definition.digest, 'a845f54580e5dbd575299d04fdffa21c464d50ba1639d53783fb6676be8f1b9e', 'changing a published definition requires a new version');
  assert.deepEqual(JSON.parse(validateRecord(lexicon, payload).payloadJson), payload);
  for (const bad of [null, [], { ...payload, purpose: 'execute' }, { ...payload, body: '  ' }, { ...payload, body: 1 },
    { ...payload, references: null }, { ...payload, references: Array(17).fill({ uri: 'x' }) }, { ...payload, references: [{ uri: '' }] },
    { ...payload, references: [{ uri: 'x', authority: 'admin' }] }, { ...payload, extra: true }, { purpose: 'reflect', body: 'missing references' }])
    assert.throws(() => validateRecord(lexicon, bad), { code: 'INVALID_PAYLOAD' });
  assert.throws(() => validateRecord({ ...lexicon, ref: 'contribution.v2' }, payload), { code: 'UNKNOWN_LEXICON' });
  assert.throws(() => validateRecord({ ...lexicon, digest: '0'.repeat(64) }, payload), { code: 'LEXICON_CHANGED' });
  assert.throws(() => checkSchema({ type: 'string', maxLength: 20, pattern: '.*' }), /Unsupported lexicon keyword/);
  // A definition can add a supported field without changing the validator or
  // post table. Its old version still rejects that field.
  const next = structuredClone(definition.definition.schema);
  next.properties.topic = { type: 'string', maxLength: 80 };
  checkSchema(next);
  validatePayload(next, { ...payload, topic: 'Experiment' });
  assert.throws(() => validateRecord(lexicon, { ...payload, topic: 'Experiment' }), { code: 'INVALID_PAYLOAD' });
});

async function start(dir) {
  const child = spawn(cli, ['dev', '--port', '0', '--no-watch'], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
  let error = '', output = '';
  child.stderr.on('data', chunk => { error += chunk; });
  const url = await new Promise((yes, no) => {
    const timer = setTimeout(() => { child.kill(); no(new Error(error || 'Server timed out')); }, 30000);
    child.once('error', e => { clearTimeout(timer); no(e); });
    child.once('exit', code => { clearTimeout(timer); no(new Error(`Server exited ${code}: ${error}`)); });
    child.stdout.on('data', chunk => {
      output += chunk; const match = output.match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match) { clearTimeout(timer); yes(match[0]); }
    });
  });
  return { url, async stop() { const done = once(child, 'exit'); child.kill(); await done; } };
}
const refused = (promise, code) => assert.rejects(promise, error => { assert.equal(error.code, code, error.message); return true; });

test('real store: legacy adoption, gateway validation, two audience kinds, attribution, replay, deletion and restart', { timeout: 120000 }, async t => {
  const dir = await mkdtemp(resolve(tmpdir(), 'jera-contracts-'));
  await mkdir(resolve(dir, 'snapback'));
  await copyFile(resolve(root, 'tests/fixtures/social-v1.q'), resolve(dir, 'snapback/schema.q'));
  let backend, gateway;
  t.after(async () => {
    if (gateway) await new Promise(done => gateway.close(done));
    await backend?.stop();
    await rm(dir, { recursive: true, force: true });
  });
  backend = await start(dir);
  const token = execFileSync(cli, ['token', '--service', 'atproto-auth'], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const service = new JeraClient(backend.url, token);
  const people = [];
  for (const letter of ['a', 'b', 'c', 'd']) {
    const did = 'did:plc:' + letter.repeat(24);
    const { session } = await service.request('/auth/session', { principal: did, days: 1 });
    people.push({ did, token: session.token, client: new JeraClient(backend.url, session.token) });
  }
  const [owner, operator, reader, outsider] = people;
  const oldAudience = (await owner.client.mutate('ensureAudience', {})).result;
  await owner.client.mutate('setAudienceMember', { audience: oldAudience.id, principal: operator.did, access: 'reply' });
  const oldIntent = intentId(), deviceKey = intentId();
  const oldArgs = { intent: oldIntent, body: 'Legacy original', visibility: 'private', audience: oldAudience.id, parent: null };
  const oldPost = (await owner.client.mutate('publishPost', oldArgs)).result;
  assert.equal((await owner.client.query('postById', { id: oldPost.id })).data.body, 'Legacy original', 'pre-upgrade row is readable');
  await owner.client.mutate('saveSocialDraft', { deviceKey, scope: 'root:private', body: 'Unpublished original', revision: 7 });

  await backend.stop(); backend = null;
  await copyFile(resolve(root, 'snapback/schema.q'), resolve(dir, 'snapback/schema.q'));
  // Exercise table authority independently of the public mutation, without
  // shipping these probe operations in the application schema.
  await appendFile(resolve(dir, 'snapback/schema.q'), `
mutation probeStructuredInsert(author: principal, intent: text 26..26, audience: audiences, payloadJson: text 1..65536):
  return insert posts { author, intent, audience, body: 'bypass', visibility: 'private', parent: null, root: null, lexicon: 'contribution.v1', lexiconDigest: '${lexicon.digest}', payloadJson }
mutation probePayloadPatch(id: posts, payloadJson: text 1..65536):
  update posts[id] { payloadJson }
  return null
mutation probeOwnerMember(audience: audiences, principal: principal):
  return insert audienceMembers { audience, principal, owner: viewer, access: 'reply' }
`);
  backend = await start(dir);
  service.origin = backend.url;
  for (const person of people) person.client.origin = backend.url;
  assert.equal((await owner.client.query('postById', { id: oldPost.id })).data.lexicon, null);
  assert.equal((await operator.client.query('postById', { id: oldPost.id })).data.body, 'Legacy original');
  assert.equal((await owner.client.query('audienceList')).data[0].kind, 'shared');
  assert.equal((await owner.client.query('draftForDevice', { deviceKey, scope: 'root:private' })).data.body, 'Unpublished original');
  assert.equal((await owner.client.mutate('publishPost', oldArgs)).result.id, oldPost.id, 'legacy intent survives adoption');

  let loseCommitResponse = false;
  async function openGateway() {
    // Simulated OAuth refresh only. Sessions, permission checks, storage and
    // the production HTTP handler are real; this is not a real-account proof.
    gateway = createServer(createHandler({ client: { restore: async did => ({ did }) }, store: {},
      publicOrigin: 'http://127.0.0.1', callbacks: [], snapbackOrigin: backend.url, serviceToken: token,
      fetcher: async (url, options) => {
        const response = await fetch(url, options);
        if (loseCommitResponse && url.endsWith('/m/commitStructuredPost')) {
          loseCommitResponse = false;
          await response.json(); // The write completed; its reply is lost.
          throw new Error('Synthetic lost upstream reply');
        }
        return response;
      } }));
    gateway.listen(0, '127.0.0.1'); await once(gateway, 'listening');
    const origin = `http://127.0.0.1:${gateway.address().port}`;
    for (const person of people) person.gateway = new JeraClient(origin, person.token);
    return origin;
  }
  const origin = await openGateway();
  const catalogResponse = await fetch(origin + '/records/lexicons', { headers: { authorization: `Bearer ${owner.token}` } });
  assert.equal(catalogResponse.status, 200);
  assert.deepEqual((await catalogResponse.json()).lexicons, lexicons);
  assert.equal((await fetch(origin + '/records/lexicons')).status, 401);
  assert.equal((await fetch(origin + '/records/lexicons', { headers: { origin: 'https://untrusted.test' } })).status, 403);

  const own = (await owner.client.mutate('createAudience', { name: 'Only me', kind: 'owner' })).result;
  const shared = (await owner.client.mutate('createAudience', { name: 'Studio', kind: 'shared' })).result;
  assert.notEqual(own.id, shared.id);
  assert.equal((await owner.client.mutate('createAudience', { name: 'Only me', kind: 'owner' })).result.id, own.id);
  await refused(owner.client.mutate('createAudience', { name: 'Only me', kind: 'shared' }), 'AUDIENCE_KIND_CONFLICT');
  await refused(owner.client.mutate('setAudienceMember', { audience: own.id, principal: operator.did, access: 'reply' }), 'OWNER_ONLY_AUDIENCE');
  await refused(owner.client.mutate('probeOwnerMember', { audience: own.id, principal: operator.did }), 'E_RULE');
  await owner.client.mutate('setAudienceMember', { audience: shared.id, principal: operator.did, access: 'reply' });
  await owner.client.mutate('setAudienceMember', { audience: shared.id, principal: reader.did, access: 'read' });
  assert(!(await operator.client.query('availableAudiences')).data.some(a => a.id === own.id));

  const envelope = { intent: intentId(), lexicon, audience: shared.id, parent: null, payload };
  const simpleDefinition=lexicons.find(l=>l.ref==='post.v1');
  assert.equal(simpleDefinition.digest,'357161d483360602f84ec47750d4f7cbcfa5d8ed6bcdb9d2a35fd97a5f1b2710','post.v1 is immutable');
  const simpleLexicon={ref:simpleDefinition.ref,digest:simpleDefinition.digest};
  const simple=(await owner.gateway.publishRecord({...envelope,intent:intentId(),lexicon:simpleLexicon,payload:{body:'A simple post ♍︎ ♍️'}})).result;
  assert.deepEqual((await owner.client.readRecord(simple.id)).payload,{body:'A simple post ♍︎ ♍️'});
  await refused(owner.gateway.publishRecord({...envelope,intent:intentId(),lexicon:simpleLexicon,payload:{body:'No purpose field',purpose:'request'}}),'INVALID_PAYLOAD');
  await owner.client.mutate('deletePost',{id:simple.id});
  const publish = (person, changes = {}) => person.gateway.publishRecord({ ...envelope, ...changes });
  await refused(publish(owner, { author: outsider.did }), 'E_INPUT');
  await refused(publish(owner, { payload: { ...payload, purpose: 'execute' } }), 'INVALID_PAYLOAD');
  await refused(publish(owner, { lexicon: { ...lexicon, ref: 'unknown.v1' } }), 'UNKNOWN_LEXICON');
  await refused(publish(owner, { lexicon: { ...lexicon, digest: 'f'.repeat(64) } }), 'LEXICON_CHANGED');
  await refused(publish(outsider), 'AUDIENCE_UNAVAILABLE');
  const raw = { author: owner.did, intent: envelope.intent, audience: shared.id, parent: null, lexicon: lexicon.ref, lexiconDigest: lexicon.digest, payloadJson: JSON.stringify(payload), body: payload.body };
  await refused(owner.client.mutate('commitStructuredPost', raw), 'RECORD_GATEWAY_REQUIRED');
  await refused(owner.client.mutate('probeStructuredInsert', { author: owner.did, intent: intentId(), audience: shared.id, payloadJson: JSON.stringify(payload) }), 'E_RULE');
  const structuredDevice = intentId();
  const draftArgs = { deviceKey: structuredDevice, scope: 'root:private', body: payload.body, compositionJson: JSON.stringify({ payload, lexicon }), revision: 3 };
  await owner.client.mutate('saveStructuredDraft', draftArgs);
  assert.equal((await outsider.client.query('draftForDevice', { deviceKey: structuredDevice, scope: 'root:private' })).data, null);
  const draftPost = { intent: intentId(), draft: { device: structuredDevice, scope: 'root:private', revision: 3 } };
  await publish(owner, draftPost);
  const tombstone = (await owner.client.query('draftForDevice', { deviceKey: structuredDevice, scope: 'root:private' })).data;
  assert.equal(tombstone.body, ''); assert.equal(tombstone.compositionJson, null); assert.equal(tombstone.revision, 4);
  const delayed = (await owner.client.mutate('saveStructuredDraft', draftArgs)).result;
  assert.equal(delayed.body, ''); assert.equal(delayed.compositionJson, null);
  await refused(publish(owner, { intent: intentId(), draft: { device: structuredDevice, scope: 'root:private', revision: -1 } }), 'E_INPUT');
  const before = Date.now();
  const posted = (await publish(owner)).result;
  assert.equal(posted.author, owner.did); assert(posted.at >= before && posted.at <= Date.now());
  assert.equal(posted.body, payload.body); assert.deepEqual(posted.payload, payload);
  assert.equal(posted.lexiconDigest, lexicon.digest);
  assert.equal((await publish(owner)).result.id, posted.id);
  assert.deepEqual((await owner.client.readRecord(posted.id)).payload, payload);
  assert.equal((await owner.client.readRecord(oldPost.id)).payload, null);
  assert.equal(await outsider.client.readRecord(posted.id), null);
  const reordered = { references: payload.references, body: payload.body, purpose: payload.purpose };
  assert.equal((await publish(owner, { payload: reordered })).result.id, posted.id, 'property ordering does not change an intent');
  const concurrent = await Promise.all([publish(owner), publish(owner)]);
  assert(concurrent.every(r => r.result.id === posted.id));
  await refused(publish(owner, { payload: { ...payload, body: 'Changed under same intent' } }), 'INTENT_REUSE');
  await refused(owner.client.mutate('publishPost', { ...oldArgs, intent: envelope.intent, body: payload.body, audience: shared.id }), 'INTENT_REUSE');
  assert.equal((await reader.client.query('postById', { id: posted.id })).data.author, owner.did);
  assert.equal((await outsider.client.query('postById', { id: posted.id })).data, null);
  const personal = (await publish(owner, { intent: intentId(), audience: own.id })).result;
  const cliEnvelope = { ...envelope, intent: intentId(), audience: own.id };
  const envelopePath = resolve(dir, 'envelope.json');
  await writeFile(envelopePath, JSON.stringify(cliEnvelope));
  const cliRun = await promisify(execFile)(process.execPath, [resolve(root, 'scripts/agent.mjs'), 'publish', 'record', envelopePath], {
    env: { ...process.env, JERA_ORIGIN: origin, JERA_TOKEN: owner.token }, timeout: 10000,
  });
  assert.equal(JSON.parse(cliRun.stdout).result.author, owner.did);
  assert(cliRun.stderr.includes(`intent-id: ${cliEnvelope.intent}`));
  const lost = { ...envelope, intent: intentId(), audience: own.id };
  loseCommitResponse = true;
  await refused(owner.gateway.publishRecord(lost), 'E_UNAVAILABLE');
  const committed = (await owner.client.query('postForIntent', { intent: lost.intent })).data;
  assert(committed, 'ambiguous failure happened after storage committed');
  assert.equal((await owner.gateway.publishRecord(lost)).result.id, committed.id);
  const longPayload = { ...payload, body: '𐐨'.repeat(12000), references: [] };
  const longPost = (await publish(owner, { intent: intentId(), audience: own.id, payload: longPayload })).result;
  assert.equal((await owner.client.readRecord(longPost.id)).payload.body, longPayload.body, 'supported Unicode/body bound remains readable');
  assert.equal((await operator.client.query('postById', { id: personal.id })).data, null);
  await refused(publish(operator, { intent: intentId(), audience: own.id, parent: personal.id }), 'AUDIENCE_UNAVAILABLE');
  await refused(publish(reader, { intent: intentId(), parent: posted.id }), 'AUDIENCE_UNAVAILABLE');
  const replyEnvelope = { ...envelope, intent: intentId(), parent: posted.id, payload: { ...payload, purpose: 'archive', body: 'Attributable operator response' } };
  const reply = (await operator.gateway.publishRecord(replyEnvelope)).result;
  assert.equal(reply.author, operator.did); assert.equal(reply.root, posted.id);
  const sameIntentOtherAuthor = (await operator.gateway.publishRecord({ ...envelope, parent: posted.id })).result;
  assert.notEqual(sameIntentOtherAuthor.id, posted.id, 'logical intents are scoped to the authenticated author');
  assert.equal(sameIntentOtherAuthor.author, operator.did);
  await refused(operator.client.mutate('probePayloadPatch', { id: reply.id, payloadJson: '{"body":"changed"}' }), 'E_RULE');
  const otherAudience = (await owner.client.mutate('createAudience', { name: 'Different circle', kind: 'shared' })).result;
  await refused(publish(owner, { intent: intentId(), audience: otherAudience.id, parent: posted.id }), 'DIFFERENT_AUDIENCE');
  const legacyReply = (await operator.client.mutate('publishPost', { intent: intentId(), body: 'Old client reply', visibility: 'private', audience: shared.id, parent: posted.id })).result;
  assert.equal(legacyReply.root, posted.id);
  await owner.client.mutate('removeAudienceMember', { audience: shared.id, principal: operator.did });
  assert.equal((await operator.client.query('postById', { id: reply.id })).data, null);
  await refused(operator.gateway.publishRecord(replyEnvelope), 'AUDIENCE_UNAVAILABLE', 'retry does not replay a stale service receipt');
  await operator.client.mutate('deletePost', { id: reply.id });
  assert.equal((await owner.client.query('postById', { id: reply.id })).data.payloadJson, null);
  await owner.client.mutate('deletePost', { id: posted.id });
  assert.equal((await publish(owner)).result.deleted, true, 'retry does not resurrect a tombstone');
  assert.equal((await owner.client.query('postById', { id: legacyReply.id })).data.body, 'Old client reply');
  assert.equal((await owner.client.query('draftForDevice', { deviceKey, scope: 'root:private' })).data.body, 'Unpublished original', 'structured publishing never retires an unrelated text draft');

  await new Promise(done => gateway.close(done)); gateway = null;
  await backend.stop(); backend = null; backend = await start(dir);
  service.origin = backend.url; for (const person of people) person.client.origin = backend.url;
  await openGateway();
  assert.deepEqual(JSON.parse((await owner.client.query('postById', { id: personal.id })).data.payloadJson), payload);
  assert.equal((await publish(owner)).result.deleted, true);
  assert.equal((await owner.client.query('postById', { id: oldPost.id })).data.body, 'Legacy original');
  await service.request('/auth/revoke', { principal: owner.did });
  await refused(publish(owner, { intent: intentId() }), 'E_AUTH');
});
