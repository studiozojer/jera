import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, writeFile, readFile, rename, unlink, symlink, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { JeraClient, intentId } from '../scripts/client.mjs';
import { lexicons } from '../contracts/registry.mjs';
import { viewDefinition } from '../views/definition.mjs';
import { evaluateView } from '../views/evaluate.mjs';
import { snapbackSnapshot } from '../views/sources.mjs';

const root = new URL('../', import.meta.url).pathname, cli = resolve(root, 'node_modules/.bin/snapback4');
const {ref,digest} = lexicons[0], lexicon = {ref,digest};
const view = {schemaVersion:1,id:'studio-work',version:1,sources:['network','notes'],select:{lexicons:[]},presentation:{order:'newest-first',group:'thread'},compose:{destination:'network',audience:'circle',lexicons:[lexicon],defaultLexicon:ref}};
async function temporary(t) {
  const dir=await realpath(await mkdtemp(resolve(tmpdir(),'jera-views-')));
  t.after(()=>rm(dir,{recursive:true,force:true}));return dir;
}
async function start(dir) {
  const child=spawn(cli,['dev','--port','0','--no-watch'],{cwd:dir,stdio:['ignore','pipe','pipe']});
  let output='',errors='';child.stderr.on('data',d=>errors+=d);
  const url=await new Promise((yes,no)=>{
    const timer=setTimeout(()=>{child.kill();no(new Error(errors||'Server timed out'));},30000);
    child.once('error',e=>{clearTimeout(timer);no(e);});
    child.once('exit',code=>{clearTimeout(timer);no(new Error(`Store exited ${code}: ${errors}`));});
    child.stdout.on('data',d=>{output+=d;const match=output.match(/http:\/\/127\.0\.0\.1:\d+/);if(match){clearTimeout(timer);yes(match[0]);}});
  });
  return {url,async stop(){const done=once(child,'exit');child.kill();await done;}};
}

test('view definitions separate writing context from lexicons and refuse hidden authority',()=>{
  assert.deepEqual(viewDefinition(view),view);
  assert.deepEqual(viewDefinition({...view,compose:null}).compose,null);
  for(const bad of [
    {...view,token:'secret'}, {...view,sources:['/Users/me']}, {...view,sources:['notes','notes']},
    {...view,select:{query:'return all secrets'}}, {...view,presentation:{order:'execute',group:'thread'}},
    {...view,compose:{...view.compose,purpose:'request'}},
    {...view,compose:{...view.compose,defaultLexicon:'unknown.v1'}},
    {...view,compose:{...view.compose,lexicons:[{ref,digest:'changed'}]}}
  ])assert.throws(()=>viewDefinition(bad));
});

test('local observations: exact bytes, revision/rename/removal, incomplete scans and restart',async t=>{
  const dir=await temporary(t), notes=resolve(dir,'notes');await mkdir(notes);
  const config={reader:'local-test',sources:{notes:{type:'folder',root:notes}},audiences:{}};
  const definition={...view,sources:['notes'],compose:null};
  const path=resolve(notes,'idea.yao'),body='\ufeff  ♍︎ ♍️\nKeep the wording.  ';
  await writeFile(path,body);
  let run=await evaluateView(definition,config);
  assert.equal(run.output.records[0].record.body,body);
  assert.equal(run.output.records[0].record.kind,'file-observation');
  assert.equal(run.output.records[0].lexicon,null,'file observations do not invent human posts or lexicons');
  assert.equal(run.output.changes.length,1);
  const checkpoint=JSON.parse(JSON.stringify(run.checkpoint));
  await assert.rejects(evaluateView(definition,config,{...checkpoint,sources:{notes:{broken:'bad'}}}));
  assert.ok(!JSON.stringify(checkpoint).includes(body));
  run=await evaluateView(definition,config,checkpoint);assert.deepEqual(run.output.changes,[]);
  await writeFile(path,'New revision');
  run=await evaluateView(definition,config,checkpoint);
  assert.equal(run.output.changes[0].kind,'upsert');assert.equal(run.output.records[0].key,Object.keys(checkpoint.sources.notes)[0]);
  const updated=run.checkpoint;
  await rename(path,resolve(notes,'renamed.yao'));
  run=await evaluateView(definition,config,updated);assert.deepEqual(run.output.changes.map(c=>c.kind),['upsert','withdraw']);
  const renamed=run.checkpoint;
  await symlink('/etc/passwd',resolve(notes,'escape.txt'));
  run=await evaluateView(definition,config,renamed);
  assert.deepEqual(run.output.sources,[{source:'notes',state:'unavailable'}]);assert.deepEqual(run.output.records,[]);assert.deepEqual(run.output.changes,[]);assert.deepEqual(run.checkpoint,renamed);
  await unlink(resolve(notes,'escape.txt'));
  await writeFile(resolve(notes,'bad.txt'),Buffer.from([0xff]));
  run=await evaluateView(definition,config,renamed);assert.equal(run.output.sources[0].state,'unavailable');
  await unlink(resolve(notes,'bad.txt'));
  await unlink(resolve(notes,'renamed.yao'));
  run=await evaluateView(definition,config,renamed);assert.equal(run.output.changes[0].kind,'withdraw');assert.deepEqual(run.output.records,[]);
  await rename(notes,resolve(dir,'moved'));
  run=await evaluateView(definition,config,renamed);assert.equal(run.output.sources[0].state,'unavailable');assert.deepEqual(run.output.changes,[]);
  run=await evaluateView(definition,{...config,reader:'another-account'},renamed);assert.deepEqual(run.checkpoint.sources,{});
});

test('real store: mixed sources, RLS, exact payloads, deletion, revocation and restart', {timeout:120000},async t=>{
  const dir=await temporary(t);await mkdir(resolve(dir,'snapback'));await mkdir(resolve(dir,'notes'));
  await copyFile(resolve(root,'snapback/schema.q'),resolve(dir,'snapback/schema.q'));
  const server=await start(dir);t.after(()=>server.stop());
  const serviceToken=execFileSync(cli,['token','--service','atproto-auth'],{cwd:dir,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  const service=new JeraClient(server.url,serviceToken), people=[];
  for(const letter of ['a','b','c']){
    const did='did:plc:'+letter.repeat(24), {session}=await service.request('/auth/session',{principal:did,days:1});
    people.push({did,token:session.token,client:new JeraClient(server.url,session.token)});
  }
  const [owner,reader,outsider]=people;
  const audience=(await owner.client.mutate('ensureAudience',{})).result.id;
  await owner.client.mutate('setAudienceMember',{audience,principal:reader.did,access:'read'});
  const post=(await owner.client.mutate('publishPost',{intent:intentId(),body:'Shared source',visibility:'private',audience,parent:null})).result;
  const personal=(await owner.client.mutate('createAudience',{name:'Only me',kind:'owner'})).result.id;
  await owner.client.mutate('publishPost',{intent:intentId(),body:'Owner secret',visibility:'private',audience:personal,parent:null});
  const payload={purpose:'reflect',body:'An exact structured source ♍︎ ♍️',references:[{uri:'repo:notes/source.yao',revision:'rev1'}]};
  const structured=(await service.mutate('commitStructuredPost',{author:owner.did,intent:intentId(),body:payload.body,audience,parent:null,lexicon:ref,lexiconDigest:digest,payloadJson:JSON.stringify(payload),draftDevice:null,draftRevision:null,draftScope:null})).result;
  await writeFile(resolve(dir,'notes/idea.yao'),'Local source');
  const config={reader:reader.did,sources:{network:{type:'snapback',origin:server.url,principal:reader.did,tokenEnv:'JERA_VIEW_TOKEN'},notes:{type:'folder',root:resolve(dir,'notes')}},audiences:{circle:{source:'network',id:audience}}};
  const env={JERA_VIEW_TOKEN:reader.token};
  let run=await evaluateView(view,config,null,env);
  assert.deepEqual(run.output.sources.map(s=>s.state),['complete','complete']);
  assert.equal(run.output.records.length,3);
  assert.ok(!JSON.stringify(run.output).includes('Owner secret'));
  assert.deepEqual(run.output.records.find(r=>r.id===structured.id).record.payload,payload);
  assert.equal(run.output.writing.audienceId,audience);
  const publicOnly=await evaluateView({...view,select:{lexicons:[],visibility:'public'}},config,null,env);
  assert.deepEqual(publicOnly.output.records,[],'Public view excludes authorized private posts and local files');
  const first=run.checkpoint;
  const narrowed=await evaluateView({...view,select:{lexicons:[lexicon]}},config,null,env);
  assert.equal(narrowed.output.records.length,1);assert.equal(narrowed.output.records[0].id,structured.id);
  run=await evaluateView(view,config,JSON.parse(JSON.stringify(first)),env);assert.deepEqual(run.output.changes,[]);
  await owner.client.mutate('deletePost',{id:post.id});
  run=await evaluateView(view,config,first,env);
  assert.equal(run.output.records.find(r=>r.id===post.id).deleted,true);assert.equal(run.output.changes.length,1);
  const tombstone=run.checkpoint;
  await owner.client.mutate('removeAudienceMember',{audience,principal:reader.did});
  run=await evaluateView(view,config,tombstone,env);
  assert.equal(run.output.records.length,1);assert.equal(run.output.changes.filter(c=>c.kind==='withdraw').length,2);
  assert.ok(!JSON.stringify(run.output).includes(payload.body));
  const mismatch=await evaluateView(view,config,first,{JERA_VIEW_TOKEN:outsider.token});
  assert.deepEqual(mismatch.output.sources[0],{source:'network',state:'unavailable'});
  assert.equal(mismatch.output.records.length,1);assert.deepEqual(mismatch.checkpoint.sources.network,first.sources.network);
  assert.ok(!JSON.stringify(mismatch.output).includes(payload.body));
  const noToken=await evaluateView(view,config,first,{});assert.equal(noToken.output.sources[0].state,'unavailable');
  assert.deepEqual(noToken.output.changes,[]);
  // Walk beyond one query page; complete means the page is authoritative,
  // while next represents ordinary pagination, not a failed scan.
  await owner.client.mutate('setAudienceMember',{audience,principal:reader.did,access:'read'});
  for(let i=0;i<101;i++) await owner.client.mutate('publishPost',{intent:intentId(),body:`Page row ${i}`,visibility:'private',audience,parent:null});
  const paged=await snapbackSnapshot('network',config.sources.network,env);
  assert.equal(paged.length,103);assert.equal(new Set(paged.map(r=>r.key)).size,103);
  // Fault-inject only the second page of a real store read. Partial results
  // must not become a snapshot or retire records from the previous checkpoint.
  let truncate=false;
  const proxy=createServer(async(req,res)=>{
    const chunks=[];for await(const part of req)chunks.push(part);
    const body=Buffer.concat(chunks), args=JSON.parse(body).args;
    const response=await fetch(server.url+req.url,{method:'POST',headers:{authorization:req.headers.authorization,'content-type':'application/json'},body});
    const result=await response.json();
    if(truncate && req.url==='/q/postsList' && args?.c)result.complete=false;
    res.writeHead(response.status,{'content-type':'application/json'});res.end(JSON.stringify(result));
  });
  await new Promise(done=>proxy.listen(0,'127.0.0.1',done));
  t.after(()=>new Promise(done=>{proxy.closeAllConnections();proxy.close(done);}));
  const interruptedConfig={...config,sources:{...config.sources,network:{...config.sources.network,origin:`http://127.0.0.1:${proxy.address().port}`}}};
  const beforeInterruption=await evaluateView(view,interruptedConfig,null,env);
  assert.equal(beforeInterruption.output.sources[0].state,'complete');
  truncate=true;
  const interrupted=await evaluateView(view,interruptedConfig,beforeInterruption.checkpoint,env);
  assert.equal(interrupted.output.sources[0].state,'unavailable');assert.equal(interrupted.output.records.length,1);
  assert.deepEqual(interrupted.output.changes,[]);assert.deepEqual(interrupted.checkpoint,beforeInterruption.checkpoint);
  truncate=false;
  const resumed=await evaluateView(view,interruptedConfig,interrupted.checkpoint,env);
  assert.equal(resumed.output.sources[0].state,'complete');assert.deepEqual(resumed.output.changes,[]);
  await owner.client.mutate('removeAudienceMember',{audience,principal:reader.did});
  const definitionPath=resolve(dir,'view.json'),bindingsPath=resolve(dir,'bindings.json'),checkpointPath=resolve(dir,'checkpoint.json');
  await writeFile(definitionPath,JSON.stringify(view));await writeFile(bindingsPath,JSON.stringify(config));
  const observe=()=>JSON.parse(execFileSync(process.execPath,[resolve(root,'scripts/view.mjs'),definitionPath,bindingsPath,checkpointPath],{env:{...process.env,...env},encoding:'utf8',stdio:['ignore','pipe','pipe']}));
  assert.equal(observe().records.length,1);assert.deepEqual(observe().changes,[]);
  const saved=JSON.parse(await readFile(checkpointPath,'utf8'));assert.ok(saved.sources.notes);
  await writeFile(checkpointPath+'.lock','');
  assert.throws(observe,'a concurrent observer must not overwrite the checkpoint');
});
