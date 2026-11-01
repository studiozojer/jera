// Run with Bun 1.4.2, the disposable test-server.mjs and Exact web on port 3034.
// This uses normal browser popups, not the held-auth agent fixture.
import {chromium} from '../../tooling/exact2/node_modules/playwright-core/index.mjs';
import {chromium as browserBinary} from '../../tooling/exact2/scripts/agent-launch.mjs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:browserBinary().executable});
const context=await browser.newContext({viewport:{width:390,height:844},colorScheme:'dark'});
await context.route('https://public.api.bsky.app/**',route=>{
 const did=new URL(route.request().url()).searchParams.get('actor');
 return route.fulfill({json:{did,handle:did.includes('aaaa')?'owner.test':'other.test',displayName:did.includes('aaaa')?'Test Owner':'Other Account'}});
});
const page=await context.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try {
 await page.goto('http://127.0.0.1:3034/');
 const login=async name=>{
  await page.getByRole('textbox',{name:'ATproto handle or DID'}).fill(name);
  await page.getByRole('button',{name:'Continue with ATproto'}).click();
  await page.getByRole('button',{name:'Your account',exact:true}).waitFor();
 };
 await login('owner.test');
 await page.getByRole('button',{name:'Your account',exact:true}).click();
 await page.getByRole('heading',{name:'Test Owner'}).waitFor();
 await page.waitForFunction(() => {const r=document.querySelector('#account-sheet')?.getBoundingClientRect();return r && Math.abs(r.bottom-innerHeight)<1;});
 const box=()=>page.locator('#account-sheet').boundingBox();
 let b=await box();assert.ok(Math.abs(b.y+b.height-844)<1);assert.equal(b.x,0);assert.equal(b.width,390);
 await page.screenshot({path:'/private/tmp/jera-panel-web-phone.png'});
 // A short pull returns to rest rather than turning into a click-to-dismiss.
 let grip=await page.locator('#account-dismiss').boundingBox();
 await page.mouse.move(grip.x+22,grip.y+12);await page.mouse.down();await page.mouse.move(grip.x+22,grip.y+32,{steps:5});await page.mouse.up();
 await page.waitForTimeout(500);assert.ok(await page.locator('#account-sheet').isVisible());
 await page.setViewportSize({width:1024,height:768});await page.waitForTimeout(500);
 b=await box();assert.ok(Math.abs(b.x+b.width/2-512)<1);assert.ok(Math.abs(b.y+b.height/2-384)<1);
 assert.equal(await page.locator('#account-dismiss').isVisible(),false);
 await page.screenshot({path:'/private/tmp/jera-panel-web-tablet.png'});
 await page.keyboard.press('Escape');await page.locator('#account-sheet').waitFor({state:'detached'});
 await page.getByRole('button',{name:'Your account',exact:true}).click();
 await page.mouse.click(20,200);
 await page.locator('#account-sheet').waitFor({state:'detached'});
 await page.getByRole('button',{name:'Your account',exact:true}).click();
 await page.getByRole('button',{name:'Log out',exact:true}).click();
 await page.getByRole('textbox',{name:'ATproto handle or DID'}).waitFor();
 await login('other.test');
 await page.getByRole('button',{name:'Your account',exact:true}).click();
 await page.getByRole('heading',{name:'Other Account'}).waitFor();
 assert.equal(await page.getByText('Test Owner',{exact:true}).count(),0);
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(500);
 grip=await page.locator('#account-dismiss').boundingBox();
 await page.mouse.move(grip.x+22,grip.y+12);await page.mouse.down();await page.mouse.move(grip.x+22,grip.y+110,{steps:8});await page.mouse.up();
 await page.locator('#account-sheet').waitFor({state:'detached'});
 assert.deepEqual(errors,[]);
 console.log('PASS: bottom attachment, short-pull cancellation, resize to centered card, Escape, real popup logout/account switch, long-pull dismissal.');
}finally{await browser.close();}
