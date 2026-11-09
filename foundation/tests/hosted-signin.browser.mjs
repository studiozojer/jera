// Run with Bun 1.4.2. Uses real production discovery, never enters credentials.
// Optional JERA_WEB_ARTIFACT_ORIGIN substitutes only root-domain asset transport.
import assert from 'node:assert/strict';
import {chromium} from '../../tooling/exact2/node_modules/playwright-core/index.mjs';
import {chromium as binary} from '../../tooling/exact2/scripts/agent-launch.mjs';
const artifactOrigin=process.env.JERA_WEB_ARTIFACT_ORIGIN;
const browser=await chromium.launch({executablePath:binary().executable});
const context=await browser.newContext({viewport:{width:1100,height:800}});
// Only substitute DNS/transport for the root still owned by Squarespace.
// Assets come from the actual deployed Caddy server; API requests are live.
if(artifactOrigin) await context.route('https://jera.ink/**',async route=>{
 const url=new URL(route.request().url());
 const response=await fetch(artifactOrigin+url.pathname+url.search);
 const headers=Object.fromEntries(response.headers);
 delete headers['content-encoding'];delete headers['content-length'];delete headers['transfer-encoding'];
 await route.fulfill({status:response.status,headers,body:Buffer.from(await response.arrayBuffer())});
});
const page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('https://jera.ink/');
 await page.getByTestId('handle').waitFor();
 if(process.env.JERA_SCREENSHOT) await page.screenshot({path:process.env.JERA_SCREENSHOT});
 assert.equal(await page.getByTestId('login').count(),1);
 const crossOrigin=await page.evaluate(async()=>{
  const r=await fetch('https://snapback.jera.ink/records/publish',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
  return {status:r.status,code:(await r.json()).denied.code};
 });
 assert.equal(crossOrigin.status,401);
 // Exercise the actual deployed callback's same-origin BroadcastChannel.
 await page.evaluate(()=>{window.receipt=null;window.testChannel=new BroadcastChannel('exact-auth');window.testChannel.onmessage=e=>window.receipt=e.data;});
 const callback=await context.newPage();
 await callback.goto('https://jera.ink/.exact/auth/callback?state=release-smoke&code=synthetic-not-a-credential');
 await page.waitForFunction(()=>window.receipt?.type==='exact-auth');
 assert.equal(await page.evaluate(()=>new URL(window.receipt.url).searchParams.get('state')),'release-smoke');
 await callback.close();
 await page.getByTestId('handle').fill('bsky.app');
 assert.equal(await page.getByTestId('login').isDisabled(),false);
 const opened=context.waitForEvent('page',{timeout:10000}).catch(()=>null);
 await page.getByTestId('login').click({timeout:10000});
 const popup=await opened;
 assert(popup,'The real authorization popup must open; check app callback grants if it does not.');
 await popup.waitForURL(url=>url.hostname==='bsky.social'&&url.pathname.includes('authorize'),{timeout:45000});
 console.log('PASS: hosted sign-in renders; production CORS/refusal; callback execution; real ATproto discovery/PAR reaches provider authorization. No account consent or session minting performed.');
 assert.deepEqual(errors,[]);
}finally{await browser.close();}
