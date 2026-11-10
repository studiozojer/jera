import {test,expect} from 'bun:test';
import {selectedView,selectPosts,writingPolicy,writingKey,prepareViewDraft,assertDraftContext,adoptLegacyPublicReply,type View} from './view-context.ts';
import {Drafts,publish,syncScope,draftScope,type PostRecord,type Request} from './social-data.ts';
import {newComposition,editedComposition,formFields} from './composition.ts';
import {writingDefinitions} from './private-definition.ts';
const principal='did:plc:aaaaaaaaaaaaaaaaaaaaaaaa';
function files(){const data=new Map<string,Uint8Array>();return{readFile:async(p:string)=>data.get(p)!.buffer as ArrayBuffer,atomicWriteFile:async(p:string,b:Uint8Array)=>{data.set(p,b);},readdir:async()=>[...data.keys()].map(p=>p.split('/').pop()!)};}
function post(id:string,visibility:'public'|'private',parent:string|null=null,lexicon?:string):PostRecord{return{id,visibility,parent,lexicon,lexiconDigest:writingDefinitions.find(d=>d.ref===lexicon)?.digest,author:principal,audience:visibility==='public'?null:'circle',root:null,at:1,intent:id,body:id,deleted:false};}
const contribution=writingDefinitions.find(d=>d.ref==='contribution.v1')!;

test('definition selection and grouping govern the feed, with authorized ancestors retained as context',()=>{
  const records=[post('root','public'),post('private','private','root'),post('child','private','private'),post('unrelated','public'),post('typed','private',null,'contribution.v1')];
  const personal=selectPosts(selectedView('private'),records);
  expect([...personal.feed]).toEqual(['private','typed']);
  expect(personal.records.map(p=>p.id)).toEqual(['root','private','child','typed']);
  const view=structuredClone(selectedView('private'));view.select.lexicons=[{ref:contribution.ref,digest:contribution.digest}];
  expect([...selectPosts(view,records).feed]).toEqual(['typed']);
  view.select.lexicons=[];view.presentation.group='none';
  expect([...selectPosts(view,records).feed]).toEqual(['private','child','typed']);
  view.select.visibility='public';
  expect([...selectPosts(view,records).feed]).toEqual(['root','unrelated']);
  // A missing parent is not invented or fetched outside source authorization.
  expect(selectPosts(selectedView('private'),[post('orphan','private','hidden')]).records.map(p=>p.id)).toEqual(['orphan']);
});

test('the writing definition resolves independently of view identity; read-only and unavailable bindings fail closed',async()=>{
  const view=structuredClone(selectedView('public'));view.id='not-public';view.compose!.audience='private';view.compose!.defaultLexicon=contribution.ref;view.compose!.lexicons=[{ref:contribution.ref,digest:contribution.digest}];
  expect(writingPolicy(view)?.mode).toBe('private');
  const drafts=new Drafts(files(),'https://one.test',principal);
  const draft=await prepareViewDraft(drafts,view,'');
  expect(draft!.composition?.lexicon.ref).toBe('contribution.v1');
  expect(formFields(draft!.composition!).map(f=>f.name)).toContain('purpose');
  view.compose=null;expect(writingPolicy(view)).toBeNull();
  await expect(prepareViewDraft(drafts,view,'')).rejects.toThrow('settings changed');
  const empty=new Drafts(files(),'https://one.test',principal);
  await expect(prepareViewDraft(empty,view,'')).rejects.toThrow('read-only');
  const missing=structuredClone(selectedView('public'));missing.compose!.destination='folder';expect(()=>writingPolicy(missing)).toThrow('destination');
  missing.sources.push('folder');expect(()=>selectPosts(missing,[])).toThrow('unavailable source');
});

test('names and read changes retain a draft; changed writing policy cannot silently redirect it',async()=>{
  const drafts=new Drafts(files(),'https://one.test',principal),view=structuredClone(selectedView('private'));
  const initial=await prepareViewDraft(drafts,view,'');
  await drafts.save('root:private','Original ♍︎',1,initial!.composition);
  const next={...view,name:'Notebook',version:2,select:{lexicons:[]}};
  expect(writingKey(next)).toBe(writingKey(view));
  expect((await prepareViewDraft(drafts,next,'')).body).toBe('Original ♍︎');
  view.compose!.audience='public';
  await expect(prepareViewDraft(drafts,view,'')).rejects.toThrow('settings changed');
  expect((await drafts.get('root:private')).body).toBe('Original ♍︎');
});

test('draft writing context survives cloud recovery; roots and replies are isolated by stable view ID',async()=>{
  const drafts=new Drafts(files(),'https://one.test',principal),view=selectedView('private');
  const prepared=await prepareViewDraft(drafts,view,'parent');
  await drafts.save(draftScope(view.id,'parent'),'Personal reply',1,prepared!.composition);
  let cloud:any;
  const request:Request=async(_k,op,args)=>{if(op==='saveStructuredDraft'){cloud=args;return{state:'sent',result:args};}if(op==='draftForDevice')return{data:null};if(op==='latestDraft')return{data:cloud?[cloud]:[]};throw new Error(op);};
  await syncScope(request,drafts,draftScope(view.id,'parent'));
  const second=new Drafts(files(),'https://one.test',principal);
  const restored=(await syncScope(request,second,draftScope(view.id,'parent'))).draft;
  expect(restored.viewContext).toBe(writingKey(view));
  expect((await prepareViewDraft(second,view,'parent'))!.body).toBe('Personal reply');
  expect((await prepareViewDraft(drafts,selectedView('public'),'parent'))!.body).toBe('');
  expect((await prepareViewDraft(drafts,view,''))!.body).toBe('');
});

test('new writing resolves a private audience and the selected exact lexicon through the existing publication path',async()=>{
  const drafts=new Drafts(files(),'https://one.test',principal),view=selectedView('private');
  const prepared=await prepareViewDraft(drafts,view,'');
  await drafts.save('root:private','Body',1,editedComposition(prepared!.composition!,'','Body',[]));
  let posted:any;
  const request:Request=async(_k,op)=>{if(op==='ensureAudience')return{state:'sent',result:{id:'circle'}};if(op==='postForIntent')return{data:posted};throw new Error(op);};
  const policy=writingPolicy(view)!;
  const result=await publish(request,drafts,policy.mode,'',1,undefined,undefined,async(e:any)=>{expect(e.audience).toBe('circle');expect(e.lexicon.ref).toBe('post.v1');posted={...post('posted','private'),intent:e.intent,body:e.payload.body,lexicon:e.lexicon.ref,lexiconDigest:e.lexicon.digest,payloadJson:JSON.stringify(e.payload)};return{state:'sent',result:posted};},policy.definition,view.id);
  expect(result.state).toBe('sent');
});

test('a sealed publication retries its exact payload after view policy changes',async()=>{
  const fs=files(),drafts=new Drafts(fs,'https://one.test',principal),view=structuredClone(selectedView('public'));
  const initial=await prepareViewDraft(drafts,view,'');await drafts.save('root:public','Exact retry',1,editedComposition(initial!.composition!,null,'Exact retry',[]));
  let envelope:any;
  const request:Request=async()=>{throw new Error('offline');};
  await publish(request,drafts,'public','',1,undefined,undefined,async e=>{envelope=e;throw new Error('lost');},writingPolicy(view)!.definition);
  view.compose=null;
  const saved=await drafts.get('root:public');expect(()=>assertDraftContext(view,saved)).not.toThrow();
  expect((await prepareViewDraft(drafts,view,''))!.sealed).toEqual(saved.sealed);
  const unavailable=structuredClone(selectedView('public'));unavailable.compose!.audience='missing';
  expect((await prepareViewDraft(drafts,unavailable,''))!.sealed).toEqual(saved.sealed);
  let retried:any;await publish(request,new Drafts(fs,'https://one.test',principal),'public','',1,undefined,undefined,async e=>{retried=e;throw new Error('lost');});
  expect(retried).toEqual(envelope);
});

test('recognized legacy Public replies move without losing the original intent or a Personal draft',async()=>{
  const drafts=new Drafts(files(),'https://one.test',principal),definition=writingPolicy(selectedView('public'))!.definition;
  await drafts.save('reply:parent','Old public reply',1,newComposition(definition,null,'Old public reply'));
  const old=await drafts.get('reply:parent');
  await adoptLegacyPublicReply(drafts,'parent');
  expect((await drafts.get(draftScope('public','parent'))).intent).toBe(old.intent);
  expect((await drafts.get(`retained:legacy:${old.intent}`)).body).toBe('Old public reply');
  expect((await prepareViewDraft(drafts,selectedView('private'),'parent'))!.body).toBe('');
  await drafts.save('reply:parent','New personal reply',3);
  await adoptLegacyPublicReply(drafts,'parent');
  expect((await drafts.get('reply:parent')).body).toBe('New personal reply');
});
