// Synthetic fixture only, on3035. State transitions only; no key values or request bodies.
import {chromium} from '../../tooling/exact2/node_modules/playwright-core/index.mjs';
import {chromium as binary} from '../../tooling/exact2/scripts/agent-launch.mjs';
import assert from 'node:assert/strict';
import {mkdir,writeFile,rename} from 'node:fs/promises';
const label=process.env.JERA_CAPTURE_LABEL||'after';const dir=process.env.JERA_CAPTURE_DIR||'/tmp/jera-button-flicker';await mkdir(dir,{recursive:true});
const browser=await chromium.launch({executablePath:binary().executable});
const context=await browser.newContext({viewport:{width:1120,height:800},colorScheme:'dark',recordVideo:{dir,size:{width:1120,height:800}}});
await context.route('https://public.api.bsky.app/**',route=>{const did=new URL(route.request().url()).searchParams.get('actor');return route.fulfill({json:{did,handle:'owner.test',displayName:'Synthetic review account',avatar:''}});});
const page=await context.newPage();const video=page.video();
await page.goto('http://127.0.0.1:3035/');await page.getByTestId('handle').fill('owner.test');await page.getByTestId('login').click();await page.getByTestId('feed-write').click();await page.getByTestId('composer').waitFor();
await page.evaluate(()=>{
 window.buttonTrace=[];const button=document.querySelector('[data-testid="post"]');
 const sample=reason=>window.buttonTrace.push({ms:Math.round(performance.now()),reason,disabled:button.disabled,opacity:getComputedStyle(button).opacity,background:getComputedStyle(button).backgroundColor});
 window.buttonObserver=new MutationObserver(()=>sample('attribute'));window.buttonObserver.observe(button,{attributes:true,attributeFilter:['disabled','aria-busy','class','style']});sample('before typing');
});
await page.waitForTimeout(700);await page.getByTestId('composer').pressSequentially('A small synthetic draft for a button-state test.',{delay:180});await page.waitForTimeout(1600);
const trace=await page.evaluate(()=>{window.buttonObserver.disconnect();return window.buttonTrace;});
await page.screenshot({path:dir+'/composer-'+label+'.png'});await writeFile(dir+'/post-button-state-'+label+'.json',JSON.stringify({scope:'Disposable browser fixture; no production content or credentials. State transitions only; no key values.',trace},null,2)+'\n');
await context.close();const path=await video.path();await rename(path,dir+'/post-button-'+label+'.webm');await browser.close();
if(label==='after')assert.equal(trace.filter((v,i)=>i&&v.disabled!==trace[i-1].disabled).length,1,'Post must stay enabled while a nonempty draft autosaves');
console.log(JSON.stringify({video:dir+'/post-button-'+label+'.webm',samples:trace.length,disabledTransitions:trace.filter((v,i)=>i&&v.disabled!==trace[i-1].disabled).length}));
