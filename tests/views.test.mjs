import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rename, unlink, symlink, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { lexicons } from '../contracts/registry.mjs';
import { viewDefinition } from '../views/definition.mjs';
import { evaluateView } from '../views/evaluate.mjs';

const {ref,digest} = lexicons[0], lexicon = {ref,digest};
const view = {schemaVersion:1,id:'studio-work',version:1,sources:['network','notes'],select:{lexicons:[]},presentation:{order:'newest-first',group:'thread'},compose:{destination:'network',audience:'circle',lexicons:[lexicon],defaultLexicon:ref}};
async function temporary(t) {
  const dir=await realpath(await mkdtemp(resolve(tmpdir(),'jera-views-')));
  t.after(()=>rm(dir,{recursive:true,force:true}));return dir;
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
