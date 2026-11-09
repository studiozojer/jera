// Bun 1.4.2. Run against the disposable real Snapback fixture + review app on
// 3035. Never point this publishing workflow at the live-account client.
import assert from 'node:assert/strict';
import {chromium} from '../tooling/exact2/node_modules/playwright-core/index.mjs';
import {chromium as binary} from '../tooling/exact2/scripts/agent-launch.mjs';
const browser=await chromium.launch({executablePath:binary().executable});
const contexts=[];
const at=(page,id)=>page.getByTestId(id);
const settle=async page=>page.waitForTimeout(250);
async function device(width,touch,name){
 const context=await browser.newContext({viewport:{width,height:900},colorScheme:'dark',hasTouch:touch,isMobile:touch});contexts.push(context);
 await context.route('https://public.api.bsky.app/**',route=>{const did=new URL(route.request().url()).searchParams.get('actor');return route.fulfill({json:{did,handle:name,displayName:name==='owner.test'?'Test Owner':'Test Viewer',avatar:''}});});
 const page=await context.newPage();
 await page.goto('http://127.0.0.1:3035/');
 await at(page,'handle').fill(name);await at(page,'login').click();await at(page,'header-experience-private').waitFor();
 await page.waitForFunction(()=>document.querySelector('[data-testid="header-experience-private"]')?.getAttribute('aria-checked')==='true');
 return page;
}
async function selected(page,id){await page.waitForFunction(id=>document.querySelector(`[data-testid="${id}"]`)?.getAttribute('aria-checked')==='true',id);}
try{
 const desktop=await device(1280,false,'owner.test');
 const group=at(desktop,'header-experience-control');
 let box=await group.boundingBox();assert.equal(box.width,79);assert.equal(box.height,40);
 await at(desktop,'header-experience-private').focus();await desktop.keyboard.press('Home');
 await selected(desktop,'header-experience-public');
 await desktop.waitForFunction(()=>document.querySelector('[data-testid="header-experience-public"]')===document.activeElement);
 await desktop.getByRole('img',{name:'Jera',exact:true}).click();
 assert.equal(await desktop.locator('body > pre').count(),0,'review must use a successful build');
 await group.screenshot({path:'/tmp/jera-switch-control-1280.png'});
 await desktop.screenshot({path:'/tmp/jera-switch-feed-1280.png'});
 await at(desktop,'feed-write').click();await at(desktop,'composer').waitFor();await selected(desktop,'experience-public');
 await at(desktop,'composer').fill('A retained public draft');await settle(desktop);
 await at(desktop,'experience-public').focus();await desktop.keyboard.press('End');await selected(desktop,'experience-private');
 await desktop.waitForFunction(()=>document.querySelector('[data-testid="composer"]')?.value==='');
 await at(desktop,'composer').fill('A private fixture post');await settle(desktop);
 await at(desktop,'experience-public').click();await selected(desktop,'experience-public');
 await desktop.waitForFunction(()=>document.querySelector('[data-testid="composer"]')?.value==='A retained public draft');
 await settle(desktop);assert.equal(await desktop.locator('body > pre').count(),0);
 const composerBox=await at(desktop,'experience-control').boundingBox();assert.equal(composerBox.width,79);assert.equal(composerBox.height,40);
 await desktop.screenshot({path:'/tmp/jera-switch-compose-1280.png'});
 assert.equal(await desktop.evaluate(()=>{const ids=[...document.querySelectorAll('[id*="experience-"]')].map(n=>n.id);return ids.length===new Set(ids).size;}),true);
 await at(desktop,'experience-private').click();await selected(desktop,'experience-private');
 await desktop.waitForFunction(()=>document.querySelector('[data-testid="composer"]')?.value==='A private fixture post');
 await at(desktop,'post').click();await desktop.waitForURL(/\/thread\//);
 await desktop.getByRole('button',{name:'Reply to Test Owner',exact:true}).click();await at(desktop,'reply-private-only').waitFor();
 assert.equal(await at(desktop,'experience-control').count(),0);
 await at(desktop,'cancel').click();await at(desktop,'composer').waitFor({state:'hidden'});
 await at(desktop,'back').click();await at(desktop,'header-experience-public').click();await selected(desktop,'header-experience-public');
 await desktop.reload();await selected(desktop,'header-experience-public');
 const phone=await device(390,true,'viewer.test');
 box=await at(phone,'header-experience-control').boundingBox();assert.equal(box.width,103);assert.equal(box.height,52);
 for(const mode of ['public','private']){const b=await at(phone,`header-experience-${mode}`).boundingBox();assert.ok(b.width>=44&&b.height>=44);}
 await at(phone,'header-experience-public').click();await selected(phone,'header-experience-public');
 await phone.screenshot({path:'/tmp/jera-switch-feed-390.png'});
 await at(phone,'feed-write').click();await at(phone,'composer').waitFor();await selected(phone,'experience-public');
 await settle(phone);assert.equal(await phone.locator('body > pre').count(),0);
 const phoneComposerBox=await at(phone,'experience-control').boundingBox();assert.equal(phoneComposerBox.width,103);assert.equal(phoneComposerBox.height,52);
 await phone.screenshot({path:'/tmp/jera-switch-compose-390.png'});
 await at(phone,'cancel').click();await at(phone,'composer').waitFor({state:'hidden'});
 await phone.setViewportSize({width:320,height:900});await settle(phone);
 assert.equal(await phone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await phone.screenshot({path:'/tmp/jera-switch-feed-320.png'});
 console.log('PASS: exact desktop capsule; 44px touch targets; shared header/composer state; keyboard focus; distinct root drafts; private-only replies; global switch after reply; preference reload; no 320px page overflow.');
}finally{for(const context of contexts)await context.close();await browser.close();}
