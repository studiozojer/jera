import {test, expect} from 'bun:test';
import {Drafts, draftScope, publish, syncScope, type Request} from './social-data.ts';
function files(){const data=new Map<string,Uint8Array>();return{data,fs:{readFile:async(p:string)=>data.get(p)!.buffer as ArrayBuffer,atomicWriteFile:async(p:string,b:Uint8Array)=>{data.set(p,b);},readdir:async()=>[...data.keys()].map(p=>p.split('/').pop()!)}};}
const alice='did:plc:'+'a'.repeat(24),bob='did:plc:'+'b'.repeat(24);
test('durable drafts fence origin/account, preserve Unicode and ignore late older saves',async()=>{const {fs}=files();const a=new Drafts(fs,'https://one.test',alice);await a.save('root:private','♍︎ ♍️ :virgo:',2);await a.save('root:private','older',1);expect((await new Drafts(fs,'https://one.test',alice).get('root:private')).body).toBe('♍︎ ♍️ :virgo:');expect((await new Drafts(fs,'https://two.test',alice).get('root:private')).body).toBe('');expect((await new Drafts(fs,'https://one.test',bob).get('root:private')).body).toBe('');expect(draftScope('public','parent')).toBe(draftScope('private','parent'));});
test('a lost response seals exact intent/bytes across restart and retry clears only confirmed draft',async()=>{const {fs}=files();let a=new Drafts(fs,'https://one.test',alice);await a.save('root:public','A precise post ♍︎',1);let first:any;let lose=true;const request:Request=async(kind,op,args,id)=>{if(op==='publishPost'){if(!first)first={args,id};else expect({args,id}).toEqual(first);if(lose)throw new Error('lost response');return{state:'sent',result:{id:'post-1',author:alice,...args}};}if(op==='postForIntent')return{data:{id:'post-1',author:alice,...first.args}};throw new Error(op);};expect((await publish(request,a,'public','',1)).state).toBe('pending');a=new Drafts(fs,'https://one.test',alice);await expect(a.save('root:public','changed',2)).rejects.toThrow();lose=false;expect((await publish(request,a,'public','',1)).state).toBe('sent');expect((await a.get('root:public')).body).toBe('');});
test('definitive refusal retains text and permits a new intent after correction',async()=>{const {fs}=files();const a=new Drafts(fs,'https://one.test',alice);await a.save('root:public','Keep me',1);const initial=(await a.get('root:public')).intent;await expect(publish(async()=>({state:'failed',why:{message:'Rejected'}}),a,'public','',1)).rejects.toThrow('Rejected');const draft=await a.get('root:public');expect(draft.body).toBe('Keep me');expect(draft.sealed).toBeNull();expect(draft.intent).not.toBe(initial);});
test('a private child retains parent audience instead of selecting the reply author’s audience',async()=>{const {fs}=files();const a=new Drafts(fs,'https://one.test',alice);await a.save('reply:parent','Private child',1);let posted:any;const req:Request=async(_kind,op,args)=>{if(op==='postForIntent')return{data:posted};if(op==='postById')return{data:{id:'parent',visibility:'private',audience:'parent-audience'}};if(op==='publishPost'){expect(args.audience).toBe('parent-audience');posted={id:'reply',author:alice,...args};return{state:'sent',result:posted};}throw new Error(op);};expect((await publish(req,a,'private','parent',1)).state).toBe('sent');});
test('corrupt saved vaults are preserved and never replaced with an empty draft',async()=>{const {fs,data}=files();const a=new Drafts(fs,'https://one.test',alice);await a.save('root:private','Saved',1);const key=[...data.keys()][0];data.set(key,new TextEncoder().encode('{bad'));await expect(a.save('root:private','replacement',2)).rejects.toThrow();expect(new TextDecoder().decode(data.get(key))).toBe('{bad');});

test('a fresh device recovers the latest private cloud draft without sharing its posting intent',async()=>{const {fs}=files();const a=new Drafts(fs,'https://one.test',alice);const request:Request=async(_kind,op,args)=>{if(op==='draftForDevice')return{data:null};if(op==='latestDraft')return{data:[{body:'Cloud recovery ♍︎',revision:7}]};if(op==='saveSocialDraft')return{state:'sent',result:{...args}};throw new Error(op);};const result=await syncScope(request,a,'root:private');expect(result.draft.body).toBe('Cloud recovery ♍︎');expect(result.draft.revision).toBe(0);expect((await a.get('root:private')).syncedRevision).toBe(0);});
test('typing while a cloud draft is loading cannot be overwritten by its late reply',async()=>{const {fs}=files();const a=new Drafts(fs,'https://one.test',alice);let release!:(v:any)=>void;const wait=new Promise(r=>{release=r});const req:Request=async(_kind,op,args)=>{if(op==='draftForDevice')return{data:null};if(op==='latestDraft')return await wait;if(op==='saveSocialDraft')return{state:'sent',result:{...args}};throw new Error(op);};const pending=syncScope(req,a,'root:private');await new Promise(r=>setTimeout(r,5));await a.save('root:private','New typing',1);release({data:[{body:'Older cloud text',revision:9}]});await pending;expect((await a.get('root:private')).body).toBe('New typing');});

test('typing after cloud hydration still starts with the current editor revision',async()=>{const {fs}=files();const a=new Drafts(fs,'https://one.test',alice);const req:Request=async(_kind,op)=>op==='draftForDevice'?{data:null}:{data:[{body:'Recovered',revision:90}]};await syncScope(req,a,'root:private');await a.save('root:private','Typed immediately after recovery',1);expect((await a.get('root:private')).body).toBe('Typed immediately after recovery');});

test('publication tombstones an outstanding cloud save without blocking new local typing',async()=>{const {fs}=files();const a=new Drafts(fs,'https://one.test',alice);await a.save('root:public','Earlier text',1);let begin!:()=>void,release!:()=>void;const started=new Promise<void>(r=>{begin=r}),later=new Promise<void>(r=>{release=r});let cloud={revision:0,body:''};let posted:any;const req:Request=async(_kind,op,args)=>{if(op==='saveSocialDraft'){begin();await later;if((args.revision as number)>cloud.revision)cloud={revision:args.revision as number,body:args.body as string};return{state:'sent',result:{...cloud}};}if(op==='postForIntent')return{data:posted};if(op==='publishPost'){cloud={revision:(args.draftRevision as number)+1,body:''};posted={id:'post',author:alice,...args};return{state:'sent',result:posted};}throw new Error(op);};const syncing=syncScope(req,a,'root:public');await started;await a.save('root:public','Newer text',2);expect((await publish(req,a,'public','',2)).state).toBe('sent');release();await syncing;expect(cloud.body).toBe('');expect((await a.get('root:public')).body).toBe('');});


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
 const after=await a.get('root:public');expect(after.body).toBe('');expect(after.sealed).toBeNull();
});
