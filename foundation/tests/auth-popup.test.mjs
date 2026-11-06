import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../../tooling/exact2/host/web/auth-glue.js',import.meta.url),'utf8').replace('export function arm','function arm');
function host({channel=true}={}){
 let now=0,next=0;
 const timers=new Map(),reports=[],delivered=[];
 const popup={closed:true,close(){this.closed=true;}};
 const channels=[];
 class BroadcastChannel{
  constructor(){if(!channel)throw new Error('unsupported');channels.push(this);}
  close(){this.closed=true;}
 }
 const scope={URL,Date:{now:()=>now},navigator:{userActivation:{isActive:true}},location:{origin:'https://jera.test'},
  crypto:{getRandomValues:bytes=>bytes.fill(7)},window:{open:()=>popup},BroadcastChannel,
  addEventListener(){},removeEventListener(){},
  setInterval:(fn,ms)=>{const id=++next;timers.set(id,{fn,ms,at:now+ms,repeat:true});return id;},
  setTimeout:(fn,ms)=>{const id=++next;timers.set(id,{fn,ms,at:now+ms});return id;},
  clearInterval:id=>timers.delete(id),clearTimeout:id=>timers.delete(id),
 };
 runInNewContext(source,scope);
 const env={agent:false,log(){},active:()=>true,deliver:ticket=>delivered.push(ticket),call:request=>{
  if(request.op==='arm')return{present:{url:'https://provider.test/authorize',callback:'https://jera.test/.exact/auth/callback'}};
  reports.push(request);return{};
 }};
 scope.arm({ticket:1},env);
 const advance=ms=>{const target=now+ms;for(;;){let chosen;for(const [id,t] of timers)if(t.at<=target&&(!chosen||t.at<chosen[1].at))chosen=[id,t];if(!chosen)break;const [id,t]=chosen;now=t.at;if(t.repeat)t.at+=t.ms;else timers.delete(id);t.fn();}now=target;};
 return{advance,reports,delivered,channels,env};
}
test('COOP closed proxy stays pending and accepts a delayed channel callback',()=>{
 const h=host();h.advance(8000);assert.equal(h.reports.length,0);
 h.channels[0].onmessage({data:{type:'exact-auth',url:'https://jera.test/.exact/auth/callback?state=fixture&code=fixture'}});
 assert.equal(h.reports.length,1);assert.ok(h.reports[0].url);assert.deepEqual(h.delivered,[1]);
});
test('callback with a different origin or path is ignored',()=>{
 const h=host();h.advance(4000);
 for(const url of ['https://other.test/.exact/auth/callback','https://jera.test/other'])h.channels[0].onmessage({data:{type:'exact-auth',url}});
 assert.equal(h.reports.length,0);
});
test('channel wait retains its ten-minute bound',()=>{
 const h=host();h.advance(600000);assert.equal(h.reports.length,1);assert.equal(h.reports[0].status,499);
});
test('closed popup still cancels after grace when no callback channel exists',()=>{
 const h=host({channel:false});h.advance(4000);assert.equal(h.reports.length,1);assert.equal(h.reports[0].status,499);
});
