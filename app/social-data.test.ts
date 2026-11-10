import {test, expect} from 'bun:test';
import {Drafts, beginDraft, draftScope, publish, syncScope, type Request} from './social-data.ts';
function files(){const data=new Map<string,Uint8Array>();return{data,fs:{readFile:async(p:string)=>data.get(p)!.buffer as ArrayBuffer,atomicWriteFile:async(p:string,b:Uint8Array)=>{data.set(p,b);},readdir:async()=>[...data.keys()].map(p=>p.split('/').pop()!)}};}
const alice='did:plc:'+'a'.repeat(24),bob='did:plc:'+'b'.repeat(24);
test('durable drafts fence origin/account, preserve Unicode and ignore late older saves',async()=>{const {fs}=files();const a=new Drafts(fs,'https://one.test',alice);await a.save('root:private','♍︎ ♍️ :virgo:',2);await a.save('root:private','older',1);expect((await new Drafts(fs,'https://one.test',alice).get('root:private')).body).toBe('♍︎ ♍️ :virgo:');expect((await new Drafts(fs,'https://two.test',alice).get('root:private')).body).toBe('');expect((await new Drafts(fs,'https://one.test',bob).get('root:private')).body).toBe('');expect(draftScope('public','parent')).not.toBe(draftScope('private','parent'));});
test('a lost response seals exact intent/bytes across restart and retry retains a confirmed draft until another opening',async()=>{const {fs}=files();let a=new Drafts(fs,'https://one.test',alice);await a.save('root:public','A precise post ♍︎',1);let first:any;let lose=true;const request:Request=async(kind,op,args,id)=>{if(op==='publishPost'){if(!first)first={args,id};else expect({args,id}).toEqual(first);if(lose)throw new Error('lost response');return{state:'sent',result:{id:'post-1',author:alice,...args}};}if(op==='postForIntent')return{data:{id:'post-1',author:alice,...first.args}};throw new Error(op);};expect((await publish(request,a,'public','',1)).state).toBe('pending');a=new Drafts(fs,'https://one.test',alice);await expect(a.save('root:public','changed',2)).rejects.toThrow();lose=false;expect((await publish(request,a,'public','',1)).state).toBe('sent');expect((await a.get('root:public')).body).toBe('A precise post ♍︎');expect((await beginDraft(request,a,'public','')).body).toBe('');});
test('definitive refusal retains text and permits a new intent after correction',async()=>{const {fs}=files();const a=new Drafts(fs,'https://one.test',alice);await a.save('root:public','Keep me',1);const initial=(await a.get('root:public')).intent;await expect(publish(async()=>({state:'failed',why:{message:'Rejected'}}),a,'public','',1)).rejects.toThrow('Rejected');const draft=await a.get('root:public');expect(draft.body).toBe('Keep me');expect(draft.sealed).toBeNull();expect(draft.intent).not.toBe(initial);});
test('a private child retains parent audience instead of selecting the reply author’s audience',async()=>{const {fs}=files();const a=new Drafts(fs,'https://one.test',alice);await a.save('reply:parent','Private child',1);let posted:any;const req:Request=async(_kind,op,args)=>{if(op==='postForIntent')return{data:posted};if(op==='postById')return{data:{id:'parent',visibility:'private',audience:'parent-audience'}};if(op==='publishPost'){expect(args.audience).toBe('parent-audience');posted={id:'reply',author:alice,...args};return{state:'sent',result:posted};}throw new Error(op);};expect((await publish(req,a,'private','parent',1)).state).toBe('sent');});
test('corrupt saved vaults are preserved and never replaced with an empty draft',async()=>{const {fs,data}=files();const a=new Drafts(fs,'https://one.test',alice);await a.save('root:private','Saved',1);const key=[...data.keys()][0];data.set(key,new TextEncoder().encode('{bad'));await expect(a.save('root:private','replacement',2)).rejects.toThrow();expect(new TextDecoder().decode(data.get(key))).toBe('{bad');});

test('a fresh device recovers the latest private cloud draft without sharing its posting intent',async()=>{const {fs}=files();const a=new Drafts(fs,'https://one.test',alice);const request:Request=async(_kind,op,args)=>{if(op==='draftForDevice')return{data:null};if(op==='latestDraft')return{data:[{body:'Cloud recovery ♍︎',revision:7}]};if(op==='saveSocialDraft')return{state:'sent',result:{...args}};throw new Error(op);};const result=await syncScope(request,a,'root:private');expect(result.draft.body).toBe('Cloud recovery ♍︎');expect(result.draft.revision).toBe(0);expect((await a.get('root:private')).syncedRevision).toBe(0);});
test('typing while a cloud draft is loading cannot be overwritten by its late reply',async()=>{const {fs}=files();const a=new Drafts(fs,'https://one.test',alice);let release!:(v:any)=>void;const wait=new Promise(r=>{release=r});const req:Request=async(_kind,op,args)=>{if(op==='draftForDevice')return{data:null};if(op==='latestDraft')return await wait;if(op==='saveSocialDraft')return{state:'sent',result:{...args}};throw new Error(op);};const pending=syncScope(req,a,'root:private');await new Promise(r=>setTimeout(r,5));await a.save('root:private','New typing',1);release({data:[{body:'Older cloud text',revision:9}]});await pending;expect((await a.get('root:private')).body).toBe('New typing');});

test('typing after cloud hydration still starts with the current editor revision',async()=>{const {fs}=files();const a=new Drafts(fs,'https://one.test',alice);const req:Request=async(_kind,op)=>op==='draftForDevice'?{data:null}:{data:[{body:'Recovered',revision:90}]};await syncScope(req,a,'root:private');await a.save('root:private','Typed immediately after recovery',1);expect((await a.get('root:private')).body).toBe('Typed immediately after recovery');});

test('publication tombstones an outstanding cloud save without blocking new local typing',async()=>{const {fs}=files();const a=new Drafts(fs,'https://one.test',alice);await a.save('root:public','Earlier text',1);let begin!:()=>void,release!:()=>void;const started=new Promise<void>(r=>{begin=r}),later=new Promise<void>(r=>{release=r});let cloud={revision:0,body:''};let posted:any;const req:Request=async(_kind,op,args)=>{if(op==='saveSocialDraft'){begin();await later;if((args.revision as number)>cloud.revision)cloud={revision:args.revision as number,body:args.body as string};return{state:'sent',result:{...cloud}};}if(op==='postForIntent')return{data:posted};if(op==='publishPost'){cloud={revision:(args.draftRevision as number)+1,body:''};posted={id:'post',author:alice,...args};return{state:'sent',result:posted};}throw new Error(op);};const syncing=syncScope(req,a,'root:public');await started;await a.save('root:public','Newer text',2);expect((await publish(req,a,'public','',2)).state).toBe('sent');release();await syncing;expect(cloud.body).toBe('');expect((await a.get('root:public')).body).toBe('Newer text');expect((await beginDraft(req,a,'public','')).body).toBe('');});


test('queued draft operations keep FIFO order and a failed writer releases the next reader',async()=>{
  const {fs}=files();
  const a=new Drafts(fs,'https://queue.test',alice);
  let entered!:()=>void,release!:()=>void;
  const started=new Promise<void>(resolve=>{entered=resolve;});
  const blocked=new Promise<void>(resolve=>{release=resolve;});
  const order:string[]=[];
  const first=a.use(async()=>{order.push('writer');entered();await blocked;throw new Error('interrupted write');},true);
  const failure=first.catch(error=>error.message);
  await started;
  const save=a.save('root:public','Queued text',1);
  const read=a.get('root:public');
  release();
  expect(await failure).toBe('interrupted write');
  await save;
  expect((await read).body).toBe('Queued text');
  expect(order).toEqual(['writer']);
  expect((await a.get('root:public')).body).toBe('Queued text');
});

test('a historical publish receipt cannot resurrect a deleted post or trap its sealed draft',async()=>{
 const {fs}=files();const a=new Drafts(fs,'https://one.test',alice);await a.save('root:public','Deleted elsewhere',1);
 let original:any;
 const req:Request=async(_kind,op,args)=>{
  if(op==='publishPost'){original={id:'post',author:alice,...args};return{state:'sent',result:original};}
  if(op==='postForIntent')return{data:{...original,deleted:true,body:''}};
  throw new Error(op);
 };
 expect((await publish(req,a,'public','',1)).state).toBe('deleted');
 const after=await a.get('root:public');expect(after.body).toBe('Deleted elsewhere');expect(after.posted).toBe('post');const opened=await beginDraft(req,a,'public','');expect(opened.body).toBe('');expect(opened.sealed).toBeNull();
});

test('Post waits for a queued autosave and publishes exactly the snapshot taken on press',async()=>{
 const {fs}=files();const drafts=new Drafts(fs,'https://post-queue.test',alice);
 await drafts.get('root:public');
 let started!:()=>void,release!:()=>void;
 const entered=new Promise<void>(r=>{started=r}),held=new Promise<void>(r=>{release=r});
 const write=fs.atomicWriteFile;let block=true;
 fs.atomicWriteFile=async(p,b)=>{if(block){block=false;started();await held;}return write(p,b);};
 const autosave=drafts.save('root:public','Earlier autosave',1);await entered;
 let record:any;
 const request:Request=async(_kind,op,args)=>{
  if(op==='publishPost'){expect(args.body).toBe('Exact text at press');record={id:'queued-post',author:alice,...args};return{state:'sent',result:record};}
  if(op==='postForIntent')return{data:record};throw new Error(op);
 };
 const posting=publish(request,drafts,'public','',2,'Exact text at press');
 release();await autosave;expect((await posting).state).toBe('sent');
 await drafts.save('root:public','Late old save',1);
 expect((await drafts.get('root:public')).body).toBe('Exact text at press');expect((await beginDraft(request,drafts,'public','')).body).toBe('');
});
test('a recovered cloud draft at editor revision zero can be posted without another keystroke',async()=>{
 const {fs}=files();const drafts=new Drafts(fs,'https://recovered.test',alice);
 let record:any;const req:Request=async(_kind,op,args)=>{
  if(op==='draftForDevice')return{data:null};if(op==='latestDraft')return{data:[{body:'Recovered text',revision:9}]};
  if(op==='publishPost'){record={id:'recovered-post',author:alice,...args};return{state:'sent',result:record};}
  if(op==='postForIntent')return{data:record};throw new Error(op);
 };
 await syncScope(req,drafts,'root:public');expect((await publish(req,drafts,'public','',0,'Recovered text')).state).toBe('sent');
});


test('an opening preserves an unsent draft and makes no publication lookup',async()=>{
 const {fs}=files();const drafts=new Drafts(fs,'https://open.test',alice);
 await drafts.save('root:public','The same words can be a new intention',1);
 const before=await drafts.get('root:public');
 const opened=await beginDraft(async()=>{throw new Error('An unsealed draft must not be queried');},drafts,'public','');
 expect(opened).toEqual(before);
});

test('an ambiguous publication is retained across restart and retired only when opening confirms its intent',async()=>{
 const {fs}=files();let drafts=new Drafts(fs,'https://open.test',alice);
 await drafts.save('root:public','A recoverable posted draft',1);let record:any;let writes=0;
 const lost:Request=async(_kind,op,args)=>{if(op==='publishPost'){writes++;record={id:'lost-receipt',author:alice,...args};throw new Error('Response lost');}throw new Error(op);};
 expect((await publish(lost,drafts,'public','',1)).state).toBe('pending');
 drafts=new Drafts(fs,'https://open.test',alice);
 const unknown:Request=async()=>({data:null});const offline:Request=async()=>{throw new Error('Offline');};
 expect((await beginDraft(unknown,drafts,'public','')).body).toBe('A recoverable posted draft');
 expect((await beginDraft(offline,drafts,'public','')).sealed?.intent).toBe(record.intent);
 const opened=await beginDraft(async(_kind,op)=>{expect(op).toBe('postForIntent');return{data:record};},drafts,'public','');
 expect(opened.body).toBe('');expect(opened.intent).not.toBe(record.intent);expect(opened.sealed).toBeNull();expect(writes).toBe(1);
});

test('confirmation rejects a different author or payload and never clears another context',async()=>{
 const {fs}=files();const drafts=new Drafts(fs,'https://open.test',alice);
 await drafts.save('root:public','Public retained bytes',1);await drafts.save('root:private','Unsent private words',1);
 let record:any;
 const request:Request=async(_kind,op,args)=>{if(op==='publishPost'){record={id:'publication',author:alice,...args};return{state:'sent',result:record};}if(op==='postForIntent')return{data:record};throw new Error(op);};
 await publish(request,drafts,'public','',1);
 await expect(beginDraft(async()=>({data:{...record,author:bob}}),drafts,'public','')).rejects.toThrow('verify');
 expect((await drafts.get('root:public')).body).toBe('Public retained bytes');
 await expect(beginDraft(async()=>({data:{...record,body:'Different text'}}),drafts,'public','')).rejects.toThrow('verify');
 await beginDraft(request,drafts,'public','');expect((await drafts.get('root:private')).body).toBe('Unsent private words');
});


test('a late opening check cannot discard text from the next intent',async()=>{
 const {fs}=files();const drafts=new Drafts(fs,'https://late-open.test',alice);await drafts.save('root:public','Previous post',1);
 let record:any;const request:Request=async(_kind,op,args)=>{if(op==='publishPost'){record={id:'previous',author:alice,...args};return{state:'sent',result:record};}return{data:record};};
 await publish(request,drafts,'public','',1);
 let begin!:()=>void,finish!:(value:any)=>void;const started=new Promise<void>(r=>{begin=r;}),held=new Promise<any>(r=>{finish=r;});
 const opening=beginDraft(async()=>{begin();return held;},drafts,'public','');await started;
 const fresh=await beginDraft(request,drafts,'public','');await drafts.save('root:public','New intention',fresh.revision+1);
 finish({data:record});expect((await opening).body).toBe('New intention');expect((await drafts.get('root:public')).body).toBe('New intention');
});
