// Run against this isolated preview; no browser dependency is added to the app.
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || '../../../tooling/exact2/node_modules/playwright-core');
import {mkdir,writeFile} from 'node:fs/promises';
const out=fileURLToPath(new URL('../.exact/daoui-review',import.meta.url));await mkdir(out,{recursive:true});const b=await chromium.launch({executablePath:process.env.DAOUI_CHROMIUM,headless:true});const p=await b.newPage({viewport:{width:390,height:844}});const checks=[];const check=(x,m)=>{if(!x)throw Error(m);checks.push(m)};
try{await p.goto(process.env.JERA_PREVIEW_URL || 'http://127.0.0.1:4319');await p.getByTestId('write').waitFor();await p.evaluate(()=>document.fonts.ready);
const css=(id,key)=>p.getByTestId(id).evaluate((e,k)=>getComputedStyle(e)[k],key);
check(await css('thread-seed-2','cursor')==='pointer','comment action owns pointer cursor');check(await css('like-stream-seed-2','cursor')==='default','disabled action retains default cursor');
check(await p.getByTestId('thread-seed-2').getAttribute('aria-pressed')===null,'comment is an ordinary action, without toggle state');
const read=()=>p.getByTestId('write').boundingBox();let r=await read();check(r.width===48&&r.height===48,'phone floating Write retains 48px target');
await p.screenshot({path:out+'/phone.png'});await p.setViewportSize({width:1280,height:900});r=await read();check(r.width===64&&r.height===64,'desktop floating Write retains 64px target');await p.screenshot({path:out+'/desktop.png'});
await p.setViewportSize({width:390,height:844});await p.evaluate(()=>{document.documentElement.style.fontSize='53px'});r=await read();check(r.width===48&&r.height===48,'large reading text does not enlarge floating Write');await p.screenshot({path:out+'/phone-text53.png'});
await p.evaluate(()=>{document.documentElement.style.fontSize='16px'});await p.getByTestId('write').click();check(await p.getByTestId('cancel').getAttribute('id')==='back','Cancel preserves host navigation ID');await p.getByTestId('composer').fill('Exact source: ♍︎ ♍️ :virgo:');await p.getByTestId('post').click();await p.getByTestId('thread-body-post-61').waitFor();check(await p.getByTestId('thread-body-post-61').innerText()==='Exact source: ♍︎ ♍️ :virgo:','canonical Post retains exact source sequences');check(await p.getByTestId('back').getAttribute('id')==='back','Back preserves host navigation ID');await p.getByTestId('back').click();await p.getByTestId('composer').waitFor({state:'detached'});check(await p.getByTestId('composer').count()===0,'new-post Back consumes completed composer');
await p.getByTestId('account').click();check(await p.getByTestId('account-done').getAttribute('id')==='back','Done preserves host navigation ID');await p.getByTestId('account-done').click();
await writeFile(out+'/report.json',JSON.stringify({checks},null,2));console.log('PASS',checks.length,'Jera normal-browser checks');}catch(e){await p.screenshot({path:out+'/failure.png'});throw e}finally{await b.close()}
