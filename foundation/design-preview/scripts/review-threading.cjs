// Run against `bun exact.mjs web --port 3034`; no browser dependency in the app.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || path.resolve(__dirname, '../../../tooling/exact2/node_modules/playwright-core'));
const output = path.resolve(__dirname, '../.exact/threading-review');

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const at = id => page.locator(`[data-testid="${id}"]:visible`).last();
    const capture = name => page.screenshot({ path: path.join(output, `${name}.png`) });
    await page.goto(process.env.JERA_PREVIEW_URL || 'http://127.0.0.1:3034/');
    await at('thread-seed-2').click();
    await at('thread-header').waitFor();
    assert.equal(await at('account').count(), 0, 'Thread header replaces the account/brand header');
    await capture('desktop');
    await page.setViewportSize({ width: 390, height: 844 });
    await capture('phone');
    await at('show-replies-seed-3').click();
    assert(page.url().endsWith('/thread/seed-4'));
    // Contract's `tree has` includes earlier mounted routes. Check visibility here.
    assert.equal(await at('thread-body-seed-60').count(), 0);
    await at('thread-body-seed-59').waitFor();
    await capture('focused');
    await at('parent-thread').click();
    assert(page.url().endsWith('/thread/seed-3'));
    await at('back').click();
    assert(page.url().endsWith('/thread/seed-4'));
    await at('back').click();
    await at('reply-to-seed-4').click();
    assert.equal(await at('reply-context').innerText(), 'Yes. And pruning can be a kind of care.');
    await page.waitForTimeout(600); // Let the host sheet finish its presentation.
    await capture('composer');
    await at('composer').fill('Keep this beside the pruning note.');
    await at('post').click();
    await at('thread-body-post-61').waitFor();
    await page.waitForTimeout(150);
    const posted = await at('thread-body-post-61').boundingBox();
    assert(posted.y >= 0 && posted.y + posted.height < 780, 'Posted reply clears the floating Write control');
    await capture('posted');
    await at('back').click();
    await page.locator('[data-testid="composer"]').waitFor({ state: 'hidden' });
    assert.equal(await at('composer').count(), 0);
    assert(page.url().endsWith('/thread/seed-2'));
    assert.equal(await at('thread-header').count(), 1);
    await at('show-replies-seed-3').click();
    await at('thread-body-post-61').waitFor();
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      assert(await page.evaluate(() => document.body.scrollWidth <= innerWidth), `Page width at ${width}`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => { document.documentElement.style.fontSize = '53px'; });
    await page.waitForTimeout(150);
    await capture('large');
    await at('thread-body-post-61').scrollIntoViewIfNeeded();
    await capture('large-reply');
    fs.writeFileSync(path.join(output, 'proof.json'), JSON.stringify({ passed: true, posted }, null, 2));
    console.log(`Threading browser checks passed; captures: ${output}`);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
