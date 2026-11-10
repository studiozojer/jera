// Run with Bun 1.4.2 against this branch's isolated real-store preview:
// PORT=4477 node app/test-server.mjs
// EXACT_BACKEND_ORIGIN=http://127.0.0.1:4477 bun app/exact.mjs web --port 3037
// bun tests/feed-startup.browser.mjs
// Public profile transport is held; post/auth queries still use real Snapback.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from '../tooling/exact2/node_modules/playwright-core/index.mjs';
import {chromium as binary} from '../tooling/exact2/scripts/agent-launch.mjs';
const origin='http://127.0.0.1:3037',backend='http://127.0.0.1:4477';
const output=new URL('../.local/feed-startup/',import.meta.url);mkdirSync(output,{recursive:true});
const phases=[],measurements=[];
function phase(name,label,fail=false){let release;const gate=new Promise(r=>release=r);const p={name,label,fail,gate,release,calls:0,finished:0};phases.push(p);return p;}
let active=phase('cold','First author');
const seeded=await fetch(`${backend}/dev/legacy-public`,{method:'POST'});assert.equal(seeded.status,200,'Use the isolated fixture, never production');
const browser=await chromium.launch({executablePath:binary().executable});
const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('https://public.api.bsky.app/**',async route=>{
 const current=active;current.calls++;
 const did=new URL(route.request().url()).searchParams.get('actor');
 try {
  await current.gate;
  if(current.fail)await route.abort();
  else await route.fulfill({json:{did,handle:'fixture.test',displayName:current.label,avatar:''}});
 } finally {current.finished++;}
});
async function until(check){const end=Date.now()+2500;while(!check()){assert(Date.now()<end,'Expected pending profile transport');await new Promise(r=>setTimeout(r,10));}}
async function visibleBeforeProfiles(name,started,cached){
 const row=page.locator('[data-testid^="post-row-"]').first();
 // The old feed path waited up to its 5000ms profile timeout. This must appear
 // while transport is still held, well before that deadline, including reload.
 await row.waitFor({timeout:2500});
 await until(()=>active.calls>0);
 assert.equal(active.finished,0,'Post text must precede profile completion');
 if(cached)await row.getByText(cached,{exact:true}).waitFor({timeout:2500});
 measurements.push({case:name,firstPostMs:Date.now()-started,profileRequestsStillPending:active.calls});
 return row;
}
try {
 await page.goto(origin);await page.getByTestId('handle').fill('owner.test');await page.getByTestId('login').click();
 await page.getByTestId('header-experience-public').waitFor();
 const start=Date.now();await page.getByTestId('header-experience-public').click();
 let row=await visibleBeforeProfiles('cold-cache',start);
 const rowId=await row.getAttribute('data-testid');
 await page.screenshot({path:new URL('cold-before-profiles.png',output).pathname});
 active.release();await row.getByText('First author',{exact:true}).waitFor();
 assert.equal(await row.getAttribute('data-testid'),rowId);
 await page.screenshot({path:new URL('cold-after-profiles.png',output).pathname});
 await page.getByTestId(`thread-${rowId.slice('post-row-'.length)}`).click();
 await page.getByTestId('reply').click();
 assert.equal(await page.getByTestId('reply-recipient').innerText(),'Replying to First author');
 await page.getByTestId('cancel').click();await page.getByTestId('back').click();
 active=phase('warm','Updated author');const reloadStart=Date.now();await page.reload();
 row=await visibleBeforeProfiles('warm-cache-reload',reloadStart,'First author');
 active.release();await row.getByText('Updated author',{exact:true}).waitFor();
 active=phase('failure','Unused',true);active.release();const failStart=Date.now();await page.reload();
 await page.locator('[data-testid^="post-row-"]').first().getByText('Updated author',{exact:true}).waitFor({timeout:2500});
 measurements.push({case:'profile-failure',firstPostMs:Date.now()-failStart});
 active=phase('logout','Late author');const logoutStart=Date.now();await page.reload();
 await visibleBeforeProfiles('before-logout',logoutStart,'Updated author');
 await page.getByTestId('account-avatar').click();await page.getByTestId('logout').click();await page.getByTestId('handle').waitFor();
 active.release();await until(()=>active.finished===active.calls);
 await page.waitForTimeout(200);
 assert.equal(await page.locator('[data-testid^="post-row-"]:visible').count(),0);
 assert.equal(await page.getByTestId('handle').isVisible(),true);
 assert.deepEqual(errors,[]);
 writeFileSync(new URL('browser-regression.json',output),JSON.stringify({method:'Synthetic profiles held independently; real isolated Snapback auth/posts; no production data.',measurements},null,2)+'\n');
 console.log('PASS: cold and cached post text precedes profile completion; names refresh independently; profile failure keeps content; late results cannot repopulate a signed-out feed.');
 console.log(JSON.stringify(measurements));
} finally {for(const p of phases)p.release();await browser.close();}
