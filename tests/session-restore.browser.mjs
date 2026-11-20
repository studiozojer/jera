// Run against the loopback Exact web preview and Jera's disposable auth fixture.
import assert from 'node:assert/strict';
import { chromium } from '../tooling/exact2/node_modules/playwright-core/index.mjs';
import { chromium as browserBinary } from '../tooling/exact2/scripts/agent-launch.mjs';

const base = new URL(process.env.JERA_REVIEW_URL ?? 'http://127.0.0.1:3035');
assert.equal(base.hostname, '127.0.0.1');
const browser = await chromium.launch({executablePath: browserBinary().executable});
try {
  for (const legacy of [false, true]) {
    const context = await browser.newContext();
    let page = await context.newPage();
    async function reopen() {
      await page.close();
      page = await context.newPage();
      await page.goto(base.href, {waitUntil:'domcontentloaded'});
    }
    await context.route('https://public.api.bsky.app/**', route => route.abort());
    await context.route('**/oauth/exchange', async route => {
      assert.equal(new URL(route.request().url()).hostname, '127.0.0.1');
      const request = route.request().postDataJSON();
      assert.equal(request.rememberDevice, true);
      const response = legacy ? await route.fetch({data:{...request, rememberDevice:false}}) : await route.fetch();
      assert.equal(response.status(), 200);
      assert.equal(Boolean((await response.json()).deviceCredential), !legacy);
      await route.fulfill({response});
    });
    await page.goto(base.href);
    await page.getByTestId('handle').fill('owner.test');
    await page.getByTestId('login').click();
    await page.getByTestId('account-avatar').waitFor();
    const endpoint = legacy ? '**/oauth/check' : '**/oauth/device/session';
    let checks = 0;
    await context.route(endpoint, route => {
      checks++;
      return route.fulfill({status:503, json:{message:'Temporarily unavailable'}});
    });
    await reopen();
    await page.getByTestId('account-avatar').waitFor();
    assert.ok(checks > 0);
    assert.equal(await page.getByTestId('handle').count(), 0);
    await context.unroute(endpoint);
    await reopen();
    await page.getByTestId('account-avatar').waitFor();
    await page.getByTestId('account-avatar').click();
    await page.getByTestId('logout').click();
    await page.getByTestId('handle').waitFor();
    await reopen();
    await page.getByTestId('handle').waitFor();
    await context.close();
    console.log((legacy ? 'Legacy' : 'Remembered') + ' login survives temporary gateway failure and relaunch; explicit logout survives relaunch.');
  }
} finally { await browser.close(); }
