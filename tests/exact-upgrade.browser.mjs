import { chromium } from '../tooling/exact/node_modules/playwright-core/index.mjs';
import { chromium as browserBinary } from '../tooling/exact/scripts/agent-launch.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '..');
// Both builds must use EXACT_BACKEND_ORIGIN=http://127.0.0.1:4497.
const [oldDirectory, newDirectory] = process.argv.slice(2);
if (!oldDirectory || !newDirectory) throw new Error('Supply the old and new web build directories.');
const oldSite = resolve(oldDirectory);
const newSite = resolve(newDirectory);
const key = 'jera-http-127.0.0.1-4497-atproto-v1';
let site = oldSite;
let namespace;
const gateway = spawn('node', ['app/test-server.mjs'], {
  cwd: root, env: { ...process.env, PORT: '4497' }, stdio: ['ignore', 'ignore', 'inherit']
});
const types = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.wasm':'application/wasm', '.json':'application/json', '.svg':'image/svg+xml' };
const server = createServer(async (req,res) => {
  const path = new URL(req.url,'http://localhost').pathname;
  const file = resolve(site, '.' + (path === '/' ? '/index.html' : path));
  if (path === '/migration.mjs') {res.writeHead(200,{'Content-Type':'text/javascript'}).end(await readFile(resolve(root,'scripts/web-upgrade.mjs')));return;}
  if (!file.startsWith(site+sep)) { res.writeHead(404).end(); return; }
  try {
    let body = await readFile(file);
    if(site === newSite && file.endsWith('/index.html')) {
      body=body.toString().replace(/<script type="module" data-entry src="([^"]+)"><\/script>/,(_,entry)=>
       '<script type="module">import {upgradeBrowserStore} from "/migration.mjs";await upgradeBrowserStore('+JSON.stringify(key)+',['+JSON.stringify(namespace)+']);await import('+JSON.stringify(entry)+');</script>');
    }
    res.writeHead(200, {'content-type':path.endsWith('/auth/callback')?'text/html':types[extname(file)]||'application/octet-stream','cache-control':'no-store','cross-origin-opener-policy':'same-origin-allow-popups','cross-origin-embedder-policy':'credentialless'}).end(body);
  } catch { console.log('Missing static file',path); res.writeHead(404).end(); }
});
let browser;
try {
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  const base = 'http://127.0.0.1:'+server.address().port;
  for (let attempt=0; attempt<60; attempt++) {
    if (gateway.exitCode!==null) throw Error('Fixture exited before verification');
    if (await fetch('http://127.0.0.1:4497/oauth/health').then(r=>r.ok).catch(()=>false)) break;
    await new Promise(r=>setTimeout(r,200));
  }
  browser = await chromium.launch({executablePath:browserBinary().executable});
  const context = await browser.newContext({viewport:{width:390,height:844}});
  await context.route('https://**/*', r=>r.abort());
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const at = id => page.getByTestId(id);
  const draft='Local Exact upgrade sample';
  const sky='Unpublished Bluesky trial';
  await page.goto(base);
  await at('handle').fill('owner.test'); await at('login').click();
  await at('account-avatar').waitFor();
  await at('sky-composer').fill(sky);
  await at('header-experience-public').click();
  await at('feed-write').click(); await at('composer').fill(draft);
  await at('cancel').click();
  await at('feed-write').click();
  await page.waitForFunction(t=>document.querySelector('[data-testid="composer"]')?.value===t,draft);
  await at('cancel').click();
  console.log('Released Exact2 client signed in and saved synthetic drafts.');
  namespace = await page.evaluate(key => Object.keys(localStorage)
    .find(name => name.startsWith('exact.secret.@') && name.endsWith('/' + key))
    ?.split('/')[0].split('@')[1], key);
  assert.match(namespace || '', /^[0-9a-f]{12}$/);
  site = newSite;
  await page.goto(base);
  await at('account-avatar').waitFor();
  console.log('Same-origin sign-in restored');
  await at('header-experience-bluesky').click();
  await page.waitForFunction(t=>document.querySelector('[data-testid="sky-composer"]')?.value===t,sky);
  await at('header-experience-public').click(); await at('feed-write').click();
  await page.waitForFunction(t=>document.querySelector('[data-testid="composer"]')?.value===t,draft);
  console.log('Both drafts restored');
  await at('post').click(); await page.waitForURL(/\/thread\//);
  await page.goto(base); await at('header-experience-public').click();
  await page.getByText(draft,{exact:true}).first().waitFor();
  assert.equal(await page.getByText(draft,{exact:true}).count(),1);
  console.log('Public Exact published a synthetic Jera post and read it once in Public after reload.');
  // A reload after logout must never copy a grant from an old namespace again.
  await at('account-avatar').click();
  await at('logout').click();
  await at('handle').waitFor();
  await page.reload();
  await at('handle').waitFor();
  assert.equal(await page.evaluate(key => localStorage.getItem('exact.secret.' + key), key), null);

} finally {
  await browser?.close();
  server.closeAllConnections(); server.close();
  if (gateway.exitCode===null) { const done=once(gateway,'exit'); gateway.kill('SIGTERM'); await done; }
}
