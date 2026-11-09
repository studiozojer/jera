// Normal browser + disposable real Snapback, with explicitly simulated OAuth.
// This test publishes fixture posts: never point it at the live-account client.
import assert from 'node:assert/strict';
import {chromium} from '../tooling/exact2/node_modules/playwright-core/index.mjs';
import {chromium as binary} from '../tooling/exact2/scripts/agent-launch.mjs';
const browser=await chromium.launch({executablePath:binary().executable});
const contexts=[];
const at=(page,id)=>page.getByTestId(id);
async function login(name,width=1280){
 const context=await browser.newContext({viewport:{width,height:900},colorScheme:'dark',hasTouch:width<704,isMobile:width<704});contexts.push(context);
 await context.route('https://public.api.bsky.app/**',route=>{const did=new URL(route.request().url()).searchParams.get('actor');const own=did.endsWith('a'.repeat(24));return route.fulfill({json:{did,handle:own?'owner.test':'viewer.test',displayName:own?'Test Owner':'Test Viewer',avatar:''}});});
 const page=await context.newPage();await page.goto('http://127.0.0.1:3035/');
 await at(page,'handle').fill(name);await at(page,'login').click();await at(page,'header-experience-private').waitFor();
 return page;
}
async function mode(page,value){
 await at(page,`header-experience-${value}`).click();
 await page.waitForFunction(value=>document.querySelector(`[data-testid="header-experience-${value}"]`)?.getAttribute('aria-checked')==='true',value);
}
async function post(page,text){
 await at(page,'feed-write').click();await at(page,'composer').fill(text);await page.waitForTimeout(350);
 await at(page,'post').click();await page.waitForURL(/\/thread\//);return new URL(page.url()).pathname.split('/').pop();
}
async function menu(page,id){await page.getByTestId(new RegExp(`^more-.*${id}$`)).filter({visible:true}).click();}
try{
 const owner=await login('owner.test');await mode(owner,'public');
 const root=await post(owner,'Fixture parent with a surviving reply');
 await at(owner,'back').click();
 await menu(owner,root);await owner.getByRole('menuitem',{name:'Delete',exact:true}).click();
 await at(owner,'confirm-delete-post-cancel').click();
 await at(owner,`post-row-${root}`).waitFor();assert.equal(new URL(owner.url()).pathname,'/','post menu must not activate the row');
 await at(owner,`post-row-${root}`).click();
 const viewer=await login('viewer.test',390);await mode(viewer,'public');await viewer.reload();
 await at(viewer,`post-row-${root}`).click();await menu(viewer,root);
 assert.equal(await viewer.getByRole('menuitem',{name:'Delete',exact:true}).count(),0,'another author has no Delete action');await viewer.keyboard.press('Escape');
 await at(viewer,'reply').click();await at(viewer,'composer').fill('A reply that belongs to someone else');await viewer.waitForTimeout(350);await at(viewer,'post').click();await at(viewer,'composer').waitFor({state:'hidden'});
 const child=await viewer.locator('[data-testid^="thread-body-"]').filter({hasText:'A reply that belongs to someone else'}).getAttribute('data-testid');const childId=child.replace('thread-body-','');
 await owner.reload();await at(owner,`thread-body-${childId}`).waitFor();
 await menu(owner,root);await owner.getByRole('menuitem',{name:'Delete',exact:true}).click();
 await owner.screenshot({path:'/tmp/jera-delete-confirm-1280.png'});assert.equal(await owner.locator('body > pre').count(),0);
 await owner.route('**/m/deletePost',route=>route.abort());await at(owner,'confirm-delete-post').click();
 await at(owner,'delete-error-close').waitFor();await at(owner,'delete-error-close').click();
 assert.equal(await at(owner,`thread-body-${root}`).textContent(),'Fixture parent with a surviving reply','failed request keeps the post visible');
 await owner.unroute('**/m/deletePost');await menu(owner,root);await owner.getByRole('menuitem',{name:'Delete',exact:true}).click();await at(owner,'confirm-delete-post').click();
 await owner.waitForFunction(id=>document.querySelector(`[data-testid="thread-body-${id}"]`)?.textContent==='This post was deleted.',root);
 assert.equal(await at(owner,`thread-body-${childId}`).textContent(),'A reply that belongs to someone else');assert.equal(await at(owner,'reply').count(),0,'no new replies directly to a deleted post');
 await owner.screenshot({path:'/tmp/jera-deleted-thread-1280.png'});
 await at(owner,'back').click();await at(owner,`post-row-${root}`).waitFor({state:'hidden'});
 await mode(owner,'private');const priv=await post(owner,'Private fixture to remove');await at(owner,'back').click();await menu(owner,priv);await owner.getByRole('menuitem',{name:'Delete',exact:true}).click();await at(owner,'confirm-delete-post').click();await at(owner,`post-row-${priv}`).waitFor({state:'hidden'});
 // A reply author can remove their own reply; a deleted parent never deletes it for them.
 await viewer.reload();await viewer.waitForFunction(id=>document.querySelector(`[data-testid="thread-body-${id}"]`)?.textContent==='This post was deleted.',root);
 await menu(viewer,childId);await viewer.getByRole('menuitem',{name:'Delete',exact:true}).click();await viewer.screenshot({path:'/tmp/jera-delete-confirm-390.png'});await at(viewer,'confirm-delete-post').click();
 await viewer.waitForFunction(id=>document.querySelector(`[data-testid="thread-body-${id}"]`)?.textContent==='This post was deleted.',childId);
 await viewer.reload();await viewer.waitForFunction(id=>document.querySelector(`[data-testid="thread-body-${id}"]`)?.textContent==='This post was deleted.',childId);
 assert.equal(await viewer.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.equal(await viewer.locator('body > pre').count(),0);await viewer.screenshot({path:'/tmp/jera-deleted-thread-390.png'});
 console.log('PASS: author-owned menu; Cancel; menu/row event boundary; failed-request recovery; public/private feed deletion; preserved replies; reply deletion; reload persistence; desktop/mobile rendered review.');
}finally{for(const context of contexts)await context.close();await browser.close();}
