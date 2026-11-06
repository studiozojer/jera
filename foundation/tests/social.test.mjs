import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, appendFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { JeraClient, intentId } from '../scripts/client.mjs';

const root = new URL('../', import.meta.url).pathname;
const cli = resolve(root, 'node_modules/.bin/snapback4');
async function start(dir) {
  const child = spawn(cli, ['dev', '--port', '0', '--no-watch'], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
  let err = '', output = '';
  child.stderr.on('data', d => { err += d; });
  const url = await new Promise((yes, no) => {
    const timer = setTimeout(() => { child.kill(); no(new Error(err || 'Server timed out')); }, 30000);
    child.once('error', e => { clearTimeout(timer); no(e); });
    child.once('exit', c => { clearTimeout(timer); no(new Error(`Server exited ${c}: ${err}`)); });
    child.stdout.on('data', d => { output += d; const m = output.match(/http:\/\/127\.0\.0\.1:\d+/); if (m) { clearTimeout(timer); yes(m[0]); } });
  });
  return {url, async stop() { const done = once(child, 'exit'); child.kill(); await done; }};
}
const rows = r => r.data;
async function refused(promise, code) { await assert.rejects(promise, e => { assert.equal(e.code, code, e.message); return true; }); }

test('real social storage: DID audiences, private branches, revocation, replay and persistence', {timeout: 120000}, async t => {
  const dir = await mkdtemp(resolve(tmpdir(), 'jera-social-'));
  await mkdir(resolve(dir, 'snapback'));
  await copyFile(resolve(root, 'snapback/schema.q'), resolve(dir, 'snapback/schema.q'));
  // Test-only mutations exercise the table transition rule independently of
  // the safe public operation; these never enter the deployed schema.
  await appendFile(resolve(dir, 'snapback/schema.q'), `
mutation probePostPatch(id: posts, body: text <=12000, deleted: bool):
  update posts[id] { body, deleted }
  return null
mutation probePostInsert(intent: text 26..26, body: text <=12000, deleted: bool):
  return insert posts { author: viewer, intent, body, deleted, visibility: 'public', audience: null, parent: null, root: null }
`);
  let server = await start(dir);
  t.after(async () => { await server?.stop(); await rm(dir, {recursive:true, force:true}); });
  const service = execFileSync(cli, ['token', '--service', 'social-test'], {cwd:dir, encoding:'utf8', stdio:['ignore','pipe','pipe']}).trim();
  const people = [];
  for (const letter of ['a','b','c','d']) {
    const did = 'did:plc:' + letter.repeat(24);
    const {session} = await new JeraClient(server.url, service).request('/auth/session', {principal:did, days:1});
    people.push({did, client:new JeraClient(server.url, session.token)});
  }
  const [alice,bob,reader,outsider] = people;
  for (const {client} of people) {
    const mutate = client.mutate.bind(client);
    client.mutate = (name, args = {}, id = intentId()) => mutate(name, name === 'publishPost' ? {...args, intent:id} : args, id);
  }
  const a=alice.client,b=bob.client,r=reader.client,o=outsider.client;
  await refused(new JeraClient(server.url).query('postsList'), 'E_AUTH');
  const audience=(await a.mutate('ensureAudience')).result;
  assert.equal((await a.mutate('ensureAudience')).result.id,audience.id);
  await a.mutate('setAudienceMember',{audience:audience.id,principal:bob.did,access:'reply'});
  await a.mutate('setAudienceMember',{audience:audience.id,principal:reader.did,access:'read'});
  const draftDevice=intentId();
  await a.mutate('saveSocialDraft',{deviceKey:draftDevice,scope:'root:public',body:'Public ♍︎ ♍️ :virgo:',revision:3});
  await a.mutate('saveSocialDraft',{deviceKey:draftDevice,scope:'root:public',body:'late older save',revision:2});
  assert.equal((await a.query('draftForDevice',{deviceKey:draftDevice,scope:'root:public'})).data.body,'Public ♍︎ ♍️ :virgo:');
  assert.equal((await b.query('draftForDevice',{deviceKey:draftDevice,scope:'root:public'})).data,null,'audience membership never shares unpublished drafts');
  const pub=(await a.mutate('publishPost',{body:'Public ♍︎ ♍️ :virgo:',visibility:'public',audience:null,parent:null,draftDevice,draftRevision:3,draftScope:'root:public'})).result;
  assert.equal((await a.query('draftForDevice',{deviceKey:draftDevice,scope:'root:public'})).data.body,'');
  await a.mutate('saveSocialDraft',{deviceKey:draftDevice,scope:'root:public',body:'late draft after posting',revision:3});
  assert.equal((await a.query('draftForDevice',{deviceKey:draftDevice,scope:'root:public'})).data.body,'','late save cannot resurrect a posted draft');
  await a.mutate('saveSocialDraft',{deviceKey:draftDevice,scope:'root:private',body:'Unpublished private draft',revision:1});
  const priv=(await a.mutate('publishPost',{body:'Private root',visibility:'private',audience:audience.id,parent:null})).result;
  assert.equal(rows(await o.query('postsList')).length,1);
  assert.equal(rows(await r.query('postsList')).length,2);
  const args={body:'A private reply',visibility:'private',audience:audience.id,parent:priv.id};
  const key=intentId();
  const child=(await b.mutate('publishPost',args,key)).result;
  await b.mutate('publishPost',args,key);
  assert.equal(child.author,bob.did);
  assert.equal(child.root,priv.id);
  assert.equal(rows(await a.query('postsList')).filter(p=>p.id===child.id).length,1);
  await refused(r.mutate('publishPost',args),'REPLY_NOT_ALLOWED');
  await refused(o.mutate('publishPost',args),'PARENT_UNAVAILABLE');
  await refused(b.mutate('publishPost',{...args,visibility:'public',audience:null}),'CANNOT_WIDEN_AUDIENCE');
  const bobAudience=(await b.mutate('ensureAudience')).result;
  await refused(b.mutate('publishPost',{...args,audience:bobAudience.id}),'DIFFERENT_AUDIENCE');
  const branch=(await b.mutate('publishPost',{body:'Bob’s private branch on Alice’s public post',visibility:'private',audience:bobAudience.id,parent:pub.id})).result;
  assert.equal(branch.root,pub.id);
  assert(!rows(await a.query('postsList')).some(p=>p.id===branch.id),'public author gains no implicit private access');
  assert(!rows(await o.query('postsList')).some(p=>p.id===branch.id));
  await refused(o.mutate('setAudienceMember',{audience:audience.id,principal:outsider.did,access:'reply'}),'NOT_OWNER');
  await refused(a.mutate('setAudienceMember',{audience:audience.id,principal:alice.did,access:'read'}),'OWNER_MEMBERSHIP');
  await refused(a.mutate('publishPost',{body:'   ',visibility:'public',audience:null,parent:null}),'E_INPUT');
  await a.mutate('removeAudienceMember',{audience:audience.id,principal:bob.did});
  const afterRevoke=rows(await b.query('postsList'));
  assert(!afterRevoke.some(p=>p.id===priv.id||p.id===child.id),'revocation also denies the revoked author’s descendant');
  await refused(b.mutate('publishPost',args),'PARENT_UNAVAILABLE');
  await a.mutate('setAudienceMember',{audience:audience.id,principal:bob.did,access:'read'});
  // Ownership authorizes deletion even after losing audience read access.
  await a.mutate('removeAudienceMember',{audience:audience.id,principal:bob.did});
  await refused(o.mutate('deletePost',{id:child.id}),'NOT_FOUND');
  assert.deepEqual((await b.mutate('deletePost',{id:child.id})).result,{id:child.id,deleted:true});
  assert.equal((await a.query('postById',{id:child.id})).data.body,'');
  await a.mutate('setAudienceMember',{audience:audience.id,principal:bob.did,access:'read'});
  assert(rows(await b.query('postsList')).some(p=>p.id===child.id));
  await refused(b.mutate('publishPost',args),'REPLY_NOT_ALLOWED');
  // No implicit organizing task or memory module is created by social posting.
  await refused(a.mutate('probePostPatch',{id:pub.id,body:'An unauthorized edit',deleted:false}),'E_RULE');
  await refused(a.mutate('probePostPatch',{id:pub.id,body:'Hidden old text',deleted:true}),'E_RULE');
  await refused(a.mutate('probePostInsert',{intent:intentId(),body:'',deleted:false}),'E_RULE');
  await refused(a.mutate('probePostInsert',{intent:intentId(),body:'Hidden text',deleted:true}),'E_RULE');
  await refused(o.mutate('deletePost',{id:pub.id}),'E_RULE');
  await a.mutate('deletePost',{id:pub.id});
  await a.mutate('deletePost',{id:pub.id}); // Retry is safe with a new request id.
  await refused(a.mutate('probePostPatch',{id:pub.id,body:'Resurrected',deleted:false}),'E_RULE');
  await refused(a.mutate('probePostPatch',{id:pub.id,body:'',deleted:false}),'E_RULE');
  const removed=(await a.query('postById',{id:pub.id})).data;
  assert.equal(removed.deleted,true);assert.equal(removed.body,'');
  assert.equal((await b.query('postById',{id:branch.id})).data.body,'Bob’s private branch on Alice’s public post','deleting a parent preserves another author’s replies');
  const replay=(await a.request('/m/publishPost',{id:intentId(),args:{intent:pub.intent,body:'Public ♍︎ ♍️ :virgo:',visibility:'public',audience:null,parent:null}})).result;
  assert.equal(replay.id,pub.id);assert.equal(replay.deleted,true);assert.equal(replay.body,'','late publication cannot resurrect deleted text');
  await refused(b.mutate('publishPost',{body:'Reply to removed post',visibility:'public',audience:null,parent:pub.id}),'PARENT_DELETED');
  assert.deepEqual(rows(await a.query('armillariesList')),[]);
  await server.stop(); server=null;
  server=await start(dir);
  for(const person of people) person.client.origin=server.url;
  assert(rows(await a.query('postsList')).some(p=>p.id===pub.id&&p.deleted&&p.body===''));
  assert(rows(await b.query('postsList')).some(p=>p.id===branch.id));
  assert(!rows(await o.query('postsList')).some(p=>p.visibility==='private'));
  assert.equal((await a.query('latestDraft',{scope:'root:private'})).data[0].body,'Unpublished private draft');
});
