import {test,expect} from 'bun:test';
import {mkdtempSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Database} from 'bun:sqlite';
import {digest} from './reply.mjs';
test('failed authorization is retained across process restarts and repeated triggers never generate or publish',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'jera-runner-'));let calls=0;
 const server=Bun.serve({port:0,hostname:'127.0.0.1',fetch(){calls++;return Response.json({denied:{code:'E_AUTH'}},{status:401});}});
 const origin=`http://127.0.0.1:${server.port}`,did='did:plc:'+'a'.repeat(24),target='0'.repeat(26);
 const session=join(dir,'session.json'),config=join(dir,'config.json');
 writeFileSync(session,JSON.stringify({origin,did,session:{principal:did,token:'synthetic'}}));
 writeFileSync(config,JSON.stringify({origin,did,handle:'tycho.jera.ink',target,session,state:join(dir,'state'),model:'opencode/deepseek-v4.1-flash'}));
 const run=async(command:string,hash?:string)=>{const p=Bun.spawn([process.execPath,import.meta.dir+'/run.ts',command,config,...(hash?[hash]:[])],{stdout:'pipe',stderr:'ignore'});return{code:await p.exited,output:await new Response(p.stdout).text()};};
 try{
  expect((await run('draft')).code).toBe(1);expect(calls).toBe(1);
  expect(JSON.parse((await run('draft')).output).status).toBe('needs-review');expect(calls).toBe(1);
  const db=new Database(join(dir,'state/reply.sqlite'));
  const envelope={intent:target,payload:{body:'original'}};
  db.query('UPDATE jobs SET status=?,data=?').run('draft',JSON.stringify({envelope,reviewHash:digest(envelope)}));db.close();
  expect((await run('publish','wrong-hash')).code).toBe(1);expect(calls).toBe(1);
 }finally{server.stop(true);rmSync(dir,{recursive:true,force:true});}
});
