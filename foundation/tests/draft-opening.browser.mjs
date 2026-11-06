// Real disposable Snapback + explicitly simulated OAuth on3035; no live account.
import assert from 'node:assert/strict';
import {chromium} from '../../tooling/exact2/node_modules/playwright-core/index.mjs';
import {chromium as binary} from '../../tooling/exact2/scripts/agent-launch.mjs';
const browser=await chromium.launch({executablePath:binary().executable});
const context=await browser.newContext({viewport:{width:1120,height:800},colorScheme:'dark'});
await context.route('https://public.api.bsky.app/**',r=>{const did=new URL(r.request().url()).searchParams.get('actor');return r.fulfill({json:{did,handle:'owner.test',displayName:'Synthetic Owner',avatar:''}});});
const page=await context.newPage();const at=id=>page.getByTestId(id);
let publications=0,lookups=0;
page.on('request',r=>{if(r.url().endsWith('/m/publishPost'))publications++;if(r.url().endsWith('/q/postForIntent'))lookups++;});
async function ready(value){await page.waitForFunction(value=>{const el=document.querySelector('[data-testid="composer"]');return el&&!el.disabled&&(value===null||el.value===value);},value);}
async function open(){await at('write').filter({visible:true}).click();await at('composer').waitFor();}
async function send(text){await at('composer').fill(text);await at('post').click();await page.waitForURL(/\/thread\//);return page.url();}
try{
 await page.goto('http://127.0.0.1:3035/');await at('handle').fill('owner.test');await at('login').click();await at('feed-write').click();await ready('');
 const root=await send('First private synthetic post');
 let before=lookups;await open();await ready('');assert.equal(lookups,before+1,'opening explicitly checks the retained publication');
 await page.waitForTimeout(500);await page.screenshot({path:'/tmp/jera-draft-open-empty-1120.png'});
 await at('composer').fill('A private draft that has not been posted');await at('cancel').click();await open();await ready('A private draft that has not been posted');
 await at('experience-public').click();await ready('');await send('An independent public synthetic post');
 await open();await ready('');await at('experience-private').click();await ready('A private draft that has not been posted');
 await at('cancel').click();await page.goto(root);await at('reply').click();await ready('');await send('A posted reply to retire on the next reply');
 await at('reply').click();await ready('');await at('cancel').click();
 // A lost HTTP response commits the real post but retains the sealed draft.
 await open();await ready('A private draft that has not been posted');
 await page.route('**/m/publishPost',async route=>{await route.fetch();await route.abort();});
 await at('post').click();await at('post-pending').waitFor();await page.unroute('**/m/publishPost');
 await at('cancel').click();const count=publications;
 await page.route('**/q/postForIntent',route=>route.abort());await open();await at('post-pending').waitFor();
 assert.equal(await at('composer').inputValue(),'A private draft that has not been posted');assert.equal(await at('composer').isDisabled(),true);
 await at('cancel').click();await page.unroute('**/q/postForIntent');
 await open();await ready('');assert.equal(publications,count,'publication lookup retires the draft without posting again');
 // A cancelled unposted draft survives a direct route reload.
 await at('composer').fill('Keep this unposted draft across reload');await page.waitForTimeout(100);await page.reload();await ready('Keep this unposted draft across reload');
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(500);await page.screenshot({path:'/tmp/jera-draft-open-unsent-390.png'});
 assert.equal(await page.locator('body > pre').count(),0);
 console.log('PASS: next-opening confirmation; empty new post; unposted recovery; independent modes; reply retirement; ambiguous/offline preservation; no duplicate writes; direct-route reload; desktop/phone layout.');
}finally{await context.close();await browser.close();}
