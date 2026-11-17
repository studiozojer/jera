import { Database } from 'bun:sqlite';
import { readFileSync,writeFileSync,mkdirSync,renameSync,chmodSync } from 'node:fs';
import { resolve,dirname,join } from 'node:path';
import { spawn } from 'node:child_process';
import { JeraClient } from '../client.mjs';
import { digest,readContext,loadSources,promptFor,makeEnvelope,verifyContext } from './reply.mjs';
process.umask(0o077);
const [command,configFile,approval]=process.argv.slice(2);
if(!['draft','status','publish'].includes(command)||!configFile)throw Error('Usage: bun run.ts draft|status|publish config.json [reviewed-sha256]');
const config=JSON.parse(readFileSync(resolve(configFile),'utf8'));
if(config.model!=='opencode/deepseek-v4.1-flash'||!/^did:plc:/.test(config.did))throw Error('Invalid operator configuration');
mkdirSync(config.state,{recursive:true,mode:0o700});
const db=new Database(join(config.state,'reply.sqlite'));
db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS jobs (source TEXT PRIMARY KEY, status TEXT NOT NULL, data TEXT, updated TEXT NOT NULL)");
chmodSync(join(config.state,'reply.sqlite'),0o600);
const key=`${config.origin}|${config.did}|${config.target}`;
const get=()=>db.query('SELECT * FROM jobs WHERE source=?').get(key) as any;
const set=(status:string,data:any)=>db.query('UPDATE jobs SET status=?,data=?,updated=? WHERE source=?').run(status,JSON.stringify(data),new Date().toISOString(),key);
const output=()=>{const row=get();const data=row?.data?JSON.parse(row.data):{};console.log(JSON.stringify({status:row?.status??'not-started',source:config.target,reviewHash:data.reviewHash??null,record:data.record??null}));};
function saveJSON(path:string,data:any){const temp=path+'.new';writeFileSync(temp,JSON.stringify(data,null,2)+'\n',{mode:0o600});renameSync(temp,path);}
async function client(){
  const saved=JSON.parse(readFileSync(config.session,'utf8'));
  if(saved.origin!==config.origin||saved.did!==config.did||saved.session.principal!==config.did)throw Error('IDENTITY_MISMATCH');
  const c=new JeraClient(config.origin,saved.session.token);
  const verified=await c.request('/oauth/check',{});if(verified.did!==config.did)throw Error('IDENTITY_MISMATCH');
  return c;
}
async function generate(prompt:string){
  // This mode has no model tools. Only the fixed context above enters the model.
  const modelConfig={model:config.model,share:'disabled',permission:{'*':'deny'},agent:{'tycho-reply':{mode:'primary',description:'Draft an explicitly addressed Jera reply',prompt:'Return only a grounded conversational draft. No tools or external actions.',permission:{'*':'deny'},steps:1}}};
  const cwd=join(config.state,'model');mkdirSync(cwd,{recursive:true,mode:0o700});
  return await new Promise<string>((yes,no)=>{
    const child=spawn(config.opencode??'/usr/local/bin/opencode',['run','--pure','--agent','tycho-reply','--model',config.model,'--format','json','--title','Tycho Jera draft'],{cwd,env:{HOME:process.env.HOME,PATH:'/usr/local/bin:/usr/bin:/bin',OPENCODE_CONFIG_CONTENT:JSON.stringify(modelConfig),OPENCODE_DISABLE_AUTOUPDATE:'true'},stdio:['pipe','pipe','pipe'],detached:true});
    let text='',bytes=0,error=false,stopping=false;let timer:ReturnType<typeof setTimeout>;
    const stop=()=>{if(stopping)return;stopping=true;try{process.kill(-child.pid!,'SIGTERM');}catch{};timer=setTimeout(()=>{try{process.kill(-child.pid!,'SIGKILL');}catch{}},2000);};
    const deadline=setTimeout(stop,180000);
    const terminate=()=>stop();process.once('SIGTERM',terminate);process.once('SIGINT',terminate);
    child.stdout.on('data',chunk=>{bytes+=chunk.length;if(bytes>2*1024*1024){error=true;stop();}else text+=chunk;});
    child.stderr.on('data',()=>{});child.stdin.end(prompt);
    child.on('error',()=>{error=true;});child.stdin.on('error',()=>{error=true;});
    child.on('close',async code=>{
      if(stopping)await new Promise(r=>setTimeout(r,2100));
      clearTimeout(deadline);clearTimeout(timer);process.removeListener('SIGTERM',terminate);process.removeListener('SIGINT',terminate);
      try{
        if(code!==0||error||stopping)throw Error('MODEL_FAILED');
        const events=text.split('\n').filter(Boolean).map(x=>JSON.parse(x));
        if(events.some(x=>x.type==='error'||x.type==='tool_use'))throw Error('MODEL_FAILED');
        const body=events.filter(x=>x.type==='text').map(x=>x.part?.text??'').join('\n').trim();
        if(!body)throw Error('MODEL_EMPTY');yes(body);
      }catch{no(Error('MODEL_FAILED'));}
    });
  });
}
async function main(){
  if(command==='status'){output();return;}
  if(command==='draft'){
    let stage='authorization';
    // Atomic claim across processes. Crash/interruption never silently reruns paid work.
    const claim=db.query("INSERT OR IGNORE INTO jobs VALUES (?,'running',NULL,?)").run(key,new Date().toISOString());
    if(!claim.changes){output();return;}
    try{
      const c=await client();stage='context';const posts=await readContext(c,config.target,config);
      stage='graph';const sources=loadSources(config.graph,config.sources),identity=loadSources(config.graph,['identity/self.md','identity/worldview.md']);
      const prompt=promptFor(posts,sources,identity);stage='model';const body=await generate(prompt);
      stage='recheck';await verifyContext(c,posts,config);
      const envelope=makeEnvelope(posts,body);
      const data={envelope,posts,sources:sources.map(({content,...x}:any)=>x),identity:identity.map(({content,...x}:any)=>x),model:config.model,promptHash:digest(prompt),reviewHash:digest(envelope),createdAt:new Date().toISOString()};
      set('draft',data);saveJSON(join(config.state,'draft.json'),data);output();
    }catch{set('needs-review',{stage,reason:'Draft did not complete; inspect authorization/model/context before any manual retry.'});throw Error('DRAFT_HELD');}
    return;
  }
  const row=get();if(!row||!['draft','uncertain'].includes(row.status))throw Error('NO_REVIEWABLE_DRAFT');
  const data=JSON.parse(row.data);
  if(!approval||approval!==data.reviewHash||digest(data.envelope)!==approval)throw Error('REVIEW_HASH_REQUIRED');
  const c=await client();await verifyContext(c,data.posts,config);
  const claimed=db.query("UPDATE jobs SET status='publishing' WHERE source=? AND status=?").run(key,row.status);
  if(!claimed.changes)throw Error('ALREADY_ACTIVE');
  try{
    const result=await c.publishRecord(data.envelope);
    const actual=await c.readRecord(result.result.id);
    if(!actual||actual.deleted||actual.author!==config.did||actual.intent!==data.envelope.intent||actual.parent!==data.envelope.parent||actual.body!==data.envelope.payload.body||actual.audience!==data.envelope.audience)throw Error('UNVERIFIED');
    set('published',{...data,record:actual.id});output();
  }catch{set('uncertain',data);throw Error('PUBLICATION_UNCERTAIN');}
}
try{await main();}catch{console.error('Operator run held for review. No automatic retry.');process.exitCode=1;}finally{db.close();}
