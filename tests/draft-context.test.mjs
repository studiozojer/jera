// Exact's native async lowering must keep each queued draft operation in the
// answer that issued it. Browser async/await alone does not exercise this gate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { webcrypto } from 'node:crypto';
import { createContext, runInContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { asyncContext, lowered } from '../tooling/exact2/js/bake/src/typescript.mjs';

const sdkRequire=createRequire(new URL('../tooling/exact2/package.json',import.meta.url));
const {rolldown}=await import(sdkRequire.resolve('rolldown'));

test('queued draft storage retains its issuing answer across native async steps',async()=>{
  const bundle=await rolldown({
    input:fileURLToPath(new URL('../app/social-data.ts',import.meta.url)),
    transform:lowered,plugins:[asyncContext()],logLevel:'silent',
  });
  let output;
  try {({output}=await bundle.generate({format:'iife',name:'draftModule'}));}
  finally {await bundle.close();}
  let active=null;
  const seen=[];
  const context=createContext({TextEncoder,TextDecoder,URL,
    __exact_async_context:{current:()=>active,swap:next=>{const old=active;active=next;return old;},route:()=>false},
    crypto:{subtle:webcrypto.subtle,getRandomValues:bytes=>{
      assert.ok(active,'randomness must belong to an active answer');
      seen.push(active);return webcrypto.getRandomValues(bytes);
    }},
  });
  runInContext(output[0].code,context);
  const files=new Map();
  let entered,release;
  const started=new Promise(resolve=>{entered=resolve;});
  const held=new Promise(resolve=>{release=resolve;});
  const fs={
    readdir:async()=>[...files.keys()].map(path=>path.split('/').pop()),
    readFile:async path=>files.get(path).buffer,
    atomicWriteFile:async(path,bytes)=>{entered();await held;files.set(path,Uint8Array.from(bytes));},
  };
  const draft=new context.draftModule.Drafts(fs,'https://context.test','did:plc:'+'a'.repeat(24));
  const answer=(name,work)=>{active=name;try{return work();}finally{active=null;}};
  const saving=answer('save',()=>draft.save('root:public','Kept across the queue',1));
  await Promise.race([started,saving]);
  const reading=answer('read',()=>draft.get('root:public'));
  release();
  await saving;
  assert.equal((await reading).body,'Kept across the queue');
  assert.ok(seen.includes('save'));
  assert.ok(seen.includes('read'));
  let record;
  const request=async(_kind,operation,args)=>{
    assert.ok(active,'network work must belong to an active answer');
    if(operation==='saveSocialDraft')return {state:'sent',result:args};
    if(operation==='publishPost'){record={id:'fixture-post',author:draft.principal,...args};return {state:'sent',result:record};}
    if(operation==='postForIntent')return {data:record};
    throw new Error(operation);
  };
  const synced=await answer('sync',()=>context.draftModule.syncScope(request,draft,'root:public'));
  assert.equal(synced.draft.syncedRevision,1);
  const posted=await answer('publish',()=>context.draftModule.publish(request,draft,'public','',2,'Exact native snapshot'));
  assert.equal(posted.state,'sent');
  assert.equal(posted.id,'fixture-post');
  assert.equal((await answer('after',()=>draft.get('root:public'))).body,'Exact native snapshot');
  const opened=await answer('open',()=>context.draftModule.beginDraft(request,draft,'public',''));
  assert.equal(opened.body,'');
  assert.equal(opened.sealed,null);
  assert.ok(seen.includes('open'));
  assert.equal(active,null);
});
