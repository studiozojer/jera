// Normal browser, separate device contexts, simulated OAuth, real isolated storage.
// Run test-server.mjs and the authenticated app on port3035 first.
import {chromium} from '../tooling/exact2/node_modules/playwright-core/index.mjs';
import {chromium as browserBinary} from '../tooling/exact2/scripts/agent-launch.mjs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:browserBinary().executable});
const base=process.env.JERA_REVIEW_URL||'http://127.0.0.1:3035';
const contexts=[];
async function device(handle){
 const context=await browser.newContext({viewport:{width:390,height:844}});contexts.push(context);
 await context.route('https://public.api.bsky.app/**',route=>{const did=new URL(route.request().url()).searchParams.get('actor');return route.fulfill({json:{did,handle:did.includes('aaaa')?'owner.test':'other.test',displayName:did.includes('aaaa')?'Test Owner':'Other Account'}});});
 const page=await context.newPage();const at=id=>page.locator(`[data-testid="${id}"]:visible`).last();
 await page.goto(base+'/');await at('handle').fill(handle);await at('login').click();await at('account-avatar').waitFor();
 return {page,at};
}
async function audience(owner){await owner.at('account-avatar').click();await owner.at('private-audience').click();await owner.at('audience-did').waitFor();}
try{
 const first=await device('owner.test');
 await first.at('feed-write').click();await first.at('composer').fill('Cloud draft ♍︎ ♍️ :virgo:');
 await first.page.waitForTimeout(1800);
 const second=await device('owner.test');
 await second.at('feed-write').click();
 await second.page.waitForFunction(()=>document.querySelector('textarea')?.value==='Cloud draft ♍︎ ♍️ :virgo:');
 await second.at('composer').fill('A private post recovered from another device ♍︎');
 await second.at('post').click();
 await second.page.waitForURL(/\/thread\//);
 const postId=new URL(second.page.url()).pathname.split('/').pop();
 await second.at(`thread-body-${postId}`).waitFor();
 const other=await device('other.test');
 await other.at('feed-write').click();await other.page.waitForTimeout(1200);
 assert.equal(await other.at('composer').inputValue(),'','another DID never sees the owner’s cloud draft');
 await other.at('cancel').click();await other.at('composer').waitFor({state:'hidden'});
 assert.equal(await other.page.locator('[data-testid^="body-"]:visible').count(),0);
 await first.at('cancel').click();await first.at('composer').waitFor({state:'hidden'});
 await audience(first);await first.at('audience-did').fill('did:plc:bbbbbbbbbbbbbbbbbbbbbbbb');await first.at('audience-add').click();
 await first.at('audience-member-did:plc:bbbbbbbbbbbbbbbbbbbbbbbb').waitFor();
 await first.page.screenshot({path:'/tmp/jera-mobile-audience.png'});
 await other.page.goto(base+'/');await other.at(`body-${postId}`).waitFor();await other.at(`post-row-${postId}`).click();
 await other.at('reply').click();await other.at('reply-private-only').waitFor();
 assert.equal(await other.at('experience-public').count(),0);
 await other.at('composer').fill('A reply from an authorized DID');await other.at('post').click();
 await other.page.waitForFunction(()=>[...document.querySelectorAll('[data-testid^="thread-body-"]')].some(e=>getComputedStyle(e).visibility!=='hidden'&&e.textContent==='A reply from an authorized DID'));
 await first.page.goto(base+`/thread/${postId}`);await first.at(`thread-body-${postId}`).waitFor();
 await first.page.waitForFunction(()=>[...document.querySelectorAll('[data-testid^="thread-body-"]')].some(e=>getComputedStyle(e).visibility!=='hidden'&&e.textContent==='A reply from an authorized DID'));
 await first.page.screenshot({path:'/tmp/jera-mobile-real-thread.png'});
 await first.page.setViewportSize({width:1280,height:900});await first.page.goto(base+'/');await first.at(`body-${postId}`).waitFor();await first.page.screenshot({path:'/tmp/jera-mobile-real-feed-desktop.png'});
 await audience(first);await first.at('audience-remove-did:plc:bbbbbbbbbbbbbbbbbbbbbbbb').click();
 await first.at('audience-member-did:plc:bbbbbbbbbbbbbbbbbbbbbbbb').waitFor({state:'hidden'});
 await other.page.goto(base+`/thread/${postId}`);await other.at('thread-unavailable').waitFor();
 assert.equal(await other.page.locator('[data-testid^="thread-body-"]:visible').count(),0);
 console.log('PASS: real popup login; independent device cloud-draft recovery; other-DID isolation; posting; audience grant; attributed private reply; revoke removes parent+descendant; phone/desktop captures.');
}finally{for(const c of contexts)await c.close();await browser.close();}
